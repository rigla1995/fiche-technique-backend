/* Étape F5 des factures fournisseur (labflow-reprise/achats-compta/PLAN-FACTURES.md §1 « F5 », réponse 12 du client) :
 * la MISE EN PAGE d'un fournisseur — les colonnes du tableau de ses factures (genre, début et fin du titre, en fractions
 * de la largeur de la page), par l'identifiant du matricule fiscal du fournisseur (ses 7 chiffres). Elle ne contient
 * AUCUNE donnée de facture : ni nom, ni montant, ni ligne.
 *
 * Chaque compte apprend la sienne à la validation d'une facture lue (« Vérifier la facture ») : la lecture avait vu le
 * titre des colonnes, gardé ses lignes, et lu sur la facture le matricule même de la fiche du fournisseur choisi.
 * PARTAGE sans qu'un compte puisse l'imposer aux autres (relecture du serveur, 13/10) : un compte lit toujours SA mise en
 * page ; celle des autres ne lui est servie que si deux comptes distincts au moins ont vu la même (colonnes de mêmes
 * genres, aux mêmes places à 3 % près). Une facture supprimée emporte ce qu'elle avait appris (migration 231). */
const { controlerMatriculeFiscal } = require('../utils/matriculeFiscal');

/** Genres de colonnes admis (mêmes que les écrans : lecture/types.ts, GenreColonne). */
const GENRES = ['num', 'ref', 'des', 'unite', 'qte', 'pu', 'puttc', 'remise', 'tva', 'montant', 'ttc'];
const CHIFFREES = ['qte', 'pu', 'puttc', 'montant', 'ttc', 'tva'];
const COLONNES_MAX = 14;
const LARGEUR_MIN = 0.005; // une colonne plus étroite n'est pas un titre lu
const LARGEUR_MAX = 0.6; // une colonne plus large que 60 % de la page non plus
const ECART_SEMBLABLE = 0.03; // deux mises en page « semblables » : mêmes genres, places à 3 % près
const COMPTES_MIN = 2; // comptes distincts qui doivent avoir vu la même mise en page pour qu'elle soit partagée

/** L'identifiant d'un matricule fiscal de forme valide (« 1234567A/A/M/000 », « 1234567A ») : ses 7 chiffres ; sinon null
 * (un n° de téléphone, de CIN ou de RIB lu à sa place n'ouvre jamais la mise en page d'un fournisseur). */
const identifiantMatricule = (brut) => {
  if (brut == null) return null;
  const c = controlerMatriculeFiscal(String(brut).slice(0, 60));
  const m = c.ok && c.valeur ? c.valeur.match(/^(\d{7})/) : null;
  return m ? m[1] : null;
};

/**
 * Une mise en page reçue, contrôlée APRÈS arrondi au dix-millième : { colonnes } triées, ou null — genres connus et
 * distincts, 2 à 14 colonnes, chacune dans la page, ni trop étroite ni trop large, sans chevauchement, une désignation et
 * une colonne chiffrée au moins.
 */
const lireMiseEnPage = (brut) => {
  if (!brut || typeof brut !== 'object' || !Array.isArray(brut.colonnes)) return null;
  const cs = brut.colonnes;
  if (cs.length < 2 || cs.length > COLONNES_MAX) return null;
  const arrondi = (v) => Math.round(v * 10000) / 10000;
  const colonnes = [];
  for (const c of cs) {
    if (!c || typeof c !== 'object' || !GENRES.includes(c.genre)) return null;
    if (typeof c.x0 !== 'number' || typeof c.x1 !== 'number' || !Number.isFinite(c.x0) || !Number.isFinite(c.x1)) return null;
    const x0 = arrondi(c.x0), x1 = arrondi(c.x1);
    if (x0 < 0 || x1 > 1 || x1 - x0 < LARGEUR_MIN || x1 - x0 > LARGEUR_MAX) return null;
    colonnes.push({ genre: c.genre, x0, x1 });
  }
  const genres = colonnes.map((c) => c.genre);
  if (new Set(genres).size !== genres.length) return null;
  if (!genres.includes('des') || !genres.some((g) => CHIFFREES.includes(g))) return null;
  colonnes.sort((a, b) => a.x0 - b.x0);
  for (let i = 1; i < colonnes.length; i++) if (colonnes[i].x0 < colonnes[i - 1].x1) return null;
  return { colonnes };
};

/** Deux mises en page semblables : mêmes genres dans le même ordre, mêmes places à 3 % de la page près. */
const semblables = (a, b) => a.colonnes.length === b.colonnes.length && a.colonnes.every((c, i) => {
  const d = b.colonnes[i];
  return c.genre === d.genre && Math.abs(c.x0 - d.x0) <= ECART_SEMBLABLE && Math.abs(c.x1 - d.x1) <= ECART_SEMBLABLE;
});

/**
 * La mise en page d'un fournisseur pour le compte `clientId` : la sienne ; sinon une mise en page vue par deux comptes
 * distincts au moins (la plus récente de celles-là). → { colonnes, propre } ou null.
 */
const lire = async (db, identifiant, clientId) => {
  if (!/^\d{7}$/.test(String(identifiant || ''))) return null;
  const vues = (await db.query(
    'SELECT client_id, colonnes FROM factures_mises_en_page WHERE identifiant = $1 ORDER BY updated_at DESC LIMIT 200', [identifiant]
  )).rows.map((r) => ({ clientId: r.client_id, m: lireMiseEnPage(r.colonnes) })).filter((v) => v.m);
  const propre = vues.find((v) => v.clientId === clientId);
  if (propre) return { colonnes: propre.m.colonnes, propre: true };
  for (const v of vues) {
    const comptes = new Set(vues.filter((w) => semblables(v.m, w.m)).map((w) => w.clientId));
    if (comptes.size >= COMPTES_MIN) return { colonnes: v.m.colonnes, propre: false };
  }
  return null;
};

/**
 * Apprend, pour le compte `clientId`, la mise en page `miseEnPage` vue par la lecture de la facture `factureId`
 * (fournisseur `fournisseurId`), dans la transaction `db`. Rien n'est appris si la fiche du fournisseur n'a pas de
 * matricule, ou si le matricule LU sur la facture (`matriculeLu`) n'est pas le sien. → true si appris.
 */
const apprendre = async (db, { fournisseurId, clientId, auteurId, factureId, miseEnPage, source, matriculeLu }) => {
  const m = lireMiseEnPage(miseEnPage);
  if (!m || (source !== 'pdf' && source !== 'ocr') || !fournisseurId || !clientId) return false;
  const f = (await db.query(
    `SELECT f.matricule_fiscal FROM fournisseurs f LEFT JOIN profil_entreprise pe ON pe.id = f.entreprise_id
      WHERE f.id = $1 AND (pe.client_id = $2 OR f.client_id = $2)`, [fournisseurId, clientId]
  )).rows[0];
  const identifiant = f ? identifiantMatricule(f.matricule_fiscal) : null;
  if (!identifiant || identifiantMatricule(matriculeLu) !== identifiant) return false;
  await db.query(
    `INSERT INTO factures_mises_en_page (identifiant, client_id, colonnes, source, facture_id, appris_par)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6)
     ON CONFLICT (identifiant, client_id) DO UPDATE SET
       colonnes = EXCLUDED.colonnes, source = EXCLUDED.source, facture_id = EXCLUDED.facture_id,
       appris_par = EXCLUDED.appris_par, updated_at = NOW()`,
    [identifiant, clientId, JSON.stringify(m), source, factureId || null, auteurId || null]
  );
  return true;
};

module.exports = { GENRES, identifiantMatricule, lireMiseEnPage, semblables, lire, apprendre };
