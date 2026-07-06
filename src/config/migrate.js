require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./database');

// Constant key for the global advisory lock guarding the migration run.
// Ensures a single instance migrates at a time (rolling deploy / scale-up safe).
const MIGRATION_LOCK_KEY = 947812365;

async function runSetup(client) {
  // Ensure tracking table exists
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Backfill for existing DBs that predate tracking:
  // If _migrations is empty but labo_pertes exists, all 034 migrations are already applied.
  const { rows: countRows } = await client.query('SELECT COUNT(*) FROM _migrations');
  if (parseInt(countRows[0].count) === 0) {
    const { rows: tableRows } = await client.query(`
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
          await client.query(
            'INSERT INTO _migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
            [file]
          );
        }
      }
      console.log(`Base de données existante détectée — migrations 001-0${maxApplied} marquées comme appliquées`);
    }
  }
}

async function migrate() {
  const client = await pool.connect();
  let locked = false;
  try {
    // Migrations may run heavy DDL/backfills — don't let the pool's statement_timeout kill them.
    await client.query('SET statement_timeout = 0');

    // Serialize migrations across instances: only one process holds the lock and migrates,
    // the others block here and then find everything already applied.
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    locked = true;

    await runSetup(client);

    // Load applied set (after acquiring the lock, so we see another instance's work)
    const { rows: appliedRows } = await client.query('SELECT filename FROM _migrations');
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
      // Apply the file SQL and record it in _migrations ATOMICALLY: if the SQL fails
      // mid-file it rolls back entirely, so the schema is never left half-applied and
      // the file is not marked done (it will be retried cleanly on the next boot).
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`Migration appliquee: ${file}`);
      } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) { /* connection may be broken */ }
        console.error(`Erreur lors de la migration ${file}:`, err.message);
        throw err;
      }
    }

    // ── Backfills applicatifs one-shot (JS) ─────────────────────────────────────
    // Même tracking _migrations que les .sql (le suffixe .js les distingue) et même
    // advisory lock : une seule instance exécute. Non bloquants pour le boot : ces
    // backfills corrigent des DONNÉES d'affichage, pas le schéma — un échec est
    // loggé et retenté au prochain démarrage, sans marquer la clé comme appliquée.
    const jsBackfills = [
      {
        key: '137_backfill_pt_activite_ttc.js',
        run: () => require('../../scripts/backfill-pt-activite-ttc').run(),
      },
      {
        key: '141_backfill_pt_refs_fournisseur.js',
        run: () => require('../../scripts/backfill-pt-refs-fournisseur').run(),
      },
    ];
    for (const bf of jsBackfills) {
      if (appliedSet.has(bf.key)) {
        console.log(`Migration deja appliquee: ${bf.key}`);
        continue;
      }
      try {
        await bf.run();
        await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [bf.key]);
        console.log(`Migration appliquee: ${bf.key}`);
      } catch (err) {
        console.error(`Backfill ${bf.key} échoué (sera retenté au prochain démarrage):`, err.message);
      }
    }

    console.log('Toutes les migrations effectuees avec succes');
  } finally {
    if (locked) {
      try { await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]); } catch (_) { /* ignore */ }
    }
    client.release();
  }
}

module.exports = migrate;

// Allow standalone execution: node src/config/migrate.js
if (require.main === module) {
  migrate().then(() => pool.end()).catch(() => process.exit(1));
}
