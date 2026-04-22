require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./database');

async function migrate() {
  const migrationsDir = path.join(__dirname, '../../migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sqlPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(sqlPath, 'utf-8');
    try {
      await pool.query(sql);
      console.log(`Migration appliquee: ${file}`);
    } catch (err) {
      console.error(`Erreur lors de la migration ${file}:`, err.message);
      process.exit(1);
    }
  }

  await pool.end();
  console.log('Toutes les migrations effectuees avec succes');
}

migrate();
