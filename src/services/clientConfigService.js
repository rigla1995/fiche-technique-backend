const pool = require('../config/database');

// ─────────────────────────────────────────────────────────────────────────────
// Config statique du client préchargée pour l'agent IA (Tier 1).
//
// À l'activation de l'agent (toggle admin OU ouverture du lien Messenger) on
// construit un "snapshot" de la config qui change rarement : périmètre
// (activités/labos), abonnement complet (capacité + mensualité/onboarding/promo
// calculés), et compteurs (fournisseurs, gérants, produits, module vente).
//
// Ce snapshot est mis en cache à deux niveaux : mémoire process (rapide) +
// colonne ai_assistant_config.context_json (partagé entre redémarrages/replicas,
// déjà utilisée). À chaque message, getContextLine() lit ce cache au lieu de
// relancer 3 requêtes SQL, et injecte un résumé dans le system prompt — de sorte
// qu'une question comme « mon abonnement ? » trouve la réponse sans aller-retour DB.
//
// Les flux DYNAMIQUES (appros/transferts/pertes/inventaires/ventes/stock) ne sont
// PAS préchargés : ils restent interrogés à la demande, avec filtres, par les
// tools dédiés (get_*). Voir aiToolHandlers.js.
// ─────────────────────────────────────────────────────────────────────────────

const SNAPSHOT_VERSION = 2;
const TTL_MS = 30 * 60 * 1000; // 30 min — filet de fraîcheur (le warm-up à l'activation le préchauffe)

const memCache = new Map();  // clientId -> { snapshot, expiry }
const inflight = new Map();  // clientId -> Promise (anti-stampede)

// Compteurs légers (1 requête) — scoping aligné sur les tools get_* correspondants.
async function fetchCounts(clientId) {
  const { rows } = await pool.query(
    `WITH pe AS (SELECT id FROM profil_entreprise WHERE client_id = $1)
     SELECT
       (SELECT module_vente_actif FROM profil_entreprise WHERE client_id = $1 LIMIT 1) AS module_vente_actif,
       (SELECT COUNT(*) FROM fournisseurs f
          WHERE f.entreprise_id IN (SELECT id FROM pe) AND f.nom <> 'AUTO') AS nb_fournisseurs,
       (SELECT COUNT(*) FROM utilisateurs u
          WHERE u.role = 'gerant' AND u.gerant_parent_id = $1) AS nb_gerants,
       (SELECT COUNT(*) FROM produits p WHERE p.client_id = $1) AS nb_produits`,
    [clientId]
  );
  const r = rows[0] || {};
  return {
    module_vente_actif: r.module_vente_actif ?? false,
    nb_fournisseurs: parseInt(r.nb_fournisseurs, 10) || 0,
    nb_gerants: parseInt(r.nb_gerants, 10) || 0,
    nb_produits: parseInt(r.nb_produits, 10) || 0,
  };
}

async function fetchSnapshot(clientId) {
  // Réutilise les handlers d'outils existants (require tardif = pas de cycle de modules).
  const { toolGetClientInfo, toolGetAbonnement } = require('./aiToolHandlers');
  const [info, abonnement, counts] = await Promise.all([
    toolGetClientInfo(clientId),
    toolGetAbonnement(clientId).catch(() => null),
    fetchCounts(clientId),
  ]);
  return {
    v: SNAPSHOT_VERSION,
    nom: info.nom,
    email: info.email,
    mode_compte: info.mode_compte,
    activites: info.activites || [],
    labos: info.labos || [],
    abonnement,
    ...counts,
    generated_at: new Date().toISOString(),
  };
}

// Construit le snapshot, le persiste (mémoire + context_json) et le renvoie.
async function buildClientConfigSnapshot(clientId) {
  const snapshot = await fetchSnapshot(clientId);
  memCache.set(clientId, { snapshot, expiry: Date.now() + TTL_MS });
  try {
    await pool.query(
      `UPDATE ai_assistant_config SET context_json = $1, context_updated_at = NOW() WHERE client_id = $2`,
      [JSON.stringify(snapshot), clientId]
    );
  } catch (e) {
    console.warn('[clientConfig] persist context_json failed:', e.message);
  }
  return snapshot;
}

// Lecture avec cache : mémoire (frais) -> context_json DB (frais + bonne version) -> rebuild.
async function getSnapshot(clientId) {
  const cached = memCache.get(clientId);
  if (cached && cached.expiry > Date.now()) return cached.snapshot;

  try {
    const { rows } = await pool.query(
      `SELECT context_json, context_updated_at FROM ai_assistant_config WHERE client_id = $1`,
      [clientId]
    );
    const row = rows[0];
    if (row && row.context_json && row.context_updated_at) {
      const snap = typeof row.context_json === 'string' ? JSON.parse(row.context_json) : row.context_json;
      const age = Date.now() - new Date(row.context_updated_at).getTime();
      if (snap && snap.v === SNAPSHOT_VERSION && age < TTL_MS) {
        memCache.set(clientId, { snapshot: snap, expiry: Date.now() + Math.max(1000, TTL_MS - age) });
        return snap;
      }
    }
  } catch (_) {
    /* context_json absent / obsolète / mauvaise forme -> on reconstruit */
  }

  if (inflight.has(clientId)) return inflight.get(clientId);
  const p = buildClientConfigSnapshot(clientId).finally(() => inflight.delete(clientId));
  inflight.set(clientId, p);
  return p;
}

// Ligne(s) de contexte compactes injectées dans le system prompt.
function buildLineFromSnapshot(snap) {
  const acts = (snap.activites || []).map((a) => `${a.id}=${a.nom}`).join(', ') || 'aucune';
  const labos = (snap.labos || []).map((l) => `${l.id}=${l.nom}`).join(', ') || 'aucun';
  const lines = [
    `Client: ${snap.nom || '—'} | Mode du compte: ${snap.mode_compte || '—'} | Activités: ${acts} | Labos: ${labos}`,
  ];

  const ab = snap.abonnement;
  if (ab && !ab.note) {
    const cap = `Capacité souscrite: ${ab.nb_activites ?? '—'} activité(s), ${ab.nb_labos ?? '—'} labo(s), ${ab.nb_gerants ?? '—'} gérant(s)`;
    const prix = ab.mensuel_effectif_tnd != null
      ? `Abonnement: mensualité ~${ab.mensuel_effectif_tnd} TND, onboarding ${ab.onboarding_effectif_tnd ?? '—'} TND${ab.promotion_active ? ' (promo active)' : ''}`
      : `Abonnement: ${ab.mode_compte || snap.mode_compte || '—'}`;
    lines.push(`${prix} | ${cap}`);
  }

  lines.push(
    `Référentiel client: ${snap.nb_fournisseurs ?? 0} fournisseur(s), ${snap.nb_gerants ?? 0} gérant(s), ${snap.nb_produits ?? 0} produit(s) | Module vente: ${snap.module_vente_actif ? 'actif' : 'inactif'}`
  );
  return lines.join('\n');
}

async function getContextLine(clientId) {
  const snap = await getSnapshot(clientId);
  return { nom: snap.nom, line: buildLineFromSnapshot(snap) };
}

// Invalide le cache (mémoire + force la péremption DB) après une mutation de config statique.
function invalidate(clientId) {
  memCache.delete(clientId);
  pool
    .query(`UPDATE ai_assistant_config SET context_updated_at = NULL WHERE client_id = $1`, [clientId])
    .catch(() => {});
}

module.exports = { buildClientConfigSnapshot, getSnapshot, getContextLine, invalidate };
