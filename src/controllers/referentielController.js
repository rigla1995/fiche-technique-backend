const pool = require('../config/database');
const ExcelJS = require('exceljs');
const multer = require('multer');
const { vocabDefaut } = require('../utils/vocab');
const { ongletSur } = require('../utils/excelNoms');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// En-têtes du modèle : la colonne 1 porte le terme du compte, les colonnes 2 à 4 n'en ont pas.
const enTetes = (voc) => [voc.Nom('article'), 'Unité', 'Catégorie', 'Famille'];
// En-têtes par défaut : un modèle fait avec le vocabulaire LabFlow reste reconnu dans tout domaine.
const HEADERS = enTetes(vocabDefaut);

// Ligne (1-based), dans les 15 premières, dont les colonnes 2 à 4 sont les en-têtes « Unité / Catégorie /
// Famille » (sans casse) et la colonne 1 non vide : modèle fait avec un ancien terme du domaine, ou colonne 1
// renommée à la main. null si aucune.
const ligneEnTetesLibre = (ws) => {
  const suite = HEADERS.slice(1).map((h) => h.toLowerCase());
  const max = Math.min(ws.rowCount, 15);
  for (let r = 1; r <= max; r++) {
    const row = ws.getRow(r);
    const texte = (i) => String(row.getCell(i).text || '').trim();
    if (texte(1) && suite.every((h, i) => texte(i + 2).toLowerCase() === h)) return r;
  }
  return null;
};
const MAX_ROWS = 1000;

const getTemplate = async (req, res) => {
  try {
    const { brandTemplate } = require('../services/excelBrandService');
    const voc = req.voc ?? vocabDefaut;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(ongletSur(wb, voc.Court('referentiel')));
    brandTemplate(wb, ws, {
      titre: `Modèle d'import — ${voc.Court('referentiel')}`,
      sousTitre: `Ajout dynamique ${voc.du('article', true)} : une ligne = ${voc.un('article')}`,
      meta: "Remplissez vos lignes sous les en-têtes — la ligne d'exemple (grisée) sera ignorée à l'import.",
      headers: enTetes(voc),
      widths: [28, 16, 22, 22],
      // Le préfixe « Exemple : » reste hors de voc.ex : isExampleRow reconnaît la ligne à son premier mot.
      exemple: ['Exemple : ' + voc.ex('Poulet rôti', `${voc.Nom('article')} A`), 'kg', voc.ex('Viandes', 'Catégorie A'), voc.ex('Food', 'Famille A')],
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="modele_referentiel.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur lors de la génération du modèle' });
  }
};

// Returns all activités + labos with assigned flag for one article
const getArticleAssignments = async (req, res) => {
  const clientId = req.user.gerant_parent_id || req.user.id;
  const articleId = parseInt(req.params.id);
  try {
    const entRes = await pool.query('SELECT id FROM profil_entreprise WHERE client_id = $1', [clientId]);
    if (entRes.rows.length === 0) return res.json({ activites: [], labos: [] });
    const entrepriseId = entRes.rows[0].id;

    const [acts, labs, actSels, laboSels] = await Promise.all([
      pool.query('SELECT id, nom FROM activites WHERE entreprise_id = $1 ORDER BY nom', [entrepriseId]),
      pool.query('SELECT id, nom FROM labos WHERE entreprise_id = $1 ORDER BY nom', [entrepriseId]),
      pool.query(
        'SELECT activite_id FROM activite_ingredient_selections WHERE ingredient_id = $1',
        [articleId]
      ),
      pool.query(
        'SELECT labo_id FROM labo_ingredient_selections WHERE ingredient_id = $1',
        [articleId]
      ),
    ]);

    const assignedActs = new Set(actSels.rows.map(r => r.activite_id));
    const assignedLabos = new Set(laboSels.rows.map(r => r.labo_id));

    res.json({
      activites: acts.rows.map(a => ({ id: a.id, nom: a.nom, assigned: assignedActs.has(a.id) })),
      labos: labs.rows.map(l => ({ id: l.id, nom: l.nom, assigned: assignedLabos.has(l.id) })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
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

      // Les données commencent APRÈS la ligne d'en-têtes, où qu'elle soit
      // (modèle de marque : bandeau au-dessus ; anciens modèles : ligne 1),
      // et la ligne d'exemple grisée du modèle est ignorée.
      // En-têtes du domaine, puis ceux par défaut, puis une colonne 1 renommée ; sinon ligne 1 (ancien modèle).
      const { findHeaderRow, isExampleRow } = require('../services/excelBrandService');
      const voc = req.voc ?? vocabDefaut;
      const headerRowNum = findHeaderRow(ws, enTetes(voc)) ?? findHeaderRow(ws, HEADERS) ?? ligneEnTetesLibre(ws) ?? 1;
      const rows = [];
      ws.eachRow((row, rowNumber) => {
        if (rowNumber <= headerRowNum || isExampleRow(row)) return;
        const article = String(row.getCell(1).value || '').trim();
        const unite   = String(row.getCell(2).value || '').trim();
        const categorie = String(row.getCell(3).value || '').trim();
        const famille  = String(row.getCell(4).value || '').trim();
        if (!article) return;
        rows.push({ rowNumber, article, unite, categorie, famille });
      });

      if (rows.length === 0) return res.status(400).json({ message: 'Aucune ligne valide trouvée dans le fichier' });
      if (rows.length > MAX_ROWS) return res.status(400).json({ message: `Limite de ${MAX_ROWS} lignes dépassée (${rows.length} lignes trouvées)` });

      // Fetch all activités + labos once before the loop
      const entRes = await pool.query('SELECT id FROM profil_entreprise WHERE client_id = $1', [clientId]);
      const entrepriseId = entRes.rows.length > 0 ? entRes.rows[0].id : null;
      let activiteIds = [];
      let laboIds = [];
      if (entrepriseId) {
        const [actRes, labRes] = await Promise.all([
          pool.query('SELECT id FROM activites WHERE entreprise_id = $1', [entrepriseId]),
          pool.query('SELECT id FROM labos WHERE entreprise_id = $1', [entrepriseId]),
        ]);
        activiteIds = actRes.rows.map(r => r.id);
        laboIds = labRes.rows.map(r => r.id);
      }

      const stats = { familles: 0, categories: 0, unites: 0, articles: 0, autoAssigned: 0 };
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
            const ins = await client.query(
              `INSERT INTO categories (nom, client_id, famille_id)
               VALUES ($1, $2, $3)
               ON CONFLICT (nom, client_id) WHERE client_id IS NOT NULL
               DO UPDATE SET famille_id = EXCLUDED.famille_id
               RETURNING id, (xmax = 0) as inserted`,
              [r.categorie, clientId, familleId]
            );
            categorieId = ins.rows[0].id;
            if (ins.rows[0].inserted) {
              stats.categories++;
              rowResult.created.push('catégorie');
            } else {
              rowResult.existing.push('catégorie');
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
            const existingArticleId = existingArt.rows[0].id;
            rowResult.existing.push('article');

            // Auto-assign if the existing article has no assignments at all
            if (activiteIds.length > 0 || laboIds.length > 0) {
              const hasAny = await client.query(
                `SELECT 1 WHERE
                   EXISTS (SELECT 1 FROM activite_ingredient_selections WHERE ingredient_id = $1)
                   OR EXISTS (SELECT 1 FROM labo_ingredient_selections   WHERE ingredient_id = $1)`,
                [existingArticleId]
              );
              if (hasAny.rows.length === 0) {
                if (activiteIds.length > 0) {
                  await client.query(
                    'INSERT INTO activite_ingredient_selections (activite_id, ingredient_id, prix_unitaire) SELECT unnest($1::int[]), $2, 0 ON CONFLICT DO NOTHING',
                    [activiteIds, existingArticleId]
                  );
                }
                if (laboIds.length > 0) {
                  await client.query(
                    'INSERT INTO labo_ingredient_selections (labo_id, ingredient_id) SELECT unnest($1::int[]), $2 ON CONFLICT DO NOTHING',
                    [laboIds, existingArticleId]
                  );
                }
                rowResult.autoAssigned = true;
                stats.autoAssigned++;
              }
            }
          } else {
            const newArt = await client.query(
              'INSERT INTO articles (nom, client_id, unite_id, categorie_id, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id',
              [r.article, clientId, uniteId, categorieId, req.user.id]
            );
            const newArticleId = newArt.rows[0].id;
            stats.articles++;
            rowResult.created.push('article');

            // Auto-affecte l'article à toutes les activités et labos du client (débloque
            // dynamiquement les espaces côté client) et le comptabilise.
            if (activiteIds.length > 0 || laboIds.length > 0) {
              if (activiteIds.length > 0) {
                await client.query(
                  'INSERT INTO activite_ingredient_selections (activite_id, ingredient_id, prix_unitaire) SELECT unnest($1::int[]), $2, 0 ON CONFLICT DO NOTHING',
                  [activiteIds, newArticleId]
                );
              }
              if (laboIds.length > 0) {
                await client.query(
                  'INSERT INTO labo_ingredient_selections (labo_id, ingredient_id) SELECT unnest($1::int[]), $2 ON CONFLICT DO NOTHING',
                  [laboIds, newArticleId]
                );
              }
              rowResult.autoAssigned = true;
              stats.autoAssigned++;
            }
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

module.exports = { getTemplate, importReferentiel, getArticleAssignments };
