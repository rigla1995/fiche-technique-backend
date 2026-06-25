const pool = require('../config/database');

/**
 * Run `fn` inside a single DB transaction with a dedicated client.
 * Commits on success, rolls back on any thrown error, always releases the client.
 *
 * Usage:
 *   await withTransaction(async (client) => {
 *     await client.query('INSERT ...');
 *     await client.query('UPDATE ...');
 *   });
 */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* connection may be broken */ }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { withTransaction };
