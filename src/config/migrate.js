require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./database');

async function migrate() {
  // Ensure tracking table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Backfill for existing DBs that predate tracking:
  // If _migrations is empty but labo_pertes exists, all 034 migrations are already applied.
  const { rows: countRows } = await pool.query('SELECT COUNT(*) FROM _migrations');
  if (parseInt(countRows[0].count) === 0) {
    const { rows: tableRows } = await pool.query(`
      SELECT EXISTS(
        SELECT 1 FROM information_schema.tables WHERE table_name = 'labo_pertes'
      ) AS has_labo_pertes,
      EXISTS(
        SELECT 1 FROM information_schema.tables WHERE table_name = 'client_pertes'
      ) AS has_client_pertes,
      EXISTS(
        SELECT 1 FROM information_schema.tables WHERE table_name = 'stock_produits_transformes'
      ) AS has_spt
    `);
    const { has_labo_pertes, has_client_pertes, has_spt } = tableRows[0];

    // Determine highest applied migration number from DB artifacts
    let maxApplied = 0;
    if (has_labo_pertes) maxApplied = 34;
    else if (has_client_pertes) maxApplied = 32;
    else if (has_spt) maxApplied = 31;

    if (maxApplied > 0) {
      const migrationsDir = path.join(__dirname, '../../migrations');
      const allFiles = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort();

      for (const file of allFiles) {
        const num = parseInt(file.split('_')[0], 10);
        if (num <= maxApplied) {
          await pool.query(
            'INSERT INTO _migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
            [file]
          );
        }
      }
      console.log(`Base de données existante détectée — migrations 001-0${maxApplied} marquées comme appliquées`);
    }
  }

  // Load applied set
  const { rows: appliedRows } = await pool.query('SELECT filename FROM _migrations');
  const appliedSet = new Set(appliedRows.map(r => r.filename));

  const migrationsDir = path.join(__dirname, '../../migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`Migration deja appliquee: ${file}`);
      continue;
    }
    const sqlPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(sqlPath, 'utf-8');
    try {
      await pool.query(sql);
      await pool.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
      console.log(`Migration appliquee: ${file}`);
    } catch (err) {
      console.error(`Erreur lors de la migration ${file}:`, err.message);
      throw err;
    }
  }

  console.log('Toutes les migrations effectuees avec succes');
}

module.exports = migrate;

// Allow standalone execution: node src/config/migrate.js
if (require.main === module) {
  migrate().then(() => pool.end()).catch(() => process.exit(1));
}
