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
const { exigerEcriture, erreurEcriture, modeTitulaire } = require('../compta/garde');
const E = require('../compta/ecritures');
const T = require('../compta/tiers');
const { journaliser } = require('../compta/journal');
const { SQL_COMPTES_NUMEROS, SQL_PERIODE_OUVERTE_APRES } = require('../compta/declarations');
const { HORS_W1252 } = require('../compta/planComptes');
const { SQL_FEUILLE } = require('../compta/configDossier');
const P = require('./piecesFacture');
const F = require('./facturesAppro');
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

/** `diff` ajouté au plus grand montant (en valeur absolue) de `montants` : la somme tombe juste, à l'arrondi près. */
const ajusterAuPlusGrand = (montants, diff) => {
  if (diff === 0n || !montants.length) return montants;
  const abs = (x) => (x < 0n ? -x : x);
  const i = montants.reduce((m, x, j) => (abs(x) > abs(montants[m]) ? j : m), 0);
  return montants.map((x, j) => (j === i ? x + diff : x));
};

/**
 * Les lignes de l'écriture d'achat d'une facture (pure : tout est déjà résolu). `lignes` : { montant (millimes signés),
 * tauxTva (null : ligne sans TVA connue, sans code), compteId, tiersId }. `tvaParTaux` : Map taux → montant de TVA
 * (millimes) ; absente : calculée par taux (assiette = lignes du taux + leur part de FODEC). `codes` : { tva: Map taux →
 * { taxeId, compteId }, fodec, timbre } ({ taxeId, compteId }, taxeId facultatif). `tvaRecuperable` faux (dossier au
 * forfait ou non assujetti) : la TVA est une charge — elle s'ajoute aux lignes de son taux, sans code de TVA.
 * `ttcAttendu` : le TTC de la facture ; l'écriture doit le donner au centime près (sinon refus ECART_TTC).
 * → { lignes, total } ; lève RefusCompta TAUX_SANS_CODE, MONTANT_NUL, ECART_TTC.
 */
const ecritureDeFacture = ({ lignes, remiseGlobale = 0n, fodec = 0n, timbre = 0n, tvaParTaux = null, tvaRecuperable = true, ttcAttendu = null, codes, fournisseur, libelle, reference }) => {
  const positifs = lignes.map((l) => (l.montant > 0n ? l.montant : 0n));
  const remises = repartirProrata(remiseGlobale, positifs);
  const nets = lignes.map((l, i) => (l.montant > 0n ? l.montant - remises[i] : l.montant));
  const partsFodec = repartirProrata(fodec, nets.map((n) => (n > 0n ? n : 0n)));
  const couts = nets.map((n, i) => n + partsFodec[i]);
  // TVA par taux : celle de la validation (ou des montants de la facture), sinon calculée sur (net + FODEC) des lignes du taux.
  const avecTaux = (l) => l.tauxTva != null;
  const bases = new Map();
  lignes.forEach((l, i) => { if (avecTaux(l)) bases.set(cleTaux(l.tauxTva), (bases.get(cleTaux(l.tauxTva)) ?? 0n) + couts[i]); });
  const tva = new Map([...bases].map(([t, b]) => [t, tvaParTaux?.has(t) ? tvaParTaux.get(t) : E.calculTaxe(b, t)]));
  // TVA non récupérable : la part de chaque ligne (son coût × taux), ajustée pour que le total du taux tombe juste.
  const tvaDesLignes = lignes.map(() => 0n);
  if (!tvaRecuperable) {
    for (const [t, montant] of tva) {
      const rangs = lignes.map((l, i) => i).filter((i) => avecTaux(lignes[i]) && cleTaux(lignes[i].tauxTva) === t);
      const parts = rangs.map((i) => E.calculTaxe(couts[i], t));
      const ajustees = ajusterAuPlusGrand(parts, montant - parts.reduce((s, x) => s + x, 0n));
      rangs.forEach((i, k) => { tvaDesLignes[i] = ajustees[k]; });
    }
  } else {
    for (const [t, montant] of tva) {
      if (montant !== 0n && !codes.tva.get(t)) throw refus(409, 'TAUX_SANS_CODE', `Aucun code de TVA à ${t.replace('.', ',')} % actif dans la comptabilité : demandez à votre comptable de le créer (page Taxes), puis envoyez de nouveau.`);
    }
  }
  const groupes = new Map();
  const ajouter = (sens, compteId, tiersId, taxeId, montant, lib) => {
    if (montant === 0n) return;
    const cle = `${sens}|${compteId}|${tiersId || ''}|${taxeId || ''}|${lib}`;
    const g = groupes.get(cle) || { sens, compteId, tiersId: tiersId || null, taxeId: taxeId || null, libelle: lib, montant: 0n };
    g.montant += montant;
    groupes.set(cle, g);
  };
  // Les lignes de la facture (HT net de remise ; TTC si la TVA n'est pas récupérable), puis FODEC, TVA par taux, timbre ;
  // au crédit : les retours (et une TVA négative), le fournisseur.
  lignes.forEach((l, i) => {
    const code = tvaRecuperable && avecTaux(l) ? codes.tva.get(cleTaux(l.tauxTva)) : null;
    const montant = nets[i] + tvaDesLignes[i];
    if (montant > 0n) ajouter('D', l.compteId, l.tiersId, code?.taxeId, montant, libelle);
    else if (montant < 0n) ajouter('C', l.compteId, l.tiersId, code?.taxeId, -montant, libelle);
  });
  if (fodec > 0n) ajouter('D', codes.fodec.compteId, null, codes.fodec.taxeId, fodec, texteCompta(`FODEC — facture ${reference}`, 255));
  if (tvaRecuperable) {
    [...tva].sort((a, b) => Number(a[0]) - Number(b[0])).forEach(([t, montant]) => {
      const lib = texteCompta(`TVA ${t.replace('.', ',')} % — facture ${reference}`, 255);
      if (montant > 0n) ajouter('D', codes.tva.get(t).compteId, null, codes.tva.get(t).taxeId, montant, lib);
      else if (montant < 0n) ajouter('C', codes.tva.get(t).compteId, null, codes.tva.get(t).taxeId, -montant, lib);
    });
  }
  if (timbre > 0n) ajouter('D', codes.timbre.compteId, null, codes.timbre.taxeId, timbre, texteCompta(`Timbre — facture ${reference}`, 255));
  const debits = [...groupes.values()].filter((g) => g.sens === 'D');
  const credits = [...groupes.values()].filter((g) => g.sens === 'C');
  const totalDebit = debits.reduce((s, g) => s + g.montant, 0n);
  const aPayer = totalDebit - credits.reduce((s, g) => s + g.montant, 0n);
  if (aPayer <= 0n) throw refus(409, 'MONTANT_NUL', 'Le total de cette facture n\'est pas positif : rien à envoyer en comptabilité.');
  if (ttcAttendu != null && aPayer !== ttcAttendu) {
    throw refus(409, 'ECART_TTC', `L'écriture donnerait ${E.fmtMillimes(aPayer)} au lieu du TTC de la facture (${E.fmtMillimes(ttcAttendu)}) : elle n'est pas envoyée. Signalez-le au support de LabFlow.`);
  }
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
const { SQL_EN_COMPTA, MESSAGE_EN_COMPTA, refusEnCompta } = F;

// Date de l'écriture : la date de la facture, dans l'exercice ouvert qui la contient ; période close ⇒ 1er jour de la
// période ouverte suivante (vraie date = date de la facture, NC 01 §61) ; facture d'avant le premier exercice ouvert ⇒
// 1re période ouverte de cet exercice ; facture d'après le dernier : refus (l'exercice qui la contiendra n'existe pas).
const dateDe = async (db, d, dateFacture) => {
  const ouverts = (await db.query(`SELECT id, debut::text AS debut, fin::text AS fin FROM compta.exercices WHERE dossier_id = $1 AND etat = 'ouvert' ORDER BY debut`, [d.id])).rows;
  if (!ouverts.length) throw refus(409, 'EXERCICE_CLOS', 'Aucun exercice ouvert dans la comptabilité : la facture ne peut pas y être enregistrée. Voyez-le avec votre comptable.');
  const dernier = ouverts[ouverts.length - 1];
  if (dateFacture > dernier.fin) {
    throw refus(409, 'DATE_APRES_EXERCICE', `La facture du ${E.fmtDate(dateFacture)} est après l'exercice ouvert de la comptabilité (du ${E.fmtDate(dernier.debut)} au ${E.fmtDate(dernier.fin)}) : elle ne peut pas encore y être enregistrée. Voyez-le avec votre comptable.`);
  }
  const ex = ouverts.find((x) => dateFacture >= x.debut && dateFacture <= x.fin) || ouverts[0];
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

// L'identifiant d'un matricule fiscal (ses 7 chiffres : la lettre n'est qu'une clé, la suite décrit l'établissement) —
// « 1234567A/A/M/000 », « 1234567 a » et « 1234567/A/M/000 » désignent la même entreprise ; sinon la saisie compactée.
const identifiantMF = (brut) => {
  const n = normaliserMatriculeFiscal(brut);
  const m = n.match(/^(\d{7})/);
  return m ? m[1] : n || null;
};

// Le fournisseur, tiers du dossier : déjà relié (actif de préférence), sinon un tiers actif de même matricule fiscal —
// relié alors s'il ne l'était à aucun fournisseur (à la place d'un tiers relié mais désactivé), employé tel quel s'il
// l'est à un autre (fournisseur en double dans LabFlow) —, sinon créé (code du modèle, collectif du paquet, origine
// « labflow »). Chaque nouveau lien est au journal de la Compta. → { tiers, cree }.
const tiersDe = async (db, d, f, auteurId, espaceId) => {
  const SQL = 'SELECT id, code, nom, actif, compte_id, fournisseur_id, matricule_fiscal FROM compta.tiers WHERE dossier_id = $1 AND type = \'fournisseur\'';
  let t = (await db.query(`${SQL} AND fournisseur_id = $2 ORDER BY actif DESC, id LIMIT 1`, [d.id, f.fournisseur_id])).rows[0];
  const mf = f.fournisseur_mf ? identifiantMF(f.fournisseur_mf) : null;
  if ((!t || !t.actif) && mf) {
    const memes = (await db.query(`${SQL} AND actif AND matricule_fiscal IS NOT NULL ORDER BY (fournisseur_id IS NULL) DESC, id`, [d.id])).rows;
    const actif = memes.find((x) => identifiantMF(x.matricule_fiscal) === mf);
    if (actif && actif.fournisseur_id == null) {
      if (t) await db.query('UPDATE compta.tiers SET fournisseur_id = NULL WHERE id = $1', [t.id]);
      await db.query('UPDATE compta.tiers SET fournisseur_id = $2 WHERE id = $1', [actif.id, f.fournisseur_id]);
      await journaliser(db, espaceId, auteurId, 'tiers_modifie', {
        dossier: d.id, tiers: actif.id, type: 'fournisseur', code: actif.code, origine: 'labflow', motif: 'même matricule fiscal',
        changements: { fournisseurLabflow: { avant: null, apres: f.fournisseur_id } },
        ...(t ? { remplace: { tiers: t.id, code: t.code } } : {}),
      });
      t = { ...actif, fournisseur_id: f.fournisseur_id };
    } else if (actif) {
      t = actif;
    }
  }
  if (t) {
    if (!t.actif) throw refus(409, 'TIERS_DESACTIVE', `Le tiers ${t.code} (${F.sansBalise(t.nom)}) est désactivé dans la comptabilité : demandez à votre comptable de le réactiver (page Tiers), puis envoyez de nouveau.`);
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

// Les lignes « métier » d'une facture validée (factures_lignes, montants exacts). → [{ montant, tauxTva, articleId,
// natureHorsStock, … }].
const lignesValidees = async (db, f) => (await db.query(
  `SELECT montant_ht::text AS montant, taux_tva::text AS taux, article_id, nature_hors_stock, quantite::text AS quantite, conversion::text AS conversion
     FROM factures_lignes WHERE facture_id = $1 ORDER BY rang`, [f.id]
)).rows.map((l) => ({ montant: enMillimes(l.montant), tauxTva: l.taux, articleId: l.article_id, natureHorsStock: l.nature_hors_stock, quantite: Number(l.quantite), conversion: l.conversion == null ? null : Number(l.conversion), montantNombre: Number(l.montant) }));

// Une facture saisie à la main : ses montants enregistrés (recalculés depuis ses lignes de stock par l'appelant,
// recalculerFacture) répartis sur ses lignes, au millime près — HT sur les lignes qui ont un prix HT (q × PU HT), TVA par
// taux, et le reste du TTC (lignes sans prix HT : q × PU TTC, TVA inconnue, sans code). → { lignes, tvaParTaux }.
const lignesSaisies = async (db, f) => {
  const SQL_L = `SELECT id, ingredient_id, quantite, prix_unitaire, prix_unitaire_tva, taux_tva FROM stock_entreprise_daily WHERE facture_id = $1
                 UNION ALL SELECT id, ingredient_id, quantite, prix_unitaire, prix_unitaire_tva, taux_tva FROM stock_labo_daily WHERE facture_id = $1`;
  const lignes = (await db.query(
    `SELECT ingredient_id, COALESCE(taux_tva, 0)::text AS taux, prix_unitaire IS NOT NULL AS avec_ht,
            ROUND(COALESCE(quantite, 0) * COALESCE(prix_unitaire, prix_unitaire_tva, 0), 3)::text AS montant
       FROM (${SQL_L}) l ORDER BY id`, [f.id]
  )).rows;
  const parTaux = (await db.query(
    `SELECT COALESCE(taux_tva, 0)::text AS taux, ROUND(SUM(COALESCE(quantite, 0) * prix_unitaire * COALESCE(taux_tva, 0) / 100), 3)::text AS tva
       FROM (${SQL_L}) l WHERE prix_unitaire IS NOT NULL GROUP BY COALESCE(taux_tva, 0)`, [f.id]
  )).rows;
  const somme = (xs) => xs.reduce((s, x) => s + x, 0n);
  const ht = enMillimes(f.montant_ht);
  const tvaTotale = enMillimes(f.montant_tva);
  const timbre = f.timbre_fiscal ? enMillimes(f.timbre) : 0n;
  const avecHt = lignes.filter((l) => l.avec_ht);
  const sansHt = lignes.filter((l) => !l.avec_ht);
  const montantsHt = avecHt.map((l) => enMillimes(l.montant));
  const montantsSansHt = sansHt.map((l) => enMillimes(l.montant));
  const tvas = parTaux.map((x) => enMillimes(x.tva));
  const htJustes = ajusterAuPlusGrand(montantsHt, ht - somme(montantsHt));
  const tvasJustes = ajusterAuPlusGrand(tvas, tvaTotale - somme(tvas));
  const sansHtJustes = ajusterAuPlusGrand(montantsSansHt, enMillimes(f.montant_ttc) - ht - tvaTotale - timbre - somme(montantsSansHt));
  return {
    lignes: [
      ...avecHt.map((l, i) => ({ montant: htJustes[i], tauxTva: l.taux, articleId: l.ingredient_id, natureHorsStock: null })),
      ...sansHt.map((l, i) => ({ montant: sansHtJustes[i], tauxTva: null, articleId: l.ingredient_id, natureHorsStock: null })),
    ],
    tvaParTaux: new Map(parTaux.map((x, i) => [cleTaux(x.taux), tvasJustes[i]])),
  };
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
    if (!k) throw refus(409, 'COMPTE_ABSENT', `Le compte ${c.numero} (${F.sansBalise(c.quoi)}) n'existe pas dans la comptabilité : choisissez son compte (LabFlow Compta, page Comptes d'achat), puis envoyez de nouveau.`);
    if (!k.actif || !k.feuille) throw refus(409, 'COMPTE_NON_IMPUTABLE', `Le compte ${k.numero} (${F.sansBalise(c.quoi)}) est désactivé ou a des sous-comptes : choisissez le compte à imputer (LabFlow Compta, page Comptes d'achat), puis envoyez de nouveau.`);
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
      // Le verrou des factures du compte d'abord (comme toute écriture d'une facture d'appro : lignes, pièces) : pendant
      // l'envoi, ni ses lignes ni ses pièces ne changent, et rien ne s'y ajoute après le contrôle.
      await F.verrouillerFactures(db, clientId);
      const SQL_F = `SELECT f.id, f.client_id, f.type_source, f.ref_facture, f.date_facture::text AS date_facture, f.fournisseur_id, f.labo_id, f.activite_id,
                f.validee_le, f.montant_fodec::text AS fodec, f.remise_globale::text AS remise_globale, f.timbre_fiscal, f.montant_timbre::text AS timbre,
                f.montant_ht::text AS montant_ht, f.montant_tva::text AS montant_tva, f.montant_ttc::text AS montant_ttc,
                fo.nom AS fournisseur_nom, fo.matricule_fiscal AS fournisseur_mf, fo.adresse AS fournisseur_adresse, fo.telephone AS fournisseur_telephone,
                fo.email AS fournisseur_email, fo.raison_sociale AS fournisseur_raison_sociale, fo.ville AS fournisseur_ville
           FROM factures f LEFT JOIN fournisseurs fo ON fo.id = f.fournisseur_id
          WHERE f.id = $1 AND f.client_id = $2`;
      let f = (await db.query(`${SQL_F} FOR UPDATE OF f`, [factureId, clientId])).rows[0];
      if (!f) throw refus(404, 'FACTURE_INTROUVABLE', 'Facture introuvable');
      if (f.type_source !== 'manuel') throw refus(409, 'FACTURE_TRANSFERT', 'Cette facture est un document interne de LabFlow : elle ne part pas en comptabilité.');
      const deja = (await etatsCompta(db, [f.id])).get(f.id);
      if (deja) return { compta: deja, deja: true };
      const nbPieces = (await db.query('SELECT COUNT(*)::int AS n FROM factures_pieces WHERE facture_id = $1', [f.id])).rows[0].n;
      if (!f.validee_le && !nbPieces) throw refus(409, 'PIECE_REQUISE', 'Joignez d\'abord la facture (📎) : une écriture d\'achat part avec sa pièce.');
      if (!f.fournisseur_id) throw refus(409, 'FOURNISSEUR_REQUIS', 'Choisissez [[le:fournisseur]] de cette facture : la comptabilité en a besoin.');
      const mod = await moduleActif(db, clientId);
      if (!mod) throw refus(409, 'MODULE_INACTIF', 'Le module LabFlow Compta n\'est pas actif pour ce compte.');
      await db.query('SELECT id FROM compta.espaces WHERE id = $1 FOR UPDATE', [mod.espaceId]);
      // Relu sous le verrou de la comptabilité : le module a pu être arrêté entre-temps.
      const encore = await moduleActif(db, clientId);
      if (!encore || encore.espaceId !== mod.espaceId) throw refus(409, 'MODULE_INACTIF', 'Le module LabFlow Compta n\'est pas actif pour ce compte.');
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

      // Les lignes « métier » et la TVA par taux : pour une facture validée, celles du calcul de la validation (mêmes
      // lignes, même fonction) ; pour une facture saisie, ses montants recalculés depuis ses lignes (règle F1), répartis.
      let metier;
      let tvaParTaux;
      if (f.validee_le) {
        metier = await lignesValidees(db, f);
        const V = require('./facturesValidees');
        const calcul = V.repartir(
          metier.map((l) => ({ quantite: l.quantite, montant: l.montantNombre, tauxTva: Number(l.tauxTva), conversion: l.conversion, article: Boolean(l.articleId) })),
          { remiseGlobale: Number(f.remise_globale || 0), fodec: Number(f.fodec || 0), timbre: 0 }
        );
        tvaParTaux = new Map(calcul.parTaux.map((x) => [cleTaux(x.taux), enMillimes(x.montant)]));
      } else {
        await F.recalculerFacture(db, f.id);
        f = (await db.query(SQL_F, [factureId, clientId])).rows[0];
        ({ lignes: metier, tvaParTaux } = await lignesSaisies(db, f));
      }
      if (!metier.length) throw refus(409, 'FACTURE_VIDE', 'Cette facture n\'a aucune ligne : rien à envoyer en comptabilité.');
      const { tiers, cree, collectif } = await tiersDe(db, d, f, auteurId, mod.espaceId);
      const comptes = await comptesDesLignes(db, d, clientId, metier);
      const natures = new Map((await db.query('SELECT id, nature FROM compta.comptes WHERE dossier_id = $1 AND id = ANY($2)', [d.id, [...new Set(comptes)]])).rows.map((k) => [k.id, k.nature]));
      const codes = await codesDuDossier(db, d);
      const fodec = enMillimes(f.fodec);
      const timbre = f.timbre_fiscal ? enMillimes(f.timbre) : 0n;
      if (fodec > 0n && !codes.fodec.compteId) throw refus(409, 'COMPTE_ABSENT', 'Le compte du FODEC (6651) manque dans la comptabilité : demandez à votre comptable de le créer (page Plan de comptes), puis envoyez de nouveau.');
      if (timbre > 0n && !codes.timbre.compteId) throw refus(409, 'COMPTE_ABSENT', 'Le compte du timbre fiscal (6654) manque dans la comptabilité : demandez à votre comptable de le créer (page Plan de comptes), puis envoyez de nouveau.');
      const reference = texteCompta(f.ref_facture, E.REFERENCE_MAX) || `FACT-${f.id}`;
      const libelle = texteCompta(`Facture ${f.ref_facture || f.id} — ${f.fournisseur_raison_sociale || f.fournisseur_nom || ''}`, E.LIBELLE_MAX);
      const { lignes, total } = ecritureDeFacture({
        lignes: metier.map((l, i) => ({
          montant: l.montant, tauxTva: l.tauxTva, compteId: comptes[i],
          tiersId: ['fournisseurs', 'clients'].includes(natures.get(comptes[i])) ? tiers.id : null,
        })),
        remiseGlobale: enMillimes(f.remise_globale), fodec, timbre, tvaParTaux, codes,
        // Dossier au forfait ou non assujetti : la TVA payée est une charge (elle s'ajoute aux achats), sans code de TVA.
        tvaRecuperable: d.tva === 'reel', ttcAttendu: enMillimes(f.montant_ttc),
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
 * Suppression d'une facture validée (question 18), dans la transaction `db` de l'appelant (sous `verrouillerFactures`) :
 * son écriture en brouillard part avec (journal de la Compta, contenu compris) ; une écriture VALIDÉE refuse la
 * suppression (la pièce d'une écriture validée reste). Comptabilité inactive ou en lecture seule, dossier archivé : la
 * Compta ne change pas, l'écriture y reste (détachée de la facture). Verrous dans l'ordre de la Compta : la comptabilité,
 * le dossier, l'écriture. → { supprimee: id } | { laissee: id } | null (aucune écriture).
 */
const retirerAvecFacture = async (db, { factureId, auteurId }) => {
  const lien = (await db.query(
    'SELECT e.id, e.dossier_id, d.espace_id FROM compta.ecritures e JOIN compta.dossiers d ON d.id = e.dossier_id WHERE e.facture_id = $1', [factureId]
  )).rows[0];
  if (!lien) return null;
  const espace = (await db.query('SELECT id, etat FROM compta.espaces WHERE id = $1 FOR UPDATE', [lien.espace_id])).rows[0];
  const d = (await db.query('SELECT id, etat FROM compta.dossiers WHERE id = $1 FOR UPDATE', [lien.dossier_id])).rows[0];
  if (!(await db.query('SELECT 1 FROM compta.ecritures WHERE id = $1 AND facture_id = $2', [lien.id, factureId])).rows.length) return null;
  const e = await E.ecritureDe(db, d.id, lien.id);
  if (e.etat === 'validee') {
    throw refus(409, 'ECRITURE_VALIDEE', `Cette facture est en comptabilité et son écriture ${e.numero} est validée : la facture ne se supprime plus dans LabFlow. Si elle est erronée, votre comptable contre-passe l'écriture dans LabFlow Compta, et [[le:stock]] se corrige par [[un:inventaire]].`);
  }
  const figee = espace.etat !== 'actif' || d.etat === 'archive' || Boolean(erreurEcriture(await modeTitulaire(db, espace.id)));
  if (figee) return { laissee: e.id };
  const contenu = E.resumeEnBase(e, (await E.lignesDe(db, [e.id])).get(e.id));
  await db.query('DELETE FROM compta.ecritures WHERE id = $1', [e.id]);
  await journaliser(db, espace.id, auteurId, 'ecriture_supprimee', {
    dossier: d.id, ecriture: e.id, numeroProvisoire: E.numeroProvisoire(e.numero_provisoire), origine: 'labflow', facture: factureId,
    motif: 'facture supprimée dans LabFlow', contenu,
  });
  return { supprimee: e.id };
};

module.exports = {
  RefusCompta, COMPTES_NATURES, LIBELLES_NATURES, compteParDefaut, enMillimes, repartirProrata, ajusterAuPlusGrand, texteCompta, ecritureDeFacture, identifiantMF,
  moduleActif, etatsCompta, enCompta, SQL_EN_COMPTA, MESSAGE_EN_COMPTA, refusEnCompta, envoyerFacture, envoyerSiDemande, retirerAvecFacture,
};
