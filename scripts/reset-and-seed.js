/**
 * Full reset + seed script.
 * Run: node scripts/reset-and-seed.js
 *
 * Accounts created:
 *   entreprise:   coco@coco.tn  / Test@1234  (step 2: ready to create activities via UI)
 *   indépendant:  solo@coco.tn  / Test@1234  (step 0: fully onboarded)
 *
 * No activities are seeded — create them through the UI to avoid type issues.
 */

require('dotenv').config();
const pool = require('../src/config/database');
const bcrypt = require('bcryptjs');

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Clear sub-product references first (RESTRICT FK blocks cascade) ─────
    await client.query(`
      DELETE FROM produit_sous_produits
      WHERE sous_produit_id IN (
        SELECT p.id FROM produits p
        JOIN utilisateurs u ON p.client_id = u.id
        WHERE u.role != 'super_admin'
      )
    `);

    // ── Wipe all non-admin users (CASCADE removes everything linked) ─────────
    console.log('Deleting all non-admin users...');
    const del = await client.query(
      "DELETE FROM utilisateurs WHERE role != 'super_admin' RETURNING id, email"
    );
    console.log(`  Deleted ${del.rows.length} user(s): ${del.rows.map((r) => r.email).join(', ')}`);

    // ── Hash password ────────────────────────────────────────────────────────
    const passwordHash = await bcrypt.hash('Test@1234', 10);

    // ── Create enterprise user at onboarding step 2 (password already changed,
    //    no activities yet — user will create them via UI) ────────────────────
    const epUserRes = await client.query(
      `INSERT INTO utilisateurs (nom, email, mot_de_passe, role, compte_type, onboarding_step)
       VALUES ('Coco Enterprise', 'coco@coco.tn', $1, 'client', 'entreprise', 2)
       RETURNING id`,
      [passwordHash]
    );
    const clientId = epUserRes.rows[0].id;
    console.log(`Enterprise user: coco@coco.tn (id=${clientId}, onboarding_step=2)`);

    // ── Create profil_entreprise (meme_activite = NULL, no activities yet) ───
    const epRes = await client.query(
      `INSERT INTO profil_entreprise (client_id, nom, email, telephone, adresse)
       VALUES ($1, 'Coco Franchise', 'contact@coco-franchise.tn', '+216 71 234 567', '12 Rue de la Liberté, 1001 Tunis')
       RETURNING id`,
      [clientId]
    );
    console.log(`Entreprise profile: id=${epRes.rows[0].id}`);

    // ── Create independent user (fully onboarded) ────────────────────────────
    const indepRes = await client.query(
      `INSERT INTO utilisateurs (nom, email, mot_de_passe, role, compte_type, onboarding_step)
       VALUES ('Solo Indépendant', 'solo@coco.tn', $1, 'client', 'independant', 0)
       RETURNING id`,
      [passwordHash]
    );
    console.log(`Independent user: solo@coco.tn (id=${indepRes.rows[0].id})`);

    await client.query('COMMIT');
    console.log('\n✅ Reset complete.');
    console.log('   Enterprise: coco@coco.tn / Test@1234  → will land on activity creation screen');
    console.log('   Independent: solo@coco.tn / Test@1234');
    console.log('\n   Redémarre le backend puis connecte-toi à coco@coco.tn pour créer les activités via l\'UI.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\nError:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
