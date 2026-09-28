// Garde serveur de quota (lot 1b, spec §3.4) — par TYPE technique, jamais par composant.
// Quota = compteurs du DERNIER abonnement du compte (ORDER BY a.id DESC LIMIT 1, même requête que
// requireFormulePremium) ; sans config → aucune garde. La règle « 3 gérants gratuits » reste une
// règle de TARIFICATION, jamais un quota.
//
//   checkQuota(db, clientId, 'activite' | 'labo' | 'gerant')
//     → null si OK, sinon { code: 'LIMITE_ATTEINTE', type, actuel, max, message } (à renvoyer en 409)
const pool = require('../config/database');

const LIBELLES = {
  activite: { col: 'nb_activites', sg: 'activité', pl: 'activités' },
  labo: { col: 'nb_labos', sg: 'labo', pl: 'labos' },
  gerant: { col: 'nb_gerants', sg: 'gérant', pl: 'gérants' },
};

async function checkQuota(db, clientId, type) {
  const d = db || pool;
  const def = LIBELLES[type];
  if (!def) throw new Error(`quotaService: type inconnu « ${type} »`);
  const cfg = await d.query(
    `SELECT ac.nb_activites, ac.nb_labos, ac.nb_gerants
       FROM abonnements a JOIN abonnement_config ac ON ac.abonnement_id = a.id
      WHERE a.client_id = $1
      ORDER BY a.id DESC LIMIT 1`,
    [clientId]
  );
  if (!cfg.rows.length) return null;
  const max = parseInt(cfg.rows[0][def.col], 10);
  if (!Number.isFinite(max)) return null;

  let actuel = 0;
  if (type === 'gerant') {
    // Actifs + inactifs (miroir de GerantsPage : gerants.length >= nbGerants).
    const r = await d.query(`SELECT COUNT(*)::int AS n FROM utilisateurs WHERE role = 'gerant' AND gerant_parent_id = $1`, [clientId]);
    actuel = r.rows[0].n;
  } else {
    const table = type === 'activite' ? 'activites' : 'labos';
    const r = await d.query(
      `SELECT COUNT(*)::int AS n FROM ${table} t
        JOIN profil_entreprise pe ON pe.id = t.entreprise_id
       WHERE pe.client_id = $1`,
      [clientId]
    );
    actuel = r.rows[0].n;
  }
  if (actuel < max) return null;
  return {
    code: 'LIMITE_ATTEINTE',
    type,
    actuel,
    max,
    message: `Limite atteinte : votre formule comprend ${max} ${max > 1 ? def.pl : def.sg} — quota entièrement utilisé (${actuel}/${max}). Demandez un avenant pour en ajouter.`,
  };
}

module.exports = { checkQuota };
