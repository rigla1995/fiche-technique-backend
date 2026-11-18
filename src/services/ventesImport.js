// Import d'un fichier de caisse (étape V1a — labflow-reprise/ventes-cartes/PLAN-VENTES-CARTES.md §3 et §5 bis) : accès
// à la base. Règles pures et lecture du corps : src/utils/ventesImport.js.
//
// Un import crée les ventes d'UNE journée d'une activité, une vente par canal (vente directe, chaque prestataire), avec
// EXACTEMENT les règles de la saisie (src/services/ventesEcriture.js : conditions du prestataire figées, coût, sorties
// de stock, refus d'un produit hors canal). Tout se fait dans la transaction de l'appelant : une ligne refusée annule
// l'import entier. Ce qui a été décidé pour chaque ligne est APPRIS, par activité (`correspondances_ventes`), ainsi que
// la nature de chaque catégorie du fichier (`caisse_categories`).
const VI = require('../utils/ventesImport');
const { verifierVente, ecrireVente } = require('./ventesEcriture');

const jourFr = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Ce que l'écran doit savoir avant de lire un fichier : correspondances apprises, catégories, journées déjà importées. */
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
  return { correspondances: corr.rows, categories: cat.rows, jours: jours.rows.map((r) => r.jour) };
}

/** Une journée ne s'importe qu'une fois, un fichier aussi (le remplacement d'une journée est l'étape V1b). */
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
  return parCle.size;
}

/**
 * Enregistre un import dans la transaction de `db`. `donnees` = le corps contrôlé (VI.lireImport).
 * Rend { import: { id, date_vente, total_lu, total_enregistre, nb_lignes }, ventes: [{ canal, type_vente,
 * prestataire_id, id, lignes, total }], apprises }.
 */
async function enregistrer(db, { clientId, userId, activiteId, donnees }) {
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
    import: { id: importe.id, date_vente: importe.date_vente, total_lu: importe.total_lu == null ? null : parseFloat(importe.total_lu),
      total_enregistre: parseFloat(importe.total_enregistre), nb_lignes: importe.nb_lignes },
    ventes, apprises,
  };
}

module.exports = { contexte, enregistrer };
