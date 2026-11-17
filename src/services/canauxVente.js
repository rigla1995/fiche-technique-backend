// Canaux de vente (étape C1 — labflow-reprise/ventes-cartes/PLAN-VENTES-CARTES.md §2.2) : accès à la base.
// Règles pures et lecture des entrées : src/utils/canauxVente.js.
//
// Un produit est EN VENTE sur un canal quand :
//   vente directe  activite_articles_vendables.actif ET .directe ;
//   prestataire    activite_articles_vendables.actif ET article_prix_prestataire.en_vente ET prix > 0.
// `actif` suit les canaux : vrai dès qu'un canal vend le produit. Un produit désactivé par l'ancien écran garde des
// cases périmées ; elles sont remises à zéro à la première modification par la grille (voir `preparer`).
// Recette propre à un canal (C2) : sur un canal, une variante en vente tient la place de son produit d'origine ; les
// deux ne s'y vendent pas ensemble (`exigerSansDoublon`), et la copie d'un canal ne remplace pas l'un par l'autre.
const { ErreurCanal, appliquer, majorer, planCopie } = require('../utils/canauxVente');

const SQL_EN_VENTE_PRESTATAIRE = `EXISTS (SELECT 1 FROM article_prix_prestataire app
   WHERE app.article_vendable_id = av.id AND app.en_vente AND app.prix_vente > 0)`;

/** L'interrupteur de chaque produit touché suit ses canaux. */
async function recalculerActif(db, vendableIds) {
  if (!vendableIds.length) return;
  await db.query(
    `UPDATE activite_articles_vendables av
        SET actif = (av.directe OR ${SQL_EN_VENTE_PRESTATAIRE})
      WHERE av.id = ANY($1::uuid[])`,
    [vendableIds]
  );
}

/** Après la désactivation d'un prestataire : un produit qui n'était vendu que chez lui n'est plus en vente nulle part. */
async function retirerSansCanal(db, activiteId) {
  const r = await db.query(
    `UPDATE activite_articles_vendables av
        SET actif = false
      WHERE av.activite_id = $1 AND av.actif AND NOT av.directe AND NOT ${SQL_EN_VENTE_PRESTATAIRE}`,
    [activiteId]
  );
  return r.rowCount;
}

/** Même règle pour un seul produit (prix prestataire effacé par l'écran d'avant les canaux). */
async function eteindreSansCanal(db, vendableId) {
  await db.query(
    `UPDATE activite_articles_vendables av
        SET actif = false
      WHERE av.id = $1 AND av.actif AND NOT av.directe AND NOT ${SQL_EN_VENTE_PRESTATAIRE}`,
    [vendableId]
  );
}

/** Liens activité–prestataire de l'activité (identifiants en minuscules). */
async function liensDe(db, activiteId) {
  const r = await db.query('SELECT id FROM activite_prestataires WHERE activite_id = $1', [activiteId]);
  return new Set(r.rows.map((x) => String(x.id).toLowerCase()));
}

const exigerLien = (liens, canal) => {
  if (!canal.directe && !liens.has(canal.lienId)) {
    throw new ErreurCanal(404, 'CANAL_INTROUVABLE', "[[Ce:prestataire]] n'est pas [[acc:prestataire:activé:activée]] pour [[ce:activite]].");
  }
};

/** Les produits et articles nommés par les cellules sont-ils du compte ? */
async function exigerArticlesDuCompte(db, clientId, cellules) {
  const produits = [...new Set(cellules.filter((c) => c.articleType === 'produit').map((c) => c.articleId))];
  const articles = [...new Set(cellules.filter((c) => c.articleType === 'ingredient').map((c) => c.articleId))];
  if (produits.length) {
    const r = await db.query('SELECT id FROM produits WHERE id = ANY($1::int[]) AND client_id = $2', [produits, clientId]);
    if (r.rows.length !== produits.length) throw new ErreurCanal(404, 'ARTICLE_INTROUVABLE', '[[Nom:produit]] introuvable.');
  }
  if (articles.length) {
    const r = await db.query('SELECT id FROM articles WHERE id = ANY($1::int[]) AND client_id = $2', [articles, clientId]);
    if (r.rows.length !== articles.length) throw new ErreurCanal(404, 'ARTICLE_INTROUVABLE', '[[Nom:article]] introuvable.');
  }
}

/** Ligne vendable de l'activité, verrouillée ; créée (hors vente, sans prix) si elle n'existe pas encore. */
async function vendableDe(db, activiteId, cellule, userId) {
  const lire = () => db.query(
    `SELECT id, prix_vente, actif, directe FROM activite_articles_vendables
      WHERE activite_id = $1 AND article_type = $2 AND article_id = $3 FOR UPDATE`,
    [activiteId, cellule.articleType, cellule.articleId]
  );
  let r = await lire();
  if (!r.rows.length) {
    await db.query(
      `INSERT INTO activite_articles_vendables (activite_id, article_type, article_id, prix_vente, actif, directe, created_by)
       VALUES ($1, $2, $3, 0, false, false, $4)
       ON CONFLICT (activite_id, article_type, article_id) DO NOTHING`,
      [activiteId, cellule.articleType, cellule.articleId, userId]
    );
    r = await lire();
  }
  return r.rows[0];
}

/** Produit hors vente : ses cases (périmées si l'ancien écran l'a désactivé) repartent de zéro avant toute modification. */
async function preparer(db, av) {
  if (av.actif) return av;
  await db.query('UPDATE activite_articles_vendables SET directe = false WHERE id = $1', [av.id]);
  await db.query('UPDATE article_prix_prestataire SET en_vente = false WHERE article_vendable_id = $1 AND en_vente', [av.id]);
  return { ...av, directe: false };
}

const prixDe = (v) => (v == null ? null : parseFloat(v));

async function historiser(db, vendableId, prix, userId) {
  await db.query(
    'INSERT INTO article_vendable_prix_historique (article_vendable_id, prix_vente, created_by) VALUES ($1, $2, $3)',
    [vendableId, prix, userId]
  );
}

async function ecrireDirecte(db, av, apres, userId) {
  const avant = prixDe(av.prix_vente) ?? 0;
  const prix = apres.prix ?? 0;
  await db.query('UPDATE activite_articles_vendables SET prix_vente = $1, directe = $2 WHERE id = $3', [prix, apres.enVente, av.id]);
  if (prix > 0 && prix !== avant) await historiser(db, av.id, prix, userId);
}

async function ecrirePrestataire(db, av, lienId, apres, userId) {
  await db.query(
    `INSERT INTO article_prix_prestataire (article_vendable_id, activite_prestataire_id, prix_vente, en_vente, updated_at, created_by)
     VALUES ($1, $2, $3, $4, NOW(), $5)
     ON CONFLICT (article_vendable_id, activite_prestataire_id) DO UPDATE
       SET prix_vente = EXCLUDED.prix_vente, en_vente = EXCLUDED.en_vente, updated_at = NOW()`,
    [av.id, lienId, apres.prix, apres.enVente, userId]
  );
}

// Paires (produit d'origine, variante) en vente toutes les deux sur un même canal de l'activité ($1), parmi les produits $2.
const SQL_DOUBLONS = `
  SELECT o.id AS origine_id, o.nom AS origine_nom, v.id AS variante_id, v.nom AS variante_nom, 'directe' AS canal
    FROM produits v
    JOIN produits o ON o.id = v.variante_de_id
    JOIN activite_articles_vendables avv ON avv.activite_id = $1 AND avv.article_type = 'produit' AND avv.article_id = v.id
    JOIN activite_articles_vendables avo ON avo.activite_id = $1 AND avo.article_type = 'produit' AND avo.article_id = o.id
   WHERE avv.actif AND avv.directe AND avo.actif AND avo.directe
     AND (v.id = ANY($2::int[]) OR o.id = ANY($2::int[]))
  UNION ALL
  SELECT o.id, o.nom, v.id, v.nom, LOWER(appv.activite_prestataire_id::text)
    FROM produits v
    JOIN produits o ON o.id = v.variante_de_id
    JOIN activite_articles_vendables avv ON avv.activite_id = $1 AND avv.article_type = 'produit' AND avv.article_id = v.id
    JOIN activite_articles_vendables avo ON avo.activite_id = $1 AND avo.article_type = 'produit' AND avo.article_id = o.id
    JOIN article_prix_prestataire appv ON appv.article_vendable_id = avv.id AND appv.en_vente AND appv.prix_vente > 0
    JOIN article_prix_prestataire appo ON appo.article_vendable_id = avo.id AND appo.en_vente AND appo.prix_vente > 0
                                      AND appo.activite_prestataire_id = appv.activite_prestataire_id
   WHERE avv.actif AND avo.actif
     AND (v.id = ANY($2::int[]) OR o.id = ANY($2::int[]))`;

/**
 * Recette propre à un canal (C2) : un envoi ne laisse pas un produit et sa variante en vente sur le même canal. Le
 * contrôle se fait une fois tout écrit : décocher la variante et recocher l'original dans le même envoi passe, quel que
 * soit l'ordre des cellules. Seuls les canaux touchés par l'envoi sont regardés.
 */
async function exigerSansDoublon(db, activiteId, cellules) {
  const produits = cellules.filter((c) => c.articleType === 'produit');
  if (!produits.length) return;
  const cleCanal = (canal) => (canal.directe ? 'directe' : canal.lienId);
  const touchees = new Set(produits.map((c) => `${c.articleId}|${cleCanal(c.canal)}`));
  const r = await db.query(SQL_DOUBLONS, [activiteId, [...new Set(produits.map((c) => c.articleId))]]);
  const doublon = r.rows.find((d) => touchees.has(`${d.origine_id}|${d.canal}`) || touchees.has(`${d.variante_id}|${d.canal}`));
  if (!doublon) return;
  throw new ErreurCanal(409, 'REMPLACE_PAR_VARIANTE',
    `« ${doublon.origine_nom} » et sa variante « ${doublon.variante_nom} » ne peuvent pas être en [[nom:vente]] sur le même canal : décochez l'un des deux.`);
}

/**
 * Enregistre des cellules de la grille « Configuration vente » (prix, case « en vente ») dans la transaction de `db`.
 * Rend le nombre de cellules écrites.
 */
async function modifierCellules(db, { activiteId, clientId, userId, cellules }) {
  await exigerArticlesDuCompte(db, clientId, cellules);
  const liens = await liensDe(db, activiteId);
  for (const c of cellules) exigerLien(liens, c.canal);

  const touches = new Set();
  for (const c of cellules) {
    // Remise à zéro d'un produit hors vente : une seule fois par envoi (l'interrupteur n'est recalculé qu'à la fin).
    let av = await vendableDe(db, activiteId, c, userId);
    if (!touches.has(av.id)) av = await preparer(db, av);
    if (c.canal.directe) {
      const prix = prixDe(av.prix_vente);
      const apres = appliquer({ prix: prix > 0 ? prix : null, enVente: av.directe }, c);
      await ecrireDirecte(db, av, apres, userId);
    } else {
      const r = await db.query(
        'SELECT prix_vente, en_vente FROM article_prix_prestataire WHERE article_vendable_id = $1 AND activite_prestataire_id = $2 FOR UPDATE',
        [av.id, c.canal.lienId]
      );
      const avant = r.rows[0] ? { prix: prixDe(r.rows[0].prix_vente), enVente: r.rows[0].en_vente } : { prix: null, enVente: false };
      const apres = appliquer(avant, c);
      if (r.rows[0] || apres.prix != null) await ecrirePrestataire(db, av, c.canal.lienId, apres, userId);
    }
    touches.add(av.id);
  }
  await recalculerActif(db, [...touches]);
  await exigerSansDoublon(db, activiteId, cellules);
  return touches.size;
}

/** Produits en vente sur un canal : [{ id (ligne vendable), prix }]. */
async function enVenteSur(db, activiteId, canal) {
  const r = canal.directe
    ? await db.query(
        `SELECT av.id, av.prix_vente AS prix FROM activite_articles_vendables av
          WHERE av.activite_id = $1 AND av.actif AND av.directe AND av.prix_vente > 0`,
        [activiteId]
      )
    : await db.query(
        `SELECT av.id, app.prix_vente AS prix
           FROM activite_articles_vendables av
           JOIN article_prix_prestataire app ON app.article_vendable_id = av.id AND app.activite_prestataire_id = $2
          WHERE av.activite_id = $1 AND av.actif AND app.en_vente AND app.prix_vente > 0`,
        [activiteId, canal.lienId]
      );
  return r.rows.map((x) => ({ id: x.id, prix: parseFloat(x.prix) }));
}

/**
 * Copie un canal vers un autre : chaque produit en vente sur la source l'est sur la cible, au prix majoré et arrondi.
 * `retirerAbsents` : ce que la cible vendait et que la source ne vend pas est retiré de la cible (prix gardé).
 * Un produit et sa variante ne se remplacent pas : si la cible vend déjà l'autre, la ligne est laissée (voir planCopie).
 * Rend { copies, prix_remplaces, retires, laisses }.
 */
async function copier(db, { activiteId, userId, source, cible, pct, pas, retirerAbsents }) {
  const liens = await liensDe(db, activiteId);
  exigerLien(liens, source);
  exigerLien(liens, cible);

  // Verrou de toutes les lignes vendables de l'activité : la copie lit puis écrit.
  await db.query('SELECT id FROM activite_articles_vendables WHERE activite_id = $1 FOR UPDATE', [activiteId]);
  const origine = await enVenteSur(db, activiteId, source);
  const avantCible = new Map((await enVenteSur(db, activiteId, cible)).map((x) => [x.id, x.prix]));
  const prixCible = cible.directe
    ? new Map((await db.query('SELECT id, prix_vente FROM activite_articles_vendables WHERE activite_id = $1', [activiteId])).rows.map((x) => [x.id, prixDe(x.prix_vente)]))
    : new Map((await db.query(
        `SELECT app.article_vendable_id AS id, app.prix_vente FROM article_prix_prestataire app WHERE app.activite_prestataire_id = $1`,
        [cible.lienId]
      )).rows.map((x) => [x.id, prixDe(x.prix_vente)]));

  const familles = new Map((await db.query(
    `SELECT av.id, p.id AS produit_id, p.variante_de_id
       FROM activite_articles_vendables av
       JOIN produits p ON p.id = av.article_id
      WHERE av.activite_id = $1 AND av.article_type = 'produit'`,
    [activiteId]
  )).rows.map((x) => [x.id, { produitId: x.produit_id, origineId: x.variante_de_id }]));
  const plan = planCopie(origine, [...avantCible.keys()].map((id) => ({ id })), familles, retirerAbsents);

  let remplaces = 0;
  for (const ligne of plan.aCopier) {
    const prix = majorer(ligne.prix, pct, pas);
    const ancien = prixCible.get(ligne.id);
    if (ancien != null && ancien > 0 && ancien !== prix) remplaces++;
    if (cible.directe) {
      await db.query('UPDATE activite_articles_vendables SET prix_vente = $1, directe = true WHERE id = $2', [prix, ligne.id]);
      if (ancien !== prix) await historiser(db, ligne.id, prix, userId);
    } else {
      await ecrirePrestataire(db, ligne, cible.lienId, { prix, enVente: true }, userId);
    }
  }

  const aRetirer = plan.aRetirer;
  const retires = aRetirer.length;
  if (retires) {
    if (cible.directe) {
      await db.query('UPDATE activite_articles_vendables SET directe = false WHERE id = ANY($1::uuid[])', [aRetirer]);
    } else {
      await db.query(
        'UPDATE article_prix_prestataire SET en_vente = false, updated_at = NOW() WHERE activite_prestataire_id = $1 AND article_vendable_id = ANY($2::uuid[])',
        [cible.lienId, aRetirer]
      );
    }
  }

  const tous = await db.query('SELECT id FROM activite_articles_vendables WHERE activite_id = $1', [activiteId]);
  await recalculerActif(db, tous.rows.map((x) => x.id));
  return { copies: plan.aCopier.length, prix_remplaces: remplaces, retires, laisses: plan.laisses };
}

/**
 * Saisie d'une vente d'une activité : chaque ligne doit être en vente sur le canal de la vente (409 PAS_EN_VENTE sinon).
 * `prestataireId` = le prestataire de la plateforme (ventes.prestataire_id), pas le lien.
 */
async function exigerLignesEnVente(db, { activiteId, typeVente, prestataireId, lignes }) {
  if (!Array.isArray(lignes) || !lignes.length) return;
  const r = typeVente === 'prestataire'
    ? await db.query(
        `SELECT av.article_type, av.article_id
           FROM activite_articles_vendables av
           JOIN activite_prestataires ap ON ap.activite_id = av.activite_id AND ap.prestataire_id = $2
           JOIN article_prix_prestataire app ON app.article_vendable_id = av.id AND app.activite_prestataire_id = ap.id
          WHERE av.activite_id = $1 AND av.actif AND app.en_vente AND app.prix_vente > 0`,
        [activiteId, prestataireId]
      )
    : await db.query(
        `SELECT av.article_type, av.article_id FROM activite_articles_vendables av
          WHERE av.activite_id = $1 AND av.actif AND av.directe`,
        [activiteId]
      );
  const ouverts = new Set(r.rows.map((x) => `${x.article_type}:${x.article_id}`));
  const ferme = lignes.find((l) => !ouverts.has(`${l.article_type}:${Number(l.article_id)}`));
  if (!ferme) return;

  const idFerme = Number(ferme.article_id);
  let nom = null;
  if (Number.isInteger(idFerme)) {
    const table = ferme.article_type === 'ingredient' ? 'articles' : 'produits';
    nom = (await db.query(`SELECT nom FROM ${table} WHERE id = $1`, [idFerme])).rows[0]?.nom ?? null;
  }
  const quoi = nom ? `« ${nom} »` : (ferme.article_type === 'ingredient' ? '[[Ce:article]]' : '[[Ce:produit]]');
  throw new ErreurCanal(409, 'PAS_EN_VENTE',
    `${quoi} n'est pas en [[nom:vente]] sur ce canal. Cochez sa case dans Configuration [[Court:vente]], avec un prix.`);
}

module.exports = { modifierCellules, copier, exigerLignesEnVente, recalculerActif, retirerSansCanal, eteindreSansCanal, liensDe, exigerLien };
