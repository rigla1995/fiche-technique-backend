/* Étape F5 des factures fournisseur (labflow-reprise/achats-compta/PLAN-FACTURES.md §1 « F5 », réponse 12 du client) :
 * la MISE EN PAGE apprise d'un fournisseur — les colonnes du tableau de ses factures (genre, début et fin du titre, en
 * fractions de la largeur de la page). Elle est PARTAGÉE entre les comptes LabFlow, par l'identifiant du matricule
 * fiscal du fournisseur (ses 7 chiffres) : la première facture validée chez un fournisseur aide tous les clients qui en
 * reçoivent les factures en photo. Elle ne contient AUCUNE donnée d'un compte : ni nom, ni montant, ni ligne.
 *
 * Apprise à la validation d'une facture lue (« Vérifier la facture »), quand la lecture avait vu le titre des colonnes et
 * que ses lignes ont été gardées ; une mise en page vue sur le texte d'un PDF (exacte) n'est jamais remplacée par une
 * mise en page vue sur une image. Lue par l'écran au moment de lire une photo (GET /api/factures/mise-en-page). */
const { normaliserMatriculeFiscal } = require('../utils/matriculeFiscal');

/** Genres de colonnes admis (mêmes que les écrans : lecture/types.ts, GenreColonne). */
const GENRES = ['num', 'ref', 'des', 'unite', 'qte', 'pu', 'puttc', 'remise', 'tva', 'montant', 'ttc'];
const CHIFFREES = ['qte', 'pu', 'puttc', 'montant', 'ttc', 'tva'];
const COLONNES_MAX = 14;

/** L'identifiant d'un matricule fiscal (ses 7 chiffres), ou null. */
const identifiantMatricule = (brut) => {
  const m = normaliserMatriculeFiscal(brut).match(/^(\d{7})/);
  return m ? m[1] : null;
};

/** Une mise en page reçue, contrôlée : { colonnes } (fractions arrondies au dix-millième, triées), ou null. */
const lireMiseEnPage = (brut) => {
  if (!brut || typeof brut !== 'object' || !Array.isArray(brut.colonnes)) return null;
  const cs = brut.colonnes;
  if (cs.length < 2 || cs.length > COLONNES_MAX) return null;
  const arrondi = (v) => Math.round(v * 10000) / 10000;
  const colonnes = [];
  for (const c of cs) {
    if (!c || typeof c !== 'object' || !GENRES.includes(c.genre)) return null;
    const { x0, x1 } = c;
    if (typeof x0 !== 'number' || typeof x1 !== 'number' || !Number.isFinite(x0) || !Number.isFinite(x1)) return null;
    if (x0 < 0 || x1 > 1 || x1 <= x0) return null;
    colonnes.push({ genre: c.genre, x0: arrondi(x0), x1: arrondi(x1) });
  }
  if (!colonnes.some((c) => c.genre === 'des') || !colonnes.some((c) => CHIFFREES.includes(c.genre))) return null;
  return { colonnes: colonnes.sort((a, b) => a.x0 - b.x0) };
};

/** La mise en page connue d'un fournisseur (par l'identifiant de son matricule) : { colonnes, source } ou null. */
const lire = async (db, identifiant) => {
  if (!/^\d{7}$/.test(String(identifiant || ''))) return null;
  const r = (await db.query('SELECT colonnes, source FROM factures_mises_en_page WHERE identifiant = $1', [identifiant])).rows[0];
  const m = r ? lireMiseEnPage(r.colonnes) : null;
  return m ? { colonnes: m.colonnes, source: r.source } : null;
};

/**
 * Apprend la mise en page `miseEnPage` (vue sur une lecture `source` 'pdf' | 'ocr') pour le fournisseur `fournisseurId`
 * du compte, dans la transaction `db`. Sans matricule au fournisseur, rien n'est appris (rien à partager). → true si la
 * mise en page connue a été créée ou remplacée.
 */
const apprendre = async (db, { fournisseurId, clientId, auteurId, miseEnPage, source }) => {
  const m = lireMiseEnPage(miseEnPage);
  if (!m || (source !== 'pdf' && source !== 'ocr') || !fournisseurId) return false;
  const f = (await db.query(
    `SELECT f.matricule_fiscal FROM fournisseurs f LEFT JOIN profil_entreprise pe ON pe.id = f.entreprise_id
      WHERE f.id = $1 AND (pe.client_id = $2 OR f.client_id = $2)`, [fournisseurId, clientId]
  )).rows[0];
  const identifiant = f ? identifiantMatricule(f.matricule_fiscal) : null;
  if (!identifiant) return false;
  // Une mise en page vue sur une image ne remplace jamais celle d'un PDF (exacte) ; sinon, la dernière l'emporte.
  const r = await db.query(
    `INSERT INTO factures_mises_en_page (identifiant, colonnes, source, appris_par)
     VALUES ($1, $2::jsonb, $3, $4)
     ON CONFLICT (identifiant) DO UPDATE SET
       colonnes = CASE WHEN factures_mises_en_page.source = 'pdf' AND EXCLUDED.source = 'ocr' THEN factures_mises_en_page.colonnes ELSE EXCLUDED.colonnes END,
       source = CASE WHEN factures_mises_en_page.source = 'pdf' AND EXCLUDED.source = 'ocr' THEN factures_mises_en_page.source ELSE EXCLUDED.source END,
       appris_par = CASE WHEN factures_mises_en_page.source = 'pdf' AND EXCLUDED.source = 'ocr' THEN factures_mises_en_page.appris_par ELSE EXCLUDED.appris_par END,
       apprentissages = factures_mises_en_page.apprentissages + 1,
       updated_at = NOW()
     RETURNING (xmax = 0) AS creee, colonnes = $2::jsonb AS retenue`,
    [identifiant, JSON.stringify(m), source, auteurId || null]
  );
  return Boolean(r.rows[0] && (r.rows[0].creee || r.rows[0].retenue));
};

module.exports = { GENRES, identifiantMatricule, lireMiseEnPage, lire, apprendre };
