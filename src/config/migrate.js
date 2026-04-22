require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./database');

async function migrate() {
  const sqlPath = path.join(__dirname, '../../migrations/001_init.sql');
  const sql = fs.readFileSync(sqlPath, 'utf-8');

  try {
    await pool.query(sql);
    console.log('Migration effectuée avec succès');
  } catch (err) {
    console.error('Erreur lors de la migration:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
