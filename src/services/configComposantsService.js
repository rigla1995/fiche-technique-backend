// Configuration d'un compte PAR COMPOSANT (lot 1a).
//
// Les 4 compteurs nb_activites / nb_labos / nb_gerants / nb_acheteurs de
// abonnement_config restent des DÉRIVÉS (Σ par type technique ; acheteurs = MAX)
// du détail abonnement_config_composants. `applyComposants` est le SEUL écrivain
// des compteurs : createAbonnement, updateAbonnementConfig, toggleModuleAcheteurs,
// supportController.traiter et le webhook DocuSeal passent tous par lui — les
// ~25 lecteurs des compteurs (moteur de prix, gardes, onboarding, contrat, IA,
// dashboards) sont inchangés.
//
//   deriveCompteurs(composants)                     → { nb_activites, nb_labos, nb_gerants, nb_acheteurs }
//   validerComposition({ compteurs, regles, composants }) → [{ code, message }] (vide = OK)
//   composantsDepuisCompteurs(domaineId, compteurs) → [{ code, nb }] (compat anciens payloads)
//   applyComposants(db, aboId, { domaineId, composants, mode }) → { domaineId, compteurs, composants, identitesCreees }
//   invaliderProfilApresCommit(resultat)            APRÈS le COMMIT : oublie le profil en cache si un composant identité a été créé
//   listComposantsConfig(aboId)                     → [{ composantId, code, libelle, libellePluriel, genre, elision, … , nb }]
const pool = require('../config/database');
const {
  TYPES_TECHNIQUES, COMPOSANTS_IDENTITE, REGLES_DEFAUT, mapComposant, getDomaineDefautId, getProfil, invalidate,
} = require('./domaineProfilService');
const { vocabDuProfil } = require('../utils/vocabCompte');

// Erreur de composition → 400 { message, code, erreurs } côté contrôleur.
class CompositionError extends Error {
  constructor(erreurs) {
    const list = Array.isArray(erreurs) && erreurs.length ? erreurs : [{ code: 'COMPOSITION_INVALIDE', message: 'Composition invalide' }];
    super(list[0].message);
    this.name = 'CompositionError';
    this.status = 400;
    this.code = list[0].code;
    this.erreurs = list;
  }
}

const typeOf = (c) => c?.typeTechnique ?? c?.type_technique ?? null;
const nbOf = (c) => { const n = parseInt(c?.nb, 10); return Number.isFinite(n) && n > 0 ? n : 0; };

// Σ nb par type ; l'option Acheteurs est un QUOTA (palier), pas un cumul → MAX.
const deriveCompteurs = (composants = []) => {
  const out = { nb_activites: 0, nb_labos: 0, nb_gerants: 0, nb_acheteurs: 0 };
  for (const c of composants || []) {
    const t = typeOf(c);
    const n = nbOf(c);
    if (t === 'activite') out.nb_activites += n;
    else if (t === 'labo') out.nb_labos += n;
    else if (t === 'gerant') out.nb_gerants += n;
    else if (t === 'acheteurs') out.nb_acheteurs = Math.max(out.nb_acheteurs, n);
  }
  return out;
};

// Compteurs en snake_case OU camelCase → snake_case normalisé.
const normCompteurs = (c = {}) => ({
  nb_activites: parseInt(c.nb_activites ?? c.nbActivites, 10) || 0,
  nb_labos:     parseInt(c.nb_labos     ?? c.nbLabos, 10)     || 0,
  nb_gerants:   parseInt(c.nb_gerants   ?? c.nbGerants, 10)   || 0,
  nb_acheteurs: parseInt(c.nb_acheteurs ?? c.nbAcheteurs, 10) || 0,
});

// Gardes de composition (mêmes messages qu'aujourd'hui) + bornes des composants.
// `composants` (optionnel) : [{ code, libelle, nbMin, nbMax, nb }] pour nb_min/nb_max.
const validerComposition = ({ compteurs, regles = REGLES_DEFAUT, composants = [] } = {}) => {
  const r = { ...REGLES_DEFAUT, ...(regles || {}) };
  const k = normCompteurs(compteurs || {});
  const erreurs = [];
  const push = (code, message) => erreurs.push({ code, message });

  for (const c of composants || []) {
    const n = nbOf(c);
    const min = parseInt(c.nbMin ?? c.nb_min, 10) || 0;
    const maxRaw = c.nbMax ?? c.nb_max;
    const max = maxRaw == null ? null : parseInt(maxRaw, 10);
    const lib = c.libelle || c.code || 'composant';
    if (n < min) push('COMPOSANT_MIN', `« ${lib} » : minimum ${min}`);
    if (max != null && Number.isFinite(max) && n > max) push('COMPOSANT_MAX', `« ${lib} » : maximum ${max}`);
  }
  if (k.nb_activites < 0 || k.nb_labos < 0 || k.nb_gerants < 0) {
    push('COMPOSITION_INVALIDE', 'Les quantités doivent être positives ou nulles');
  }
  if (k.nb_acheteurs < 0 || k.nb_acheteurs > 100) {
    push('ACHETEURS_QUOTA', 'Quota acheteurs invalide (paliers de 1 à 100)');
  }
  if (r.depot_exige_acheteurs !== false && k.nb_activites === 0) {
    if (k.nb_labos < 1) {
      push('DEPOT_SANS_LABO', 'Un compte sans activité doit avoir au moins un labo (compte dépôt)');
    } else if (k.nb_acheteurs === 0) {
      push('DEPOT_SANS_ACHETEURS', "Un labo sans activité nécessite l'option Acheteurs (compte dépôt = labo + acheteurs)");
    }
  }
  if (r.acheteurs_requiert_labo !== false && k.nb_acheteurs > 0 && k.nb_labos < 1) {
    push('ACHETEURS_SANS_LABO', "L'option Acheteurs nécessite au moins un labo");
  }
  return erreurs;
};

// Lève une CompositionError (400) si la composition est invalide.
const assertComposition = (args) => {
  const erreurs = validerComposition(args);
  if (erreurs.length) throw new CompositionError(erreurs);
};

// Erreurs INTRODUITES par une modification : celles de la composition résultante
// dont le code n'existait pas déjà sur la composition courante. Un compte existant
// « hors règles » (état hérité) peut ainsi être modifié tant qu'on n'aggrave pas
// (aucun changement de comportement pour l'existant ; les nouveaux comptes restent
// validés intégralement par clientsController.create).
const erreursIntroduites = (erreursAvant = [], erreursApres = []) => {
  const codesAvant = new Set((erreursAvant || []).map((e) => e.code));
  return (erreursApres || []).filter((e) => !codesAvant.has(e.code));
};

// ── Résolution des composants d'un domaine ───────────────────────────────────

const loadComposantsDomaine = async (db, domaineId) => {
  const r = await db.query(
    'SELECT * FROM domaine_composants WHERE domaine_id = $1 ORDER BY ordre, id',
    [domaineId]
  );
  return r.rows.map(mapComposant);
};

// Composant identité d'un type dans les MOTS d'un domaine (lot 2b §5.4, §6.7) : libellés, genre et
// élision viennent du TERME du lexique du domaine ; icône et ordre, de COMPOSANTS_IDENTITE.
// Table à clés littérales : une par type technique.
const IDENTITE_DU_VOC = Object.freeze({
  activite: (voc) => ({
    libelle: voc.Nom('activite'), libellePluriel: voc.Pl('activite'),
    genre: voc.acc('activite', 'm', 'f'), elision: /^l'/.test(voc.le('activite')),
  }),
  labo: (voc) => ({
    libelle: voc.Nom('labo'), libellePluriel: voc.Pl('labo'),
    genre: voc.acc('labo', 'm', 'f'), elision: /^l'/.test(voc.le('labo')),
  }),
  gerant: (voc) => ({
    libelle: voc.Nom('gerant'), libellePluriel: voc.Pl('gerant'),
    genre: voc.acc('gerant', 'm', 'f'), elision: /^l'/.test(voc.le('gerant')),
  }),
  // Module « Base acheteurs » : invariable (même texte que l'écran Mon abonnement), féminin, élision déduite.
  acheteurs: (voc) => ({
    libelle: `Base ${voc.court('acheteur', true)}`, libellePluriel: `Base ${voc.court('acheteur', true)}`,
    genre: 'f', elision: null,
  }),
});

// Libellés, genre et élision du composant identité `type` du domaine. Le profil est lu ICI
// (getProfil) : la fonction est atteinte par le webhook DocuSeal et par des requêtes admin, qui
// n'ont pas le vocabulaire du compte. Domaine illisible → LÈVE : on n'écrit jamais en base un
// libellé de repli (la transaction de l'appelant est annulée).
const identiteDuDomaine = async (domaineId, type) => {
  const idt = COMPOSANTS_IDENTITE[type];
  if (!idt) throw new Error(`composant identité : type technique inconnu « ${type} »`);
  const profil = await getProfil(domaineId);
  if (!profil || profil.id == null) throw new Error(`composant identité : domaine ${domaineId} illisible, aucun libellé écrit`);
  return { ...idt, ...IDENTITE_DU_VOC[type](vocabDuProfil(profil)) };
};

// Crée (ou réactive) le composant identité d'un type dans un domaine — comme le
// backfill de la migration 187, mais dans les mots du domaine (identiteDuDomaine).
// Renvoie le composant mappé. Le profil du domaine en cache (domaineProfilService, TTL 60 s) n'a pas ce
// composant, et identiteDuDomaine vient de l'y mettre : applyComposants le signale (identitesCreees) et
// l'appelant appelle invaliderProfilApresCommit(resultat) APRÈS son COMMIT (spec §5.4).
// Un composant INACTIF portant déjà ce code est réactivé s'il est du même type (il garde
// son libellé) ; s'il est d'un AUTRE type (créé par l'admin), il n'est jamais retypé (ses
// références garderaient des compteurs faux) : l'identité prend un code suffixé.
const creerComposantIdentite = async (db, domaineId, type) => {
  const idt = await identiteDuDomaine(domaineId, type);
  const insert = (code) => db.query(
    `INSERT INTO domaine_composants (domaine_id, code, libelle, libelle_pluriel, icone, type_technique, ordre, genre, elision)
     VALUES ($1, $2, $3, $4, $5, $6,
             (SELECT COALESCE(MAX(ordre), 0) + 1 FROM domaine_composants WHERE domaine_id = $1),
             $7, $8::boolean)
     ON CONFLICT (domaine_id, code) DO UPDATE SET actif = true
       WHERE domaine_composants.type_technique = EXCLUDED.type_technique
     RETURNING *`,
    [domaineId, code, idt.libelle, idt.libellePluriel, idt.icone, type, idt.genre, idt.elision]
  );
  let r = await insert(idt.code);
  for (let n = 2; !r.rows.length && n <= 20; n++) r = await insert(`${idt.code}_${n}`);
  if (!r.rows.length) throw new Error(`creerComposantIdentite : impossible de créer le composant « ${type} » (domaine ${domaineId})`);
  return mapComposant(r.rows[0]);
};

// Premier composant ACTIF d'un type (ordre, id) dans une liste mappée.
const premierDuType = (composants, type) =>
  (composants || []).find((c) => c.actif && c.typeTechnique === type) || null;

// items: [{ code | composantId, nb }] → composants du domaine (mappés) + nb.
// Un code inconnu ÉGAL à un type technique, sans composant actif de ce type dans le
// domaine, désigne le composant identité : créé à la volée (creer=true, dans la
// transaction) ou renvoyé virtuel (creer=false, validation avant écriture) — avec les
// MÊMES libellé, genre et élision (identiteDuDomaine) : l'aperçu dit ce que la création écrira.
// Codes inconnus / composants inactifs → CompositionError (400) — sauf, avec
// `actuels` (détail souscrit, listComposantsConfig), un composant inactif DÉJÀ
// souscrit dont la quantité ne monte pas (un composant désactivé par l'admin reste
// valide pour les comptes qui l'utilisent ; il ne peut plus être ajouté).
// `crees` (tableau, optionnel) : reçoit chaque composant identité créé à la volée (creer=true).
const resolveComposants = async (db, domaineId, items, { creer = true, actuels = null, crees = null } = {}) => {
  const dispo = await loadComposantsDomaine(db, domaineId);
  const nbActuel = new Map((actuels || []).map((a) => [a.composantId ?? a.id, nbOf(a)]));
  const erreurs = [];
  const out = [];
  for (const it of items || []) {
    const nb = parseInt(it?.nb, 10);
    if (!Number.isFinite(nb) || nb < 0) {
      erreurs.push({ code: 'COMPOSITION_INVALIDE', message: `Quantité invalide pour « ${it?.code ?? it?.composantId ?? '?'} »` });
      continue;
    }
    let comp = null;
    const cid = parseInt(it?.composantId ?? it?.composant_id, 10);
    const code = typeof it?.code === 'string' ? it.code.trim() : null;
    if (Number.isFinite(cid)) comp = dispo.find((c) => c.id === cid) || null;
    else if (code) comp = dispo.find((c) => c.code === code) || null;
    if (!comp && code && TYPES_TECHNIQUES.includes(code) && !premierDuType(dispo, code)) {
      if (creer) {
        comp = await creerComposantIdentite(db, domaineId, code);
        dispo.push(comp);
        if (Array.isArray(crees)) crees.push(comp);
      } else {
        const idt = await identiteDuDomaine(domaineId, code);
        comp = { id: null, ...idt, aide: null, typeTechnique: code, venteActive: true, productionActive: true, nbMin: 0, nbMax: null, actif: true, virtuel: true };
      }
    }
    if (!comp) {
      erreurs.push({ code: 'COMPOSANT_INCONNU', message: `Composant inconnu pour ce domaine : « ${code ?? cid} »` });
      continue;
    }
    if (!comp.actif && !(nbActuel.has(comp.id) && nb <= nbActuel.get(comp.id))) {
      erreurs.push({ code: 'COMPOSANT_INACTIF', message: `Composant désactivé : « ${comp.libelle} »` });
      continue;
    }
    out.push({ ...comp, composantId: comp.id, nb });
  }
  if (erreurs.length) throw new CompositionError(erreurs);
  return out;
};

// Compat anciens payloads : compteurs → [{ code, nb }] sur le PREMIER composant actif
// de chaque type (code = type technique s'il n'en existe aucun : identité créée à
// l'écriture par applyComposants, comme le backfill). Seuls les compteurs > 0 sortent.
const composantsDepuisCompteurs = async (domaineId, compteurs, db = pool) => {
  const k = normCompteurs(compteurs || {});
  const dispo = await loadComposantsDomaine(db, domaineId);
  const parType = { activite: k.nb_activites, labo: k.nb_labos, gerant: k.nb_gerants, acheteurs: k.nb_acheteurs };
  const out = [];
  for (const type of TYPES_TECHNIQUES) {
    const nb = parType[type];
    if (!(nb > 0)) continue;
    const c = premierDuType(dispo, type);
    out.push({ code: c ? c.code : type, nb });
  }
  return out;
};

// Compat anciens payloads sur un compte DÉJÀ détaillé : applique le DELTA des
// compteurs au détail existant (jamais un remplacement total, qui écraserait la
// composition d'un compte multi-composants — ex. restaurant×1 + bar×1 → restaurant×2).
//   • activite/labo/gerant : delta > 0 → ajouté au 1er composant SOUSCRIT du type
//     (sinon 1er composant actif du domaine, sinon identité) ; delta < 0 → retiré
//     en partant du DERNIER composant souscrit du type.
//   • acheteurs : quota cible posé sur le composant souscrit (sinon 1er actif).
// Renvoie [{ composantId | code, nb }] complet (mode 'set'), composants inactifs
// souscrits inclus (tolérés par resolveComposants tant que nb ne monte pas).
const composantsDelta = async (domaineId, compteursCible, actuels, db = pool) => {
  const k = normCompteurs(compteursCible || {});
  const dispo = await loadComposantsDomaine(db, domaineId);
  const cible = { activite: k.nb_activites, labo: k.nb_labos, gerant: k.nb_gerants, acheteurs: k.nb_acheteurs };
  const lignes = (actuels || []).map((a) => ({ composantId: a.composantId ?? a.id ?? null, code: a.code, typeTechnique: a.typeTechnique, nb: nbOf(a) }));
  const out = [];
  for (const type of TYPES_TECHNIQUES) {
    const duType = lignes.filter((l) => l.typeTechnique === type);
    if (type === 'acheteurs') {
      const port = duType[0] || null;
      const reste = duType.slice(1).map((l) => ({ composantId: l.composantId, nb: 0 }));
      if (port) out.push({ composantId: port.composantId, nb: cible.acheteurs }, ...reste);
      else if (cible.acheteurs > 0) { const c = premierDuType(dispo, type); out.push({ code: c ? c.code : type, nb: cible.acheteurs }); }
      continue;
    }
    let delta = cible[type] - duType.reduce((s, l) => s + l.nb, 0);
    if (delta > 0) {
      if (duType[0]) duType[0].nb += delta;
      else { const c = premierDuType(dispo, type); duType.push({ code: c ? c.code : type, nb: delta }); }
    } else if (delta < 0) {
      for (let i = duType.length - 1; i >= 0 && delta < 0; i--) {
        const retire = Math.min(duType[i].nb, -delta);
        duType[i].nb -= retire;
        delta += retire;
      }
    }
    for (const l of duType) out.push(l.composantId != null ? { composantId: l.composantId, nb: l.nb } : { code: l.code, nb: l.nb });
  }
  return out;
};

// Détail par composant d'un abonnement (rows nb > 0, triés ordre/id).
const listComposantsConfig = async (aboId, db = pool) => {
  const r = await db.query(
    `SELECT acc.composant_id, acc.nb, dc.*
       FROM abonnement_config_composants acc
       JOIN domaine_composants dc ON dc.id = acc.composant_id
      WHERE acc.abonnement_id = $1
      ORDER BY dc.ordre, dc.id`,
    [aboId]
  );
  return r.rows.map((row) => ({
    composantId: row.composant_id,
    code: row.code,
    libelle: row.libelle,
    libellePluriel: row.libelle_pluriel ?? null,
    genre: row.genre === 'f' ? 'f' : 'm',
    elision: typeof row.elision === 'boolean' ? row.elision : null,
    icone: row.icone ?? null,
    typeTechnique: row.type_technique,
    nb: parseInt(row.nb, 10) || 0,
  }));
};

// SEUL écrivain des compteurs. `db` = client de transaction (ou pool).
//   mode 'set' : remplace TOUT le détail par `composants`
//   mode 'add' : incrémente les composants activite/labo/gerant ; un composant
//                acheteurs REMPLACE le quota (cible de palier, jamais un cumul)
// `domaineId` (optionnel) : écrit aussi abonnement_config.domaine_id.
// Renvoie { domaineId, compteurs, composants, identitesCreees } après recalcul. identitesCreees : un
// composant identité a été créé dans le domaine → l'appelant appelle invaliderProfilApresCommit(resultat)
// APRÈS son COMMIT (jamais avant : un chargement concurrent remettrait en cache le profil sans la ligne).
const applyComposants = async (db, aboId, { domaineId = null, composants = [], mode = 'set' } = {}) => {
  if (!['set', 'add'].includes(mode)) throw new Error(`applyComposants : mode inconnu « ${mode} »`);
  const cfgRes = await db.query('SELECT * FROM abonnement_config WHERE abonnement_id = $1 FOR UPDATE', [aboId]);
  const cfg = cfgRes.rows[0];
  if (!cfg) throw new Error(`applyComposants : abonnement_config introuvable (abonnement ${aboId})`);

  let domId = parseInt(domaineId, 10);
  if (!Number.isFinite(domId) || domId <= 0) domId = cfg.domaine_id ?? null;
  if (domId == null) domId = await getDomaineDefautId(db);
  if (domId == null) throw new Error('applyComposants : aucun domaine (slug restauration absent)');

  // Détail souscrit : un composant inactif déjà présent reste accepté (nb non croissant)
  const actuels = await listComposantsConfig(aboId, db);
  const crees = [];
  const resolved = await resolveComposants(db, domId, composants, { creer: true, actuels, crees });

  if (mode === 'set') {
    await db.query('DELETE FROM abonnement_config_composants WHERE abonnement_id = $1', [aboId]);
    // Agrégation des doublons (même composant envoyé deux fois) puis insertion des nb > 0
    const parId = new Map();
    for (const c of resolved) parId.set(c.composantId, (parId.get(c.composantId) || 0) + c.nb);
    for (const [composantId, nb] of parId) {
      if (nb <= 0) continue;
      await db.query(
        'INSERT INTO abonnement_config_composants (abonnement_id, composant_id, nb) VALUES ($1, $2, $3)',
        [aboId, composantId, nb]
      );
    }
  } else {
    for (const c of resolved) {
      if (c.typeTechnique === 'acheteurs') {
        // Quota cible : remplace toute ligne acheteurs existante
        await db.query(
          `DELETE FROM abonnement_config_composants acc
            USING domaine_composants dc
            WHERE dc.id = acc.composant_id AND acc.abonnement_id = $1 AND dc.type_technique = 'acheteurs'`,
          [aboId]
        );
        if (c.nb > 0) {
          await db.query(
            'INSERT INTO abonnement_config_composants (abonnement_id, composant_id, nb) VALUES ($1, $2, $3)',
            [aboId, c.composantId, c.nb]
          );
        }
      } else if (c.nb > 0) {
        await db.query(
          `INSERT INTO abonnement_config_composants (abonnement_id, composant_id, nb) VALUES ($1, $2, $3)
           ON CONFLICT (abonnement_id, composant_id) DO UPDATE SET nb = abonnement_config_composants.nb + EXCLUDED.nb`,
          [aboId, c.composantId, c.nb]
        );
      }
    }
  }

  const rows = await listComposantsConfig(aboId, db);
  const compteurs = deriveCompteurs(rows);
  // Formule : NULL sans activité ; un compte qui (re)gagne des activités reçoit
  // premium par défaut (mêmes règles que les anciens écrivains).
  await db.query(
    `UPDATE abonnement_config
        SET nb_activites = $2, nb_labos = $3, nb_gerants = $4, nb_acheteurs = $5,
            domaine_id = $6,
            formule_activites = CASE WHEN $2::int = 0 THEN NULL ELSE COALESCE(formule_activites, 'premium') END,
            updated_at = NOW()
      WHERE abonnement_id = $1`,
    [aboId, compteurs.nb_activites, compteurs.nb_labos, compteurs.nb_gerants, compteurs.nb_acheteurs, domId]
  );
  return { domaineId: domId, compteurs, composants: rows, identitesCreees: crees.length > 0 };
};

// Après le COMMIT de la transaction d'un applyComposants (spec §5.4) : si un composant identité a été créé à
// la volée, le profil du domaine en cache ne l'a pas (pastilles, glossaire, /auth/me, GET /api/domaines) ; on
// l'oublie. Au mieux : ne lève jamais, la configuration est déjà écrite. `resultat` absent (aucun
// applyComposants dans la transaction) : rien.
const invaliderProfilApresCommit = (resultat) => {
  try {
    if (resultat && resultat.identitesCreees && resultat.domaineId != null) invalidate(resultat.domaineId);
  } catch (e) {
    console.error('[composants] invalidation du profil du domaine :', e.message);
  }
};

module.exports = {
  CompositionError,
  deriveCompteurs, normCompteurs, validerComposition, assertComposition, erreursIntroduites,
  loadComposantsDomaine, resolveComposants, creerComposantIdentite, identiteDuDomaine, premierDuType,
  composantsDepuisCompteurs, composantsDelta, applyComposants, invaliderProfilApresCommit, listComposantsConfig,
};
