// Import d'un fichier de caisse (étapes V1a et V1b — labflow-reprise/ventes-cartes/PLAN-VENTES-CARTES.md §3 et §5 bis) :
// accès à la base. Règles pures et lecture du corps : src/utils/ventesImport.js.
//
// Un import crée les ventes d'UNE journée d'une activité, une vente par canal (vente directe, chaque prestataire), avec
// EXACTEMENT les règles de la saisie (src/services/ventesEcriture.js : conditions du prestataire figées, coût, sorties
// de stock, refus d'un produit hors canal). Tout se fait dans la transaction de l'appelant : une ligne refusée annule
// l'import entier. Ce qui a été décidé pour chaque ligne est APPRIS, par activité (`correspondances_ventes`), ainsi que
// la nature de chaque catégorie du fichier (`caisse_categories`).
//
// V1b :
//   • une journée déjà importée se REMPLACE (`remplacer`) : les ventes de l'ancien import sont effacées et leur stock
//     rendu (effacerVente, le cœur de l'annulation d'une vente), puis le nouvel import s'enregistre — tout ou rien ;
//   • un import s'ANNULE de la même façon, sans rien remettre à la place ;
//   • le modèle d'un fichier dont l'utilisateur a désigné les colonnes est retenu (`caisse_modeles`) ;
//   • le document d'origine est conservé avec l'import (stockage des fichiers, privé), s'il est bien le fichier lu
//     (même empreinte SHA-256).
const crypto = require('crypto');
const VI = require('../utils/ventesImport');
const stockage = require('./stockageFichiers');
const { verifierVente, ecrireVente, effacerVente } = require('./ventesEcriture');

const jourFr = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const nombre = (v) => (v === null || v === undefined ? null : parseFloat(v));

const DOCUMENTS = Object.freeze({
  excel: { ext: 'xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  pdf: { ext: 'pdf', type: 'application/pdf' },
  csv: { ext: 'csv', type: 'text/csv; charset=utf-8' },
});
const DOCUMENT_MAX = 15 * 1024 * 1024;

/**
 * Ce que l'écran doit savoir avant de lire un fichier : correspondances apprises, catégories, journées déjà importées,
 * modèles de fichier retenus.
 */
async function contexte(db, activiteId) {
  const corr = await db.query(
    `SELECT c.cle, c.categorie, c.designation, c.ignoree,
            COALESCE(json_agg(json_build_object('article_type', x.article_type, 'article_id', x.article_id, 'quantite', x.quantite) ORDER BY x.id)
                     FILTER (WHERE x.id IS NOT NULL), '[]'::json) AS cibles
       FROM correspondances_ventes c
       LEFT JOIN correspondances_ventes_cibles x ON x.correspondance_id = c.id
      WHERE c.activite_id = $1
      GROUP BY c.id
      ORDER BY c.id`,
    [activiteId]
  );
  const cat = await db.query('SELECT cle, nom, livraison FROM caisse_categories WHERE activite_id = $1 ORDER BY nom', [activiteId]);
  const jours = await db.query(
    `SELECT to_char(date_vente, 'YYYY-MM-DD') AS jour FROM ventes_imports
      WHERE activite_id = $1 AND statut = 'enregistre' ORDER BY date_vente DESC LIMIT 400`,
    [activiteId]
  );
  const modeles = await db.query(
    'SELECT signature, colonnes FROM caisse_modeles WHERE activite_id = $1 ORDER BY updated_at DESC LIMIT 40', [activiteId]
  );
  return { correspondances: corr.rows, categories: cat.rows, jours: jours.rows.map((r) => r.jour), modeles: modeles.rows };
}

const SQL_IMPORT = `
  SELECT i.id, to_char(i.date_vente, 'YYYY-MM-DD') AS date_vente, i.source, i.fichier_nom, i.total_lu, i.total_enregistre,
         i.nb_lignes, i.created_by, i.created_at, u.nom AS auteur, (i.document_cle IS NOT NULL) AS document,
         (SELECT COUNT(*)::int FROM ventes v WHERE v.import_id = i.id) AS ventes
    FROM ventes_imports i
    LEFT JOIN utilisateurs u ON u.id = i.created_by`;
const versImport = (r) => ({
  id: r.id, date_vente: r.date_vente, source: r.source, fichier_nom: r.fichier_nom, total_lu: nombre(r.total_lu),
  total_enregistre: nombre(r.total_enregistre), nb_lignes: r.nb_lignes, created_by: r.created_by, created_at: r.created_at,
  auteur: r.auteur, document: r.document === true, ventes: r.ventes,
});

/** Les journées importées d'une activité, la plus récente d'abord (fenêtre « Importer la caisse »). */
async function lister(db, activiteId) {
  const r = await db.query(`${SQL_IMPORT} WHERE i.activite_id = $1 AND i.statut = 'enregistre' ORDER BY i.date_vente DESC LIMIT 60`, [activiteId]);
  return r.rows.map(versImport);
}

/**
 * Ce qui existe déjà pour une journée : son import (à remplacer), et les ventes enregistrées ce jour-là HORS import de
 * caisse (saisies à la main) — l'écran en avertit : elles s'ajouteraient à celles du fichier.
 */
async function jour(db, activiteId, date) {
  const imp = await db.query(`${SQL_IMPORT} WHERE i.activite_id = $1 AND i.date_vente = $2::date AND i.statut = 'enregistre'`, [activiteId, date]);
  const saisies = await db.query(
    `SELECT COUNT(DISTINCT v.id)::int AS nombre, COALESCE(SUM(vl.quantite * vl.prix_unitaire), 0) AS total
       FROM ventes v
       LEFT JOIN vente_lignes vl ON vl.vente_id = v.id
      WHERE v.activite_id = $1 AND v.date_vente = $2::date AND v.import_id IS NULL AND v.statut = 'confirmee'`,
    [activiteId, date]
  );
  return {
    date,
    import: imp.rows.length ? versImport(imp.rows[0]) : null,
    saisies: { nombre: saisies.rows[0].nombre, total: VI.millime(parseFloat(saisies.rows[0].total)) },
  };
}

/** Une journée ne s'importe qu'une fois, un fichier aussi. */
async function exigerNouveau(db, activiteId, { dateVente, empreinte }) {
  const r = await db.query(
    `SELECT to_char(date_vente, 'YYYY-MM-DD') AS jour, (empreinte = $3) AS meme_fichier
       FROM ventes_imports
      WHERE activite_id = $1 AND statut = 'enregistre' AND (date_vente = $2::date OR empreinte = $3)
      ORDER BY (empreinte = $3) DESC
      LIMIT 1`,
    [activiteId, dateVente, empreinte]
  );
  if (!r.rows.length) return;
  if (r.rows[0].meme_fichier) throw new VI.ErreurImport(409, 'FICHIER_DEJA_IMPORTE', `Ce fichier a déjà été importé, pour la journée du ${jourFr(r.rows[0].jour)}.`);
  throw new VI.ErreurImport(409, 'JOUR_DEJA_IMPORTE', `La journée du ${jourFr(r.rows[0].jour)} a déjà été importée pour [[ce:activite]].`);
}

/** Les produits et articles choisis sont-ils du compte ? */
async function exigerArticlesDuCompte(db, clientId, lignes) {
  const ids = (type) => [...new Set(lignes.filter((l) => l.articleType === type).map((l) => l.articleId))];
  const produits = ids('produit');
  const articles = ids('ingredient');
  if (produits.length) {
    const r = await db.query('SELECT id FROM produits WHERE id = ANY($1::int[]) AND client_id = $2', [produits, clientId]);
    if (r.rows.length !== produits.length) throw new VI.ErreurImport(404, 'ARTICLE_INTROUVABLE', '[[Nom:produit]] introuvable.');
  }
  if (articles.length) {
    const r = await db.query('SELECT id FROM articles WHERE id = ANY($1::int[]) AND client_id = $2', [articles, clientId]);
    if (r.rows.length !== articles.length) throw new VI.ErreurImport(404, 'ARTICLE_INTROUVABLE', '[[Nom:article]] introuvable.');
  }
}

/** Ce qui a été décidé pour chaque ligne est appris : la prochaine fois, la ligne se reconnaît seule. */
async function apprendre(db, activiteId, userId, donnees) {
  const parCle = new Map();
  for (const l of donnees.lignes) if (!l.ignoree) parCle.set(VI.cleCorrespondance(l.categorie, l.designation), l);
  for (const [cle, l] of parCle) {
    const c = await db.query(
      `INSERT INTO correspondances_ventes (activite_id, cle, categorie, designation, ignoree, created_by, updated_at)
       VALUES ($1, $2, $3, $4, false, $5, NOW())
       ON CONFLICT (activite_id, cle) DO UPDATE
         SET categorie = EXCLUDED.categorie, designation = EXCLUDED.designation, ignoree = false, updated_at = NOW()
       RETURNING id`,
      [activiteId, cle, l.categorie, l.designation, userId]
    );
    await db.query('DELETE FROM correspondances_ventes_cibles WHERE correspondance_id = $1', [c.rows[0].id]);
    await db.query(
      'INSERT INTO correspondances_ventes_cibles (correspondance_id, article_type, article_id, quantite) VALUES ($1, $2, $3, 1)',
      [c.rows[0].id, l.articleType, l.articleId]
    );
  }
  for (const c of donnees.categories) {
    await db.query(
      `INSERT INTO caisse_categories (activite_id, cle, nom, livraison, updated_at) VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (activite_id, cle) DO UPDATE SET nom = EXCLUDED.nom, livraison = EXCLUDED.livraison, updated_at = NOW()`,
      [activiteId, c.cle, c.nom, c.livraison]
    );
  }
  // Le modèle du fichier (colonnes désignées par l'utilisateur) : le fichier suivant de la même caisse se lit seul.
  if (donnees.modeleColonnes) {
    await db.query(
      `INSERT INTO caisse_modeles (activite_id, signature, colonnes, updated_at) VALUES ($1, $2, $3::jsonb, NOW())
       ON CONFLICT (activite_id, signature) DO UPDATE SET colonnes = EXCLUDED.colonnes, updated_at = NOW()`,
      [activiteId, donnees.modeleColonnes.signature, JSON.stringify(donnees.modeleColonnes.colonnes)]
    );
  }
  return parCle.size;
}

/**
 * Annule un import dans la transaction de `db` : ses ventes sont effacées et leur stock rendu, comme une annulation à
 * la main. Un gérant n'annule que ses propres imports (même règle que pour une vente). `critere` = { importId } ou
 * { date }. Rend null si rien n'est à annuler, sinon { id, date_vente, ventes, documentCle } — le document est à
 * effacer du stockage APRÈS la validation de la transaction.
 */
async function annuler(db, { activiteId, user, importId = null, date = null, remplacePar = null }) {
  const r = await db.query(
    `SELECT id, created_by, document_cle, to_char(date_vente, 'YYYY-MM-DD') AS date_vente
       FROM ventes_imports
      WHERE activite_id = $1 AND statut = 'enregistre' AND ${importId ? 'id = $2' : 'date_vente = $2::date'}
      FOR UPDATE`,
    [activiteId, importId || date]
  );
  if (!r.rows.length) return null;
  const imp = r.rows[0];
  if (user.role === 'gerant' && imp.created_by !== user.id) {
    throw new VI.ErreurImport(403, 'IMPORT_D_UN_AUTRE', `La journée du ${jourFr(imp.date_vente)} a été importée par un autre utilisateur : vous ne pouvez annuler ou remplacer que vos imports.`);
  }
  const ventes = await db.query('SELECT * FROM ventes WHERE import_id = $1 ORDER BY id', [imp.id]);
  for (const v of ventes.rows) await effacerVente(db, v);
  await db.query(
    `UPDATE ventes_imports
        SET statut = 'annule', annule_le = NOW(), annule_par = $2, remplace_par = $3,
            document_cle = NULL, document_type = NULL, document_taille = NULL
      WHERE id = $1`,
    [imp.id, user.id, remplacePar]
  );
  return { id: imp.id, date_vente: imp.date_vente, ventes: ventes.rows.length, documentCle: imp.document_cle };
}

/**
 * Enregistre un import dans la transaction de `db`. `donnees` = le corps contrôlé (VI.lireImport) ; `user` = { id, role }.
 * Rend { import: { id, date_vente, total_lu, total_enregistre, nb_lignes }, ventes: [{ canal, type_vente,
 * prestataire_id, id, lignes, total }], apprises, remplace: { id, ventes } | null, documentsAEffacer: [clé] }.
 */
async function enregistrer(db, { clientId, user, activiteId, donnees }) {
  const userId = user.id;
  // Remplacement demandé : l'import de cette journée, s'il existe, est annulé d'abord (ventes effacées, stock rendu).
  const remplace = donnees.remplacer ? await annuler(db, { activiteId, user, date: donnees.dateVente }) : null;
  await exigerNouveau(db, activiteId, donnees);
  const utiles = donnees.lignes.filter((l) => !l.ignoree);
  await exigerArticlesDuCompte(db, clientId, utiles);

  const liens = new Map((await db.query(
    'SELECT id, prestataire_id FROM activite_prestataires WHERE activite_id = $1 AND actif = true', [activiteId]
  )).rows.map((x) => [String(x.id).toLowerCase(), x.prestataire_id]));
  const parCanal = VI.ventesParCanal(donnees.lignes);
  for (const canal of parCanal.keys()) {
    if (canal !== VI.CANAL_DIRECT && !liens.has(canal)) {
      throw new VI.ErreurImport(404, 'CANAL_INTROUVABLE', "[[Ce:prestataire]] n'est pas [[acc:prestataire:activé:activée]] pour [[ce:activite]].");
    }
  }

  let importe;
  try {
    importe = (await db.query(
      `INSERT INTO ventes_imports (activite_id, date_vente, source, fichier_nom, empreinte, modele, total_lu, total_enregistre, nb_lignes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, to_char(date_vente, 'YYYY-MM-DD') AS date_vente, total_lu, total_enregistre, nb_lignes`,
      [activiteId, donnees.dateVente, donnees.source, donnees.fichierNom, donnees.empreinte, donnees.modele, donnees.totalLu, donnees.totalEnregistre, utiles.length, userId]
    )).rows[0];
  } catch (e) {
    // Deux envois au même instant : l'index unique tranche.
    if (e.code === '23505') throw new VI.ErreurImport(409, /fichier/.test(e.constraint || '') ? 'FICHIER_DEJA_IMPORTE' : 'JOUR_DEJA_IMPORTE', `La journée du ${jourFr(donnees.dateVente)} ou ce fichier ont déjà été importés.`);
    throw e;
  }
  if (remplace) await db.query('UPDATE ventes_imports SET remplace_par = $2 WHERE id = $1', [remplace.id, importe.id]);

  const ventes = [];
  for (const [canal, lignes] of parCanal) {
    const vente = {
      clientId, activite_id: activiteId, labo_id: null, date_vente: donnees.dateVente,
      type_vente: canal === VI.CANAL_DIRECT ? 'directe' : 'prestataire',
      prestataire_id: canal === VI.CANAL_DIRECT ? null : liens.get(canal),
      notes: `Import de caisse${donnees.fichierNom ? ` — ${donnees.fichierNom}` : ''}`, lignes,
    };
    const { conditions, moduleVenteActif } = await verifierVente(db, vente);
    const ecrite = await ecrireVente(db, { ...vente, userId, conditions, moduleVenteActif, importId: importe.id });
    ventes.push({
      canal, type_vente: vente.type_vente, prestataire_id: vente.prestataire_id, id: ecrite.id, lignes: lignes.length,
      total: VI.millime(lignes.reduce((s, l) => s + l.quantite * l.prix_unitaire, 0)),
    });
  }

  for (const l of donnees.lignes) {
    await db.query(
      `INSERT INTO ventes_imports_lignes (import_id, rang, categorie, designation, quantite, montant, ignoree, article_type, article_id, repartition)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
      [importe.id, l.rang, l.categorie, l.designation, l.quantite, l.montant, l.ignoree, l.articleType, l.articleId, JSON.stringify(l.repartition)]
    );
  }
  const apprises = await apprendre(db, activiteId, userId, donnees);
  return {
    import: { id: importe.id, date_vente: importe.date_vente, total_lu: nombre(importe.total_lu),
      total_enregistre: parseFloat(importe.total_enregistre), nb_lignes: importe.nb_lignes },
    ventes, apprises,
    remplace: remplace ? { id: remplace.id, ventes: remplace.ventes } : null,
    documentsAEffacer: remplace && remplace.documentCle ? [remplace.documentCle] : [],
  };
}

/** L'import `importId`, s'il est enregistré : { id, activite_id, source, empreinte, fichier_nom, document_cle, document_type }. */
async function trouver(db, importId) {
  const id = Number(importId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const r = await db.query(
    `SELECT id, activite_id, source, empreinte, fichier_nom, document_cle, document_type
       FROM ventes_imports WHERE id = $1 AND statut = 'enregistre'`,
    [id]
  );
  return r.rows[0] || null;
}

/** Le contenu ressemble-t-il au type annoncé par l'import ? (Le type se lit sur le contenu, jamais sur le nom.) */
function contenuConforme(source, octets) {
  if (source === 'pdf') return octets.subarray(0, 5).toString('latin1') === '%PDF-';
  if (source === 'excel') return octets[0] === 0x50 && octets[1] === 0x4b && octets[2] === 0x03 && octets[3] === 0x04;
  // CSV : du texte — aucun octet nul dans les premiers kilo-octets.
  return !octets.subarray(0, 4096).includes(0);
}

/**
 * Conserve le document d'origine d'un import. Le fichier reçu doit être CELUI qui a été lu : même empreinte SHA-256
 * que celle enregistrée avec l'import. Rend { depose: true } ou { depose: false } (document déjà conservé).
 */
async function deposerDocument(db, { imp, clientId, octets }) {
  if (imp.document_cle) return { depose: false };
  if (!Buffer.isBuffer(octets) || !octets.length) throw new VI.ErreurImport(400, 'DOCUMENT_VIDE', 'Document vide.');
  if (octets.length > DOCUMENT_MAX) throw new VI.ErreurImport(413, 'DOCUMENT_TROP_GROS', 'Document trop lourd (15 Mo au plus).');
  const empreinte = crypto.createHash('sha256').update(octets).digest('hex');
  if (empreinte !== String(imp.empreinte).trim() || !contenuConforme(imp.source, octets)) {
    throw new VI.ErreurImport(400, 'DOCUMENT_DIFFERENT', "Ce fichier n'est pas celui qui a été importé pour cette journée.");
  }
  if (!stockage.disponible()) throw new VI.ErreurImport(503, 'STOCKAGE_ABSENT', "Le stockage des documents n'est pas configuré sur ce serveur.");
  const { ext, type } = DOCUMENTS[imp.source];
  const cle = stockage.nouvelleCle(clientId, ext, '-caisse');
  await stockage.deposer(cle, octets, type);
  try {
    const u = await db.query(
      `UPDATE ventes_imports SET document_cle = $2, document_type = $3, document_taille = $4
        WHERE id = $1 AND statut = 'enregistre' AND document_cle IS NULL`,
      [imp.id, cle, type, octets.length]
    );
    // Annulé ou déjà pourvu entre-temps : le fichier déposé ne sert à rien.
    if (!u.rowCount) { await stockage.supprimerSansErreur([cle], 'import de caisse'); return { depose: false }; }
  } catch (e) {
    await stockage.supprimerSansErreur([cle], 'import de caisse');
    throw e;
  }
  return { depose: true };
}

/** Le document conservé d'un import : { octets, type, nom } ; null s'il n'y en a pas (ou plus). */
async function lireDocument(imp) {
  if (!imp.document_cle) return null;
  const octets = await stockage.lire(imp.document_cle);
  if (!octets) return null;
  const ext = DOCUMENTS[imp.source].ext;
  const base = String(imp.fichier_nom || `import-caisse.${ext}`).split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f"]/g, '').trim() || `import-caisse.${ext}`;
  return { octets, type: imp.document_type || DOCUMENTS[imp.source].type, nom: base };
}

const effacerDocuments = (cles) => stockage.supprimerSansErreur(cles || [], 'import de caisse annulé');

module.exports = { DOCUMENT_MAX, contexte, lister, jour, enregistrer, annuler, trouver, deposerDocument, lireDocument, effacerDocuments };
