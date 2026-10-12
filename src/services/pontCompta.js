/* Pont LabFlow → LabFlow Compta (étape F4 « Vers la comptabilité » — labflow-reprise/achats-compta/PLAN-FACTURES.md §4,
 * notes ETAPE-F4.md). Une facture d'appro (validée par la lecture, ou saisie à la main avec sa pièce) part dans le dossier
 * « Mon entreprise » du client (module Compta actif) : LabFlow y prépare l'écriture d'achat EN BROUILLARD (journal des
 * achats, référence = n° de facture, origine « labflow ») ; le comptable la modifie et la valide comme toute écriture.
 *
 * Montants EXACTS de la facture, en millimes : une ligne de débit par compte et code de TVA (remise globale répartie au
 * prorata des lignes positives, plus forts restes), FODEC, TVA déductible par taux (montants de la validation), timbre ;
 * une ligne négative (déconsigne) au crédit ; le fournisseur, devenu tiers du dossier, au crédit du TTC.
 *
 * L'envoi a sa PROPRE transaction (après la validation ou le dépôt de la pièce) : un refus laisse la facture « à envoyer »,
 * avec le message ; il ne défait jamais la facture. Verrous : la facture, puis la comptabilité, puis le dossier (l'ordre
 * des transactions de la Compta). Le gérant LabFlow n'a pas d'accès Compta : le pont écrit pour le compte du client. */
const { withTransaction } = require('../utils/db');
const M = require('../compta/moduleClient');
const { exigerEcriture } = require('../compta/garde');
const E = require('../compta/ecritures');
const T = require('../compta/tiers');
const { journaliser } = require('../compta/journal');
const { SQL_COMPTES_NUMEROS, SQL_PERIODE_OUVERTE_APRES } = require('../compta/declarations');
const { HORS_W1252 } = require('../compta/planComptes');
const { SQL_FEUILLE } = require('../compta/configDossier');
const P = require('./piecesFacture');
const { rendre, vocabDefaut } = require('../utils/vocab');
const { normaliserMatriculeFiscal } = require('../utils/matriculeFiscal');

class RefusCompta extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const refus = (status, code, message) => new RefusCompta(status, code, message);

// ── Comptes par défaut (PLAN-FACTURES question 17) ────────────────────────────────────────────────────────────────────
// Sens LabFlow des familles : « consommable » = utilisée dans les recettes, « vendable » = vendue (vraies par défaut).
const COMPTE_ACHATS = '601';         // ingrédients (famille consommable), article sans famille
const COMPTE_MARCHANDISES = '607';   // famille vendable non consommable : revendue en l'état (boissons…)
const COMPTE_CONSOMMABLES = '6022';  // famille ni vendable ni consommable : fournitures (emballages, entretien)
const COMPTES_NATURES = { transport: '6241', livraison: '6241', consigne: '4096', service: '604', autre: '606' };
const LIBELLES_NATURES = { transport: 'Transport', livraison: 'Frais de livraison', consigne: 'Consigne', service: 'Prestation', autre: 'Autre frais' };
const compteParDefaut = ({ natureHorsStock, vendable, consommable }) => {
  if (natureHorsStock) return COMPTES_NATURES[natureHorsStock] || COMPTES_NATURES.autre;
  if (consommable === false && vendable === true) return COMPTE_MARCHANDISES;
  if (consommable === false && vendable === false) return COMPTE_CONSOMMABLES;
  return COMPTE_ACHATS;
};

// ── Montants ─────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Montant lu en base (NUMERIC « -12.340 ») ou calculé (nombre) → millimes BigInt (signe gardé). */
const enMillimes = (v) => {
  if (v == null || v === '') return 0n;
  const s = typeof v === 'number' ? v.toFixed(3) : String(v).trim();
  const negatif = s.startsWith('-');
  const [entiers, decimales = ''] = s.replace('-', '').split('.');
  const n = BigInt(entiers || '0') * 1000n + BigInt(decimales.padEnd(3, '0').slice(0, 3));
  return negatif ? -n : n;
};
/** `total` réparti au prorata de `poids` (millimes ≥ 0), à l'entier près : plus forts restes, puis l'ordre. */
const repartirProrata = (total, poids) => {
  const somme = poids.reduce((s, p) => s + (p > 0n ? p : 0n), 0n);
  if (total === 0n || somme === 0n) return poids.map(() => 0n);
  const parts = poids.map((p) => (p > 0n ? (total * p) / somme : 0n));
  let manque = total - parts.reduce((s, x) => s + x, 0n);
  const ordre = poids.map((p, i) => ({ i, reste: p > 0n ? (total * p) % somme : -1n }))
    .sort((a, b) => (b.reste > a.reste ? 1 : b.reste < a.reste ? -1 : a.i - b.i));
  for (const { i, reste } of ordre) {
    if (manque <= 0n || reste < 0n) break;
    parts[i] += 1n;
    manque -= 1n;
  }
  return parts;
};
const cleTaux = (t) => String(Number(t || 0));

/** Texte admis par la Compta (Windows-1252, longueur) : les caractères hors jeu deviennent des espaces. */
const texteCompta = (s, max) => String(s ?? '').replace(new RegExp(HORS_W1252.source, 'gu'), ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Les lignes de l'écriture d'achat d'une facture (pure : tout est déjà résolu). `lignes` : { montant (millimes signés),
 * tauxTva, compteId, tiersId }. `tvaParTaux` : Map taux → montant de TVA (millimes) ; absente : calculée par taux
 * (assiette = lignes du taux + leur part de FODEC). `codes` : { tva: Map taux → { taxeId, compteId }, fodec, timbre }
 * ({ taxeId, compteId }, taxeId facultatif). → { lignes, total } ; lève RefusCompta TAUX_SANS_CODE.
 */
const ecritureDeFacture = ({ lignes, remiseGlobale = 0n, fodec = 0n, timbre = 0n, tvaParTaux = null, codes, fournisseur, libelle, reference }) => {
  const positifs = lignes.map((l) => (l.montant > 0n ? l.montant : 0n));
  const remises = repartirProrata(remiseGlobale, positifs);
  const nets = lignes.map((l, i) => (l.montant > 0n ? l.montant - remises[i] : l.montant));
  const partsFodec = repartirProrata(fodec, nets.map((n) => (n > 0n ? n : 0n)));
  // TVA par taux : celle de la validation, sinon calculée sur (net + FODEC) des lignes du taux.
  const bases = new Map();
  lignes.forEach((l, i) => bases.set(cleTaux(l.tauxTva), (bases.get(cleTaux(l.tauxTva)) ?? 0n) + nets[i] + partsFodec[i]));
  const tva = new Map([...bases].map(([t, b]) => [t, tvaParTaux?.has(t) ? tvaParTaux.get(t) : E.calculTaxe(b, t)]));
  for (const [t, montant] of tva) {
    if (montant !== 0n && !codes.tva.get(t)) throw refus(409, 'TAUX_SANS_CODE', `Aucun code de TVA à ${t.replace('.', ',')} % actif dans la comptabilité : demandez à votre comptable de le créer (page Taxes), puis envoyez de nouveau.`);
  }
  const groupes = new Map();
  const ajouter = (sens, compteId, tiersId, taxeId, montant, lib) => {
    if (montant === 0n) return;
    const cle = `${sens}|${compteId}|${tiersId || ''}|${taxeId || ''}|${lib}`;
    const g = groupes.get(cle) || { sens, compteId, tiersId: tiersId || null, taxeId: taxeId || null, libelle: lib, montant: 0n };
    g.montant += montant;
    groupes.set(cle, g);
  };
  // Les lignes de la facture (HT net de remise), puis FODEC, TVA par taux, timbre ; au crédit : les retours, le fournisseur.
  lignes.forEach((l, i) => {
    const code = codes.tva.get(cleTaux(l.tauxTva));
    if (nets[i] > 0n) ajouter('D', l.compteId, l.tiersId, code?.taxeId, nets[i], libelle);
    else if (nets[i] < 0n) ajouter('C', l.compteId, l.tiersId, code?.taxeId, -nets[i], libelle);
  });
  if (fodec > 0n) ajouter('D', codes.fodec.compteId, null, codes.fodec.taxeId, fodec, texteCompta(`FODEC — facture ${reference}`, 255));
  [...tva].sort((a, b) => Number(a[0]) - Number(b[0])).forEach(([t, montant]) => {
    if (montant > 0n) ajouter('D', codes.tva.get(t).compteId, null, codes.tva.get(t).taxeId, montant, texteCompta(`TVA ${t.replace('.', ',')} % — facture ${reference}`, 255));
  });
  if (timbre > 0n) ajouter('D', codes.timbre.compteId, null, codes.timbre.taxeId, timbre, texteCompta(`Timbre — facture ${reference}`, 255));
  const debits = [...groupes.values()].filter((g) => g.sens === 'D');
  const credits = [...groupes.values()].filter((g) => g.sens === 'C');
  const totalDebit = debits.reduce((s, g) => s + g.montant, 0n);
  const aPayer = totalDebit - credits.reduce((s, g) => s + g.montant, 0n);
  if (aPayer <= 0n) throw refus(409, 'MONTANT_NUL', 'Le total de cette facture n\'est pas positif : rien à envoyer en comptabilité.');
  const toutes = [...debits, ...credits, { sens: 'C', compteId: fournisseur.compteId, tiersId: fournisseur.tiersId, taxeId: null, libelle, montant: aPayer }];
  return {
    lignes: toutes.map((g, i) => ({
      rang: i + 1, compteId: g.compteId, tiersId: g.tiersId, libelle: g.libelle,
      debit: g.sens === 'D' ? g.montant : 0n, credit: g.sens === 'C' ? g.montant : 0n, taxeId: g.taxeId, echeance: null,
    })),
    total: totalDebit,
  };
};

// ── En base ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Le module Compta du compte : actif (abonnement + comptabilité ouverte) → { espaceId } ; sinon null. */
const moduleActif = async (db, clientId) => {
  const m = await M.lire(db, clientId);
  return m && m.module_compta_actif === true && m.espace_id && m.espace_etat === 'actif' ? { espaceId: m.espace_id } : null;
};

/** L'écriture de chaque facture : Map factureId → { ecritureId, etat, numero, numeroProvisoire }. */
const etatsCompta = async (db, factureIds) => {
  if (!factureIds.length) return new Map();
  const r = await db.query('SELECT id, facture_id, etat, numero, numero_provisoire FROM compta.ecritures WHERE facture_id = ANY($1)', [factureIds]);
  return new Map(r.rows.map((e) => [e.facture_id, { ecritureId: e.id, etat: e.etat, numero: e.numero, numeroProvisoire: E.numeroProvisoire(e.numero_provisoire) }]));
};
/** La facture est-elle en comptabilité (une écriture la porte) ? Ses lignes et ses pièces ne changent plus. */
const enCompta = async (db, factureId) => Boolean(factureId) && (await db.query('SELECT 1 FROM compta.ecritures WHERE facture_id = $1', [factureId])).rows.length > 0;
/** Fragment SQL : la facture `col` (identifiant) porte une écriture. */
const SQL_EN_COMPTA = (col) => `EXISTS (SELECT 1 FROM compta.ecritures ce WHERE ce.facture_id = ${col})`;
const MESSAGE_EN_COMPTA = 'Cette ligne vient d\'une facture envoyée en comptabilité : elle ne se modifie plus. Pour la changer, supprimez d\'abord son écriture en brouillard dans LabFlow Compta (ou demandez-le à votre comptable).';
const refusEnCompta = { code: 'FACTURE_EN_COMPTA', message: MESSAGE_EN_COMPTA };

// Date de l'écriture : la date de la facture ; période close ⇒ 1er jour de la période ouverte suivante (vraie date = date
// de la facture, NC 01 §61) ; facture d'avant l'exercice ouvert ⇒ 1re période ouverte de l'exercice.
const dateDe = async (db, d, dateFacture) => {
  const ex = await E.exerciceOuvert(db, d.id);
  if (!ex) throw refus(409, 'EXERCICE_CLOS', 'Aucun exercice ouvert dans la comptabilité : demandez à votre comptable d\'ouvrir l\'exercice, puis envoyez de nouveau.');
  if (dateFacture > ex.fin) {
    throw refus(409, 'DATE_APRES_EXERCICE', `La facture du ${E.fmtDate(dateFacture)} est après l'exercice ouvert (du ${E.fmtDate(ex.debut)} au ${E.fmtDate(ex.fin)}) : demandez à votre comptable d'ouvrir l'exercice suivant, puis envoyez de nouveau.`);
  }
  if (dateFacture < ex.debut) {
    const p = (await db.query(`SELECT debut::text AS debut FROM compta.periodes WHERE exercice_id = $1 AND etat = 'ouverte' ORDER BY debut LIMIT 1`, [ex.id])).rows[0];
    if (!p) throw refus(409, 'PAS_DE_PERIODE_OUVERTE', 'Toutes les périodes de l\'exercice sont closes : demandez à votre comptable d\'en rouvrir une.');
    return { date: p.debut, dateReelle: dateFacture };
  }
  const p = (await db.query('SELECT etat FROM compta.periodes WHERE exercice_id = $1 AND $2::date BETWEEN debut AND fin', [ex.id, dateFacture])).rows[0];
  if (!p || p.etat === 'ouverte') return { date: dateFacture, dateReelle: null };
  const suivante = (await db.query(SQL_PERIODE_OUVERTE_APRES, [d.id, dateFacture, ex.id])).rows[0];
  if (!suivante) throw refus(409, 'PAS_DE_PERIODE_OUVERTE', `La période de la facture (${E.fmtDate(dateFacture)}) est close et aucune période ouverte ne la suit : demandez à votre comptable d'en rouvrir une.`);
  return { date: suivante.debut, dateReelle: dateFacture };
};

// Le fournisseur, tiers du dossier : déjà relié, sinon même matricule fiscal, sinon créé (code du modèle, collectif du
// paquet, origine « labflow »). → { tiers, cree }.
const tiersDe = async (db, d, f, auteurId) => {
  const SQL = 'SELECT id, code, nom, actif, compte_id, fournisseur_id, matricule_fiscal FROM compta.tiers WHERE dossier_id = $1 AND type = \'fournisseur\'';
  let t = (await db.query(`${SQL} AND fournisseur_id = $2 ORDER BY actif DESC, id LIMIT 1`, [d.id, f.fournisseur_id])).rows[0];
  const mf = f.fournisseur_mf ? normaliserMatriculeFiscal(f.fournisseur_mf) : null;
  if (!t && mf) {
    const memes = (await db.query(`${SQL} AND matricule_fiscal IS NOT NULL ORDER BY actif DESC, id`, [d.id])).rows;
    t = memes.find((x) => normaliserMatriculeFiscal(x.matricule_fiscal) === mf);
    if (t && !t.fournisseur_id) await db.query('UPDATE compta.tiers SET fournisseur_id = $2 WHERE id = $1', [t.id, f.fournisseur_id]);
  }
  if (t) {
    if (!t.actif) throw refus(409, 'TIERS_DESACTIVE', `Le tiers ${t.code} (${t.nom}) est désactivé dans la comptabilité : demandez à votre comptable de le réactiver (page Tiers), puis envoyez de nouveau.`);
    return { tiers: t, cree: false };
  }
  const numero = T.collectifDefautNumero(d, 'fournisseur');
  const k = numero && (await db.query(SQL_COMPTES_NUMEROS, [d.id, [numero]])).rows[0];
  if (!k || !k.actif || !k.feuille) throw refus(409, 'COLLECTIF_ABSENT', `Le compte collectif ${numero || '401'} n'est pas imputable dans la comptabilité : demandez à votre comptable de le régler (page Plan de comptes).`);
  const codes = new Set((await db.query('SELECT code FROM compta.tiers WHERE dossier_id = $1 AND type = \'fournisseur\'', [d.id])).rows.map((x) => x.code));
  let code;
  try { code = T.generateurCodes(T.modeleDe(d), 'fournisseur', codes)(); } catch (e) { throw refus(409, e.code || 'SERIE_PLEINE', e.message); }
  const nom = texteCompta(f.fournisseur_raison_sociale || f.fournisseur_nom, 255) || 'Tiers';
  const ins = await db.query(
    `INSERT INTO compta.tiers (dossier_id, type, code, nom, matricule_fiscal, adresse, ville, telephone, email, compte_id, origine, cree_par, fournisseur_id)
     VALUES ($1, 'fournisseur', $2, $3, $4, $5, $6, $7, $8, $9, 'labflow', $10, $11) RETURNING id, code, nom, actif, compte_id`,
    [d.id, code, nom, mf ? texteCompta(f.fournisseur_mf, 50) : null, texteCompta(f.fournisseur_adresse, 300) || null, texteCompta(f.fournisseur_ville, 120) || null,
      texteCompta(f.fournisseur_telephone, 30) || null, texteCompta(f.fournisseur_email, 150) || null, k.id, auteurId, f.fournisseur_id]
  );
  return { tiers: ins.rows[0], cree: true, collectif: k.numero };
};

// Les lignes « métier » de la facture : validée (factures_lignes, montants exacts) ou saisie à la main (lignes de stock :
// quantité × prix HT). → [{ montant, tauxTva, articleId, natureHorsStock }].
const lignesDeFacture = async (db, f) => {
  if (f.validee_le) {
    return (await db.query(
      `SELECT montant_ht::text AS montant, taux_tva::text AS taux, article_id, nature_hors_stock, quantite::text AS quantite, conversion::text AS conversion
         FROM factures_lignes WHERE facture_id = $1 ORDER BY rang`, [f.id]
    )).rows.map((l) => ({ montant: enMillimes(l.montant), tauxTva: l.taux, articleId: l.article_id, natureHorsStock: l.nature_hors_stock, quantite: Number(l.quantite), conversion: l.conversion == null ? null : Number(l.conversion), montantNombre: Number(l.montant) }));
  }
  const table = f.labo_id ? 'stock_labo_daily' : 'stock_entreprise_daily';
  return (await db.query(
    `SELECT quantite::text AS quantite, prix_unitaire::text AS prix, COALESCE(taux_tva, 0)::text AS taux, ingredient_id
       FROM ${table} WHERE facture_id = $1 AND quantite > 0 ORDER BY id`, [f.id]
  )).rows.map((l) => ({ montant: enMillimes(Number(l.quantite) * Number(l.prix || 0)), tauxTva: l.taux, articleId: l.ingredient_id, natureHorsStock: null }));
};

/** Les comptes des lignes : réglage de l'article, sinon de sa catégorie, sinon défaut de la famille ; nature hors stock. */
const comptesDesLignes = async (db, d, clientId, lignes) => {
  const articleIds = [...new Set(lignes.map((l) => l.articleId).filter(Boolean))];
  const infos = new Map(articleIds.length ? (await db.query(
    `SELECT a.id, a.nom, a.categorie_id, fa.vendable, fa.consommable
       FROM articles a LEFT JOIN categories c ON c.id = a.categorie_id LEFT JOIN familles fa ON fa.id = c.famille_id
      WHERE a.id = ANY($1) AND a.client_id = $2`, [articleIds, clientId]
  )).rows.map((a) => [a.id, a]) : []);
  const reglages = (await db.query('SELECT categorie_id, article_id, nature_hors_stock, compte_id FROM compta.comptes_articles WHERE dossier_id = $1', [d.id])).rows;
  const parArticle = new Map(reglages.filter((r) => r.article_id).map((r) => [r.article_id, r.compte_id]));
  const parCategorie = new Map(reglages.filter((r) => r.categorie_id).map((r) => [r.categorie_id, r.compte_id]));
  const parNature = new Map(reglages.filter((r) => r.nature_hors_stock).map((r) => [r.nature_hors_stock, r.compte_id]));
  const choix = lignes.map((l) => {
    if (l.natureHorsStock) return { id: parNature.get(l.natureHorsStock) || null, numero: compteParDefaut({ natureHorsStock: l.natureHorsStock }), quoi: LIBELLES_NATURES[l.natureHorsStock] };
    const a = infos.get(l.articleId);
    const id = (a && (parArticle.get(a.id) || parCategorie.get(a.categorie_id))) || null;
    return { id, numero: compteParDefaut({ vendable: a?.vendable, consommable: a?.consommable }), quoi: a ? a.nom : 'ligne de la facture' };
  });
  const numeros = [...new Set(choix.filter((c) => !c.id).map((c) => c.numero))];
  const parNumero = new Map(numeros.length ? (await db.query(SQL_COMPTES_NUMEROS, [d.id, numeros])).rows.map((k) => [k.numero, k]) : []);
  const ids = [...new Set(choix.filter((c) => c.id).map((c) => c.id))];
  const parId = new Map(ids.length ? (await db.query(
    `SELECT k.id, k.numero, k.libelle, k.actif, ${SQL_FEUILLE('k')} AS feuille FROM compta.comptes k WHERE k.dossier_id = $1 AND k.id = ANY($2)`, [d.id, ids]
  )).rows.map((k) => [k.id, k]) : []);
  return choix.map((c) => {
    const k = c.id ? parId.get(c.id) : parNumero.get(c.numero);
    if (!k) throw refus(409, 'COMPTE_ABSENT', `Le compte ${c.numero} (${c.quoi}) n'existe pas dans la comptabilité : choisissez son compte (LabFlow Compta, page Comptes d'achat), puis envoyez de nouveau.`);
    if (!k.actif || !k.feuille) throw refus(409, 'COMPTE_NON_IMPUTABLE', `Le compte ${k.numero} (${c.quoi}) est désactivé ou a des sous-comptes : choisissez le compte à imputer (LabFlow Compta, page Comptes d'achat), puis envoyez de nouveau.`);
    return k.id;
  });
};

/** Les codes de taxe du dossier utiles à une facture d'achat : TVA déductible par taux, FODEC, timbre. */
const codesDuDossier = async (db, d) => {
  const r = (await db.query(
    `SELECT x.id, x.code, x.type, x.taux::text AS taux, x.compte_achat_id, k.nature, k.numero
       FROM compta.taxes x LEFT JOIN compta.comptes k ON k.id = x.compte_achat_id
      WHERE x.dossier_id = $1 AND x.actif AND x.type IN ('tva', 'fodec', 'timbre') ORDER BY x.code`, [d.id]
  )).rows;
  const tva = new Map();
  for (const x of r.filter((y) => y.type === 'tva')) {
    const t = cleTaux(x.taux);
    // TVA déductible : le code dont le compte d'achat est de TVA déductible (TVANDR19, non récupérable, est écarté) ;
    // 0 % : le code sans compte (TVA0).
    if (Number(t) > 0 ? x.nature === 'tva_deductible' : !x.compte_achat_id && x.taux != null) {
      if (!tva.has(t)) tva.set(t, { taxeId: x.id, compteId: x.compte_achat_id });
    }
  }
  const un = async (type, numero) => {
    const x = r.find((y) => y.type === type && y.compte_achat_id);
    if (x) return { taxeId: x.id, compteId: x.compte_achat_id };
    const k = (await db.query(SQL_COMPTES_NUMEROS, [d.id, [numero]])).rows[0];
    return { taxeId: null, compteId: k ? k.id : null, numero };
  };
  return { tva, fodec: await un('fodec', '6651'), timbre: await un('timbre', '6654') };
};

/**
 * Envoie la facture `factureId` du compte `clientId` en comptabilité. → { compta: { ecritureId, etat, numeroProvisoire,
 * date, dateReelle, total }, deja } ; lève RefusCompta (la facture reste « à envoyer »).
 */
const envoyerFacture = async ({ clientId, factureId, auteurId }) => {
  try {
    return await withTransaction(async (db) => {
      const f = (await db.query(
        `SELECT f.id, f.client_id, f.type_source, f.ref_facture, f.date_facture::text AS date_facture, f.fournisseur_id, f.labo_id, f.activite_id,
                f.validee_le, f.montant_fodec::text AS fodec, f.remise_globale::text AS remise_globale, f.timbre_fiscal, f.montant_timbre::text AS timbre,
                fo.nom AS fournisseur_nom, fo.matricule_fiscal AS fournisseur_mf, fo.adresse AS fournisseur_adresse, fo.telephone AS fournisseur_telephone,
                fo.email AS fournisseur_email, fo.raison_sociale AS fournisseur_raison_sociale, fo.ville AS fournisseur_ville,
                (SELECT COUNT(*)::int FROM factures_pieces p WHERE p.facture_id = f.id) AS nb_pieces
           FROM factures f LEFT JOIN fournisseurs fo ON fo.id = f.fournisseur_id
          WHERE f.id = $1 AND f.client_id = $2 FOR UPDATE OF f`, [factureId, clientId]
      )).rows[0];
      if (!f) throw refus(404, 'FACTURE_INTROUVABLE', 'Facture introuvable');
      if (f.type_source !== 'manuel') throw refus(409, 'FACTURE_TRANSFERT', 'Cette facture est un document interne de LabFlow : elle ne part pas en comptabilité.');
      const deja = (await etatsCompta(db, [f.id])).get(f.id);
      if (deja) return { compta: deja, deja: true };
      if (!f.validee_le && !f.nb_pieces) throw refus(409, 'PIECE_REQUISE', 'Joignez d\'abord la facture (📎) : une écriture d\'achat part avec sa pièce.');
      if (!f.fournisseur_id) throw refus(409, 'FOURNISSEUR_REQUIS', 'Choisissez [[le:fournisseur]] de cette facture : la comptabilité en a besoin.');
      const mod = await moduleActif(db, clientId);
      if (!mod) throw refus(409, 'MODULE_INACTIF', 'Le module LabFlow Compta n\'est pas actif pour ce compte.');
      await db.query('SELECT id FROM compta.espaces WHERE id = $1 FOR UPDATE', [mod.espaceId]);
      await exigerEcriture(db, mod.espaceId);
      const d = (await db.query(`SELECT * FROM compta.dossiers WHERE espace_id = $1 AND source = 'labflow' FOR UPDATE`, [mod.espaceId])).rows[0];
      if (!d) throw refus(409, 'DOSSIER_ABSENT', 'Le dossier « Mon entreprise » est introuvable dans votre comptabilité.');
      if (d.etat === 'archive') throw refus(409, 'DOSSIER_ARCHIVE', 'Le dossier « Mon entreprise » est archivé : désarchivez-le dans LabFlow Compta, puis envoyez de nouveau.');
      const j = (await db.query(`SELECT id FROM compta.journaux WHERE dossier_id = $1 AND type = 'achats' AND actif ORDER BY (code = 'AC') DESC, code LIMIT 1`, [d.id])).rows[0];
      if (!j) throw refus(409, 'JOURNAL_ABSENT', 'Aucun journal des achats actif dans la comptabilité : demandez à votre comptable de le réactiver (page Journaux).');
      const journal = await E.journalDe(db, d.id, j.id);
      const { date, dateReelle } = await dateDe(db, d, f.date_facture);
      const { exercice, periode } = await E.periodeDe(db, d.id, date);
      E.exigerDateAN(journal, exercice, date);
      await E.controlerDateReelle(db, d.id, dateReelle);

      const metier = await lignesDeFacture(db, f);
      if (!metier.length) throw refus(409, 'FACTURE_VIDE', 'Cette facture n\'a aucune ligne : rien à envoyer en comptabilité.');
      const { tiers, cree, collectif } = await tiersDe(db, d, f, auteurId);
      const comptes = await comptesDesLignes(db, d, clientId, metier);
      const natures = new Map((await db.query('SELECT id, nature FROM compta.comptes WHERE dossier_id = $1 AND id = ANY($2)', [d.id, [...new Set(comptes)]])).rows.map((k) => [k.id, k.nature]));
      const codes = await codesDuDossier(db, d);
      if (!codes.fodec.compteId || !codes.timbre.compteId) throw refus(409, 'COMPTE_ABSENT', 'Le compte du FODEC (6651) ou du timbre (6654) manque dans la comptabilité.');
      // TVA par taux : pour une facture validée, celle du calcul de la validation (mêmes lignes, même fonction).
      let tvaParTaux = null;
      if (f.validee_le) {
        const V = require('./facturesValidees');
        const calcul = V.repartir(
          metier.map((l) => ({ quantite: l.quantite, montant: l.montantNombre, tauxTva: Number(l.tauxTva), conversion: l.conversion, article: Boolean(l.articleId) })),
          { remiseGlobale: Number(f.remise_globale || 0), fodec: Number(f.fodec || 0), timbre: 0 }
        );
        tvaParTaux = new Map(calcul.parTaux.map((x) => [cleTaux(x.taux), enMillimes(x.montant)]));
      }
      const reference = texteCompta(f.ref_facture, E.REFERENCE_MAX) || `FACT-${f.id}`;
      const libelle = texteCompta(`Facture ${f.ref_facture || f.id} — ${f.fournisseur_raison_sociale || f.fournisseur_nom || ''}`, E.LIBELLE_MAX);
      const { lignes, total } = ecritureDeFacture({
        lignes: metier.map((l, i) => ({
          montant: l.montant, tauxTva: l.tauxTva, compteId: comptes[i],
          tiersId: ['fournisseurs', 'clients'].includes(natures.get(comptes[i])) ? tiers.id : null,
        })),
        remiseGlobale: enMillimes(f.remise_globale), fodec: enMillimes(f.fodec),
        timbre: f.timbre_fiscal === false ? 0n : enMillimes(f.timbre), tvaParTaux, codes,
        fournisseur: { compteId: tiers.compte_id, tiersId: tiers.id }, libelle, reference,
      });
      if (lignes.length > E.LIGNES_MAX) throw refus(409, 'TROP_DE_LIGNES', `L'écriture aurait ${lignes.length} lignes (${E.LIGNES_MAX} au plus) : regroupez les comptes (LabFlow Compta, page Comptes d'achat).`);
      const cartes = await E.resoudreLignes(db, d, lignes);
      const n = (await db.query('UPDATE compta.dossiers SET prochain_provisoire = prochain_provisoire + 1 WHERE id = $1 RETURNING prochain_provisoire - 1 AS n', [d.id])).rows[0].n;
      const ecr = { date, dateReelle, reference, libelle, total };
      const ins = await db.query(
        `INSERT INTO compta.ecritures (dossier_id, exercice_id, periode_id, journal_id, date, date_reelle, numero_provisoire, reference, libelle, total_debit, total_credit, origine, cree_par, facture_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, 'labflow', $11, $12) RETURNING id`,
        [d.id, exercice.id, periode.id, journal.id, date, dateReelle, n, reference, libelle, E.texteMillimes(total), auteurId, f.id]
      );
      const ecritureId = ins.rows[0].id;
      await E.insererLignes(db, d, ecritureId, date, lignes);
      if (cree) {
        await journaliser(db, mod.espaceId, auteurId, 'tiers_cree', { dossier: d.id, tiers: tiers.id, type: 'fournisseur', code: tiers.code, nom: tiers.nom, compte: collectif, codeGenere: true, origine: 'labflow', fournisseur: f.fournisseur_id });
      }
      await journaliser(db, mod.espaceId, auteurId, 'ecriture_creee', { dossier: d.id, ecriture: ecritureId, numeroProvisoire: E.numeroProvisoire(n), origine: 'labflow', facture: f.id, ...E.resumeEcriture(ecr, journal, lignes, cartes) });
      await P.journaliser(db, {
        clientId, factureId: f.id, action: 'envoi_compta', auteurId,
        details: { ecriture: ecritureId, numeroProvisoire: E.numeroProvisoire(n), date, ...(dateReelle ? { dateReelle } : {}), total: E.texteMillimes(total), tiers: tiers.code },
      });
      return { compta: { ecritureId, etat: 'brouillard', numero: null, numeroProvisoire: E.numeroProvisoire(n), date, dateReelle, total: E.texteMillimes(total) }, deja: false };
    });
  } catch (err) {
    if (err instanceof RefusCompta) throw err;
    // Refus de la Compta (abonnement suspendu, compte non imputable, période…) : son message, tel quel.
    if (err && err.statusCode && err.statusCode < 500) throw refus(err.statusCode, err.code || 'COMPTA', err.message);
    throw err;
  }
};

/**
 * Après un enregistrement (validation d'une facture lue, dépôt de sa pièce) : l'envoi demandé, sans jamais faire échouer
 * l'enregistrement. Le message d'un refus est rendu ici avec le vocabulaire du compte (il voyage dans « comptaRefus », que
 * le rendu au bord ne lit pas). → { compta } | { comptaRefus: { code, message } } | {} (rien demandé).
 */
const envoyerSiDemande = async ({ demande, clientId, factureId, auteurId, voc }) => {
  if (!demande || !factureId) return {};
  try {
    return { compta: (await envoyerFacture({ clientId, factureId, auteurId })).compta };
  } catch (err) {
    if (err instanceof RefusCompta) return { comptaRefus: { code: err.code, message: rendre(voc || vocabDefaut, err.message) } };
    console.error('[pont compta]', err);
    return { comptaRefus: { code: 'ERREUR', message: 'L\'envoi en comptabilité a échoué : réessayez depuis la page Factures.' } };
  }
};

/**
 * Suppression d'une facture validée (question 18), dans la transaction `db` de l'appelant : son écriture en brouillard
 * part avec (journal de la Compta) ; une écriture VALIDÉE refuse la suppression (la pièce d'une écriture validée reste).
 */
const retirerAvecFacture = async (db, { factureId, auteurId }) => {
  const e = (await db.query(
    `SELECT e.id, e.etat, e.numero, e.numero_provisoire, e.dossier_id, d.espace_id FROM compta.ecritures e JOIN compta.dossiers d ON d.id = e.dossier_id
      WHERE e.facture_id = $1 FOR UPDATE OF e`, [factureId]
  )).rows[0];
  if (!e) return null;
  if (e.etat === 'validee') {
    throw refus(409, 'ECRITURE_VALIDEE', `Cette facture est en comptabilité et son écriture ${e.numero} est validée : elle ne se supprime plus. Demandez à votre comptable de contre-passer l'écriture.`);
  }
  await db.query('DELETE FROM compta.ecritures WHERE id = $1', [e.id]);
  await journaliser(db, e.espace_id, auteurId, 'ecriture_supprimee', { dossier: e.dossier_id, ecriture: e.id, numeroProvisoire: E.numeroProvisoire(e.numero_provisoire), origine: 'labflow', facture: factureId, motif: 'facture supprimée dans LabFlow' });
  return e.id;
};

module.exports = {
  RefusCompta, COMPTES_NATURES, LIBELLES_NATURES, compteParDefaut, enMillimes, repartirProrata, texteCompta, ecritureDeFacture,
  moduleActif, etatsCompta, enCompta, SQL_EN_COMPTA, MESSAGE_EN_COMPTA, refusEnCompta, envoyerFacture, envoyerSiDemande, retirerAvecFacture,
};
