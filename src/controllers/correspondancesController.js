/* Factures fournisseur, étape F3 (labflow-reprise/achats-compta/PLAN-FACTURES.md §4 « Les correspondances ») : ce que
 * LabFlow a appris des factures validées, par compte et par fournisseur.
 *
 *   GET    /api/correspondances/contexte?fournisseurId=&type=activite|labo&id=
 *            ce dont la fenêtre « Vérifier la facture » a besoin pour proposer un article à chaque ligne : les
 *            correspondances de ce fournisseur, les articles déjà achetés chez lui (dernier prix, dernière date), et tous
 *            les articles du compte (sélectionnés ou non dans ce lieu)
 *   GET    /api/correspondances[?fournisseurId=]   la page « Correspondances »
 *   PATCH  /api/correspondances/:id                 corriger : article + conversion, ou nature hors stock
 *   DELETE /api/correspondances/:id                 oublier
 * Le gérant ne voit et ne touche que les correspondances des fournisseurs rattachés à ses activités et labos. */
const pool = require('../config/database');
const F = require('../services/facturesAppro');
const V = require('../services/facturesValidees');

const n = (x) => (x == null ? null : parseFloat(x));

/** Clause SQL (alias `fo`) : fournisseur dans le périmètre du gérant ; '' pour un client. */
const clauseGerant = (req, params) => {
  if (req.user.role !== 'gerant') return '';
  const a = req.user.gerantActiviteIds || [];
  const l = req.user.gerantLaboIds || [];
  params.push(a.length ? a : [-1]);
  const pa = params.length;
  params.push(l.length ? l : [-1]);
  const pl = params.length;
  return ` AND (EXISTS (SELECT 1 FROM fournisseur_activites fa WHERE fa.fournisseur_id = fo.id AND fa.activite_id = ANY($${pa}::int[]))
             OR EXISTS (SELECT 1 FROM fournisseur_labos fl WHERE fl.fournisseur_id = fo.id AND fl.labo_id = ANY($${pl}::int[])))`;
};

/** Fournisseur du compte (et du périmètre du gérant) ? */
const fournisseurVisible = async (req, clientId, fournisseurId) => {
  const id = F.idValide(fournisseurId);
  if (!id) return null;
  const params = [id, clientId];
  const r = await pool.query(
    `SELECT fo.id FROM fournisseurs fo LEFT JOIN profil_entreprise pe ON pe.id = fo.entreprise_id
     WHERE fo.id = $1 AND (pe.client_id = $2 OR fo.client_id = $2)${clauseGerant(req, params)}`,
    params
  );
  return r.rows[0]?.id ?? null;
};

const versApi = (x) => ({
  id: x.id, fournisseurId: x.fournisseur_id, fournisseurNom: x.fournisseur_nom ?? undefined, cle: x.cle,
  designation: x.designation, reference: x.reference, uniteFacture: x.unite_facture,
  articleId: x.article_id, articleNom: x.article_nom, uniteStock: x.unite_stock, horsStock: x.nature_hors_stock,
  conversion: n(x.conversion), emplois: x.emplois, derniereFois: x.derniere_fois, auteurNom: x.auteur_nom ?? undefined,
});

const contexte = async (req, res) => {
  const clientId = F.clientDe(req);
  const { type } = req.query;
  const lieuId = F.idValide(req.query.id);
  if ((type !== 'activite' && type !== 'labo') || !lieuId) return res.status(400).json({ message: 'Lieu invalide' });
  try {
    if (type === 'activite' ? req.user.role === 'gerant' && !(req.user.gerantActiviteIds || []).includes(lieuId)
      : req.user.role === 'gerant' && !(req.user.gerantLaboIds || []).includes(lieuId)) {
      return res.status(403).json({ message: 'Accès non autorisé' });
    }
    const lieu = await pool.query(
      type === 'activite'
        ? 'SELECT a.id FROM activites a JOIN profil_entreprise pe ON pe.id = a.entreprise_id WHERE a.id = $1 AND pe.client_id = $2'
        : 'SELECT l.id FROM labos l JOIN profil_entreprise pe ON pe.id = l.entreprise_id WHERE l.id = $1 AND pe.client_id = $2',
      [lieuId, clientId]
    );
    if (!lieu.rows.length) return res.status(404).json({ message: 'Lieu introuvable' });
    const fournisseurId = req.query.fournisseurId ? await fournisseurVisible(req, clientId, req.query.fournisseurId) : null;
    const selection = type === 'activite'
      ? 'EXISTS (SELECT 1 FROM activite_ingredient_selections s WHERE s.ingredient_id = a.id AND s.activite_id = $2)'
      : 'EXISTS (SELECT 1 FROM labo_ingredient_selections s WHERE s.ingredient_id = a.id AND s.labo_id = $2)';
    const articles = await pool.query(
      `SELECT a.id, a.nom, u.nom AS unite, c.nom AS categorie, ${selection} AS selectionne
       FROM articles a JOIN unites u ON u.id = a.unite_id LEFT JOIN categories c ON c.id = a.categorie_id
       WHERE a.client_id = $1 OR ${selection}
       ORDER BY a.nom`,
      [clientId, lieuId]
    );
    let correspondances = [];
    let achats = [];
    if (fournisseurId) {
      correspondances = (await pool.query(
        `SELECT co.*, a.nom AS article_nom, u.nom AS unite_stock
         FROM correspondances co LEFT JOIN articles a ON a.id = co.article_id LEFT JOIN unites u ON u.id = a.unite_id
         WHERE co.client_id = $1 AND co.fournisseur_id = $2 ORDER BY co.derniere_fois DESC`,
        [clientId, fournisseurId]
      )).rows.map(versApi);
      // Articles déjà achetés chez ce fournisseur (toutes saisies du compte : à la main aussi — décision du 05/10).
      achats = (await pool.query(
        `WITH l AS (
           SELECT s.ingredient_id, s.prix_unitaire, s.date_appro, s.id FROM stock_entreprise_daily s
           JOIN activites ac ON ac.id = s.activite_id JOIN profil_entreprise pe ON pe.id = ac.entreprise_id
           WHERE pe.client_id = $1 AND s.fournisseur_id = $2 AND s.quantite > 0 AND s.type_appro = 'manuel'
           UNION ALL
           SELECT s.ingredient_id, s.prix_unitaire, s.date_appro, s.id FROM stock_labo_daily s
           JOIN labos lb ON lb.id = s.labo_id JOIN profil_entreprise pe ON pe.id = lb.entreprise_id
           WHERE pe.client_id = $1 AND s.fournisseur_id = $2 AND s.quantite > 0 AND s.type_appro = 'manuel'
         )
         SELECT DISTINCT ON (l.ingredient_id) l.ingredient_id AS article_id, l.prix_unitaire, l.date_appro,
                COUNT(*) OVER (PARTITION BY l.ingredient_id) AS nb
         FROM l ORDER BY l.ingredient_id, l.date_appro DESC, l.id DESC`,
        [clientId, fournisseurId]
      )).rows.map((x) => ({ articleId: x.article_id, dernierPrix: n(x.prix_unitaire), derniereDate: x.date_appro, nbAchats: Number(x.nb) }));
    }
    return res.json({
      fournisseurId,
      correspondances,
      achats,
      articles: articles.rows.map((x) => ({ id: x.id, nom: x.nom, unite: x.unite, categorie: x.categorie, selectionne: x.selectionne === true })),
    });
  } catch (err) {
    console.error('[correspondances, contexte]', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

const lister = async (req, res) => {
  const clientId = F.clientDe(req);
  try {
    const params = [clientId];
    let filtre = '';
    if (req.query.fournisseurId) {
      const id = F.idValide(req.query.fournisseurId);
      if (!id) return res.status(400).json({ message: 'Paramètres de filtre invalides' });
      params.push(id);
      filtre = ` AND co.fournisseur_id = $${params.length}`;
    }
    const r = await pool.query(
      `SELECT co.*, fo.nom AS fournisseur_nom, a.nom AS article_nom, u.nom AS unite_stock,
              ut.nom AS auteur_nom
       FROM correspondances co
       JOIN fournisseurs fo ON fo.id = co.fournisseur_id
       LEFT JOIN articles a ON a.id = co.article_id
       LEFT JOIN unites u ON u.id = a.unite_id
       LEFT JOIN utilisateurs ut ON ut.id = co.auteur_id
       WHERE co.client_id = $1${filtre}${clauseGerant(req, params)}
       ORDER BY fo.nom, co.designation`,
      params
    );
    return res.json(r.rows.map(versApi));
  } catch (err) {
    console.error('[correspondances, liste]', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

/** La correspondance du compte et du périmètre du gérant, ou null. */
const correspondanceVisible = async (req, clientId, id) => {
  const cid = F.idValide(id);
  if (!cid) return null;
  const params = [cid, clientId];
  const r = await pool.query(
    `SELECT co.* FROM correspondances co JOIN fournisseurs fo ON fo.id = co.fournisseur_id
     WHERE co.id = $1 AND co.client_id = $2${clauseGerant(req, params)}`,
    params
  );
  return r.rows[0] || null;
};

const modifier = async (req, res) => {
  const clientId = F.clientDe(req);
  try {
    const co = await correspondanceVisible(req, clientId, req.params.id);
    if (!co) return res.status(404).json({ message: 'Correspondance introuvable' });
    const { articleId, horsStock } = req.body || {};
    let article = null;
    let nature = null;
    let conversion = 1;
    if (articleId != null && articleId !== '') {
      article = F.idValide(articleId);
      const ok = article && (await pool.query('SELECT 1 FROM articles WHERE id = $1 AND client_id = $2', [article, clientId])).rows.length;
      if (!ok) return res.status(400).json({ code: 'ARTICLE_INCONNU', message: '[[Nom:article]] introuvable.' });
      conversion = req.body.conversion == null || req.body.conversion === '' ? 1 : Math.round(Number(req.body.conversion) * 1e6) / 1e6;
      if (!(conversion > 0) || conversion > 100000) return res.status(400).json({ code: 'CONVERSION_INVALIDE', message: 'Conversion invalide : un nombre positif.' });
    } else if (V.NATURES.includes(horsStock)) {
      nature = horsStock;
    } else {
      return res.status(400).json({ code: 'CHOIX_REQUIS', message: 'Choisissez [[un:article]] ou « hors [[nom:stock]] ».' });
    }
    // Corrigée à la main : plus aucune facture n'a encore confirmé cette décision (emplois = 0).
    await pool.query(
      `UPDATE correspondances SET article_id = $2, nature_hors_stock = $3, conversion = $4, auteur_id = $5, emplois = 0
       WHERE id = $1`,
      [co.id, article, nature, conversion, req.user.id]
    );
    const r = await pool.query(
      `SELECT co.*, fo.nom AS fournisseur_nom, a.nom AS article_nom, u.nom AS unite_stock, ut.nom AS auteur_nom
       FROM correspondances co JOIN fournisseurs fo ON fo.id = co.fournisseur_id
       LEFT JOIN articles a ON a.id = co.article_id LEFT JOIN unites u ON u.id = a.unite_id
       LEFT JOIN utilisateurs ut ON ut.id = co.auteur_id
       WHERE co.id = $1`,
      [co.id]
    );
    return res.json(versApi(r.rows[0]));
  } catch (err) {
    console.error('[correspondances, modification]', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

const oublier = async (req, res) => {
  const clientId = F.clientDe(req);
  try {
    const co = await correspondanceVisible(req, clientId, req.params.id);
    if (!co) return res.status(404).json({ message: 'Correspondance introuvable' });
    await pool.query('DELETE FROM correspondances WHERE id = $1', [co.id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[correspondances, oubli]', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

/** Libellés des frais hors stock (les mêmes que l'écran et le pont vers la Compta). */
const LIBELLES_NATURES = { transport: 'Transport', livraison: 'Frais de livraison', consigne: 'Consigne', service: 'Prestation', autre: 'Autre frais' };

// GET /api/correspondances/export — les correspondances du compte (et du périmètre du gérant) dans un fichier de la
// charte des modèles d'import : une ligne par correspondance, du fournisseur à l'article et sa conversion. Lecture
// seule : les correspondances s'apprennent des factures validées (pas d'import).
const exporter = async (req, res) => {
  const clientId = F.clientDe(req);
  try {
    const ExcelJS = require('exceljs');
    const { brandModeleRempli, jourExport } = require('../services/excelBrandService');
    const { ongletSur } = require('../utils/excelNoms');
    const { vocabDefaut } = require('../utils/vocab');
    const voc = req.voc ?? vocabDefaut;
    const params = [clientId];
    const r = await pool.query(
      `SELECT co.designation, co.reference, co.unite_facture, co.nature_hors_stock, co.conversion, co.emplois, co.derniere_fois,
              fo.nom AS fournisseur_nom, fo.matricule_fiscal, a.nom AS article_nom, u.nom AS unite_stock
       FROM correspondances co
       JOIN fournisseurs fo ON fo.id = co.fournisseur_id
       LEFT JOIN articles a ON a.id = co.article_id
       LEFT JOIN unites u ON u.id = a.unite_id
       WHERE co.client_id = $1${clauseGerant(req, params)}
       ORDER BY fo.nom, co.designation`,
      params
    );
    const jour = jourExport();
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(ongletSur(wb, 'Correspondances'));
    brandModeleRempli(wb, ws, {
      titre: `Correspondances — export du ${jour.fr}`,
      sousTitre: `${r.rows.length} ligne${r.rows.length > 1 ? 's' : ''} : une ligne de facture ${voc.du('fournisseur')} → ${voc.votre('article')} et sa conversion`,
      meta: 'Apprises de vos factures validées ; elles se corrigent dans LabFlow (page Correspondances). Conversion : 1 unité facturée = tant d\'unités LabFlow.',
      headers: [
        voc.Nom('fournisseur'), 'Matricule fiscal', `Code ${voc.nom('fournisseur')}`, 'Désignation sur la facture', 'Unité facturée',
        `${voc.Nom('article')} LabFlow`, 'Unité LabFlow', 'Conversion', `Hors ${voc.nom('stock')}`, 'Factures confirmées', 'Dernière facture',
      ],
      widths: [26, 18, 16, 36, 13, 30, 13, 12, 18, 12, 14],
      lignes: r.rows.map((x) => [
        x.fournisseur_nom, x.matricule_fiscal, x.reference, x.designation, x.unite_facture,
        x.article_nom, x.unite_stock, x.nature_hors_stock ? null : n(x.conversion),
        x.nature_hors_stock ? (LIBELLES_NATURES[x.nature_hors_stock] ?? x.nature_hors_stock) : null,
        x.emplois, x.derniere_fois ? new Date(x.derniere_fois) : null,
      ]),
      formats: [null, null, null, null, null, null, null, null, null, null, 'dd/mm/yyyy'],
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="correspondances_${jour.iso}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[correspondances, export]', err);
    if (!res.headersSent) res.status(500).json({ message: "Erreur lors de l'export" });
  }
};

module.exports = { contexte, lister, modifier, oublier, exporter };
