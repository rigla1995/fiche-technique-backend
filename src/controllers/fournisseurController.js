const pool = require('../config/database');
const ExcelJS = require('exceljs');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
// Ajout dynamique (import Excel) — même gabarit que le carnet d'acheteurs
const IMPORT_HEADERS = ['Nom', 'Téléphone', 'Adresse'];
const IMPORT_MAX_ROWS = 500;

const getEntrepriseId = async (clientId) => {
  const r = await pool.query('SELECT id FROM profil_entreprise WHERE client_id = $1', [clientId]);
  return r.rows[0]?.id ?? null;
};

const listFournisseurs = async (req, res) => {
  const clientId = req.user.gerant_parent_id || req.user.id;
  const isGerant = req.user.role === 'gerant';
  try {
    const entrepriseId = await getEntrepriseId(clientId);
    if (!entrepriseId) return res.json([]);

    const params = [entrepriseId];
    let gerantClause = '';
    if (isGerant) {
      const actIds = (req.user.gerantActiviteIds || []);
      const laboIds = (req.user.gerantLaboIds || []);
      params.push(actIds.length ? actIds : [-1]); const _ai = params.length;
      params.push(laboIds.length ? laboIds : [-1]); const _li = params.length;
      gerantClause = ` AND (EXISTS (SELECT 1 FROM fournisseur_activites fag WHERE fag.fournisseur_id = f.id AND fag.activite_id = ANY($${_ai}::int[])) OR EXISTS (SELECT 1 FROM fournisseur_labos flg WHERE flg.fournisseur_id = f.id AND flg.labo_id = ANY($${_li}::int[])))`;
    }

    const result = await pool.query(
      `SELECT f.id, f.nom, f.adresse, f.telephone, f.is_labo, f.created_at,
              COALESCE(
                json_agg(DISTINCT fa.activite_id) FILTER (WHERE fa.activite_id IS NOT NULL),
                '[]'
              ) as activite_ids,
              COALESCE(
                json_agg(DISTINCT fl.labo_id) FILTER (WHERE fl.labo_id IS NOT NULL),
                '[]'
              ) as labo_ids,
              (SELECT COUNT(*) FROM stock_entreprise_daily sed WHERE sed.fournisseur_id = f.id AND sed.quantite > 0) AS appro_count,
              (SELECT COALESCE(json_agg(json_build_object('activiteId', sub.activite_id, 'nom', a.nom, 'count', sub.cnt)), '[]')
               FROM (
                 SELECT sed2.activite_id, COUNT(*) AS cnt
                 FROM stock_entreprise_daily sed2
                 WHERE sed2.fournisseur_id = f.id AND sed2.quantite > 0
                 GROUP BY sed2.activite_id
               ) sub
               JOIN activites a ON a.id = sub.activite_id
              ) AS appro_by_activite
       FROM fournisseurs f
       LEFT JOIN fournisseur_activites fa ON fa.fournisseur_id = f.id
       LEFT JOIN fournisseur_labos fl ON fl.fournisseur_id = f.id
       WHERE f.entreprise_id = $1 AND f.nom != 'AUTO'${gerantClause}
       GROUP BY f.id
       ORDER BY f.is_labo DESC, f.nom`,
      params
    );
    res.json(result.rows.map((r) => ({
      id: r.id,
      nom: r.nom,
      adresse: r.adresse,
      telephone: r.telephone,
      isLabo: r.is_labo ?? false,
      createdAt: r.created_at,
      activiteIds: r.activite_ids,
      laboIds: r.labo_ids,
      hasAppros: Number(r.appro_count) > 0,
      approCount: Number(r.appro_count),
      approByActivite: r.appro_by_activite ?? [],
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const getFournisseursForActivite = async (req, res) => {
  const { activiteId } = req.params;
  const clientId = req.user.gerant_parent_id || req.user.id;
  // Périmètre gérant : interdire l'accès à une activité non affectée
  if (req.user.role === 'gerant' && !(req.user.gerantActiviteIds || []).includes(Number(activiteId))) {
    return res.status(403).json({ message: 'Accès non autorisé à cette activité' });
  }
  try {
    const check = await pool.query(
      `SELECT a.id FROM activites a
       JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       WHERE a.id = $1 AND pe.client_id = $2`,
      [activiteId, clientId]
    );
    if (check.rows.length === 0) return res.json([]);

    const result = await pool.query(
      `SELECT f.id, f.nom, f.telephone, f.is_labo
       FROM fournisseurs f
       JOIN fournisseur_activites fa ON fa.fournisseur_id = f.id
       WHERE f.nom != 'AUTO' AND fa.activite_id = $1 AND f.is_labo = false
       ORDER BY f.nom`,
      [activiteId]
    );
    res.json(result.rows.map((r) => ({ id: r.id, nom: r.nom, telephone: r.telephone, isLabo: r.is_labo ?? false })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const createFournisseur = async (req, res) => {
  const { nom, adresse, telephone, activiteIds, laboIds } = req.body;
  if (!nom?.trim()) return res.status(400).json({ message: 'Nom requis' });
  const clientId = req.user.gerant_parent_id || req.user.id;
  const isGerant = req.user.role === 'gerant';
  const gerantActiviteId = req.user.gerant_activite_id;
  const gerantActiviteType = req.user.gerant_activite_type;
  try {
    const entrepriseId = await getEntrepriseId(clientId);
    if (!entrepriseId) return res.status(403).json({ message: 'Entreprise introuvable' });

    const r = await pool.query(
      `INSERT INTO fournisseurs (entreprise_id, nom, adresse, telephone, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [entrepriseId, nom.trim(), adresse?.trim() || null, telephone?.trim() || null, req.user.id]
    );
    const fournisseur = r.rows[0];

    // Gérant: valider que les activités/labos demandés sont dans son périmètre
    if (isGerant) {
      const allowedAct = req.user.gerantActiviteIds || [];
      const allowedLabo = req.user.gerantLaboIds || [];
      const bad = (Array.isArray(activiteIds) ? activiteIds : []).some((id) => !allowedAct.includes(Number(id)))
        || (Array.isArray(laboIds) ? laboIds : []).some((id) => !allowedLabo.includes(Number(id)));
      if (bad) {
        await pool.query('DELETE FROM fournisseurs WHERE id = $1', [fournisseur.id]);
        return res.status(403).json({ message: 'Affectation hors de votre périmètre' });
      }
    }

    if (Array.isArray(activiteIds) && activiteIds.length > 0) {
      await pool.query(
        `INSERT INTO fournisseur_activites (fournisseur_id, activite_id)
         SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING`,
        [fournisseur.id, activiteIds]
      );
    }

    if (Array.isArray(laboIds) && laboIds.length > 0) {
      await pool.query(
        `INSERT INTO fournisseur_labos (fournisseur_id, labo_id)
         SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING`,
        [fournisseur.id, laboIds]
      );
    }

    res.status(201).json({ id: fournisseur.id, nom: fournisseur.nom, adresse: fournisseur.adresse, telephone: fournisseur.telephone, activiteIds: activiteIds || [], laboIds: laboIds || [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const updateFournisseur = async (req, res) => {
  const { id } = req.params;
  const { nom, adresse, telephone, activiteIds, laboIds } = req.body;
  if (!nom?.trim()) return res.status(400).json({ message: 'Nom requis' });
  const clientId = req.user.gerant_parent_id || req.user.id;
  const isGerant = req.user.role === 'gerant';
  const gerantActiviteId = req.user.gerant_activite_id;
  const gerantActiviteType = req.user.gerant_activite_type;
  try {
    const entrepriseId = await getEntrepriseId(clientId);
    const check = await pool.query(
      'SELECT id, is_labo FROM fournisseurs WHERE id = $1 AND entreprise_id = $2',
      [id, entrepriseId]
    );
    if (check.rows.length === 0) return res.status(404).json({ message: 'Fournisseur introuvable' });
    if (check.rows[0].is_labo) return res.status(403).json({ message: 'Ce fournisseur est géré automatiquement par le labo.' });

    // Gérant: verify this fournisseur belongs to their activité/labo
    if (isGerant) {
      const actIds = req.user.gerantActiviteIds || [];
      const laboIds = req.user.gerantLaboIds || [];
      const scopeCheck = await pool.query(
        `SELECT 1 FROM fournisseurs f WHERE f.id = $1 AND (
           EXISTS (SELECT 1 FROM fournisseur_activites fa WHERE fa.fournisseur_id = f.id AND fa.activite_id = ANY($2::int[]))
           OR EXISTS (SELECT 1 FROM fournisseur_labos fl WHERE fl.fournisseur_id = f.id AND fl.labo_id = ANY($3::int[])))`,
        [id, actIds.length ? actIds : [-1], laboIds.length ? laboIds : [-1]]
      );
      if (scopeCheck.rows.length === 0) return res.status(403).json({ message: 'Accès refusé' });
    }

    await pool.query(
      `UPDATE fournisseurs SET nom = $1, adresse = $2, telephone = $3 WHERE id = $4`,
      [nom.trim(), adresse?.trim() || null, telephone?.trim() || null, id]
    );

    await pool.query('DELETE FROM fournisseur_activites WHERE fournisseur_id = $1', [id]);
    if (Array.isArray(activiteIds) && activiteIds.length > 0) {
      await pool.query(
        `INSERT INTO fournisseur_activites (fournisseur_id, activite_id)
         SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING`,
        [id, activiteIds]
      );
    }

    await pool.query('DELETE FROM fournisseur_labos WHERE fournisseur_id = $1', [id]);
    if (Array.isArray(laboIds) && laboIds.length > 0) {
      await pool.query(
        `INSERT INTO fournisseur_labos (fournisseur_id, labo_id)
         SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING`,
        [id, laboIds]
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const deleteFournisseur = async (req, res) => {
  const { id } = req.params;
  const clientId = req.user.gerant_parent_id || req.user.id;
  const isGerant = req.user.role === 'gerant';
  const gerantActiviteId = req.user.gerant_activite_id;
  const gerantActiviteType = req.user.gerant_activite_type;
  try {
    const entrepriseId = await getEntrepriseId(clientId);
    const check = await pool.query(
      'SELECT id, is_labo FROM fournisseurs WHERE id = $1 AND entreprise_id = $2',
      [id, entrepriseId]
    );
    if (check.rows.length === 0) return res.status(404).json({ message: 'Fournisseur introuvable' });
    if (check.rows[0].is_labo) return res.status(403).json({ message: 'Ce fournisseur est géré automatiquement par le labo.' });

    // Gérant: verify this fournisseur belongs to their activité/labo
    if (isGerant) {
      const actIds = req.user.gerantActiviteIds || [];
      const laboIds = req.user.gerantLaboIds || [];
      const scopeCheck = await pool.query(
        `SELECT 1 FROM fournisseurs f WHERE f.id = $1 AND (
           EXISTS (SELECT 1 FROM fournisseur_activites fa WHERE fa.fournisseur_id = f.id AND fa.activite_id = ANY($2::int[]))
           OR EXISTS (SELECT 1 FROM fournisseur_labos fl WHERE fl.fournisseur_id = f.id AND fl.labo_id = ANY($3::int[])))`,
        [id, actIds.length ? actIds : [-1], laboIds.length ? laboIds : [-1]]
      );
      if (scopeCheck.rows.length === 0) return res.status(403).json({ message: 'Accès refusé' });
    }
    await pool.query('DELETE FROM fournisseurs WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// GET /api/entreprise/fournisseurs/template — modèle Excel de l'ajout dynamique
const getFournisseursTemplate = async (req, res) => {
  try {
    const { brandTemplate } = require('../services/excelBrandService');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Fournisseurs');
    brandTemplate(wb, ws, {
      titre: "Modèle d'import — Fournisseurs",
      sousTitre: 'Ajout dynamique des fournisseurs : une ligne = un fournisseur',
      meta: "Remplissez vos lignes sous les en-têtes — la ligne d'exemple (grisée) sera ignorée à l'import. Seul le nom est obligatoire.",
      headers: IMPORT_HEADERS,
      widths: [30, 20, 38],
      exemple: ['Exemple : Société Ben Ammar', '71 234 567', 'Zone industrielle, Ben Arous'],
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="modele_fournisseurs.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur lors de la génération du modèle' });
  }
};

// POST /api/entreprise/fournisseurs/import — ajout dynamique (Excel).
// Chaque fournisseur importé est assigné à l'ENSEMBLE des activités et labos
// (périmètre du gérant s'il importe en tant que gérant) ; les affectations
// restent modifiables fournisseur par fournisseur après l'import.
const importFournisseurs = [
  upload.single('file'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'Fichier requis' });
    const clientId = req.user.gerant_parent_id || req.user.id;
    const isGerant = req.user.role === 'gerant';
    try {
      const entrepriseId = await getEntrepriseId(clientId);
      if (!entrepriseId) return res.status(403).json({ message: 'Entreprise introuvable' });

      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(req.file.buffer);
      const ws = wb.worksheets[0];
      if (!ws) return res.status(400).json({ message: 'Fichier Excel vide ou illisible' });

      // Les données commencent APRÈS la ligne d'en-têtes (bandeau de marque au-dessus),
      // et la ligne d'exemple grisée du modèle est ignorée.
      const { findHeaderRow, isExampleRow } = require('../services/excelBrandService');
      const headerRowNum = findHeaderRow(ws, IMPORT_HEADERS) ?? 1;
      const lignes = [];
      ws.eachRow((row, rowNumber) => {
        if (rowNumber <= headerRowNum || isExampleRow(row)) return;
        const cell = (i) => String(row.getCell(i).text || '').trim();
        lignes.push({ row: rowNumber, nom: cell(1), telephone: cell(2), adresse: cell(3) });
      });
      const nonVides = lignes.filter((l) => l.nom || l.telephone || l.adresse);
      if (nonVides.length === 0) return res.status(400).json({ message: 'Aucune ligne à importer' });
      if (nonVides.length > IMPORT_MAX_ROWS) return res.status(400).json({ message: `Maximum ${IMPORT_MAX_ROWS} lignes par fichier` });

      // Doublons : dans le fichier ET contre le répertoire existant (insensible à la casse)
      const existants = await pool.query('SELECT LOWER(nom) AS nom FROM fournisseurs WHERE entreprise_id = $1', [entrepriseId]);
      const dejaLa = new Set(existants.rows.map((r) => r.nom));
      const vusFichier = new Set();
      const valides = [];
      const details = [];
      for (const l of nonVides) {
        if (!l.nom) { details.push({ row: l.row, nom: l.nom, status: 'error', error: 'Nom requis' }); continue; }
        const cle = l.nom.toLowerCase();
        if (dejaLa.has(cle)) { details.push({ row: l.row, nom: l.nom, status: 'error', error: 'Existe déjà dans votre répertoire' }); continue; }
        if (vusFichier.has(cle)) { details.push({ row: l.row, nom: l.nom, status: 'error', error: 'Nom en double dans le fichier' }); continue; }
        vusFichier.add(cle);
        valides.push(l);
      }
      if (valides.length === 0) {
        return res.status(400).json({ message: 'Aucune ligne valide', processed: 0, errors: details.length, details });
      }

      // Cibles d'affectation : toutes les activités + tous les labos du compte
      // (restreints au périmètre du gérant le cas échéant).
      const [acts, labs] = await Promise.all([
        pool.query('SELECT id FROM activites WHERE entreprise_id = $1', [entrepriseId]),
        pool.query('SELECT id FROM labos WHERE entreprise_id = $1', [entrepriseId]),
      ]);
      let actIds = acts.rows.map((r) => Number(r.id));
      let laboIds = labs.rows.map((r) => Number(r.id));
      if (isGerant) {
        const aOk = new Set(req.user.gerantActiviteIds || []);
        const lOk = new Set(req.user.gerantLaboIds || []);
        actIds = actIds.filter((id) => aOk.has(id));
        laboIds = laboIds.filter((id) => lOk.has(id));
      }

      const db = await pool.connect();
      let crees = 0;
      try {
        await db.query('BEGIN');
        for (const v of valides) {
          // SAVEPOINT par ligne : une erreur SQL isolée ne doit pas avorter
          // silencieusement toute la transaction (leçon de l'import acheteurs).
          await db.query('SAVEPOINT ligne');
          try {
            const r = await db.query(
              `INSERT INTO fournisseurs (entreprise_id, nom, telephone, adresse, created_by)
               VALUES ($1, $2, $3, $4, $5) RETURNING id`,
              [entrepriseId, v.nom, v.telephone || null, v.adresse || null, req.user.id]
            );
            const fid = r.rows[0].id;
            if (actIds.length) {
              await db.query(
                `INSERT INTO fournisseur_activites (fournisseur_id, activite_id)
                 SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING`,
                [fid, actIds]
              );
            }
            if (laboIds.length) {
              await db.query(
                `INSERT INTO fournisseur_labos (fournisseur_id, labo_id)
                 SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING`,
                [fid, laboIds]
              );
            }
            crees++;
            details.push({ row: v.row, nom: v.nom, status: 'ok' });
          } catch (e) {
            await db.query('ROLLBACK TO SAVEPOINT ligne');
            details.push({ row: v.row, nom: v.nom, status: 'error', error: 'Ligne rejetée par la base' });
            console.error('Import fournisseur ligne', v.row, e.message);
          }
        }
        await db.query('COMMIT');
      } catch (err) {
        await db.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        db.release();
      }

      details.sort((a, b) => a.row - b.row);
      res.json({
        processed: crees,
        stats: { crees, activites: actIds.length, labos: laboIds.length },
        errors: details.filter((d) => d.status === 'error').length,
        details,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Erreur lors de l'import" });
    }
  },
];

module.exports = {
  listFournisseurs, getFournisseursForActivite, createFournisseur, updateFournisseur, deleteFournisseur,
  getFournisseursTemplate, importFournisseurs,
};
