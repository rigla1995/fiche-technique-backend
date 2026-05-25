const pool = require('../config/database');
const ExcelJS = require('exceljs');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const HEADERS = ['Article', 'Unité', 'Catégorie', 'Famille'];
const MAX_ROWS = 1000;

const getTemplate = async (req, res) => {
  try {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Référentiel');

    ws.columns = HEADERS.map(h => ({ header: h, key: h.toLowerCase(), width: 25 }));

    const headerRow = ws.getRow(1);
    headerRow.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF16a34a' } };
      cell.alignment = { horizontal: 'center' };
    });

    ws.addRow(['Poulet rôti', 'kg', 'Viandes', 'Food']);
    ws.addRow(['Sauce tomate', 'litre', 'Sauces', 'Food']);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="modele_referentiel.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur lors de la génération du modèle' });
  }
};

const importReferentiel = [
  upload.single('file'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'Fichier requis' });

    const clientId = req.user.gerant_parent_id || req.user.id;

    try {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(req.file.buffer);
      const ws = wb.worksheets[0];
      if (!ws) return res.status(400).json({ message: 'Feuille Excel introuvable' });

      const rows = [];
      ws.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const article = String(row.getCell(1).value || '').trim();
        const unite   = String(row.getCell(2).value || '').trim();
        const categorie = String(row.getCell(3).value || '').trim();
        const famille  = String(row.getCell(4).value || '').trim();
        if (!article) return;
        rows.push({ rowNumber, article, unite, categorie, famille });
      });

      if (rows.length === 0) return res.status(400).json({ message: 'Aucune ligne valide trouvée dans le fichier' });
      if (rows.length > MAX_ROWS) return res.status(400).json({ message: `Limite de ${MAX_ROWS} lignes dépassée (${rows.length} lignes trouvées)` });

      const stats = { familles: 0, categories: 0, unites: 0, articles: 0 };
      const details = [];

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        for (const r of rows) {
          const rowResult = { row: r.rowNumber, article: r.article, status: 'ok', created: [], existing: [] };

          let familleId = null;
          if (r.famille) {
            const existing = await client.query(
              'SELECT id FROM familles WHERE LOWER(TRIM(nom)) = LOWER(TRIM($1)) AND client_id = $2',
              [r.famille, clientId]
            );
            if (existing.rows.length > 0) {
              familleId = existing.rows[0].id;
              rowResult.existing.push('famille');
            } else {
              const ins = await client.query(
                'INSERT INTO familles (nom, client_id, consommable) VALUES ($1, $2, TRUE) RETURNING id',
                [r.famille, clientId]
              );
              familleId = ins.rows[0].id;
              stats.familles++;
              rowResult.created.push('famille');
            }
          } else if (r.categorie) {
            rowResult.status = 'error';
            rowResult.error = 'Famille requise quand Catégorie est renseignée';
            details.push(rowResult);
            continue;
          }

          let categorieId = null;
          if (r.categorie) {
            const existing = await client.query(
              'SELECT id FROM categories WHERE LOWER(TRIM(nom)) = LOWER(TRIM($1)) AND famille_id = $2 AND client_id = $3',
              [r.categorie, familleId, clientId]
            );
            if (existing.rows.length > 0) {
              categorieId = existing.rows[0].id;
              rowResult.existing.push('catégorie');
            } else {
              const ins = await client.query(
                'INSERT INTO categories (nom, client_id, famille_id, vendable) VALUES ($1, $2, $3, TRUE) RETURNING id',
                [r.categorie, clientId, familleId]
              );
              categorieId = ins.rows[0].id;
              stats.categories++;
              rowResult.created.push('catégorie');
            }
          }

          let uniteId = null;
          if (r.unite) {
            const existing = await client.query(
              'SELECT id FROM unites WHERE LOWER(TRIM(nom)) = LOWER(TRIM($1)) AND client_id = $2',
              [r.unite, clientId]
            );
            if (existing.rows.length > 0) {
              uniteId = existing.rows[0].id;
              rowResult.existing.push('unité');
            } else {
              const ins = await client.query(
                'INSERT INTO unites (nom, client_id) VALUES ($1, $2) RETURNING id',
                [r.unite, clientId]
              );
              uniteId = ins.rows[0].id;
              stats.unites++;
              rowResult.created.push('unité');
            }
          }

          const existingArt = await client.query(
            'SELECT id FROM articles WHERE LOWER(TRIM(nom)) = LOWER(TRIM($1)) AND client_id = $2',
            [r.article, clientId]
          );
          if (existingArt.rows.length > 0) {
            rowResult.existing.push('article');
          } else {
            await client.query(
              'INSERT INTO articles (nom, client_id, unite_id, categorie_id) VALUES ($1, $2, $3, $4)',
              [r.article, clientId, uniteId, categorieId]
            );
            stats.articles++;
            rowResult.created.push('article');
          }

          details.push(rowResult);
        }

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      const errors = details.filter(d => d.status === 'error').length;
      res.json({ processed: rows.length, stats, errors, details });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Erreur lors du traitement du fichier' });
    }
  },
];

module.exports = { getTemplate, importReferentiel };
