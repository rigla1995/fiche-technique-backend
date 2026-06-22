const { Pool, types } = require('pg');

// Return DATE columns as plain 'YYYY-MM-DD' strings (avoid local-timezone midnight shift)
types.setTypeParser(1082, (val) => val);

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'fiche_technique',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,

  // ── Pool sizing & timeouts ────────────────────────────────────────────────
  // Bound the pool explicitly so handlers that chain many queries cannot exhaust
  // the server's connection limit, and so saturated requests fail fast instead of
  // hanging forever. Tune DB_POOL_MAX to (Postgres max_connections / nb instances).
  max: parseInt(process.env.DB_POOL_MAX) || 15,
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT_MS) || 30000,
  connectionTimeoutMillis: parseInt(process.env.DB_CONN_TIMEOUT_MS) || 5000,
  // Kill any single query that runs longer than this (ms) — protects the pool from
  // a stuck/slow query holding a connection indefinitely.
  statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT_MS) || 30000,
  query_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT_MS) || 30000,
});

pool.on('error', (err) => {
  console.error('Erreur inattendue du pool PostgreSQL', err);
});

module.exports = pool;
