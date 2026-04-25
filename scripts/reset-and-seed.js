/**
 * Reset script: clears activities, products, stock data, then seeds test data.
 * Keeps: utilisateurs, ingredients, categories, unites, domaines, ingredient_prix_client
 *
 * Creates for the first enterprise account found:
 *   - Franchise "Alpha" with activities "Alpha Paris" and "Alpha Lyon"
 *   - Franchise "Beta"  with activities "Beta Paris"  and "Beta Lyon"
 *   - Distinct activity "Gamma Indép"
 *   - Distinct activity "Delta Corner"
 *
 * Also assigns all available ingredients to every activity and unlocks the account.
 *
 * Run: node scripts/reset-and-seed.js
 */

require('dotenv').config();
const pool = require('../src/config/database');

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Find the first enterprise account
    const userRes = await client.query(
      "SELECT id FROM utilisateurs WHERE compte_type = 'entreprise' LIMIT 1"
    );
    if (userRes.rows.length === 0) {
      throw new Error('No enterprise account found. Aborting.');
    }
    const clientId = userRes.rows[0].id;
    console.log(`Enterprise user id: ${clientId}`);

    // 2. Find their profil_entreprise
    const epRes = await client.query(
      'SELECT id FROM profil_entreprise WHERE client_id = $1',
      [clientId]
    );
    if (epRes.rows.length === 0) {
      throw new Error('No profil_entreprise found for this user. Aborting.');
    }
    const entrepriseId = epRes.rows[0].id;
    console.log(`Entreprise id: ${entrepriseId}`);

    // 3. Update profil_entreprise with fake Tunisian data
    await client.query(
      `UPDATE profil_entreprise
       SET telephone = '+216 71 234 567', email = 'contact@coco-franchise.tn',
           adresse = '12 Rue de la Liberté, 1001 Tunis', updated_at = NOW()
       WHERE id = $1`,
      [entrepriseId]
    );

    // 4. Clear existing data in dependency order
    console.log('Clearing existing data...');

    await client.query(`
      DELETE FROM stock_entreprise_daily sed
      USING activites a
      WHERE sed.activite_id = a.id AND a.entreprise_id = $1
    `, [entrepriseId]);

    await client.query(
      'DELETE FROM fiche_technique_manual_prices WHERE client_id = $1',
      [clientId]
    );

    await client.query('DELETE FROM produit_sous_produits WHERE produit_id IN (SELECT id FROM produits WHERE client_id = $1)', [clientId]);
    await client.query('DELETE FROM produit_ingredients WHERE produit_id IN (SELECT id FROM produits WHERE client_id = $1)', [clientId]);
    await client.query('DELETE FROM produits WHERE client_id = $1', [clientId]);

    await client.query(`
      DELETE FROM activite_ingredient_selections ais
      USING activites a
      WHERE ais.activite_id = a.id AND a.entreprise_id = $1
    `, [entrepriseId]);

    await client.query('DELETE FROM activites WHERE entreprise_id = $1', [entrepriseId]);

    // 5. Get all available ingredient IDs
    const ingRes = await client.query('SELECT id FROM ingredients ORDER BY id');
    const ingredientIds = ingRes.rows.map((r) => r.id);
    console.log(`Found ${ingredientIds.length} ingredients to assign`);

    // 6. Helper: create activity + assign all ingredients + fake contact data
    const createActivity = async (nom, type, group, phone, email, adresse) => {
      const res = await client.query(
        `INSERT INTO activites (entreprise_id, nom, type, franchise_group, telephone, email, adresse)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [entrepriseId, nom, type, group, phone, email, adresse]
      );
      const actId = res.rows[0].id;
      // Assign all ingredients
      for (const ingId of ingredientIds) {
        await client.query(
          'INSERT INTO activite_ingredient_selections (activite_id, ingredient_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [actId, ingId]
        );
      }
      return actId;
    };

    // 7. Create franchise "Alpha" (2 activities)
    const alpha1Id = await createActivity(
      'Alpha Paris', 'franchise', 'Alpha',
      '+216 55 111 222', 'alpha.paris@coco.tn',
      '45 Avenue Habib Bourguiba, 1000 Tunis'
    );
    const alpha2Id = await createActivity(
      'Alpha Lyon', 'franchise', 'Alpha',
      '+216 55 333 444', 'alpha.lyon@coco.tn',
      '8 Rue Ibn Khaldoun, 2000 Le Bardo'
    );

    // 8. Create franchise "Beta" (2 activities)
    const beta1Id = await createActivity(
      'Beta Paris', 'franchise', 'Beta',
      '+216 98 555 666', 'beta.paris@coco.tn',
      '22 Rue de Marseille, 3000 Sfax'
    );
    const beta2Id = await createActivity(
      'Beta Lyon', 'franchise', 'Beta',
      '+216 98 777 888', 'beta.lyon@coco.tn',
      '17 Avenue Farhat Hached, 4000 Sousse'
    );

    // 9. Create 2 distinct activities
    const gammaId = await createActivity(
      'Gamma Indép', 'distincte', null,
      '+216 22 999 000', 'gamma@coco.tn',
      '3 Impasse des Jasmins, 5000 Monastir'
    );
    const deltaId = await createActivity(
      'Delta Corner', 'distincte', null,
      '+216 29 123 456', 'delta@coco.tn',
      '60 Boulevard 7 Novembre, 6000 Gabès'
    );

    // 10. Unlock the account (onboarding_step = 0)
    await client.query(
      'UPDATE utilisateurs SET onboarding_step = 0, updated_at = NOW() WHERE id = $1',
      [clientId]
    );

    await client.query('COMMIT');

    console.log('\nSeed complete:');
    console.log(`  Franchise Alpha: Alpha Paris (id=${alpha1Id}), Alpha Lyon (id=${alpha2Id})`);
    console.log(`  Franchise Beta:  Beta Paris  (id=${beta1Id}), Beta Lyon  (id=${beta2Id})`);
    console.log(`  Distinct: Gamma Indép (id=${gammaId}), Delta Corner (id=${deltaId})`);
    console.log(`  Ingredients assigned to all activities: ${ingredientIds.length}`);
    console.log('  Onboarding unlocked (step=0)');
    console.log('\nDone! Restart the backend server if needed.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
