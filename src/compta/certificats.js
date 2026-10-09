// LabFlow Compta, étape S7b « TVA, retenues et certificats » (labflow-reprise/achats-compta/PLAN-S7.md §1 ligne S7b, §2
// « S7b », §4 « Retenues », « Droits » ; réponses du client du 09/10 — « ok pour les 9 » : date de paiement = règlement
// lettré, sinon facture, modifiable avant de produire ; fichier XML au cahier des charges TEJ v2.0, « à essayer sur TEJ »
// tant qu'aucun dépôt d'essai n'a réussi (« pas accès TEJ ») ; recherche-fiscale-tunisie.md §3.4). Les certificats de
// retenue à la source d'un dossier (compta.certificats, compta.certificat_lignes, compta.fichiers_tej — migration 219) :
//   • PRODUIRE : un certificat par bénéficiaire et par paiement (date choisie), numéroté sans trou par dossier et par année
//     (« 2026-000001 » : la référence du certificat chez le déclarant), avec ses opérations, son bénéficiaire et le
//     déclarant FIGÉS (il se reproduit à l'identique) ; ses lignes de retenue ne se certifient plus une seconde fois ;
//   • ANNULER : le certificat reste (numéro gardé), ses lignes redeviennent à certifier ; déjà déposé dans un fichier, il
//     part dans le rectificatif suivant (bloc d'annulation) ;
//   • FICHIER TEJ du mois de paiement : « MATRICULE-AAAA-MM-acte.xml » — dépôt initial (acte 0) avec les certificats non
//     encore déposés, puis rectificatif (acte 1) avec les nouveaux et les annulés ; montants en millimes entiers, textes sans
//     accent ni caractère interdit (cahier des charges, « Remarques importantes ») ; contenu gardé et empreinte (SHA-256) :
//     le fichier se retélécharge à l'identique ;
//   • PDF : le certificat (« classique » : payeur, retenues, bénéficiaire), un par un ou le lot du mois — document
//     préparatoire, le certificat qui fait foi s'établit sur la plateforme TEJ (art. 55 du CIRPPIS).
// Écritures (produire, annuler, fichier) : transaction verrouillée du dossier (dansEspaceDuDossier : comptabilité
// verrouillée, dossier relu sous verrou, garde par comptabilité D4), droit « configurer » (titulaire, Complet), dossier non
// archivé ; dans cette transaction un 404 devient « Dossier introuvable » (S4c) : un état périmé y répond 409.
const crypto = require('crypto');
const pool = require('../config/database');
const { journaliser } = require('./journal');
const { erreur, idValide, repondreErreur } = require('./comptablesClient');
const { TYPES_IDENTIFIANT_LIBELLES, fiscaliteDe, regimeFiscalDe } = require('./paquets');
const { droits, dateValide, dansEspaceDuDossier } = require('./dossiers');
const { lectureDossier, HORS_W1252 } = require('./planComptes');
const { fmtDate, fmtMillimes } = require('./ecritures');
const { aujourdhuiTunis } = require('./echeances');
const { MARGE, LARGEUR, COULEURS, creerDocument, nomPdf, envoyerPdf } = require('./pdf');
const { millimes, texte, SQL_ECRITURES_A_RETENUE, SQL_LIGNES_DES_PIECES, SQL_LIGNES_DES_LETTRES, operationDe, totauxDe } = require('./taxesCalcul');

const MSG_CERTIFICATS = 'Seul le titulaire ou un gérant de niveau Complet peut produire ou annuler des certificats de retenue';
// Bornes : pièces à retenue lues pour un dossier, paiements et pièces d'une production, motif d'annulation.
const OPERATIONS_MAX = 5000;
const PAIEMENTS_MAX = 200;
const PIECES_PAR_PAIEMENT_MAX = 500;
const MOTIF_MAX = 255;
// Cahier des charges TEJ v2.0 : adresse email du bénéficiaire, identifiant du matricule fiscal (7 chiffres et la clé).
const RE_EMAIL_TEJ = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const RE_IDENTIFIANT_MF = /^(\d{7}[A-Z])/;
const TYPES_TEJ = { mf: 1, cin: 2, passeport: 3, carte_sejour: 4, autre: 5 };

// ── Textes pour la plateforme TEJ ───────────────────────────────────────────────────────────────────────────────────
// Le cahier des charges interdit les caractères accentués, « ; * & », le double tiret, « /* », « &# » et les séquences
// « 'OR » et « 'AND » : les accents sont retirés (é → e), les autres signes deviennent des espaces.
const DIACRITIQUES = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, 'g');
const LIGATURES = [['œ', 'oe'], ['Œ', 'OE'], ['æ', 'ae'], ['Æ', 'AE'], ['ß', 'ss'], ['ø', 'o'], ['Ø', 'O']];
const texteTej = (s, max = 200) => {
  let t = String(s ?? '').normalize('NFD').replace(DIACRITIQUES, '');
  for (const [a, b] of LIGATURES) t = t.split(a).join(b);
  t = t.replace(/[^A-Za-z0-9 .,()/:+@_-]/g, ' ').replace(/-{2,}/g, '-').replace(/\/\*/g, '/').replace(/\s+/g, ' ').trim();
  return t.slice(0, max).trim();
};
const echapperXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Millimes entiers (texte NUMERIC « 1234.500 » → « 1234500 ») ; un taux « 1.500 » → « 1.50 » (format 999.99).
const millimesEntiers = (t) => String(millimes(t));
const tauxTej = (t) => {
  if (t == null) return '0.00';
  const m = millimes(t);
  const cent = (m + 5n) / 10n;
  return `${cent / 100n}.${String(cent % 100n).padStart(2, '0')}`;
};
const dateTej = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

// ── Bénéficiaire et déclarant ───────────────────────────────────────────────────────────────────────────────────────
// Ce que la plateforme exige d'un bénéficiaire : un identifiant (matricule fiscal avec sa clé et la catégorie PM / PP ;
// sinon CIN de 8 chiffres et date de naissance ; passeport ou carte de séjour avec date de naissance et pays ; autre
// identifiant avec pays et catégorie), la résidence, le nom, l'adresse, l'email et le téléphone. → { fige, manque }.
const beneficiaireDe = (t, pays) => {
  const manque = [];
  const regime = regimeFiscalDe(pays, t.regime_fiscal);
  const categorie = regime ? (regime.personne === 'morale' ? 'PM' : 'PP') : null;
  let identifiant = null;
  const mf = String(t.matricule_fiscal || '');
  if (mf && RE_IDENTIFIANT_MF.test(mf)) {
    identifiant = { type: 'mf', typeTej: 1, valeur: RE_IDENTIFIANT_MF.exec(mf)[1], matricule: mf, naissance: null, pays: null, categorie };
    if (!categorie) manque.push('régime fiscal (personne morale ou physique)');
  } else if (t.id_type) {
    identifiant = { type: t.id_type, typeTej: TYPES_TEJ[t.id_type], valeur: t.id_numero, matricule: null, naissance: t.id_naissance || null, pays: t.id_pays || null, categorie: t.id_type === 'autre' ? categorie : 'PP' };
    if (t.id_type === 'cin' && !/^\d{8}$/.test(t.id_numero || '')) manque.push('numéro de CIN (8 chiffres)');
    if (['cin', 'passeport', 'carte_sejour'].includes(t.id_type) && !t.id_naissance) manque.push('date de naissance');
    if (['passeport', 'carte_sejour', 'autre'].includes(t.id_type) && !t.id_pays) manque.push('pays de l\'identifiant');
    if (t.id_type === 'autre' && !categorie) manque.push('régime fiscal (personne morale ou physique)');
    if (mf) manque.push('matricule fiscal sans lettre de clé (1234567A…) : corrigez-le ou videz-le');
  } else {
    manque.push(mf ? 'matricule fiscal avec sa lettre de clé (1234567A…)' : 'matricule fiscal ou, à défaut, CIN, passeport ou carte de séjour');
  }
  const adresse = [t.adresse, t.ville].filter(Boolean).join(', ');
  // Relecture : un nom ou une adresse écrits sans lettre latine (arabe) sont REMPLIS mais illisibles pour la plateforme ;
  // le double tiret est interdit partout, l'email compris.
  if (!texteTej(t.nom)) manque.push(String(t.nom || '').trim() ? 'nom en caractères latins' : 'nom');
  if (!texteTej(adresse)) manque.push(adresse.trim() ? 'adresse en caractères latins' : 'adresse');
  if (!t.email) manque.push('email');
  else if (!RE_EMAIL_TEJ.test(t.email) || t.email.includes('--')) manque.push('email valide (sans double tiret)');
  if (!t.telephone || !texteTej(t.telephone)) manque.push('téléphone');
  return {
    manque,
    fige: {
      id: t.id, code: t.code, nom: t.nom, identifiant, resident: t.resident !== false, adresse, email: t.email || null, telephone: t.telephone || null,
      regimeFiscal: regime ? regime.libelle : null,
    },
  };
};
// Le déclarant (le dossier) : matricule fiscal avec sa clé, catégorie PM / PP d'après le régime du dossier, nom, adresse.
const declarantDe = (d) => {
  const manque = [];
  const mf = String(d.matricule_fiscal || '');
  if (!RE_IDENTIFIANT_MF.test(mf)) manque.push(mf ? 'matricule fiscal du dossier avec sa lettre de clé (1234567A…)' : 'matricule fiscal du dossier');
  return {
    manque,
    fige: {
      nom: d.raison_sociale || d.nom, matricule: mf || null, identifiant: RE_IDENTIFIANT_MF.test(mf) ? RE_IDENTIFIANT_MF.exec(mf)[1] : null,
      categorie: d.personne === 'physique' ? 'PP' : 'PM', adresse: [d.adresse, d.ville].filter(Boolean).join(', '),
    },
  };
};
const texteManque = (manque) => manque.join(', ');

// ── Lectures ────────────────────────────────────────────────────────────────────────────────────────────────────────
// Les pièces à retenue opérée encore à certifier (toutes, ou `ids`), en opérations (taxesCalcul.operationDe), et leurs
// bénéficiaires. → { operations, tiers: Map }.
const SQL_TIERS = `
  SELECT id, type, code, nom, matricule_fiscal, adresse, ville, telephone, email, regime_fiscal, resident, id_type, id_numero, id_naissance::text AS id_naissance, id_pays, retenue_id, actif
    FROM compta.tiers WHERE dossier_id = $1 AND id = ANY($2)`;
const chargerOperations = async (db, dossierId, ids = null) => {
  const ecritures = (await db.query(SQL_ECRITURES_A_RETENUE, [dossierId, ids, OPERATIONS_MAX])).rows.map((r) => r.id);
  if (!ecritures.length) return { operations: [], tiers: new Map(), borne: false };
  const lignes = (await db.query(SQL_LIGNES_DES_PIECES, [dossierId, ecritures])).rows;
  const idsLettres = [...new Set(lignes.filter((l) => l.lettrage_id).map((l) => l.lettrage_id))];
  const lettres = new Map();
  if (idsLettres.length) {
    for (const r of (await db.query(SQL_LIGNES_DES_LETTRES, [dossierId, idsLettres])).rows) {
      if (!lettres.has(r.lettrage_id)) lettres.set(r.lettrage_id, []);
      lettres.get(r.lettrage_id).push(r);
    }
  }
  const parPiece = new Map();
  for (const l of lignes) {
    if (!parPiece.has(l.ecriture_id)) parPiece.set(l.ecriture_id, []);
    parPiece.get(l.ecriture_id).push(l);
  }
  const operations = [...parPiece.values()].map((ls) => operationDe(ls, lettres));
  const idsTiers = [...new Set(operations.map((o) => o.tiersId).filter(Boolean))];
  const tiers = new Map(idsTiers.length ? (await db.query(SQL_TIERS, [dossierId, idsTiers])).rows.map((t) => [t.id, t]) : []);
  return { operations, tiers, borne: ecritures.length >= OPERATIONS_MAX };
};
const SQL_CERTIFICAT = `
  SELECT c.id, c.tiers_id, c.annee, c.numero, c.reference, c.date_paiement::text AS date_paiement, c.source_date, c.beneficiaire, c.declarant, c.operations,
         c.total_ht::text AS total_ht, c.total_tva::text AS total_tva, c.total_ttc::text AS total_ttc, c.total_rs::text AS total_rs, c.total_taxes::text AS total_taxes, c.total_net::text AS total_net,
         c.etat, c.fichier_id, f.nom AS fichier_nom, f.acte AS fichier_acte, f.created_at AS fichier_le, c.annulation_fichier_id, fa.nom AS annulation_fichier_nom,
         c.annule_le, ua.nom AS annule_par_nom, c.motif_annulation, c.created_at, up.nom AS produit_par_nom
    FROM compta.certificats c
    LEFT JOIN compta.fichiers_tej f ON f.id = c.fichier_id
    LEFT JOIN compta.fichiers_tej fa ON fa.id = c.annulation_fichier_id
    LEFT JOIN utilisateurs ua ON ua.id = c.annule_par
    LEFT JOIN utilisateurs up ON up.id = c.produit_par`;
const presenterCertificat = (c) => ({
  id: c.id, reference: c.reference, numero: c.numero, annee: c.annee, datePaiement: c.date_paiement, sourceDate: c.source_date,
  tiers: { id: c.tiers_id, code: c.beneficiaire.code, nom: c.beneficiaire.nom },
  beneficiaire: c.beneficiaire, declarant: c.declarant, operations: c.operations,
  totaux: { ht: c.total_ht, tva: c.total_tva, ttc: c.total_ttc, rs: c.total_rs, taxes: c.total_taxes, net: c.total_net },
  etat: c.etat, produitPar: c.produit_par_nom || null, produitLe: c.created_at,
  fichier: c.fichier_id ? { id: c.fichier_id, nom: c.fichier_nom, acte: c.fichier_acte, le: c.fichier_le } : null,
  annulation: c.etat === 'annule' ? { le: c.annule_le, par: c.annule_par_nom || null, motif: c.motif_annulation, fichier: c.annulation_fichier_id ? { id: c.annulation_fichier_id, nom: c.annulation_fichier_nom } : null } : null,
});
// Les certificats d'un mois de paiement ($1 dossier, $2 premier jour, $3 dernier jour), par numéro.
const certificatsDuMois = async (db, dossierId, debut, fin) =>
  (await db.query(`${SQL_CERTIFICAT} WHERE c.dossier_id = $1 AND c.date_paiement BETWEEN $2 AND $3 ORDER BY c.annee, c.numero`, [dossierId, debut, fin])).rows.map(presenterCertificat);
const SQL_FICHIERS = `
  SELECT f.id, f.annee, f.mois, f.acte, f.nom, f.empreinte, f.nb_ajouts, f.nb_annulations, f.created_at, u.nom AS produit_par_nom,
         f.retire_le, f.motif_retrait, ur.nom AS retire_par_nom
    FROM compta.fichiers_tej f LEFT JOIN utilisateurs u ON u.id = f.produit_par LEFT JOIN utilisateurs ur ON ur.id = f.retire_par`;
const presenterFichier = (f) => ({
  id: f.id, annee: f.annee, mois: f.mois, acte: f.acte, nom: f.nom, empreinte: f.empreinte, nbAjouts: f.nb_ajouts, nbAnnulations: f.nb_annulations, produitLe: f.created_at, produitPar: f.produit_par_nom || null,
  retrait: f.retire_le ? { le: f.retire_le, par: f.retire_par_nom || null, motif: f.motif_retrait } : null,
});
const fichiersDuMois = async (db, dossierId, annee, mois) =>
  (await db.query(`${SQL_FICHIERS} WHERE f.dossier_id = $1 AND f.annee = $2 AND f.mois = $3 ORDER BY f.id`, [dossierId, annee, mois])).rows.map(presenterFichier);
// Ce que contiendrait le prochain fichier du mois : acte (0 tant qu'aucun dépôt initial n'est produit), certificats à
// ajouter (produits, jamais déposés), à annuler (annulés après leur dépôt, pas encore dans un rectificatif).
const SQL_A_AJOUTER = `${SQL_CERTIFICAT} WHERE c.dossier_id = $1 AND c.etat = 'produit' AND c.fichier_id IS NULL AND c.date_paiement BETWEEN $2 AND $3 ORDER BY c.annee, c.numero`;
const SQL_A_ANNULER = `${SQL_CERTIFICAT} WHERE c.dossier_id = $1 AND c.etat = 'annule' AND c.fichier_id IS NOT NULL AND c.annulation_fichier_id IS NULL AND c.date_paiement BETWEEN $2 AND $3 ORDER BY c.annee, c.numero`;
// Les certificats ($1 dossier, $2 identifiants) dont une pièce a été contre-passée depuis leur production.
const SQL_AJOUTS_CONTREPASSES = `
  SELECT DISTINCT c.reference
    FROM compta.certificats c
    JOIN compta.certificat_lignes cl ON cl.certificat_id = c.id AND cl.actif
    JOIN compta.lignes l ON l.id = cl.ligne_id
    JOIN compta.ecritures cp ON cp.origine_id = l.ecriture_id AND cp.origine = 'contrepassation' AND cp.dossier_id = c.dossier_id
   WHERE c.dossier_id = $1 AND c.id = ANY($2)
   ORDER BY c.reference`;
const bornesDuMois = (annee, mois) => {
  const mm = String(mois).padStart(2, '0');
  const fin = new Date(Date.UTC(annee, mois, 0)).getUTCDate();
  return { debut: `${annee}-${mm}-01`, fin: `${annee}-${mm}-${String(fin).padStart(2, '0')}`, mm };
};
const prochainFichier = async (db, dossierId, annee, mois) => {
  const { debut, fin } = bornesDuMois(annee, mois);
  // Un fichier retiré (refusé par la plateforme) ne compte plus : le dépôt initial se refait.
  const initial = (await db.query('SELECT 1 FROM compta.fichiers_tej WHERE dossier_id = $1 AND annee = $2 AND mois = $3 AND acte = 0 AND retire_le IS NULL', [dossierId, annee, mois])).rows.length > 0;
  const ajouts = (await db.query(SQL_A_AJOUTER, [dossierId, debut, fin])).rows.map(presenterCertificat);
  const annulations = initial ? (await db.query(SQL_A_ANNULER, [dossierId, debut, fin])).rows.map(presenterCertificat) : [];
  return { acte: initial ? 1 : 0, ajouts, annulations };
};

// ── XML du cahier des charges TEJ v2.0 ──────────────────────────────────────────────────────────────────────────────
const el = (nom, valeur) => `<${nom}>${echapperXml(valeur)}</${nom}>`;
const xmlIdentifiant = (id) => {
  const nom = { mf: 'MatriculeFiscal', cin: 'CIN', passeport: 'Passeport', carte_sejour: 'CarteSejour', autre: 'AutreIdentifiantFiscal' }[id.type];
  const parties = [el('TypeIdentifiant', String(id.typeTej)), el('Identifiant', texteTej(id.valeur, 30))];
  if (['cin', 'passeport', 'carte_sejour'].includes(id.type)) parties.push(el('DateNaissance', dateTej(id.naissance)));
  if (['passeport', 'carte_sejour', 'autre'].includes(id.type)) parties.push(el('Pays', id.pays));
  parties.push(el('CategorieContribuable', id.categorie));
  return `<${nom}>${parties.join('')}</${nom}>`;
};
const xmlCertificat = (c) => {
  const b = c.beneficiaire;
  const ops = c.operations.map((o) => [
    `<Operation IdTypeOperation="${echapperXml(o.codeTej)}">`,
    el('AnneeFacturation', String(o.anneeFacturation)), el('CNPC', '0'), el('P_Charge', '0'),
    el('MontantHT', millimesEntiers(o.ht)), el('TauxRS', tauxTej(o.tauxRs)),
    // Relecture : taux de TVA inconnu (lignes de TVA sans code) ⇒ l'élément, facultatif, est omis plutôt que « 0.00 ».
    o.tauxTva != null ? el('TauxTVA', tauxTej(o.tauxTva)) : '', el('MontantTVA', millimesEntiers(o.tva)),
    el('MontantTTC', millimesEntiers(o.ttc)), el('MontantRS', millimesEntiers(o.rs)),
    o.rsTva ? `<TaxeAdditionnelle Code="${echapperXml(o.rsTva.code)}" Taux="${tauxTej(o.rsTva.taux)}">${millimesEntiers(o.rsTva.montant)}</TaxeAdditionnelle>` : '',
    el('MontantNetServi', millimesEntiers(o.net)),
    '</Operation>',
  ].join(''));
  const taxes = new Map();
  for (const o of c.operations) if (o.rsTva) taxes.set(o.rsTva.code, (taxes.get(o.rsTva.code) || 0n) + millimes(o.rsTva.montant));
  return [
    '<Certificat>',
    '<Beneficiaire>',
    `<IdTaxpayer>${xmlIdentifiant(b.identifiant)}</IdTaxpayer>`,
    el('Resident', b.resident ? '1' : '0'),
    el('NometprenonOuRaisonsociale', texteTej(b.nom)),
    el('Adresse', texteTej(b.adresse)),
    `<InfosContact>${el('AdresseMail', b.email)}${el('NumTel', texteTej(b.telephone, 30))}</InfosContact>`,
    '</Beneficiaire>',
    el('DatePayement', dateTej(c.datePaiement)),
    el('Ref_certif_chez_declarant', c.reference),
    `<ListeOperations>${ops.join('')}</ListeOperations>`,
    '<TotalPayement>',
    el('TotalMontantHT', millimesEntiers(c.totaux.ht)), el('TotalMontantTVA', millimesEntiers(c.totaux.tva)), el('TotalMontantTTC', millimesEntiers(c.totaux.ttc)), el('TotalMontantRS', millimesEntiers(c.totaux.rs)),
    taxes.size ? `<TotalTaxes>${[...taxes.entries()].map(([code, m]) => `<TotalTaxeAdditionnelle Code="${echapperXml(code)}" Montant="${m}"/>`).join('')}</TotalTaxes>` : '',
    el('TotalMontantNetServi', millimesEntiers(c.totaux.net)),
    '</TotalPayement>',
    '</Certificat>',
  ].join('');
};
// Le fichier d'un mois : → { nom, contenu }. `declarant` : declarantDe(d).fige ; `ajouts`, `annulations` : certificats
// présentés. Une ligne par élément de premier niveau (lisible), sans commentaire (interdit par le cahier des charges).
const construireXml = ({ declarant, annee, mois, acte, ajouts, annulations, versionSchema = '1.0' }) => {
  const mm = String(mois).padStart(2, '0');
  const lignes = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<DeclarationsRS VersionSchema="${echapperXml(versionSchema)}">`,
    `<Declarant>${el('TypeIdentifiant', '1')}${el('Identifiant', declarant.identifiant)}${el('CategorieContribuable', declarant.categorie)}</Declarant>`,
    `<ReferenceDeclaration>${el('ActeDepot', String(acte))}${el('AnneeDepot', String(annee))}${el('MoisDepot', mm)}</ReferenceDeclaration>`,
  ];
  if (ajouts.length) lignes.push('<AjouterCertificats>', ...ajouts.map(xmlCertificat), '</AjouterCertificats>');
  // Le bloc d'annulation : la référence du certificat chez le déclarant identifie celui à annuler (structure détaillée
  // non publiée dans le cahier des charges v2.0 : à vérifier à l'essai sur la plateforme).
  if (annulations.length) lignes.push('<AnnulerCertificats>', ...annulations.map((c) => `<Certificat>${el('Ref_certif_chez_declarant', c.reference)}</Certificat>`), '</AnnulerCertificats>');
  lignes.push('</DeclarationsRS>');
  return { nom: `${declarant.identifiant}-${annee}-${mm}-${acte}.xml`, contenu: `${lignes.join('\n')}\n` };
};

// ── PDF : le certificat classique ───────────────────────────────────────────────────────────────────────────────────
const COL_OPS = [62, 50, 121, 56, 50, 58, 30, 46, 50];
const texteIdentifiant = (id) => (id ? `${id.type === 'mf' ? 'Matricule fiscal' : TYPES_IDENTIFIANT_LIBELLES[id.type]} ${id.type === 'mf' ? id.matricule || id.valeur : id.valeur}${id.pays ? ` (${id.pays})` : ''}` : '—');
const fmt = (t) => fmtMillimes(millimes(t));
const fmtTaux = (t) => (t == null ? '' : `${String(Number(t)).replace('.', ',')} %`);
const dessinerCertificat = (p, c, { dossierVille }) => {
  const d = c.declarant;
  const b = c.beneficiaire;
  p.texte('CERTIFICAT DE RETENUE À LA SOURCE', MARGE, p.y, { taille: 14, gras: true, couleur: COULEURS.indigo });
  p.texte(`N° ${c.reference}`, MARGE, p.y + 2, { taille: 10, gras: true, largeur: LARGEUR, aligner: 'right' });
  p.y += 19;
  p.paragraphe(`Impôt sur le revenu ou impôt sur les sociétés${c.operations.some((o) => o.rsTva) ? ' et taxe sur la valeur ajoutée' : ''} — article 55 du code de l'IRPP et de l'IS · paiement du ${fmtDate(c.datePaiement)}`, { taille: 8.5, couleur: COULEURS.gris });
  if (c.etat === 'annule') p.paragraphe(`CERTIFICAT ANNULÉ le ${fmtDate(aujourdhuiTunis(new Date(c.annulation.le)))}${c.annulation.motif ? ` : ${c.annulation.motif}` : ''}`, { taille: 11, gras: true, couleur: COULEURS.alerte });
  p.y += 4;
  const bloc = (titre, lignes) => {
    p.assurer(16 + lignes.length * 12);
    p.rangee([{ t: titre, gras: true }], [LARGEUR], { taille: 8.5, fond: COULEURS.fond });
    for (const [libelle, valeur] of lignes) p.rangee([{ t: libelle, couleur: COULEURS.gris }, { t: valeur || '—' }], [150, LARGEUR - 150], { taille: 8.5 });
    p.y += 6;
  };
  bloc('A. Personne ou organisme payeur', [['Identifiant', d.matricule ? `Matricule fiscal ${d.matricule}` : ''], ['Dénomination', d.nom], ['Adresse', d.adresse]]);
  p.assurer(40);
  p.rangee([{ t: 'B. Retenues effectuées', gras: true }], [LARGEUR], { taille: 8.5, fond: COULEURS.fond });
  const enTete = () => {
    p.rangee([{ t: 'Pièce' }, { t: 'Facture' }, { t: 'Nature (code TEJ)' }, { t: 'Hors taxes', aligner: 'right' }, { t: 'TVA', aligner: 'right' }, { t: 'TTC', aligner: 'right' }, { t: 'Taux', aligner: 'right' }, { t: 'Retenue', aligner: 'right' }, { t: 'Net servi', aligner: 'right' }], COL_OPS, { taille: 7, gras: true, couleur: COULEURS.gris });
    p.filet(p.y);
  };
  enTete();
  for (const o of c.operations) {
    const cellules = [
      { t: o.reference }, { t: fmtDate(o.dateFacture) }, { t: `${o.libelleCode || o.code} (${o.codeTej})` }, { t: fmt(o.ht), aligner: 'right' }, { t: fmt(o.tva), aligner: 'right' },
      { t: fmt(o.ttc), aligner: 'right' }, { t: fmtTaux(o.tauxRs), aligner: 'right' }, { t: fmt(o.rs), aligner: 'right' }, { t: fmt(o.net), aligner: 'right' },
    ];
    p.assurer(p.hauteurRangee(cellules, COL_OPS, 7.5), enTete);
    p.rangee(cellules, COL_OPS, { taille: 7.5 });
    if (o.rsTva) p.rangee([{ t: '' }, { t: '' }, { t: `Retenue de TVA ${o.rsTva.code} (${fmtTaux(o.rsTva.taux)})` }, { t: '' }, { t: '' }, { t: '' }, { t: '' }, { t: fmt(o.rsTva.montant), aligner: 'right' }, { t: '' }], COL_OPS, { taille: 7.5, couleur: COULEURS.gris });
  }
  p.filet(p.y);
  p.rangee([{ t: 'Total' }, { t: '' }, { t: `${c.operations.length} opération${c.operations.length > 1 ? 's' : ''}` }, { t: fmt(c.totaux.ht), aligner: 'right' }, { t: fmt(c.totaux.tva), aligner: 'right' }, { t: fmt(c.totaux.ttc), aligner: 'right' }, { t: '' }, { t: fmt(texte(millimes(c.totaux.rs) + millimes(c.totaux.taxes))), aligner: 'right' }, { t: fmt(c.totaux.net), aligner: 'right' }], COL_OPS, { taille: 7.5, gras: true, fond: COULEURS.bande });
  p.y += 8;
  bloc('C. Bénéficiaire', [['Identifiant', texteIdentifiant(b.identifiant)], ['Nom ou raison sociale', b.nom], ['Adresse', b.adresse], ['Résident en Tunisie', b.resident ? 'Oui' : 'Non']]);
  p.paragraphe('Je soussigné certifie exacts les renseignements figurant sur le présent certificat et m\'expose aux sanctions prévues par la loi pour toute inexactitude.', { taille: 8.5 });
  p.y += 6;
  p.assurer(60);
  const lieu = String(dossierVille || '').replace(/^\d+\s*/, '').trim();
  p.texte(`${lieu ? `${lieu}, le` : 'Le'} ${fmtDate(aujourdhuiTunis(new Date(c.produitLe)))}`, MARGE + LARGEUR / 2, p.y, { taille: 9, largeur: LARGEUR / 2 });
  p.y += 14;
  p.texte('Cachet et signature du payeur', MARGE + LARGEUR / 2, p.y, { taille: 8.5, gras: true, largeur: LARGEUR / 2 });
  p.y += 46;
  p.paragraphe('Document préparé par LabFlow Compta : depuis 2026, le certificat qui fait foi s\'établit sur la plateforme TEJ (tej.finances.gov.tn, article 55 du code de l\'IRPP et de l\'IS) ; ce document en reprend le contenu.', { taille: 7.5, couleur: COULEURS.gris });
};
// Un ou plusieurs certificats (une page chacun au moins). → Promise<Buffer>.
const construireCertificats = (certificats, { dossier }) => {
  const premier = certificats[0];
  const p = creerDocument({ titre: certificats.length > 1 ? `Certificats de retenue - ${dossier.nom}` : `Certificat ${premier.reference} - ${dossier.nom}`, suite: certificats.length > 1 ? 'Certificats de retenue' : `Certificat ${premier.reference}` });
  certificats.forEach((c, i) => {
    if (i > 0) { p.doc.addPage(); p.y = MARGE; }
    dessinerCertificat(p, c, { dossierVille: dossier.ville });
  });
  return p.finir(`LabFlow Compta · ${dossier.nom} · ${certificats.length > 1 ? `${certificats.length} certificats de retenue` : `certificat ${premier.reference} du ${fmtDate(premier.datePaiement)}`}`);
};

// ── Lecture des demandes ────────────────────────────────────────────────────────────────────────────────────────────
// { paiements: [{ tiersId, date, ecritures: [id…] }] } : un certificat par paiement ; date AAAA-MM-JJ, jamais après
// aujourd'hui (à Tunis) ; une pièce dans un seul paiement. Tout est contrôlé avant la moindre requête.
const lirePaiements = (corps, aujourdhui = aujourdhuiTunis()) => {
  if (!corps || typeof corps !== 'object' || !Array.isArray(corps.paiements) || !corps.paiements.length) throw erreur(400, 'Choisissez les paiements à certifier', 'PAIEMENTS_REQUIS');
  if (corps.paiements.length > PAIEMENTS_MAX) throw erreur(400, `${PAIEMENTS_MAX} certificats au plus à la fois`);
  const vues = new Set();
  const total = corps.paiements.reduce((t, p) => t + (p && Array.isArray(p.ecritures) ? p.ecritures.length : 0), 0);
  if (total > OPERATIONS_MAX) throw erreur(400, `${OPERATIONS_MAX} pièces au plus par production`);
  return corps.paiements.map((p, i) => {
    const n = `Paiement ${i + 1}`;
    if (!p || typeof p !== 'object') throw erreur(400, `${n} : requête invalide`);
    if (!idValide(p.tiersId)) throw erreur(400, `${n} : bénéficiaire invalide`);
    if (!dateValide(p.date)) throw erreur(400, `${n} : date du paiement invalide (AAAA-MM-JJ)`, 'DATE_PAIEMENT');
    if (p.date > aujourdhui) throw erreur(400, `${n} : la date du paiement (${fmtDate(p.date)}) est postérieure à aujourd'hui`, 'DATE_PAIEMENT');
    if (p.date < '2000-01-01') throw erreur(400, `${n} : date du paiement trop ancienne`, 'DATE_PAIEMENT');
    if (!Array.isArray(p.ecritures) || !p.ecritures.length) throw erreur(400, `${n} : aucune pièce`);
    if (p.ecritures.length > PIECES_PAR_PAIEMENT_MAX) throw erreur(400, `${n} : ${PIECES_PAR_PAIEMENT_MAX} pièces au plus`);
    const ecritures = p.ecritures.map((id) => {
      if (!idValide(id)) throw erreur(400, `${n} : pièce invalide`);
      if (vues.has(Number(id))) throw erreur(400, 'Une même pièce est dans deux paiements', 'PIECE_EN_DOUBLE');
      vues.add(Number(id));
      return Number(id);
    });
    return { tiersId: Number(p.tiersId), date: p.date, ecritures };
  });
};
const lireMotif = (v) => {
  if (v != null && typeof v !== 'string') throw erreur(400, 'Motif : requête invalide');
  const s = String(v ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!s) throw erreur(400, 'Indiquez le motif de l\'annulation', 'MOTIF_REQUIS');
  if (s.length > MOTIF_MAX) throw erreur(400, `Motif : ${MOTIF_MAX} caractères au plus`);
  if (HORS_W1252.test(s)) throw erreur(400, 'Motif : caractères latins seulement (il s\'imprime sur le certificat)');
  return s;
};
// { annee, mois, attendu? } — `attendu` : { acte, nbAjouts, nbAnnulations } montrés à la confirmation (relecture : le serveur
// refuse en 409 si le fichier a changé entre-temps, par exemple après une production par une autre personne).
const lireMois = (corps) => {
  const annee = Number(corps?.annee);
  const mois = Number(corps?.mois);
  if (!Number.isInteger(annee) || annee < 2000 || annee > 2099 || !Number.isInteger(mois) || mois < 1 || mois > 12) throw erreur(400, 'Mois du fichier invalide (année, mois)', 'MOIS_INVALIDE');
  const a = corps?.attendu;
  let attendu = null;
  if (a != null) {
    const n = (v) => (Number.isInteger(v) && v >= 0 && v <= 100000 ? v : NaN);
    attendu = { acte: n(a.acte), nbAjouts: n(a.nbAjouts), nbAnnulations: n(a.nbAnnulations) };
    if (Object.values(attendu).some(Number.isNaN) || ![0, 1].includes(attendu.acte)) throw erreur(400, 'Fichier attendu : requête invalide');
  }
  return { annee, mois, attendu };
};

// ── Écritures ───────────────────────────────────────────────────────────────────────────────────────────────────────
const ecritureCertificats = (req, travail) => dansEspaceDuDossier(req.user, req.params.dossierId, async (db, acces, d) => {
  if (!droits(acces).configurer) throw erreur(403, MSG_CERTIFICATS, 'NIVEAU_INSUFFISANT');
  if (d.etat === 'archive') throw erreur(409, 'Dossier archivé : désarchivez-le d\'abord', 'DOSSIER_ARCHIVE');
  return travail(db, acces, d);
});

// POST /api/compta/dossiers/:dossierId/certificats — { paiements: [{ tiersId, date, ecritures }] } : un certificat par
// paiement. Chaque pièce : retenue opérée encore à certifier, écriture validée, sans problème, du bénéficiaire annoncé ;
// bénéficiaire et déclarant complets pour la plateforme ; numéro suivant de l'année du paiement ; tout ou rien. → 201
// { produits: [{ id, reference, tiers, date, rs }] }.
const produire = async (req, res) => {
  try {
    const demande = lirePaiements(req.body || {});
    const resultat = await ecritureCertificats(req, async (db, acces, d) => {
      const decl = declarantDe(d);
      if (decl.manque.length) throw erreur(409, `Identité du dossier à compléter pour la plateforme TEJ : ${texteManque(decl.manque)} (fiche du dossier)`, 'DECLARANT_INCOMPLET');
      const { operations, tiers } = await chargerOperations(db, d.id, demande.flatMap((p) => p.ecritures));
      const parPiece = new Map(operations.map((o) => [o.ecritureId, o]));
      const produits = [];
      const prochains = new Map();
      for (const p of demande) {
        const ops = p.ecritures.map((id) => {
          const o = parPiece.get(id);
          if (!o) throw erreur(409, 'Une pièce n\'est plus à certifier (déjà certifiée, contre-passée ou modifiée) : relisez la page', 'PERIME');
          const qui = o.numero || o.reference;
          if (o.etat !== 'validee') throw erreur(409, `L'écriture ${qui} est en brouillard : validez-la d'abord`, 'BROUILLARD');
          if (o.probleme) throw erreur(409, `Pièce ${qui} : ${o.probleme.message}`, o.probleme.code);
          if (o.tiersId !== p.tiersId) throw erreur(409, `La pièce ${qui} n'est pas de ce bénéficiaire : relisez la page`, 'PERIME');
          return o;
        });
        const t = tiers.get(p.tiersId);
        if (!t) throw erreur(409, 'Bénéficiaire introuvable : relisez la page', 'PERIME');
        const b = beneficiaireDe(t, d.pays);
        if (b.manque.length) throw erreur(409, `Fiche du fournisseur ${t.code} à compléter pour la plateforme TEJ : ${texteManque(b.manque)} (page Tiers)`, 'BENEFICIAIRE_INCOMPLET');
        const anneeP = Number(p.date.slice(0, 4));
        if (!prochains.has(anneeP)) prochains.set(anneeP, (await db.query('SELECT COALESCE(MAX(numero), 0)::int + 1 AS n FROM compta.certificats WHERE dossier_id = $1 AND annee = $2', [d.id, anneeP])).rows[0].n);
        const numero = prochains.get(anneeP);
        prochains.set(anneeP, numero + 1);
        const reference = `${anneeP}-${String(numero).padStart(6, '0')}`;
        const figees = ops.map((o) => ({
          ecritureId: o.ecritureId, numero: o.numero, reference: o.reference, journal: o.journal, dateFacture: o.dateFacture, anneeFacturation: o.anneeFacturation,
          code: o.code, libelleCode: o.libelleCode, codeTej: o.codeTej, tauxRs: o.tauxRs, tauxTva: o.tauxTva, ht: o.ht, tva: o.tva, ttc: o.ttc, rs: o.rs, rsTva: o.rsTva, net: o.net, lignes: o.lignes,
        }));
        const tot = totauxDe(ops);
        const source = ops.every((o) => o.dateProposee === p.date) ? (ops.some((o) => o.sourceDate === 'reglement') ? 'reglement' : 'facture') : 'saisie';
        const ins = await db.query(
          `INSERT INTO compta.certificats (dossier_id, tiers_id, annee, numero, reference, date_paiement, source_date, beneficiaire, declarant, operations, total_ht, total_tva, total_ttc, total_rs, total_taxes, total_net, produit_par)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id`,
          [d.id, t.id, anneeP, numero, reference, p.date, source, JSON.stringify(b.fige), JSON.stringify(decl.fige), JSON.stringify(figees), tot.ht, tot.tva, tot.ttc, tot.rs, tot.taxes, tot.net, req.user.id]
        );
        const lignes = ops.flatMap((o) => o.lignes);
        await db.query('INSERT INTO compta.certificat_lignes (certificat_id, ligne_id) SELECT $1, unnest($2::int[])', [ins.rows[0].id, lignes]);
        produits.push({ id: ins.rows[0].id, reference, tiers: t.code, tiersId: t.id, date: p.date, rs: tot.rs, operations: ops.length, pieces: ops.map((o) => o.numero || o.reference) });
      }
      await journaliser(db, acces.espace_id, req.user.id, 'certificats_produits', { dossier: d.id, certificats: produits });
      return { produits: produits.map(({ pieces: _p, ...x }) => x) };
    });
    res.status(201).json(resultat);
  } catch (err) {
    repondreErreur(res, err && err.code === '23505' ? erreur(409, 'Une pièce vient d\'être certifiée par ailleurs : relisez la page', 'PERIME') : err, '[compta.certificats.produire]');
  }
};

// POST /api/compta/dossiers/:dossierId/certificats/:certificatId/annuler — { motif } : le certificat reste (numéro gardé),
// marqué annulé ; ses lignes redeviennent à certifier ; déjà déposé dans un fichier, il part dans le rectificatif suivant.
const annuler = async (req, res) => {
  try {
    if (!idValide(req.params.certificatId)) throw erreur(404, 'Certificat introuvable', 'CERTIFICAT_INTROUVABLE');
    const motif = lireMotif((req.body || {}).motif);
    const resultat = await ecritureCertificats(req, async (db, acces, d) => {
      const c = (await db.query('SELECT id, reference, etat, fichier_id, tiers_id, beneficiaire, total_rs::text AS total_rs FROM compta.certificats WHERE dossier_id = $1 AND id = $2 FOR UPDATE', [d.id, req.params.certificatId])).rows[0];
      if (!c) throw erreur(409, 'Certificat introuvable : relisez la page', 'CERTIFICAT_INTROUVABLE');
      if (c.etat === 'annule') throw erreur(409, `Le certificat ${c.reference} est déjà annulé : relisez la page`, 'DEJA_ANNULE');
      await db.query('UPDATE compta.certificats SET etat = \'annule\', annule_par = $2, annule_le = NOW(), motif_annulation = $3 WHERE id = $1', [c.id, req.user.id, motif]);
      await db.query('UPDATE compta.certificat_lignes SET actif = false WHERE certificat_id = $1', [c.id]);
      await journaliser(db, acces.espace_id, req.user.id, 'certificat_annule', { dossier: d.id, certificat: c.id, reference: c.reference, tiers: c.beneficiaire.code, rs: c.total_rs, motif, depose: !!c.fichier_id });
      return { annule: { id: c.id, reference: c.reference, depose: !!c.fichier_id } };
    });
    res.json(resultat);
  } catch (err) {
    repondreErreur(res, err, '[compta.certificats.annuler]');
  }
};

// POST /api/compta/dossiers/:dossierId/fichiers-tej — { annee, mois } : le fichier XML du mois de paiement (acte 0, puis
// 1), gardé et journalisé ; les certificats qu'il contient sont marqués. → le fichier (application/xml), à déposer sur
// la plateforme (à essayer d'abord : réponse 5 du 09/10).
const produireFichier = async (req, res) => {
  try {
    const { annee, mois, attendu } = lireMois(req.body || {});
    const f = await ecritureCertificats(req, async (db, acces, d) => {
      const decl = declarantDe(d);
      if (decl.manque.length) throw erreur(409, `Identité du dossier à compléter pour la plateforme TEJ : ${texteManque(decl.manque)} (fiche du dossier)`, 'DECLARANT_INCOMPLET');
      const { acte, ajouts, annulations } = await prochainFichier(db, d.id, annee, mois);
      if (!ajouts.length && !annulations.length) throw erreur(409, `Rien à déposer pour ${String(mois).padStart(2, '0')}/${annee} : tous les certificats du mois sont déjà dans un fichier`, 'RIEN_A_DEPOSER');
      if (ajouts.length) {
        const cp = (await db.query(SQL_AJOUTS_CONTREPASSES, [d.id, ajouts.map((c) => c.id)])).rows.map((r) => r.reference);
        if (cp.length) throw erreur(409, `${cp.length > 1 ? 'Les certificats' : 'Le certificat'} ${cp.join(', ')} ${cp.length > 1 ? 'portent' : 'porte'} une pièce contre-passée depuis : annulez-${cp.length > 1 ? 'les' : 'le'} avant de produire le fichier`, 'CERTIFICAT_CONTREPASSE');
      }
      if (attendu && (attendu.acte !== acte || attendu.nbAjouts !== ajouts.length || attendu.nbAnnulations !== annulations.length)) throw erreur(409, `Le fichier du mois a changé depuis l'affichage (${acte === 0 ? 'dépôt initial' : 'rectificatif'} : ${ajouts.length} certificat${ajouts.length > 1 ? 's' : ''}, ${annulations.length} annulation${annulations.length > 1 ? 's' : ''}) : relisez la page`, 'PERIME');
      const { nom, contenu } = construireXml({ declarant: decl.fige, annee, mois, acte, ajouts, annulations, versionSchema: fiscaliteDe(d.pays)?.tej?.versionSchema || '1.0' });
      const empreinte = crypto.createHash('sha256').update(contenu, 'utf8').digest('hex');
      const ins = await db.query(
        'INSERT INTO compta.fichiers_tej (dossier_id, annee, mois, acte, nom, contenu, empreinte, nb_ajouts, nb_annulations, produit_par) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id',
        [d.id, annee, mois, acte, nom, contenu, empreinte, ajouts.length, annulations.length, req.user.id]
      );
      const id = ins.rows[0].id;
      if (ajouts.length) await db.query('UPDATE compta.certificats SET fichier_id = $2 WHERE dossier_id = $1 AND id = ANY($3)', [d.id, id, ajouts.map((c) => c.id)]);
      if (annulations.length) await db.query('UPDATE compta.certificats SET annulation_fichier_id = $2 WHERE dossier_id = $1 AND id = ANY($3)', [d.id, id, annulations.map((c) => c.id)]);
      await journaliser(db, acces.espace_id, req.user.id, 'fichier_tej_produit', { dossier: d.id, fichier: id, nom, acte, annee, mois, empreinte, ajouts: ajouts.map((c) => c.reference), annulations: annulations.map((c) => c.reference) });
      return { nom, contenu };
    });
    envoyerXml(res, f.contenu, f.nom);
  } catch (err) {
    repondreErreur(res, err, '[compta.certificats.produireFichier]');
  }
};
const envoyerXml = (res, contenu, nom) => {
  const corps = Buffer.from(contenu, 'utf8');
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nom}"`);
  res.setHeader('Content-Length', String(corps.length));
  res.send(corps);
};

// POST /api/compta/dossiers/:dossierId/fichiers-tej/:fichierId/retirer — { motif } : un fichier REFUSÉ par la plateforme
// (« à essayer » : réponse 5 du 09/10) se retire — le DERNIER fichier non retiré de son mois seulement ; ses certificats
// redeviennent « à mettre dans un fichier » (et ses annulations « à déclarer ») ; le fichier reste lisible, marqué retiré ;
// un dépôt initial retiré se refait (acte 0). Journal `fichier_tej_retire`.
const retirerFichier = async (req, res) => {
  try {
    if (!idValide(req.params.fichierId)) throw erreur(404, 'Fichier introuvable', 'FICHIER_INTROUVABLE');
    const motif = lireMotif((req.body || {}).motif);
    const resultat = await ecritureCertificats(req, async (db, acces, d) => {
      const f = (await db.query('SELECT id, annee, mois, acte, nom, retire_le FROM compta.fichiers_tej WHERE dossier_id = $1 AND id = $2 FOR UPDATE', [d.id, req.params.fichierId])).rows[0];
      if (!f) throw erreur(409, 'Fichier introuvable : relisez la page', 'FICHIER_INTROUVABLE');
      if (f.retire_le) throw erreur(409, `Le fichier ${f.nom} est déjà retiré : relisez la page`, 'DEJA_RETIRE');
      const suivant = (await db.query('SELECT nom FROM compta.fichiers_tej WHERE dossier_id = $1 AND annee = $2 AND mois = $3 AND id > $4 AND retire_le IS NULL ORDER BY id LIMIT 1', [d.id, f.annee, f.mois, f.id])).rows[0];
      if (suivant) throw erreur(409, `Un fichier plus récent du mois existe (${suivant.nom}) : retirez d'abord celui-là`, 'PAS_LE_DERNIER');
      const ajouts = (await db.query('UPDATE compta.certificats SET fichier_id = NULL WHERE dossier_id = $1 AND fichier_id = $2 RETURNING reference', [d.id, f.id])).rows.map((r) => r.reference);
      const annulations = (await db.query('UPDATE compta.certificats SET annulation_fichier_id = NULL WHERE dossier_id = $1 AND annulation_fichier_id = $2 RETURNING reference', [d.id, f.id])).rows.map((r) => r.reference);
      await db.query('UPDATE compta.fichiers_tej SET retire_par = $2, retire_le = NOW(), motif_retrait = $3 WHERE id = $1', [f.id, req.user.id, motif]);
      await journaliser(db, acces.espace_id, req.user.id, 'fichier_tej_retire', { dossier: d.id, fichier: f.id, nom: f.nom, acte: f.acte, annee: f.annee, mois: f.mois, motif, ajouts, annulations });
      return { retire: { id: f.id, nom: f.nom, acte: f.acte, ajouts: ajouts.length, annulations: annulations.length } };
    });
    res.json(resultat);
  } catch (err) {
    repondreErreur(res, err, '[compta.certificats.retirerFichier]');
  }
};

// ── Lectures (routes) ───────────────────────────────────────────────────────────────────────────────────────────────
// GET …/fichiers-tej/:fichierId — un fichier déjà produit, à l'identique (lecture : tout niveau).
const telechargerFichier = async (req, res) => {
  try {
    if (!idValide(req.params.fichierId)) throw erreur(404, 'Fichier introuvable');
    const { d } = await lectureDossier(req.user, req.params.dossierId);
    const f = (await pool.query('SELECT nom, contenu FROM compta.fichiers_tej WHERE dossier_id = $1 AND id = $2', [d.id, req.params.fichierId])).rows[0];
    if (!f) throw erreur(404, 'Fichier introuvable');
    envoyerXml(res, f.contenu, f.nom);
  } catch (err) {
    repondreErreur(res, err, '[compta.certificats.telechargerFichier]');
  }
};
// GET …/certificats/:certificatId/pdf — le certificat, à l'identique (annulé : marqué) ; lecture : tout niveau.
const pdf = async (req, res) => {
  try {
    if (!idValide(req.params.certificatId)) throw erreur(404, 'Certificat introuvable');
    const { d } = await lectureDossier(req.user, req.params.dossierId);
    const r = (await pool.query(`${SQL_CERTIFICAT} WHERE c.dossier_id = $1 AND c.id = $2`, [d.id, req.params.certificatId])).rows[0];
    if (!r) throw erreur(404, 'Certificat introuvable');
    const c = presenterCertificat(r);
    envoyerPdf(res, await construireCertificats([c], { dossier: d }), nomPdf('certificat', `${c.reference}-${c.tiers.code}`, null));
  } catch (err) {
    repondreErreur(res, err, '[compta.certificats.pdf]');
  }
};

module.exports = {
  MSG_CERTIFICATS, OPERATIONS_MAX, PAIEMENTS_MAX, MOTIF_MAX, RE_EMAIL_TEJ, TYPES_TEJ,
  texteTej, tauxTej, dateTej, millimesEntiers, beneficiaireDe, declarantDe, texteManque, lirePaiements, lireMotif, lireMois,
  SQL_TIERS, SQL_CERTIFICAT, SQL_FICHIERS, SQL_A_AJOUTER, SQL_A_ANNULER, SQL_AJOUTS_CONTREPASSES, chargerOperations, presenterCertificat, presenterFichier, certificatsDuMois, fichiersDuMois, prochainFichier, bornesDuMois,
  construireXml, xmlCertificat, construireCertificats, ecritureCertificats,
  produire, annuler, produireFichier, retirerFichier, telechargerFichier, pdf,
};
