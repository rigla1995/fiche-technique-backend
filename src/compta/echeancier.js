// LabFlow Compta, étape S7a « Lettrage, échéancier, relevés » (labflow-reprise/achats-compta/PLAN-S7.md §1 ligne S7a, §2
// « S7a », §4 « Échéance », « Relevé et relance », « Droits » ; réponses du client du 09/10 — « ok pour les 9 » : relevé de
// compte et lettre de relance en PDF, que le comptable envoie lui-même — aucun email depuis LabFlow Compta en S7 ; CADRAGE
// §5 « Tiers et lettrage » : échéancier, relances). L'échéancier d'un dossier : les lignes NON LETTRÉES des tiers d'un
// type (fournisseurs : ce que le dossier doit ; clients : ce qu'on lui doit), leur échéance, leur retard au jour de la
// lecture et la balance âgée par tiers (non échu, 1 à 30, 31 à 60, 61 à 90, plus de 90 jours ; règles : echeances.js) ;
// un tiers déplié (ses lignes) ; son relevé de compte et, pour un client, la lettre de relance (texte type modifiable) en
// PDF à la charte (pdf.js) ; l'export Excel (balance âgée et détail, excelBrandService par livres.js). Brouillard compris
// par défaut, retirable (`brouillard=0`), comme les livres. Lecture pour tout accès au dossier (D3, D4 : lectureDossier) ;
// rien n'est écrit ici. Montants : sommes NUMERIC en SQL transportées en texte, totaux en millimes entiers (BigInt).
const ExcelJS = require('exceljs');
const pool = require('../config/database');
const { modeTitulaire, etatAbonnement } = require('./garde');
const { erreur, idValide, repondreErreur } = require('./comptablesClient');
const { TYPES_TIERS, TYPES_TIERS_LIBELLES } = require('./paquets');
const { droits } = require('./dossiers');
const { lectureDossier, presenterDossier, HORS_W1252 } = require('./planComptes');
const { fmtDate, fmtMillimes, millimesDe, texteMillimes, numeroProvisoire } = require('./ecritures');
const { EXPORT_MAX, nombreExcel, ajouterFeuille, avecGardeExport } = require('./livres');
const { envoyerClasseur, jourTunis } = require('./importExcel');
const { SQL_DU, SQL_ECHEANCE, TRANCHES, CLES_TRANCHES, CLES_ECHUES, sqlAgregatsAges, trancheDe, trancheesImputees, aujourdhuiTunis } = require('./echeances');
const { MARGE, LARGEUR, COULEURS, creerDocument, nomPdf, envoyerPdf } = require('./pdf');

// Lignes d'un tiers déplié (les échéances les plus anciennes d'abord) ; au-delà, l'export.
const LIGNES_TIERS_MAX = 1000;
const TEXTE_RELANCE_MAX = 2000;
const TEXTE_RELANCE_LIGNES_MAX = 40;
// Le texte type de la lettre de relance (PLAN-S7 §4 : modifiable dans la fenêtre avant d'imprimer).
const TEXTE_RELANCE = [
  'Madame, Monsieur,',
  '',
  'Sauf erreur ou omission de notre part, les factures ci-dessous, arrivées à échéance, restent impayées à ce jour.',
  '',
  'Nous vous remercions de bien vouloir procéder à leur règlement dans les meilleurs délais. Si votre paiement a été effectué entre-temps, nous vous prions de ne pas tenir compte de la présente.',
  '',
  'Nous vous prions d\'agréer, Madame, Monsieur, l\'expression de nos salutations distinguées.',
].join('\n');

// Les espaces insécables : insécable, fine insécable, espace de chiffre, espace fine (bâtie par codes : aucun caractère
// invisible dans ce source).
const ESPACES_INSECABLES = new RegExp(`[${[0xa0, 0x202f, 0x2007, 0x2009].map((c) => String.fromCharCode(c)).join('')}]`, 'g');

// ── Paramètres ──────────────────────────────────────────────────────────────────────────────────────────────────────
// type (fournisseur par défaut, ou client), brouillard (« 0 » = écritures validées seulement ; sinon comprises).
const lireType = (v) => {
  const t = v === undefined || v === '' ? 'fournisseur' : String(v);
  if (!TYPES_TIERS.includes(t)) throw erreur(400, 'Type de tiers inconnu (fournisseur ou client)');
  return t;
};
// « 0 », « false » (adresse) ou false (corps JSON de la relance) : écritures validées seulement.
const lireBrouillard = (v) => !(v === '0' || v === 'false' || v === false);
// Le texte de la relance : vide = le texte type ; sinon 2 000 caractères et 40 lignes au plus, caractères latins (polices
// du PDF), lignes vides gardées (paragraphes).
const lireTexteRelance = (v) => {
  if (v === undefined || v === null || v === '') return TEXTE_RELANCE;
  if (typeof v !== 'string') throw erreur(400, 'Texte de la relance : requête invalide');
  // Les espaces insécables (fine comprise, courante en français) deviennent des espaces : `sur` (pdf) les rend ainsi.
  const t = v.normalize('NFC').replace(/\r\n?/g, '\n').replace(ESPACES_INSECABLES, ' ').split('\n').map((l) => l.replace(/[\t ]+/g, ' ').trimEnd()).join('\n').trim();
  if (!t) return TEXTE_RELANCE;
  if (t.length > TEXTE_RELANCE_MAX) throw erreur(400, `Texte de la relance : ${TEXTE_RELANCE_MAX} caractères au plus`, 'TEXTE_TROP_LONG');
  if (t.split('\n').length > TEXTE_RELANCE_LIGNES_MAX) throw erreur(400, `Texte de la relance : ${TEXTE_RELANCE_LIGNES_MAX} lignes au plus`, 'TEXTE_TROP_LONG');
  if (t.split('\n').some((l) => HORS_W1252.test(l))) throw erreur(400, 'Texte de la relance : caractères latins seulement (les lettres arabes et les émojis ne s\'impriment pas sur le PDF)', 'TEXTE_ILLISIBLE');
  return t;
};

// ── Requêtes ────────────────────────────────────────────────────────────────────────────────────────────────────────
// Les lignes non lettrées ($1 dossier, $2 jour de lecture, $3 type de tiers, $4 brouillard compris, $5 tiers ou NULL) avec
// leur dû, leur échéance et leur retard au jour de lecture (echeances.js).
const SQL_NON_LETTREES = `
  SELECT l.id, l.tiers_id, l.date, l.rang, l.libelle, l.debit, l.credit, l.echeance AS echeance_ligne, l.compte_id, e.id AS ecriture_id, e.etat, e.numero, e.numero_provisoire,
         e.reference, e.libelle AS ecriture_libelle, e.date_reelle, e.journal_id,
         ${SQL_DU} AS du, ${SQL_ECHEANCE} AS echeance, ($2::date - ${SQL_ECHEANCE})::int AS retard
    FROM compta.lignes l
    JOIN compta.ecritures e ON e.id = l.ecriture_id
    JOIN compta.tiers t ON t.id = l.tiers_id
   WHERE l.dossier_id = $1 AND l.tiers_id IS NOT NULL AND l.lettrage_id IS NULL AND t.type = $3 AND ($4::boolean OR e.etat = 'validee') AND ($5::int IS NULL OR l.tiers_id = $5)`;
// La balance âgée : par tiers, le dû non lettré, ses factures par tranche de retard ($2 - échéance) et ses règlements et
// avoirs non lettrés (« credits »), imputés ensuite sur les tranches les plus anciennes (echeances.js : trancheesImputees).
const SQL_BALANCE_AGEE = `
  WITH n AS (${SQL_NON_LETTREES})
  SELECT t.id, t.code, t.nom, t.actif, t.delai_paiement,
         SUM(n.du)::numeric(18,3)::text AS total,
         ${sqlAgregatsAges('n')},
         SUM(n.debit)::numeric(18,3)::text AS debit, SUM(n.credit)::numeric(18,3)::text AS credit,
         COUNT(*)::int AS nb_lignes, COUNT(*) FILTER (WHERE n.etat = 'brouillard')::int AS nb_brouillard,
         MAX(n.retard) FILTER (WHERE n.du > 0)::int AS retard_max
    FROM n JOIN compta.tiers t ON t.id = n.tiers_id
   GROUP BY t.id
   ORDER BY t.code`;
// Les lignes d'un tiers (ou de tous : export), les échéances les plus anciennes d'abord ($6 : borne).
const SQL_LIGNES = `
  WITH n AS (${SQL_NON_LETTREES})
  SELECT n.id, n.tiers_id, t.code AS tiers_code, t.nom AS tiers_nom, n.date::text AS date, n.date_reelle::text AS date_reelle, COALESCE(n.libelle, n.ecriture_libelle) AS libelle,
         n.debit::text AS debit, n.credit::text AS credit, n.du::numeric(18,3)::text AS du, n.echeance::text AS echeance, n.echeance_ligne::text AS echeance_ligne,
         n.retard, n.etat, n.numero, n.numero_provisoire, n.reference, j.code AS journal_code, k.numero AS compte_numero
    FROM n
    JOIN compta.tiers t ON t.id = n.tiers_id
    JOIN compta.journaux j ON j.id = n.journal_id
    JOIN compta.comptes k ON k.id = n.compte_id
   ORDER BY t.code, n.echeance, n.date, n.numero NULLS LAST, n.numero_provisoire, n.rang
   LIMIT $6`;
const SQL_NB_LIGNES = `SELECT COUNT(*)::int AS n FROM (${SQL_NON_LETTREES}) n`;

// ── Présentation ────────────────────────────────────────────────────────────────────────────────────────────────────
const zeroTranches = () => Object.fromEntries(CLES_TRANCHES.map((c) => [c, 0n]));
const texteTranches = (m) => Object.fromEntries(CLES_TRANCHES.map((c) => [c, texteMillimes(m[c])]));
// Le dû échu = toutes les tranches de retard (hors non échu), après imputation des règlements.
const echuDe = (m) => CLES_ECHUES.reduce((s, c) => s + m[c], 0n);
const rangeeAgee = (r) => {
  const { tranches: m } = trancheesImputees(r);
  return {
    tiers: { id: r.id, code: r.code, nom: r.nom, actif: r.actif, delaiPaiement: r.delai_paiement },
    total: r.total, tranches: texteTranches(m), echu: texteMillimes(echuDe(m)), credits: r.credits, nbLignes: r.nb_lignes, nbBrouillard: r.nb_brouillard, retardMax: r.retard_max,
    _m: { ...m, total: millimesSigne(r.total) },
  };
};
// Un montant NUMERIC signé lu en base (« -12.500 ») → millimes (millimesDe refuse le signe : piège noté en S6c).
const millimesSigne = (t) => (String(t).startsWith('-') ? -millimesDe(String(t).slice(1)) : millimesDe(t));
const totauxAgee = (rangees) => {
  const m = zeroTranches();
  let total = 0n;
  let nbLignes = 0;
  let nbBrouillard = 0;
  for (const r of rangees) {
    for (const c of CLES_TRANCHES) m[c] += r._m[c];
    total += r._m.total;
    nbLignes += r.nbLignes;
    nbBrouillard += r.nbBrouillard;
  }
  return { total: texteMillimes(total), tranches: texteTranches(m), echu: texteMillimes(echuDe(m)), nbLignes, nbBrouillard, nbTiers: rangees.length };
};
const sansInterne = ({ _m, ...r }) => r;
const presenterLigne = (l) => ({
  id: l.id, date: l.date, dateReelle: l.date_reelle, libelle: l.libelle, debit: l.debit, credit: l.credit, du: l.du, echeance: l.echeance, echeanceSaisie: !!l.echeance_ligne,
  // Une facture a sa tranche ; un règlement ou un avoir non lettré n'en a pas : il s'impute sur les plus anciennes (null).
  retard: l.retard, tranche: String(l.du).startsWith('-') ? null : trancheDe(l.retard), compte: l.compte_numero,
  ecriture: { numero: l.numero, numeroProvisoire: numeroProvisoire(l.numero_provisoire), etat: l.etat, reference: l.reference, journal: l.journal_code },
  tiers: { id: l.tiers_id, code: l.tiers_code, nom: l.tiers_nom },
});
// Le tiers du dossier (identité complète : relevé, relance).
const tiersDuDossier = async (db, dossierId, tiersId) => {
  if (!idValide(tiersId)) throw erreur(404, 'Tiers introuvable');
  const t = (await db.query('SELECT id, type, code, nom, matricule_fiscal, adresse, ville, telephone, email, actif, delai_paiement FROM compta.tiers WHERE dossier_id = $1 AND id = $2', [dossierId, tiersId])).rows[0];
  if (!t) throw erreur(404, 'Tiers introuvable');
  return t;
};
const presenterTiers = (t) => ({ id: t.id, type: t.type, typeLibelle: TYPES_TIERS_LIBELLES[t.type] || t.type, code: t.code, nom: t.nom, matriculeFiscal: t.matricule_fiscal, adresse: t.adresse, ville: t.ville, actif: t.actif, delaiPaiement: t.delai_paiement });
// Un tiers déplié : ses lignes (bornées : les échéances les plus anciennes d'abord), et — sur TOUTES ses lignes non
// lettrées, par la balance âgée restreinte au tiers — leur nombre, leurs totaux, sa répartition par tranche, son dû et sa
// part échue.
const etatTiers = async (db, d, t, au, brouillard, limite = LIGNES_TIERS_MAX) => {
  const params = [d.id, au, t.type, brouillard, t.id];
  const [lignes, agee] = await Promise.all([db.query(SQL_LIGNES, [...params, limite]), db.query(SQL_BALANCE_AGEE, params)]);
  const r = agee.rows[0] || null;
  const m = r ? trancheesImputees(r).tranches : zeroTranches();
  return {
    tiers: presenterTiers(t), au, brouillard, lignes: lignes.rows.map(presenterLigne), total: r ? r.nb_lignes : 0, limite,
    totaux: { du: r ? r.total : '0.000', echu: texteMillimes(echuDe(m)), tranches: texteTranches(m), credits: r ? r.credits : '0.000', debit: r ? r.debit : '0.000', credit: r ? r.credit : '0.000', nbBrouillard: r ? r.nb_brouillard : 0, retardMax: r ? r.retard_max : null },
  };
};
// La page : le dossier, les droits, le type, le jour de lecture, les tranches, la balance âgée et ses totaux, le texte type
// de la relance, l'abonnement.
const etatEcheancier = async (db, acces, d, type, brouillard, au = aujourdhuiTunis()) => {
  const [agee, mode] = await Promise.all([
    db.query(SQL_BALANCE_AGEE, [d.id, au, type, brouillard, null]),
    modeTitulaire(db, acces.espace_id),
  ]);
  const rangees = agee.rows.map(rangeeAgee);
  return {
    dossier: presenterDossier(acces, d),
    droits: droits(acces),
    type, typeLibelle: TYPES_TIERS_LIBELLES[type], au, brouillard,
    tranches: TRANCHES.map((x) => ({ cle: x.cle, libelle: x.libelle })),
    rangees: rangees.map(sansInterne),
    totaux: totauxAgee(rangees),
    texteRelance: TEXTE_RELANCE,
    bornes: { lignesTiers: LIGNES_TIERS_MAX, exportMax: EXPORT_MAX, texteRelanceMax: TEXTE_RELANCE_MAX },
    etatAbonnement: etatAbonnement(mode),
  };
};

// ── PDF : relevé de compte, lettre de relance ───────────────────────────────────────────────────────────────────────
const dateLongue = (iso) => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
const fmtSigne = (t) => fmtMillimes(millimesSigne(t));
// Un retard ne se dit que d'une ligne qui augmente le dû (une facture) : un règlement ou un avoir non lettré vient en moins.
const enRetard = (l) => l.retard > 0 && millimesSigne(l.du) > 0n;
const montantSiNonNul = (t) => (millimesDe(t) > 0n ? fmtMillimes(millimesDe(t)) : '');
// L'identité du dossier (expéditeur) et celle du tiers (destinataire), en lignes de texte.
const identiteDossier = (d) => [d.raison_sociale || d.nom, d.nom_commercial && d.nom_commercial !== (d.raison_sociale || d.nom) ? d.nom_commercial : null, d.matricule_fiscal ? `Matricule fiscal ${d.matricule_fiscal}` : null, d.adresse, d.ville].filter(Boolean);
const identiteTiers = (t) => [t.nom, `${TYPES_TIERS_LIBELLES[t.type]} ${t.code}`, t.matricule_fiscal ? `Matricule fiscal ${t.matricule_fiscal}` : null, t.adresse, t.ville].filter(Boolean);
// Deux blocs côte à côte (« De » et « À ») à partir de y ; → y sous le plus haut.
const blocsAdresses = (p, gauche, droite, { titreGauche = null, titreDroite = null } = {}) => {
  const larg = LARGEUR / 2 - 12;
  const ecrire = (lignes, x, titre) => {
    let y = p.y;
    if (titre) { p.texte(titre, x, y, { taille: 7.5, gras: true, couleur: COULEURS.gris }); y += 11; }
    lignes.forEach((t, i) => {
      const taille = i === 0 ? 10.5 : 8.5;
      p.texte(t, x, y, { taille, gras: i === 0, largeur: larg });
      y += p.hauteur(t, larg, taille, i === 0) + 1;
    });
    return y;
  };
  const y1 = ecrire(gauche, MARGE, titreGauche);
  const y2 = ecrire(droite, MARGE + LARGEUR / 2 + 12, titreDroite);
  p.y = Math.max(y1, y2) + 8;
};
const COL_RELEVE = [52, 72, 163, 52, 70, 70, 44];
const COL_TRANCHES = [105, 104, 104, 104, 106];
const COL_RELANCE = [56, 80, 196, 56, 46, 89];
// Le résumé par tranche (tableau à cinq colonnes).
const tableauTranches = (p, tranches) => {
  p.assurer(40);
  p.rangee(TRANCHES.map((x) => ({ t: x.libelle, aligner: 'right' })), COL_TRANCHES, { taille: 7.5, gras: true, couleur: COULEURS.gris });
  p.filet(p.y);
  p.rangee(TRANCHES.map((x) => ({ t: fmtSigne(tranches[x.cle]), aligner: 'right' })), COL_TRANCHES);
};
// Le relevé de compte d'un tiers : expéditeur, destinataire, lignes non lettrées (date, pièce, libellé, échéance, débit,
// crédit, retard), totaux, solde dans les mots du destinataire, répartition par tranche. → Promise<Buffer>.
const construireReleve = ({ dossier, tiers, etat }) => {
  const p = creerDocument({ titre: `Relevé de compte ${tiers.code} - ${dossier.nom}`, suite: `Relevé de compte — ${tiers.code} ${tiers.nom}` });
  p.texte('RELEVÉ DE COMPTE', MARGE, p.y, { taille: 16, gras: true, couleur: COULEURS.indigo });
  p.texte('LabFlow Compta', MARGE, p.y + 2, { taille: 9, couleur: COULEURS.gris, largeur: LARGEUR, aligner: 'right' });
  p.y += 26;
  blocsAdresses(p, identiteDossier(dossier), identiteTiers(tiers), { titreGauche: 'DE', titreDroite: 'À' });
  const comptes = [...new Set(etat.lignes.map((l) => l.compte))].join(', ');
  const brouillards = etat.lignes.filter((l) => l.ecriture.etat === 'brouillard').length;
  p.paragraphe(`Relevé arrêté au ${dateLongue(etat.au)} · ${tiers.type === 'client' ? 'compte client' : 'compte fournisseur'} ${tiers.code}${comptes ? ` (${comptes})` : ''} · opérations non lettrées · montants en dinars, trois décimales`, { taille: 8.5 });
  p.y += 2;
  p.filet(p.y, COULEURS.indigo);
  p.y += 6;
  const enTete = () => {
    p.rangee([{ t: 'Date' }, { t: 'Pièce' }, { t: 'Libellé' }, { t: 'Échéance' }, { t: 'Débit', aligner: 'right' }, { t: 'Crédit', aligner: 'right' }, { t: 'Retard', aligner: 'right' }], COL_RELEVE, { taille: 7.5, gras: true, couleur: COULEURS.gris });
    p.filet(p.y);
  };
  enTete();
  for (const l of etat.lignes) {
    const cellules = [
      { t: fmtDate(l.date) }, { t: l.ecriture.reference }, { t: `${l.libelle || ''}${l.ecriture.etat === 'brouillard' ? ' (*)' : ''}` }, { t: fmtDate(l.echeance) },
      { t: montantSiNonNul(l.debit), aligner: 'right' }, { t: montantSiNonNul(l.credit), aligner: 'right' }, { t: enRetard(l) ? `${l.retard} j` : '', aligner: 'right', couleur: enRetard(l) ? COULEURS.alerte : null },
    ];
    p.assurer(p.hauteurRangee(cellules, COL_RELEVE), enTete);
    p.rangee(cellules, COL_RELEVE);
  }
  if (!etat.lignes.length) p.rangee([{ t: '' }, { t: '' }, { t: 'Aucune opération non lettrée : compte soldé.', couleur: COULEURS.gris }, { t: '' }, { t: '' }, { t: '' }, { t: '' }], COL_RELEVE);
  p.assurer(60);
  p.filet(p.y);
  p.rangee([{ t: 'Totaux' }, { t: '' }, { t: `${etat.total} opération${etat.total > 1 ? 's' : ''}` }, { t: '' }, { t: fmtMillimes(millimesDe(etat.totaux.debit)), aligner: 'right' }, { t: fmtMillimes(millimesDe(etat.totaux.credit)), aligner: 'right' }, { t: '' }], COL_RELEVE, { gras: true, fond: COULEURS.fond });
  const du = millimesSigne(etat.totaux.du);
  const solde = du === 0n ? 'Compte soldé'
    : tiers.type === 'client' ? (du > 0n ? `Reste à nous régler : ${fmtMillimes(du)} dinars` : `Solde en votre faveur : ${fmtMillimes(-du)} dinars`)
      : (du > 0n ? `Reste à vous régler : ${fmtMillimes(du)} dinars` : `Solde en notre faveur : ${fmtMillimes(-du)} dinars`);
  p.y += 6;
  p.paragraphe(solde, { taille: 10.5, gras: true });
  if (millimesSigne(etat.totaux.echu) > 0n) p.paragraphe(`dont échu au ${fmtDate(etat.au)} : ${fmtSigne(etat.totaux.echu)} dinars`, { taille: 9, couleur: COULEURS.alerte });
  p.y += 6;
  tableauTranches(p, etat.totaux.tranches);
  p.y += 10;
  if (millimesSigne(etat.totaux.credits || '0') > 0n) p.paragraphe('Les règlements et avoirs non lettrés sont imputés sur les échéances les plus anciennes.', { taille: 7.5, couleur: COULEURS.gris });
  if (brouillards) p.paragraphe('(*) opération en cours de validation.', { taille: 7.5, couleur: COULEURS.gris });
  p.paragraphe('Sauf erreur ou omission de notre part.', { taille: 8, couleur: COULEURS.gris });
  if (etat.total > etat.lignes.length) p.paragraphe(`Les ${etat.lignes.length} premières opérations sont détaillées sur ${etat.total} ; les totaux portent sur toutes.`, { taille: 7.5, couleur: COULEURS.gris });
  return p.finir(`LabFlow Compta · ${dossier.nom} · Relevé de compte ${tiers.code} au ${fmtDate(etat.au)}`);
};
// La lettre de relance d'un client : expéditeur, destinataire, lieu et date, objet, texte, lignes échues (retard > 0),
// montant échu et reste dû, signature. → Promise<Buffer>.
const construireRelance = ({ dossier, tiers, etat, texte }) => {
  const p = creerDocument({ titre: `Relance ${tiers.code} - ${dossier.nom}`, suite: `Relance — ${tiers.code} ${tiers.nom}` });
  const expediteur = identiteDossier(dossier);
  const larg = LARGEUR / 2 - 12;
  let y = p.y;
  expediteur.forEach((t, i) => { p.texte(t, MARGE, y, { taille: i === 0 ? 11 : 8.5, gras: i === 0, largeur: larg }); y += p.hauteur(t, larg, i === 0 ? 11 : 8.5, i === 0) + 1; });
  p.y = Math.max(y, MARGE + 60) + 14;
  const dest = [tiers.nom, tiers.adresse, tiers.ville].filter(Boolean);
  y = p.y;
  dest.forEach((t, i) => { p.texte(t, MARGE + LARGEUR / 2 + 12, y, { taille: i === 0 ? 10.5 : 9.5, gras: i === 0, largeur: larg }); y += p.hauteur(t, larg, i === 0 ? 10.5 : 9.5, i === 0) + 1; });
  p.y = y + 18;
  const lieu = String(dossier.ville || '').replace(/^\d+\s*/, '').trim();
  p.texte(`${lieu ? `${lieu}, le` : 'Le'} ${dateLongue(etat.au)}`, MARGE, p.y, { taille: 9.5, largeur: LARGEUR, aligner: 'right' });
  p.y += 24;
  p.paragraphe(`Objet : relance — factures échues (compte client ${tiers.code})`, { taille: 10, gras: true, apres: 12 });
  for (const ligne of texte.split('\n')) p.paragraphe(ligne || ' ', { taille: 9.5, apres: ligne ? 3 : 0 });
  p.y += 8;
  // Les factures échues, puis les règlements et avoirs non lettrés, déduits (relecture de S7a : imputés sur les plus
  // anciennes, ils font du « montant échu » ce qui reste vraiment dû : la somme des rangées).
  const echues = etat.lignes.filter((l) => enRetard(l));
  const deduits = etat.lignes.filter((l) => millimesSigne(l.du) < 0n);
  const brouillard = (l) => (l.ecriture.etat === 'brouillard' ? ' (*)' : '');
  const enTete = () => {
    p.rangee([{ t: 'Date' }, { t: 'Pièce' }, { t: 'Libellé' }, { t: 'Échéance' }, { t: 'Retard', aligner: 'right' }, { t: 'Montant', aligner: 'right' }], COL_RELANCE, { taille: 7.5, gras: true, couleur: COULEURS.gris });
    p.filet(p.y);
  };
  p.assurer(40);
  enTete();
  for (const l of echues) {
    const cellules = [{ t: fmtDate(l.date) }, { t: l.ecriture.reference }, { t: `${l.libelle || ''}${brouillard(l)}` }, { t: fmtDate(l.echeance) }, { t: `${l.retard} j`, aligner: 'right' }, { t: fmtSigne(l.du), aligner: 'right' }];
    p.assurer(p.hauteurRangee(cellules, COL_RELANCE), enTete);
    p.rangee(cellules, COL_RELANCE);
  }
  for (const l of deduits) {
    const cellules = [{ t: fmtDate(l.date) }, { t: l.ecriture.reference }, { t: `${l.libelle || ''}${brouillard(l)} — à déduire` }, { t: '' }, { t: '' }, { t: fmtSigne(l.du), aligner: 'right' }];
    p.assurer(p.hauteurRangee(cellules, COL_RELANCE), enTete);
    p.rangee(cellules, COL_RELANCE);
  }
  p.assurer(50);
  p.filet(p.y);
  p.rangee([{ t: '' }, { t: '' }, { t: `Montant échu${deduits.length ? ', règlements déduits' : ''}` }, { t: '' }, { t: '' }, { t: fmtSigne(etat.totaux.echu), aligner: 'right' }], COL_RELANCE, { gras: true, fond: COULEURS.fond });
  p.y += 6;
  p.paragraphe(`Reste dû au ${fmtDate(etat.au)}, échu et non échu : ${fmtSigne(etat.totaux.du)} dinars.`, { taille: 9 });
  if ([...echues, ...deduits].some((l) => brouillard(l))) p.paragraphe('(*) opération en cours de validation.', { taille: 7.5, couleur: COULEURS.gris });
  if (etat.total > etat.lignes.length) p.paragraphe(`Les opérations les plus anciennes sont détaillées (${etat.lignes.length} sur ${etat.total}) ; les montants portent sur toutes.`, { taille: 7.5, couleur: COULEURS.gris });
  p.y += 22;
  p.assurer(40);
  p.texte(`Pour ${expediteur[0]}`, MARGE + LARGEUR / 2 + 12, p.y, { taille: 9.5, gras: true, largeur: larg });
  return p.finir(`LabFlow Compta · ${dossier.nom} · Relance ${tiers.code} du ${fmtDate(etat.au)}`);
};

// ── Routes de lecture ───────────────────────────────────────────────────────────────────────────────────────────────
// GET /api/compta/dossiers/:dossierId/echeancier?type=fournisseur|client&brouillard= — la balance âgée (lecture : tout niveau).
const lire = async (req, res) => {
  try {
    const type = lireType(req.query.type);
    const brouillard = lireBrouillard(req.query.brouillard);
    const { acces, d } = await lectureDossier(req.user, req.params.dossierId);
    res.json(await etatEcheancier(pool, acces, d, type, brouillard));
  } catch (err) {
    repondreErreur(res, err, '[compta.echeancier.lire]');
  }
};
// GET …/echeancier/tiers/:tiersId?brouillard= — un tiers déplié : ses lignes non lettrées, échéance et retard.
const unTiers = async (req, res) => {
  try {
    if (!idValide(req.params.tiersId)) throw erreur(404, 'Tiers introuvable');
    const brouillard = lireBrouillard(req.query.brouillard);
    const { d } = await lectureDossier(req.user, req.params.dossierId);
    res.json(await etatTiers(pool, d, await tiersDuDossier(pool, d.id, req.params.tiersId), aujourdhuiTunis(), brouillard));
  } catch (err) {
    repondreErreur(res, err, '[compta.echeancier.tiers]');
  }
};
// GET …/echeancier/tiers/:tiersId/releve.pdf?brouillard= — le relevé de compte du tiers (fournisseur ou client).
const releve = async (req, res) => {
  try {
    if (!idValide(req.params.tiersId)) throw erreur(404, 'Tiers introuvable');
    const brouillard = lireBrouillard(req.query.brouillard);
    const { d } = await lectureDossier(req.user, req.params.dossierId);
    const t = await tiersDuDossier(pool, d.id, req.params.tiersId);
    const etat = await etatTiers(pool, d, t, aujourdhuiTunis(), brouillard);
    const pdf = await construireReleve({ dossier: d, tiers: t, etat });
    envoyerPdf(res, pdf, nomPdf('releve', `${t.code}-${t.nom}`, etat.au));
  } catch (err) {
    repondreErreur(res, err, '[compta.echeancier.releve]');
  }
};
// POST …/echeancier/tiers/:tiersId/relance.pdf — { brouillard?, texte? } : la lettre de relance d'un client qui a des
// lignes échues (texte type, ou celui de la fenêtre). En POST pour que le texte ne voyage pas dans l'adresse (relecture de
// S7a) ; rien n'est écrit (ECRITURES_SANS_GARDE, routes.js). 400 pour un fournisseur ; 409 RIEN_ECHU sans montant échu.
const relance = async (req, res) => {
  try {
    if (!idValide(req.params.tiersId)) throw erreur(404, 'Tiers introuvable');
    const corps = req.body && typeof req.body === 'object' ? req.body : {};
    const brouillard = lireBrouillard(corps.brouillard);
    const texte = lireTexteRelance(corps.texte);
    const { d } = await lectureDossier(req.user, req.params.dossierId);
    const t = await tiersDuDossier(pool, d.id, req.params.tiersId);
    if (t.type !== 'client') throw erreur(400, 'La lettre de relance s\'adresse à un client : pour un fournisseur, imprimez son relevé de compte', 'RELANCE_CLIENT');
    const etat = await etatTiers(pool, d, t, aujourdhuiTunis(), brouillard);
    if (millimesSigne(etat.totaux.echu) <= 0n) throw erreur(409, `Aucun montant échu pour ${t.code} au ${fmtDate(etat.au)} : rien à relancer (imprimez son relevé de compte)`, 'RIEN_ECHU');
    const pdf = await construireRelance({ dossier: d, tiers: t, etat, texte });
    envoyerPdf(res, pdf, nomPdf('relance', `${t.code}-${t.nom}`, etat.au));
  } catch (err) {
    repondreErreur(res, err, '[compta.echeancier.relance]');
  }
};
// GET …/echeancier/export?type=&brouillard= — la balance âgée (une rangée par tiers) et le détail (une rangée par ligne
// non lettrée, 10 000 au plus), à la charte ; sous la garde des exports (deux à la fois pour tout le serveur).
const exporter = (req, res) => avecGardeExport(res, '[compta.echeancier.exporter]', async () => {
  const type = lireType(req.query.type);
  const brouillard = lireBrouillard(req.query.brouillard);
  const { acces, d } = await lectureDossier(req.user, req.params.dossierId);
  const au = aujourdhuiTunis();
  const params = [d.id, au, type, brouillard, null];
  const nb = (await pool.query(SQL_NB_LIGNES, params)).rows[0].n;
  if (nb > EXPORT_MAX) throw erreur(400, `${EXPORT_MAX} lignes au plus par export (${nb} lignes non lettrées) : lettrez d'abord ce qui est réglé`, 'EXPORT_TROP_GRAND');
  const [e, lignes] = await Promise.all([etatEcheancier(pool, acces, d, type, brouillard, au), pool.query(SQL_LIGNES, [...params, EXPORT_MAX])]);
  const libelleType = type === 'client' ? 'clients' : 'fournisseurs';
  const meta = `au ${fmtDate(au)} · ${brouillard ? 'écritures validées et en brouillard' : 'écritures validées seulement'} · lignes non lettrées · exporté le ${jourTunis()}`;
  const wb = new ExcelJS.Workbook();
  ajouterFeuille(wb, {
    feuille: 'Balance âgée', titre: `Balance âgée — ${libelleType}`, sousTitre: d.nom,
    metaTexte: `${meta} · ${e.rangees.length} tiers`,
    enTetes: ['Code', 'Nom', ...TRANCHES.map((x) => x.libelle), 'Total', 'Dont échu', 'Lignes', 'En brouillard'],
    largeurs: [12, 36, 15, 15, 15, 15, 16, 17, 17, 9, 12],
    montants: [3, 4, 5, 6, 7, 8, 9],
    rangees: e.rangees.map((r) => [r.tiers.code, r.tiers.nom, ...CLES_TRANCHES.map((c) => nombreExcel(r.tranches[c])), nombreExcel(r.total), nombreExcel(r.echu), r.nbLignes, r.nbBrouillard || '']),
    total: ['Total', '', ...CLES_TRANCHES.map((c) => nombreExcel(e.totaux.tranches[c])), nombreExcel(e.totaux.total), nombreExcel(e.totaux.echu), e.totaux.nbLignes, e.totaux.nbBrouillard || ''],
  });
  ajouterFeuille(wb, {
    feuille: 'Détail', titre: `Échéancier — ${libelleType}`, sousTitre: d.nom,
    metaTexte: `${meta} · ${lignes.rows.length} ligne${lignes.rows.length > 1 ? 's' : ''}`,
    enTetes: ['Code', 'Nom', 'Date', 'Journal', 'Numéro', 'Pièce', 'Libellé', 'Compte', 'Débit', 'Crédit', 'Échéance', 'Retard (jours)', 'Tranche', 'État'],
    largeurs: [12, 28, 12, 9, 17, 16, 36, 10, 15, 15, 12, 12, 16, 11],
    montants: [9, 10],
    rangees: lignes.rows.map(presenterLigne).map((l) => [l.tiers.code, l.tiers.nom, fmtDate(l.date), l.ecriture.journal, l.ecriture.numero || l.ecriture.numeroProvisoire, l.ecriture.reference, l.libelle, l.compte, millimesDe(l.debit) > 0n ? nombreExcel(l.debit) : null, millimesDe(l.credit) > 0n ? nombreExcel(l.credit) : null, fmtDate(l.echeance), l.tranche ? l.retard : '', l.tranche ? TRANCHES.find((x) => x.cle === l.tranche).libelle : 'À imputer (règlement, avoir)', l.ecriture.etat === 'validee' ? 'Validée' : 'Brouillard']),
    total: null,
  });
  await envoyerClasseur(res, wb, `echeancier-${libelleType}-${String(d.nom).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'dossier'}-${au}.xlsx`);
});

module.exports = {
  LIGNES_TIERS_MAX, TEXTE_RELANCE, TEXTE_RELANCE_MAX, TEXTE_RELANCE_LIGNES_MAX,
  lireType, lireBrouillard, lireTexteRelance, millimesSigne, rangeeAgee, totauxAgee, echuDe, presenterLigne, identiteDossier, identiteTiers, dateLongue,
  SQL_NON_LETTREES, SQL_BALANCE_AGEE, SQL_LIGNES, SQL_NB_LIGNES,
  etatEcheancier, etatTiers, construireReleve, construireRelance,
  lire, unTiers, releve, relance, exporter,
};
