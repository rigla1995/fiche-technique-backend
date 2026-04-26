require('dotenv').config();
const pool = require('../src/config/database');

async function main() {
  const client = await pool.connect();
  try {
    // Find enterprise user
    const userRes = await client.query(
      "SELECT id, nom, email, compte_type, onboarding_step FROM utilisateurs WHERE compte_type = 'entreprise' LIMIT 1"
    );
    if (userRes.rows.length === 0) {
      console.log('No enterprise user found.');
      return;
    }
    const user = userRes.rows[0];
    console.log(`\nEnterprise user: ${user.nom} (id=${user.id}, email=${user.email}, onboarding_step=${user.onboarding_step})`);

    // Find profil_entreprise
    const epRes = await client.query(
      'SELECT id, nom, telephone, email, meme_activite FROM profil_entreprise WHERE client_id = $1',
      [user.id]
    );
    if (epRes.rows.length === 0) {
      console.log('No profil_entreprise found.');
      return;
    }
    const ep = epRes.rows[0];
    console.log(`Entreprise: ${ep.nom} (id=${ep.id}, meme_activite=${ep.meme_activite})`);

    // List all activities with type
    const actRes = await client.query(
      'SELECT id, nom, type, franchise_group FROM activites WHERE entreprise_id = $1 ORDER BY created_at ASC',
      [ep.id]
    );
    console.log(`\nActivities (${actRes.rows.length} total):`);
    for (const row of actRes.rows) {
      const ingCountRes = await client.query(
        'SELECT COUNT(*) FROM activite_ingredient_selections WHERE activite_id = $1',
        [row.id]
      );
      const ingCount = parseInt(ingCountRes.rows[0].count);
      console.log(`  id=${row.id}  type="${row.type}"  group="${row.franchise_group}"  ingredients=${ingCount}  nom="${row.nom}"`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => { console.error(err.message); process.exit(1); });
