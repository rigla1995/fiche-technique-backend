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

    // 2. Find or get their profil_entreprise
    const epRes = await client.query(
      'SELECT id FROM profil_entreprise WHERE client_id = $1',
      [clientId]
    );
    if (epRes.rows.length === 0) {
      throw new Error('No profil_entreprise found for this user. Aborting.');
    }
    const entrepriseId = epRes.rows[0].id;
    console.log(`Entreprise id: ${entrepriseId}`);

    // 3. Delete in dependency order
    console.log('Clearing existing data...');

    // Stock tables
    await client.query(`
      DELETE FROM stock_entreprise_daily sed
      USING activites a
      WHERE sed.activite_id = a.id AND a.entreprise_id = $1
    `, [entrepriseId]);

    // Manual prices for products of this client
    await client.query(
      'DELETE FROM fiche_technique_manual_prices WHERE client_id = $1',
      [clientId]
    );

    // Products
    await client.query('DELETE FROM produit_sous_produits WHERE produit_id IN (SELECT id FROM produits WHERE client_id = $1)', [clientId]);
    await client.query('DELETE FROM produit_ingredients WHERE produit_id IN (SELECT id FROM produits WHERE client_id = $1)', [clientId]);
    await client.query('DELETE FROM produits WHERE client_id = $1', [clientId]);

    // Activity ingredient selections
    await client.query(`
      DELETE FROM activite_ingredient_selections ais
      USING activites a
      WHERE ais.activite_id = a.id AND a.entreprise_id = $1
    `, [entrepriseId]);

    // Activities
    await client.query('DELETE FROM activites WHERE entreprise_id = $1', [entrepriseId]);

    // 4. Create franchise "Alpha" with 2 activities
    const alpha1 = await client.query(
      `INSERT INTO activites (entreprise_id, nom, type, franchise_group) VALUES ($1, 'Alpha Paris', 'franchise', 'Alpha') RETURNING id`,
      [entrepriseId]
    );
    const alpha2 = await client.query(
      `INSERT INTO activites (entreprise_id, nom, type, franchise_group) VALUES ($1, 'Alpha Lyon', 'franchise', 'Alpha') RETURNING id`,
      [entrepriseId]
    );

    // 5. Create franchise "Beta" with 2 activities
    const beta1 = await client.query(
      `INSERT INTO activites (entreprise_id, nom, type, franchise_group) VALUES ($1, 'Beta Paris', 'franchise', 'Beta') RETURNING id`,
      [entrepriseId]
    );
    const beta2 = await client.query(
      `INSERT INTO activites (entreprise_id, nom, type, franchise_group) VALUES ($1, 'Beta Lyon', 'franchise', 'Beta') RETURNING id`,
      [entrepriseId]
    );

    // 6. Create 2 distinct activities
    const gamma = await client.query(
      `INSERT INTO activites (entreprise_id, nom, type) VALUES ($1, 'Gamma Indép', 'distincte') RETURNING id`,
      [entrepriseId]
    );
    const delta = await client.query(
      `INSERT INTO activites (entreprise_id, nom, type) VALUES ($1, 'Delta Corner', 'distincte') RETURNING id`,
      [entrepriseId]
    );

    await client.query('COMMIT');

    console.log('\nSeed complete:');
    console.log(`  Franchise Alpha: Alpha Paris (id=${alpha1.rows[0].id}), Alpha Lyon (id=${alpha2.rows[0].id})`);
    console.log(`  Franchise Beta:  Beta Paris  (id=${beta1.rows[0].id}), Beta Lyon  (id=${beta2.rows[0].id})`);
    console.log(`  Distinct: Gamma Indép (id=${gamma.rows[0].id}), Delta Corner (id=${delta.rows[0].id})`);
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
