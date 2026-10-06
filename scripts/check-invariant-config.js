/* Invariant lot 1a — pour TOUS les abonnement_config :
 *   (1) domaine_id posé ;
 *   (2) Σ composants par type (acheteurs = MAX) = compteurs nb_activites/nb_labos/nb_gerants/nb_acheteurs ;
 *   (3) mensualité résolue sur la grille du domaine = mensualité sur la grille générale
 *       tant que tarifs_domaine n'a AUCUNE surcharge pour ce domaine (sinon : signalée, non comptée).
 * Aucun backend requis (lecture directe de la base). Exit ≠ 0 si un écart est trouvé. */
require('dotenv').config();
const pool = require('../src/config/database');
const { tarifsFor, computeMensuelTotalFromConfig } = require('../src/services/pricingEngine');
const { deriveCompteurs } = require('../src/services/configComposantsService');

(async () => {
  const [cfgs, comps, baseRes, ovRes] = await Promise.all([
    pool.query(
      // LabFlow Compta (S2b) : un cabinet n'a ni domaine ni composant, il est hors de ce contrôle.
      `SELECT ac.*, a.client_id FROM abonnement_config ac JOIN abonnements a ON a.id = ac.abonnement_id WHERE a.produit = 'labflow' ORDER BY ac.id`
    ),
    pool.query(
      `SELECT acc.abonnement_id, acc.nb, dc.type_technique, dc.code, dc.domaine_id
         FROM abonnement_config_composants acc JOIN domaine_composants dc ON dc.id = acc.composant_id`
    ),
    pool.query('SELECT cle, valeur_dt FROM tarifs_config'),
    pool.query('SELECT domaine_id, cle, valeur_dt FROM tarifs_domaine'),
  ]);
  const base = {};
  baseRes.rows.forEach((r) => { base[r.cle] = parseFloat(r.valeur_dt); });
  const overridesByDomaine = {};
  ovRes.rows.forEach((r) => {
    const k = String(r.domaine_id);
    if (!overridesByDomaine[k]) overridesByDomaine[k] = {};
    overridesByDomaine[k][r.cle] = parseFloat(r.valeur_dt);
  });
  const t = { base, overridesByDomaine };

  const byAbo = new Map();
  for (const c of comps.rows) {
    if (!byAbo.has(c.abonnement_id)) byAbo.set(c.abonnement_id, []);
    byAbo.get(c.abonnement_id).push(c);
  }

  let erreurs = 0;
  let surcharges = 0;
  for (const cfg of cfgs.rows) {
    const tag = `config ${cfg.id} (abo ${cfg.abonnement_id}, client ${cfg.client_id})`;
    if (cfg.domaine_id == null) { console.log(`❌ ${tag} : domaine_id NULL`); erreurs++; continue; }
    const list = byAbo.get(cfg.abonnement_id) || [];
    const etranger = list.filter((c) => c.domaine_id !== cfg.domaine_id);
    if (etranger.length) {
      console.log(`❌ ${tag} : composant(s) d'un autre domaine : ${etranger.map((e) => e.code).join(', ')}`);
      erreurs++;
    }
    const d = deriveCompteurs(list);
    const attendu = {
      nb_activites: parseInt(cfg.nb_activites, 10) || 0,
      nb_labos: parseInt(cfg.nb_labos, 10) || 0,
      nb_gerants: parseInt(cfg.nb_gerants, 10) || 0,
      nb_acheteurs: parseInt(cfg.nb_acheteurs, 10) || 0,
    };
    const diff = Object.keys(attendu).filter((k) => attendu[k] !== d[k]);
    if (diff.length) {
      console.log(`❌ ${tag} : compteurs ≠ Σ composants — ${diff.map((k) => `${k} ${attendu[k]}/${d[k]}`).join(', ')}`);
      erreurs++;
    }
    const mDom = computeMensuelTotalFromConfig(cfg, tarifsFor(t, cfg.domaine_id));
    const mGen = computeMensuelTotalFromConfig(cfg, tarifsFor(t, null));
    if (overridesByDomaine[String(cfg.domaine_id)]) {
      surcharges++;
      if (mDom !== mGen) console.log(`ℹ️  ${tag} : surcharge tarifaire du domaine ${cfg.domaine_id} → mensualité ${mDom} (générale ${mGen})`);
    } else if (mDom !== mGen) {
      console.log(`❌ ${tag} : mensualité domaine ${mDom} ≠ générale ${mGen} sans surcharge`);
      erreurs++;
    }
  }
  console.log(`\n${cfgs.rows.length} config(s) contrôlée(s), ${surcharges} sous surcharge de domaine, ${erreurs} écart(s).`);
  await pool.end();
  process.exit(erreurs ? 1 : 0);
})().catch((e) => { console.error('ERREUR FATALE', e); process.exit(1); });
