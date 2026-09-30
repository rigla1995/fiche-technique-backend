// Contrôle EN LECTURE SEULE à lancer sur la base de PRODUCTION avant de déployer le backend du lot 2a
// (spec docs/lot-2-spec.md §1.5 et §6) : ce que la migration 191 va toucher ou signaler.
//
//   node scripts/controle-avant-191.js            (variables DB_* du .env, comme les autres scripts)
//
// Trois lectures, aucune écriture, code de sortie 0 dans tous les cas :
//   1. entrées de lexique enregistrées par l'ancienne interface (sg sans pl, g ou el) : l'étape 0 les complète ;
//   2. lexique du domaine « restauration » : l'étape 2 le remet à vide (l'ancienne valeur n'est tracée que dans
//      le journal du conteneur) — le garder ici ;
//   3. domaines HORS restauration qui ont des comptes ET un lexique non vide : dès le déploiement, ces comptes
//      lisent ces mots à l'écran (avant le lot 2, le lexique n'avait aucun effet) — à corriger dans l'admin AVANT
//      de déployer si un mot n'est pas voulu.
// Chaque résultat est imprimé en JSON : à conserver avec le compte rendu du déploiement.
require('dotenv').config();
const pool = require('../src/config/database');

const REQUETES = [
  ['1. entrées incomplètes que l\'étape 0 complètera (sg sans pl, g ou el)',
    `SELECT d.slug, e.key, e.value
       FROM domaines_activite d, jsonb_each(d.lexique) e
      WHERE jsonb_typeof(d.lexique) = 'object' AND jsonb_typeof(e.value) = 'object'
        AND COALESCE(btrim(e.value ->> 'sg'), '') <> ''
        AND NOT (COALESCE(btrim(e.value ->> 'pl'), '') <> ''
                 AND COALESCE(e.value ->> 'g', '') IN ('m', 'f')
                 AND jsonb_typeof(e.value -> 'el') IS NOT DISTINCT FROM 'boolean')
      ORDER BY d.slug, e.key`],
  ['2. lexique du domaine « restauration » (remis à vide par l\'étape 2 ; à garder)',
    `SELECT slug, lexique FROM domaines_activite WHERE slug = 'restauration'`],
  ['3. domaines hors restauration avec des comptes ET un lexique non vide (leurs comptes verront ces mots)',
    `SELECT da.slug, COUNT(DISTINCT ac.abonnement_id) AS comptes, da.lexique
       FROM domaines_activite da
       JOIN abonnement_config ac ON ac.domaine_id = da.id
      WHERE da.slug <> 'restauration' AND da.lexique IS NOT NULL AND da.lexique <> '{}'::jsonb
      GROUP BY da.slug, da.lexique
      ORDER BY da.slug`],
];

async function main() {
  const client = await pool.connect();
  try {
    await client.query('SET default_transaction_read_only = on'); // la session ne peut rien écrire
    for (const [titre, sql] of REQUETES) {
      const { rows } = await client.query(sql);
      console.log(`\n── ${titre} : ${rows.length} ligne(s)`);
      for (const r of rows) console.log(JSON.stringify(r));
    }
    const resto = await client.query(`SELECT lexique FROM domaines_activite WHERE slug = 'restauration' AND lexique <> '{}'::jsonb`);
    const autres = await client.query(REQUETES[2][1]);
    console.log('');
    if (resto.rows.length) console.log('→ Le lexique « restauration » ci-dessus sera remis à vide par la migration 191 : conserver cette sortie.');
    if (autres.rows.length) console.log('→ Corriger dans l\'admin, AVANT le déploiement, tout mot non voulu des domaines de la liste 3.');
    if (!resto.rows.length && !autres.rows.length) console.log('→ Rien à reprendre avant le déploiement.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => { console.error('controle-avant-191 :', e.message); process.exit(1); });
