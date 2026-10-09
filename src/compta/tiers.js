// LabFlow Compta, étape S5c « Les tiers et les imports » (labflow-reprise/achats-compta/PLAN-S5.md §1, §2, §4 ; SPEC-SOCLE
// D18 ; réponses du client du 07/10 — questions 4, 5 et 6 : code préfixe + chiffres réglable par dossier, tiers sans
// compte individuel dans le plan, import au modèle Excel de LabFlow Compta — et du 08/10 — « ok pour les 4 » : modèle
// des codes réglé sur la page Tiers, retenue par défaut = un code de taxe de type retenue, le niveau Saisie crée et
// modifie des tiers). Les tiers d'un dossier (compta.tiers : fournisseurs et clients) : lecture par pages avec recherche
// (code, nom, matricule), création (code saisi ou généré d'après le modèle du dossier : préfixe + numéro suivant),
// modification (le code tant que le tiers n'a pas d'écriture), désactivation, réactivation, suppression sans écriture,
// modèle des codes, import Excel TOUT-OU-RIEN (importExcel.js : toutes les lignes contrôlées, puis une transaction ou
// rien), export Excel à la charte. Le tiers est une dimension de la ligne d'écriture (compte collectif + tiers) : aucun
// compte individuel dans le plan. Routes (D3) : /api/compta/dossiers/:dossierId/tiers… ; chaque écriture passe par la
// transaction verrouillée du dossier (dansEspaceDuDossier : comptabilité verrouillée, dossier relu sous verrou, garde par
// comptabilité D4), puis par les droits (créer, modifier, désactiver, réactiver : titulaire, Complet ou Saisie ;
// supprimer, modèle des codes, import : titulaire ou Complet) et l'état du dossier. « Sans écriture » :
// tiersMouvemente lit compta.lignes depuis S6a (les écritures en brouillard comptent). S7b (PLAN-S7 §2 « S7b », §3 point 4 ;
// migration 219) : le RÉGIME FISCAL d'un fournisseur (liste du paquet : personne morale à l'IS de 25, 20, 15 ou 10 %,
// personne physique au réel, à déduction des 2/3, au forfait), qui propose sa retenue (achats, honoraires) et donne sa
// catégorie (PM / PP) sur la plateforme TEJ ; sa RÉSIDENCE ; l'IDENTIFIANT DE SECOURS d'un bénéficiaire sans matricule
// fiscal (CIN, passeport, carte de séjour, autre identifiant ; date de naissance, pays) — en saisie, à l'import (colonnes
// facultatives après celles de S5c : un ancien modèle s'importe encore) et à l'export.
const ExcelJS = require('exceljs');
const pool = require('../config/database');
const { journaliser } = require('./journal');
const { modeTitulaire, etatAbonnement } = require('./garde');
const { erreur, idValide, repondreErreur } = require('./comptablesClient');
const { controlerMatriculeFiscal } = require('../utils/matriculeFiscal');
const {
  TYPES_TIERS, TYPES_TIERS_LIBELLES, NATURE_PAR_TYPE_TIERS, REGIMES_TVA_TIERS, REGIMES_TVA_TIERS_LIBELLES, NATURES_LIBELLES,
  CODE_TIERS_MIN, CODE_TIERS_MAX, RE_CODE_TIERS, RE_PREFIXE_TIERS, PREFIXE_TIERS_MAX, CHIFFRES_TIERS_MIN, CHIFFRES_TIERS_MAX, DELAI_PAIEMENT_MAX, paquetDe,
  RE_REGIME_FISCAL, TYPES_IDENTIFIANT, TYPES_IDENTIFIANT_LIBELLES, fiscaliteDe, regimeFiscalDe,
} = require('./paquets');
const { droits, dateValide, dansEspaceDuDossier } = require('./dossiers');
const { lectureDossier, presenterDossier, HORS_W1252 } = require('./planComptes');
const { SQL_FEUILLE, choixComptes, presenterCompteCourt, compteDuDossier } = require('./configDossier');
const { brandHeader, headerRow, dataRowStyle, brandFooter, finalize } = require('../services/excelBrandService');
const { lireClasseur, modeleClasseur, envoyerClasseur, erreurImport, repondreImport, nomFichier, jourTunis, LIGNES_MAX } = require('./importExcel');

const MSG_TIERS = 'Seul le titulaire ou un gérant de niveau Complet ou Saisie peut créer ou modifier un tiers';
const MSG_CONFIGURER = 'Seul le titulaire ou un gérant de niveau Complet peut supprimer un tiers, régler le modèle des codes ou importer';
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const minuscule = (type) => TYPES_TIERS_LIBELLES[type].toLowerCase();

// ── Lecture des saisies ─────────────────────────────────────────────────────────────────────────────────────────────
const texte = (v) => (v == null ? '' : String(v).normalize('NFC').replace(/\s+/g, ' ').trim());
const lireType = (v) => {
  if (!TYPES_TIERS.includes(v)) throw erreur(400, 'Type de tiers inconnu (fournisseur ou client)');
  return v;
};
// Un texte imprimable (même table que l'identité : un nom de tiers s'imprime sur le grand livre) ; vide = null, sauf
// obligatoire.
const lireTexte = (v, libelle, max, obligatoire = false) => {
  if (v != null && typeof v !== 'string' && typeof v !== 'number') throw erreur(400, `${libelle} : requête invalide`);
  const s = texte(v);
  if (!s) {
    if (obligatoire) throw erreur(400, `${libelle} obligatoire`);
    return null;
  }
  if (s.length > max) throw erreur(400, `${libelle} : ${max} caractères au maximum`);
  if (HORS_W1252.test(s)) throw erreur(400, `${libelle} : caractères latins seulement (les lettres arabes et les émojis ne s'impriment pas sur les états)`);
  return s;
};
const lireNom = (v) => lireTexte(v, 'Nom', 255, true);
// Code : vide = généré d'après le modèle du dossier (null) ; sinon 2 à 10 lettres majuscules ou chiffres (« f0001 » → « F0001 »).
const lireCode = (v) => {
  if (v != null && typeof v !== 'string' && typeof v !== 'number') throw erreur(400, 'Code : requête invalide');
  const s = texte(v).toUpperCase();
  if (!s) return null;
  if (!RE_CODE_TIERS.test(s)) throw erreur(400, `Code : ${CODE_TIERS_MIN} à ${CODE_TIERS_MAX} lettres majuscules ou chiffres`);
  return s;
};
// Matricule fiscal : même contrôle de forme que l'identité (D17) ; vide = null ; avertissement sans lettre de clé.
const lireMatricule = (v) => {
  if (v != null && typeof v !== 'string' && typeof v !== 'number') throw erreur(400, 'Matricule fiscal : requête invalide');
  const mf = controlerMatriculeFiscal(texte(v));
  if (!mf.ok) throw erreur(400, mf.erreur);
  return { valeur: mf.valeur || null, avertissement: mf.avertissement || null };
};
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const lireEmail = (v) => {
  const s = lireTexte(v, 'Email', 255);
  if (s && !RE_EMAIL.test(s)) throw erreur(400, 'Email invalide');
  return s;
};
const lireTelephone = (v) => lireTexte(v, 'Téléphone', 30);
const lireAdresse = (v) => lireTexte(v, 'Adresse', 300);
const lireVille = (v) => lireTexte(v, 'Ville', 120);
// Régime de TVA du tiers : valeur de la liste, ou son libellé (import : « Non assujetti », « exonéré »…) ; vide = assujetti.
const normaliserMot = (s) => texte(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[\s_-]+/g, ' ');
const REGIMES_PAR_MOT = new Map([
  ...REGIMES_TVA_TIERS.map((r) => [normaliserMot(r), r]),
  ...REGIMES_TVA_TIERS.map((r) => [normaliserMot(REGIMES_TVA_TIERS_LIBELLES[r]), r]),
  ['suspension', 'suspension'], ['en suspension', 'suspension'], ['exonere', 'exonere'],
]);
const lireRegimeTva = (v) => {
  if (v == null || v === '') return 'assujetti';
  if (typeof v !== 'string') throw erreur(400, 'Régime de TVA : requête invalide');
  const r = REGIMES_PAR_MOT.get(normaliserMot(v));
  if (!r) throw erreur(400, `Régime de TVA inconnu (${REGIMES_TVA_TIERS.map((x) => { const l = REGIMES_TVA_TIERS_LIBELLES[x]; return l.charAt(0).toLowerCase() + l.slice(1); }).join(', ')})`);
  return r;
};
// Délai de paiement en jours : vide = 0 (comptant) ; entier de 0 à 365.
const lireDelai = (v) => {
  if (v == null || v === '') return 0;
  const s = String(v).trim();
  if (!/^\d{1,3}$/.test(s) || Number(s) > DELAI_PAIEMENT_MAX) throw erreur(400, `Délai de paiement : nombre de jours de 0 à ${DELAI_PAIEMENT_MAX}`);
  return Number(s);
};
const lireId = (v, libelle) => {
  if (v == null || v === '') return null;
  if (!idValide(v)) throw erreur(400, `${libelle} : requête invalide`);
  return Number(v);
};
// S7b : le régime fiscal (valeur d'une liste du paquet, vérifiée contre le pays du dossier dans la transaction ; vide =
// non renseigné), la résidence (oui par défaut), l'identifiant de secours (type, numéro ; date de naissance et pays selon
// le type — la plateforme TEJ les exige au certificat, la fiche les accepte incomplets).
const lireRegimeFiscal = (v) => {
  if (v == null || v === '') return null;
  if (typeof v !== 'string' || !RE_REGIME_FISCAL.test(v.trim())) throw erreur(400, 'Régime fiscal inconnu');
  return v.trim();
};
const exigerRegimeFiscal = (d, valeur) => {
  if (valeur && !regimeFiscalDe(d.pays, valeur)) throw erreur(400, 'Régime fiscal inconnu pour ce pays');
};
const OUI = ['oui', 'o', '1', 'true', 'vrai', 'resident', 'resident en tunisie'];
const NON = ['non', 'n', '0', 'false', 'faux', 'non resident'];
const lireResident = (v) => {
  if (v == null || v === '') return true;
  if (typeof v === 'boolean') return v;
  if (typeof v !== 'string' && typeof v !== 'number') throw erreur(400, 'Résident : requête invalide');
  const m = normaliserMot(String(v));
  if (OUI.includes(m)) return true;
  if (NON.includes(m)) return false;
  throw erreur(400, 'Résident : oui ou non');
};
const TYPES_IDENTIFIANT_PAR_MOT = new Map([
  ...TYPES_IDENTIFIANT.map((t) => [normaliserMot(t), t]),
  ...TYPES_IDENTIFIANT.map((t) => [normaliserMot(TYPES_IDENTIFIANT_LIBELLES[t]), t]),
  ['carte d identite', 'cin'], ['carte d identite nationale', 'cin'], ['carte de sejour', 'carte_sejour'], ['autre', 'autre'], ['autre identifiant', 'autre'],
]);
const RE_NUMERO_IDENTIFIANT = /^[A-Z0-9][A-Z0-9 ./-]{0,29}$/;
// Une date de naissance : « AAAA-MM-JJ » ou « JJ/MM/AAAA » (import) → AAAA-MM-JJ.
const lireNaissance = (v) => {
  if (v == null || v === '') return null;
  if (typeof v !== 'string') throw erreur(400, 'Date de naissance : requête invalide');
  const s = v.trim();
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  const iso = m ? `${m[3]}-${m[2]}-${m[1]}` : s;
  if (!dateValide(iso) || iso < '1900-01-01' || iso > jourIso()) throw erreur(400, 'Date de naissance invalide (JJ/MM/AAAA)');
  return iso;
};
const jourIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tunis', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
// { type, numero, naissance, pays } ou null → les quatre colonnes (toutes nulles sans type).
const lireIdentifiant = (v) => {
  const vide = { id_type: null, id_numero: null, id_naissance: null, id_pays: null };
  if (v == null || v === '') return vide;
  if (typeof v !== 'object' || Array.isArray(v)) throw erreur(400, 'Identifiant : requête invalide');
  if (v.type == null || v.type === '') return vide;
  const type = typeof v.type === 'string' ? TYPES_IDENTIFIANT_PAR_MOT.get(normaliserMot(v.type)) : null;
  if (!type) throw erreur(400, `Type d'identifiant inconnu (${TYPES_IDENTIFIANT.map((t) => TYPES_IDENTIFIANT_LIBELLES[t].toLowerCase()).join(', ')})`);
  const brut = typeof v.numero === 'string' || typeof v.numero === 'number' ? texte(v.numero).toUpperCase() : '';
  const numero = type === 'cin' ? brut.replace(/\s/g, '') : brut;
  if (!numero) throw erreur(400, "Numéro d'identifiant obligatoire avec son type");
  if (type === 'cin' && !/^\d{8}$/.test(numero)) throw erreur(400, 'Numéro de CIN : 8 chiffres');
  if (!RE_NUMERO_IDENTIFIANT.test(numero)) throw erreur(400, "Numéro d'identifiant : 30 lettres, chiffres, espaces, points, barres ou tirets au plus");
  let pays = null;
  if (v.pays != null && v.pays !== '') {
    if (typeof v.pays !== 'string' || !/^[A-Za-z]{2}$/.test(v.pays.trim())) throw erreur(400, 'Pays : code à deux lettres (TN, FR, DZ…)');
    pays = v.pays.trim().toUpperCase();
  }
  // Relecture : un champ que le type n'emploie pas (pays d'une CIN, naissance d'un « autre identifiant ») n'est pas gardé.
  return { id_type: type, id_numero: numero, id_naissance: type === 'autre' ? null : lireNaissance(v.naissance), id_pays: type === 'cin' ? null : pays };
};
// Les champs d'un tiers lus dans le corps : `partiel` (modification) : seuls les champs présents.
// → { valeurs: { colonne: valeur }, compteId (undefined = absent), retenueId (undefined = absent), avertissements }
const CHAMPS = [
  ['code', 'code', lireCode], ['nom', 'nom', lireNom], ['adresse', 'adresse', lireAdresse], ['ville', 'ville', lireVille],
  ['telephone', 'telephone', lireTelephone], ['email', 'email', lireEmail], ['regimeTva', 'regime_tva', lireRegimeTva], ['delaiPaiement', 'delai_paiement', lireDelai],
  // S7b
  ['regimeFiscal', 'regime_fiscal', lireRegimeFiscal], ['resident', 'resident', lireResident],
];
// Le nom d'un champ dans le journal des événements (D16), quand il diffère de la colonne.
const CLES_JOURNAL = { matricule_fiscal: 'matricule', regime_tva: 'regimeTva', delai_paiement: 'delaiPaiement', regime_fiscal: 'regimeFiscal', id_type: 'identifiantType', id_numero: 'identifiantNumero', id_naissance: 'identifiantNaissance', id_pays: 'identifiantPays' };
const lireChamps = (corps, partiel = false) => {
  if (!corps || typeof corps !== 'object') throw erreur(400, 'Tiers : requête invalide');
  const valeurs = {};
  const avertissements = [];
  for (const [champ, colonne, lire] of CHAMPS) {
    if (partiel && !hasOwn(corps, champ)) continue;
    valeurs[colonne] = lire(corps[champ]);
  }
  if (!partiel || hasOwn(corps, 'matriculeFiscal')) {
    const mf = lireMatricule(corps.matriculeFiscal);
    valeurs.matricule_fiscal = mf.valeur;
    if (mf.avertissement) avertissements.push(mf.avertissement);
  }
  // S7b : l'identifiant de secours voyage d'un bloc (les quatre colonnes ensemble).
  if (!partiel || hasOwn(corps, 'identifiant')) Object.assign(valeurs, lireIdentifiant(corps.identifiant));
  return {
    valeurs,
    compteId: partiel && !hasOwn(corps, 'compteId') ? undefined : lireId(corps.compteId, 'Compte collectif'),
    retenueId: partiel && !hasOwn(corps, 'retenueId') ? undefined : lireId(corps.retenueId, 'Retenue par défaut'),
    avertissements,
  };
};
// Modèle des codes : { prefixeFournisseur?, prefixeClient?, chiffres? } (champs présents seulement).
const lirePrefixe = (v, libelle) => {
  if (v != null && typeof v !== 'string') throw erreur(400, `${libelle} : requête invalide`);
  const s = texte(v).toUpperCase();
  if (!RE_PREFIXE_TIERS.test(s)) throw erreur(400, `${libelle} : 0 à ${PREFIXE_TIERS_MAX} lettres majuscules ou chiffres`);
  return s;
};
const lireModele = (corps) => {
  if (!corps || typeof corps !== 'object') throw erreur(400, 'Modèle des codes : requête invalide');
  const m = {};
  if (hasOwn(corps, 'prefixeFournisseur')) m.tiers_prefixe_fournisseur = lirePrefixe(corps.prefixeFournisseur, 'Préfixe des fournisseurs');
  if (hasOwn(corps, 'prefixeClient')) m.tiers_prefixe_client = lirePrefixe(corps.prefixeClient, 'Préfixe des clients');
  if (hasOwn(corps, 'chiffres')) {
    const s = String(corps.chiffres ?? '').trim();
    if (!/^\d$/.test(s) || Number(s) < CHIFFRES_TIERS_MIN || Number(s) > CHIFFRES_TIERS_MAX) throw erreur(400, `Nombre de chiffres : de ${CHIFFRES_TIERS_MIN} à ${CHIFFRES_TIERS_MAX}`);
    m.tiers_chiffres = Number(s);
  }
  if (!Object.keys(m).length) throw erreur(400, 'Rien à modifier');
  return m;
};

// ── Modèle des codes et code généré ─────────────────────────────────────────────────────────────────────────────────
const modeleDe = (d) => ({ prefixes: { fournisseur: d.tiers_prefixe_fournisseur, client: d.tiers_prefixe_client }, chiffres: d.tiers_chiffres });
const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Le prochain code libre d'un type d'après le modèle : préfixe + (plus grand numéro déjà pris sous ce modèle + 1), sur
// `chiffres` chiffres ; null quand la série est pleine (9999 pris sur 4 chiffres : changer le modèle).
const prochainCode = (modele, type, codesPris) => {
  const prefixe = modele.prefixes[type];
  const n = modele.chiffres;
  const re = new RegExp(`^${echapper(prefixe)}(\\d{${n}})$`);
  let max = 0;
  for (const c of codesPris) {
    const m = re.exec(c);
    if (m) max = Math.max(max, Number(m[1]));
  }
  const suivant = max + 1;
  if (suivant > 10 ** n - 1) return null;
  return `${prefixe}${String(suivant).padStart(n, '0')}`;
};
// Générateur de codes pour une série (import) : chaque code rendu est ajouté aux codes pris.
const generateurCodes = (modele, type, codesPris) => () => {
  const c = prochainCode(modele, type, codesPris);
  if (!c) throw erreur(409, `Plus de code libre pour les ${minuscule(type)}s avec le modèle ${modele.prefixes[type]}${'9'.repeat(modele.chiffres)} : changez le modèle des codes`, 'SERIE_PLEINE');
  codesPris.add(c);
  return c;
};
const codesDuType = async (db, dossierId, type) => new Set((await db.query('SELECT code FROM compta.tiers WHERE dossier_id = $1 AND type = $2', [dossierId, type])).rows.map((x) => x.code));

// Un tiers « mouvementé » est porté par au moins une ligne d'écriture (S6a : compta.lignes, migration 215, brouillard
// compris) : son code et son compte collectif ne changent plus, il ne se supprime plus (il se désactive).
const tiersMouvemente = async (db, tiersId) => (await db.query('SELECT 1 FROM compta.lignes WHERE dossier_id = (SELECT dossier_id FROM compta.tiers WHERE id = $1) AND tiers_id = $1 LIMIT 1', [tiersId])).rows.length > 0;

// ── Lectures ────────────────────────────────────────────────────────────────────────────────────────────────────────
const SQL_SELECT = `
  SELECT t.id, t.type, t.code, t.nom, t.matricule_fiscal, t.adresse, t.ville, t.telephone, t.email, t.regime_tva, t.delai_paiement, t.origine, t.actif, t.created_at, t.updated_at,
         t.regime_fiscal, t.resident, t.id_type, t.id_numero, t.id_naissance::text AS id_naissance, t.id_pays,
         t.compte_id, k.numero AS compte_numero, k.libelle AS compte_libelle, k.nature AS compte_nature, k.actif AS compte_actif, ${SQL_FEUILLE('k')} AS compte_feuille,
         t.retenue_id, x.code AS retenue_code, x.libelle AS retenue_libelle, x.taux::text AS retenue_taux, x.actif AS retenue_actif
    FROM compta.tiers t
    LEFT JOIN compta.comptes k ON k.id = t.compte_id
    LEFT JOIN compta.taxes x ON x.id = t.retenue_id`;
// Conditions de la liste ($1 dossier, $2 type, $3 motif ou '', $4 inactifs aussi) : code, nom ou matricule.
const SQL_FILTRES = `t.dossier_id = $1 AND t.type = $2 AND ($3::text = '' OR t.code ILIKE $3 OR t.nom ILIKE $3 OR t.matricule_fiscal ILIKE $3) AND ($4::boolean OR t.actif)`;
const SQL_LISTE = `${SQL_SELECT}
   WHERE ${SQL_FILTRES}
   ORDER BY t.actif DESC, t.code
   LIMIT $5 OFFSET $6`;
const SQL_UN = `${SQL_SELECT} WHERE t.dossier_id = $1 AND t.id = $2`;
const motifRecherche = (q) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
const presenterRetenue = (x) => (x ? { id: x.id, code: x.code, libelle: x.libelle, taux: x.taux, actif: x.actif } : null);
const presenterTiers = (t, pays = 'TN') => ({
  id: t.id,
  type: t.type,
  typeLibelle: TYPES_TIERS_LIBELLES[t.type] || t.type,
  code: t.code,
  nom: t.nom,
  matriculeFiscal: t.matricule_fiscal,
  adresse: t.adresse,
  ville: t.ville,
  telephone: t.telephone,
  email: t.email,
  compte: t.compte_id ? presenterCompteCourt({ id: t.compte_id, numero: t.compte_numero, libelle: t.compte_libelle, nature: t.compte_nature, actif: t.compte_actif, feuille: t.compte_feuille }) : null,
  regimeTva: t.regime_tva,
  regimeTvaLibelle: REGIMES_TVA_TIERS_LIBELLES[t.regime_tva] || t.regime_tva,
  retenue: t.retenue_id ? presenterRetenue({ id: t.retenue_id, code: t.retenue_code, libelle: t.retenue_libelle, taux: t.retenue_taux, actif: t.retenue_actif }) : null,
  delaiPaiement: t.delai_paiement,
  // S7b : régime fiscal (et sa personne : PM / PP), résidence, identifiant de secours.
  regimeFiscal: t.regime_fiscal || null,
  regimeFiscalLibelle: regimeFiscalDe(pays, t.regime_fiscal)?.libelle || null,
  personne: regimeFiscalDe(pays, t.regime_fiscal)?.personne || null,
  resident: t.resident !== false,
  identifiant: t.id_type ? { type: t.id_type, typeLibelle: TYPES_IDENTIFIANT_LIBELLES[t.id_type] || t.id_type, numero: t.id_numero, naissance: t.id_naissance || null, pays: t.id_pays || null } : null,
  origine: t.origine,
  actif: t.actif,
  creeLe: t.created_at,
  modifieLe: t.updated_at,
});
// Paramètres de la liste : type (fournisseur par défaut), q (100 caractères au plus), inactifs (1 : les désactivés aussi,
// après les actifs), page / limite (25 par défaut, 200 au plus).
const LIMITE_DEFAUT = 25;
const LIMITE_MAX = 200;
const PAGE_MAX = 100000;
const RE_ENTIER = /^\d{1,6}$/;
const lireFiltres = (query = {}) => {
  if (!query || typeof query !== 'object') throw erreur(400, 'Paramètres invalides');
  const type = query.type === undefined || query.type === '' ? 'fournisseur' : lireType(query.type);
  const q = String(query.q ?? '').trim().slice(0, 100);
  const inactifs = ['1', 'true', 'oui'].includes(String(query.inactifs ?? '').toLowerCase());
  const page = query.page === undefined || query.page === '' ? 1 : (RE_ENTIER.test(String(query.page)) ? Number(query.page) : NaN);
  if (!Number.isInteger(page) || page < 1 || page > PAGE_MAX) throw erreur(400, 'Page invalide');
  const limite = query.limite === undefined || query.limite === '' ? LIMITE_DEFAUT : (RE_ENTIER.test(String(query.limite)) ? Number(query.limite) : NaN);
  if (!Number.isInteger(limite) || limite < 1 || limite > LIMITE_MAX) throw erreur(400, `Limite : entier de 1 à ${LIMITE_MAX}`);
  return { type, q, inactifs, page, limite };
};
// Comptes rendus par type (actifs, total) et prochains codes du modèle.
const resumeTiers = async (db, d) => {
  const r = await db.query('SELECT type, code, actif FROM compta.tiers WHERE dossier_id = $1', [d.id]);
  const nb = Object.fromEntries(TYPES_TIERS.map((t) => [t, { actifs: 0, total: 0 }]));
  const codes = Object.fromEntries(TYPES_TIERS.map((t) => [t, new Set()]));
  for (const x of r.rows) {
    nb[x.type].total += 1;
    if (x.actif) nb[x.type].actifs += 1;
    codes[x.type].add(x.code);
  }
  const modele = modeleDe(d);
  return { nb, modele: { ...modele, prochain: Object.fromEntries(TYPES_TIERS.map((t) => [t, prochainCode(modele, t, codes[t])])) } };
};
// Les codes de retenue à la source du dossier (choix de la retenue par défaut) : actifs d'abord.
const retenuesDuDossier = async (db, dossierId) =>
  (await db.query(`SELECT id, code, libelle, taux::text AS taux, actif FROM compta.taxes WHERE dossier_id = $1 AND type = 'retenue' ORDER BY actif DESC, id`, [dossierId])).rows.map(presenterRetenue);
// L'état de la page : le dossier, les droits, le modèle des codes, les comptes rendus, la page demandée, les listes
// fermées, les comptes collectifs possibles (actifs, de nature fournisseurs ou clients), les codes de retenue, l'abonnement.
const etatTiers = async (db, acces, d, f) => {
  const motif = f.q ? motifRecherche(f.q) : '';
  const [page, total, resume, collectifs, retenues, mode] = await Promise.all([
    db.query(SQL_LISTE, [d.id, f.type, motif, f.inactifs, f.limite, (f.page - 1) * f.limite]),
    db.query(`SELECT COUNT(*)::int AS n FROM compta.tiers t WHERE ${SQL_FILTRES}`, [d.id, f.type, motif, f.inactifs]),
    resumeTiers(db, d),
    choixComptes(db, d.id, Object.values(NATURE_PAR_TYPE_TIERS)),
    retenuesDuDossier(db, d.id),
    modeTitulaire(db, acces.espace_id),
  ]);
  return {
    dossier: presenterDossier(acces, d),
    droits: droits(acces),
    modele: resume.modele,
    nb: resume.nb,
    type: f.type,
    q: f.q,
    inactifs: f.inactifs,
    tiers: page.rows.map((t) => presenterTiers(t, d.pays)),
    total: total.rows[0].n,
    page: f.page,
    limite: f.limite,
    types: TYPES_TIERS.map((valeur) => ({ valeur, libelle: TYPES_TIERS_LIBELLES[valeur], nature: NATURE_PAR_TYPE_TIERS[valeur], natureLibelle: NATURES_LIBELLES[NATURE_PAR_TYPE_TIERS[valeur]], collectifDefaut: collectifDefautNumero(d, valeur) })),
    regimes: REGIMES_TVA_TIERS.map((valeur) => ({ valeur, libelle: REGIMES_TVA_TIERS_LIBELLES[valeur] })),
    // S7b : les régimes fiscaux du paquet et les retenues qu'ils proposent (codes actifs du dossier), les familles de
    // codes (achats, honoraires : la fenêtre propose le code de la même famille), les types d'identifiant de secours.
    ...choixFiscaux(d, retenues),
    code: { min: CODE_TIERS_MIN, max: CODE_TIERS_MAX, prefixeMax: PREFIXE_TIERS_MAX, chiffresMin: CHIFFRES_TIERS_MIN, chiffresMax: CHIFFRES_TIERS_MAX },
    delaiMax: DELAI_PAIEMENT_MAX,
    collectifs,
    retenues,
    importMax: LIGNES_MAX,
    etatAbonnement: etatAbonnement(mode),
  };
};
// Le tiers, s'il est dans le dossier ; verrouillé (écriture).
const tiersDe = async (db, dossierId, tiersId) => {
  if (!idValide(tiersId)) throw erreur(404, 'Tiers introuvable');
  const r = await db.query('SELECT * FROM compta.tiers WHERE dossier_id = $1 AND id = $2 FOR UPDATE', [dossierId, tiersId]);
  if (!r.rows.length) throw erreur(404, 'Tiers introuvable');
  return r.rows[0];
};
// S7b : les régimes fiscaux d'un pays par mot (valeur ou libellé normalisés) → valeur (import).
const regimesParMot = (pays) => new Map((fiscaliteDe(pays)?.regimesFiscaux || []).flatMap((r) => [[normaliserMot(r.valeur), r.valeur], [normaliserMot(r.libelle), r.valeur]]));
const lireTiers = async (db, d, tiersId) => presenterTiers((await db.query(SQL_UN, [d.id, tiersId])).rows[0], d.pays);
// S7b : les choix fiscaux de la fenêtre d'un tiers (paquet du pays du dossier, codes de retenue actifs du dossier).
const choixFiscaux = (d, retenues) => {
  const f = fiscaliteDe(d.pays);
  const code = (c) => { const x = retenues.find((r) => r.code === c && r.actif); return x ? { id: x.id, code: x.code, taux: x.taux } : null; };
  return {
    regimesFiscaux: (f?.regimesFiscaux || []).map((r) => ({ valeur: r.valeur, libelle: r.libelle, personne: r.personne, note: r.note || null, retenues: { achats: code(r.achats), honoraires: code(r.honoraires) } })),
    familles: { achats: f?.familles?.achats || [], honoraires: f?.familles?.honoraires || [] },
    typesIdentifiant: TYPES_IDENTIFIANT.map((valeur) => ({ valeur, libelle: TYPES_IDENTIFIANT_LIBELLES[valeur] })),
  };
};
// Le compte collectif par défaut d'un type : numéro donné par le paquet du pays (4011 / 4111 en Tunisie).
const collectifDefautNumero = (d, type) => paquetDe(d.pays)?.tiers?.collectifs?.[type] || null;
// Le compte collectif d'un tiers : choisi (un compte actif du dossier, de la nature du type) ou, sans choix, celui par
// défaut du paquet (actif, sinon « à choisir » : 409).
const compteCollectif = async (db, d, type, compteId) => {
  const nature = NATURE_PAR_TYPE_TIERS[type];
  if (compteId) {
    const k = await compteDuDossier(db, d.id, compteId);
    if (!k) throw erreur(404, 'Compte introuvable');
    if (k.nature !== nature) throw erreur(400, `Choisissez un compte collectif de nature ${NATURES_LIBELLES[nature].toLowerCase()} (${k.numero} est de nature ${NATURES_LIBELLES[k.nature].toLowerCase()})`);
    if (!k.actif) throw erreur(409, `Le compte ${k.numero} est désactivé : réactivez-le d'abord`, 'COMPTE_DESACTIVE');
    return k;
  }
  const numero = collectifDefautNumero(d, type);
  const k = numero ? (await db.query(`SELECT k.id, k.numero, k.libelle, k.nature, k.actif, ${SQL_FEUILLE('k')} AS feuille FROM compta.comptes k WHERE k.dossier_id = $1 AND k.numero = $2 AND k.actif AND k.nature = $3`, [d.id, numero, nature])).rows[0] : null;
  if (!k) throw erreur(409, `Aucun compte collectif par défaut pour un ${minuscule(type)}${numero ? ` (${numero} absent, désactivé ou d'une autre nature)` : ''} : choisissez le compte collectif`, 'COLLECTIF_DEFAUT');
  return k;
};
// La retenue par défaut d'un tiers : un code de taxe du dossier, de type retenue, actif.
const retenueDe = async (db, dossierId, retenueId) => {
  if (!retenueId) return null;
  const r = (await db.query(`SELECT id, code, libelle, taux::text AS taux, type, actif FROM compta.taxes WHERE dossier_id = $1 AND id = $2`, [dossierId, retenueId])).rows[0];
  if (!r) throw erreur(404, 'Code de retenue introuvable');
  if (r.type !== 'retenue') throw erreur(400, `${r.code} n'est pas un code de retenue à la source`);
  if (!r.actif) throw erreur(409, `Le code ${r.code} est désactivé : réactivez-le d'abord (page Taxes)`, 'TAXE_DESACTIVEE');
  return r;
};
// Avertissement « déjà porté » par un autre tiers du dossier (même identifiant à 7 chiffres) : jamais un refus.
const avertissementsMatricule = async (db, dossierId, mf, excludeId = null) => {
  if (!mf) return [];
  const r = await db.query(
    `SELECT type, code, nom FROM compta.tiers WHERE dossier_id = $1 AND matricule_fiscal IS NOT NULL AND LEFT(matricule_fiscal, 7) = LEFT($2, 7) AND ($3::int IS NULL OR id <> $3) ORDER BY id LIMIT 3`,
    [dossierId, mf, excludeId]
  );
  return r.rows.map((x) => `Ce matricule fiscal est déjà porté par le ${minuscule(x.type)} ${x.code} « ${x.nom} »`);
};

// ── Écritures ───────────────────────────────────────────────────────────────────────────────────────────────────────
// Toute écriture : transaction verrouillée du dossier (comptabilité verrouillée, dossier relu sous verrou, garde par
// comptabilité), droit demandé (« tiers » : titulaire, Complet ou Saisie ; « configurer » : titulaire ou Complet),
// dossier non archivé ; puis ce que le travail rend (la liste est paginée : chaque écriture rend le tiers touché et les
// comptes rendus, la page relit ce qu'il lui faut).
const ecritureTiers = (req, travail, droit = 'tiers') => dansEspaceDuDossier(req.user, req.params.dossierId, async (db, acces, d) => {
  if (!droits(acces)[droit]) throw erreur(403, droit === 'configurer' ? MSG_CONFIGURER : MSG_TIERS, 'NIVEAU_INSUFFISANT');
  if (d.etat === 'archive') throw erreur(409, 'Dossier archivé : désarchivez-le d\'abord', 'DOSSIER_ARCHIVE');
  return travail(db, acces, d);
});

// GET /api/compta/dossiers/:dossierId/tiers?type=&q=&inactifs=&page=&limite= — une page (lecture : tout niveau).
const lire = async (req, res) => {
  try {
    const f = lireFiltres(req.query);
    const { acces, d } = await lectureDossier(req.user, req.params.dossierId);
    res.json(await etatTiers(pool, acces, d, f));
  } catch (err) {
    repondreErreur(res, err, '[compta.tiers.lire]');
  }
};

// POST /api/compta/dossiers/:dossierId/tiers — { type, code?, nom, matriculeFiscal?, adresse?, ville?, telephone?, email?,
// compteId?, regimeTva?, retenueId?, delaiPaiement?, regimeFiscal?, resident?, identifiant? } : code généré s'il est vide ;
// compte collectif par défaut s'il n'est pas choisi. → 201 { tiers, avertissements, nb, modele }.
const creer = async (req, res) => {
  try {
    const corps = req.body || {};
    const type = lireType(corps.type);
    const { valeurs, compteId, retenueId, avertissements } = lireChamps(corps);
    const resultat = await ecritureTiers(req, async (db, acces, d) => {
      const codes = await codesDuType(db, d.id, type);
      const code = valeurs.code || generateurCodes(modeleDe(d), type, codes)();
      if (valeurs.code && codes.has(code)) throw erreur(409, `Le ${minuscule(type)} ${code} existe déjà`, 'CODE_EXISTANT');
      const k = await compteCollectif(db, d, type, compteId);
      const x = await retenueDe(db, d.id, retenueId);
      exigerRegimeFiscal(d, valeurs.regime_fiscal);
      const ins = await db.query(
        `INSERT INTO compta.tiers (dossier_id, type, code, nom, matricule_fiscal, adresse, ville, telephone, email, compte_id, regime_tva, retenue_id, delai_paiement, origine, cree_par,
                                   regime_fiscal, resident, id_type, id_numero, id_naissance, id_pays)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'saisi', $14, $15, $16, $17, $18, $19, $20) RETURNING id`,
        [d.id, type, code, valeurs.nom, valeurs.matricule_fiscal, valeurs.adresse, valeurs.ville, valeurs.telephone, valeurs.email, k.id, valeurs.regime_tva, x ? x.id : null, valeurs.delai_paiement, req.user.id,
          valeurs.regime_fiscal, valeurs.resident, valeurs.id_type, valeurs.id_numero, valeurs.id_naissance, valeurs.id_pays]
      );
      await journaliser(db, acces.espace_id, req.user.id, 'tiers_cree', {
        dossier: d.id, tiers: ins.rows[0].id, type, code, nom: valeurs.nom, ...(valeurs.matricule_fiscal ? { matricule: valeurs.matricule_fiscal } : {}), compte: k.numero, ...(x ? { retenue: x.code } : {}), ...(valeurs.code ? {} : { codeGenere: true }),
        ...(valeurs.regime_fiscal ? { regimeFiscal: valeurs.regime_fiscal } : {}), ...(valeurs.resident ? {} : { resident: false }), ...(valeurs.id_type ? { identifiant: `${valeurs.id_type} ${valeurs.id_numero}` } : {}),
      });
      return { tiers: await lireTiers(db, d, ins.rows[0].id), avertissements: [...avertissements, ...await avertissementsMatricule(db, d.id, valeurs.matricule_fiscal, ins.rows[0].id)], ...await resumeTiers(db, d) };
    });
    res.status(201).json(resultat);
  } catch (err) {
    repondreErreur(res, err, '[compta.tiers.creer]');
  }
};

// PUT /api/compta/dossiers/:dossierId/tiers/:tiersId — les champs présents ; le code tant que le tiers n'a pas d'écriture
// (unique dans l'onglet) ; le type ne change pas. Le journal garde, pour chaque champ changé, la valeur d'avant et celle
// d'après (D16) ; rien ne change : ni écriture ni journal. → { tiers, avertissements, nb, modele }.
const modifier = async (req, res) => {
  try {
    const corps = req.body || {};
    const { valeurs, compteId, retenueId, avertissements } = lireChamps(corps, true);
    if (hasOwn(valeurs, 'code') && !valeurs.code) throw erreur(400, `Code : ${CODE_TIERS_MIN} à ${CODE_TIERS_MAX} lettres majuscules ou chiffres`);
    if (!Object.keys(valeurs).length && compteId === undefined && retenueId === undefined) throw erreur(400, 'Rien à modifier');
    const resultat = await ecritureTiers(req, async (db, acces, d) => {
      const t = await tiersDe(db, d.id, req.params.tiersId);
      if (hasOwn(valeurs, 'regime_fiscal')) exigerRegimeFiscal(d, valeurs.regime_fiscal);
      const sets = [];
      const params = [t.id];
      const changements = {};
      const poser = (colonne, cle, valeur, avant, apres) => {
        params.push(valeur);
        sets.push(`${colonne} = $${params.length}`);
        if ((avant ?? null) !== (apres ?? null)) changements[cle] = { avant: avant ?? null, apres: apres ?? null };
      };
      for (const [colonne, valeur] of Object.entries(valeurs)) {
        if (colonne === 'code' && valeur !== t.code) {
          if (await tiersMouvemente(db, t.id)) throw erreur(409, `Le ${minuscule(t.type)} ${t.code} a des écritures : son code ne change plus`, 'TIERS_MOUVEMENTE');
          if ((await db.query('SELECT 1 FROM compta.tiers WHERE dossier_id = $1 AND type = $2 AND code = $3 AND id <> $4', [d.id, t.type, valeur, t.id])).rows.length) throw erreur(409, `Le ${minuscule(t.type)} ${valeur} existe déjà`, 'CODE_EXISTANT');
        }
        poser(colonne, CLES_JOURNAL[colonne] || colonne, valeur, t[colonne], valeur);
      }
      if (compteId !== undefined && compteId !== t.compte_id) {
        if (await tiersMouvemente(db, t.id)) throw erreur(409, `Le ${minuscule(t.type)} ${t.code} a des écritures : son compte collectif ne change plus`, 'TIERS_MOUVEMENTE');
        const avant = (await db.query('SELECT numero FROM compta.comptes WHERE id = $1', [t.compte_id])).rows[0]?.numero;
        const k = await compteCollectif(db, d, t.type, compteId);
        poser('compte_id', 'compte', k.id, avant, k.numero);
      }
      if (retenueId !== undefined && retenueId !== t.retenue_id) {
        const avant = t.retenue_id ? (await db.query('SELECT code FROM compta.taxes WHERE id = $1', [t.retenue_id])).rows[0]?.code : null;
        const x = await retenueDe(db, d.id, retenueId);
        poser('retenue_id', 'retenue', x ? x.id : null, avant, x ? x.code : null);
      }
      if (Object.keys(changements).length) {
        await db.query(`UPDATE compta.tiers SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1`, params);
        await journaliser(db, acces.espace_id, req.user.id, 'tiers_modifie', { dossier: d.id, tiers: t.id, type: t.type, code: changements.code ? changements.code.apres : t.code, changements });
      }
      const mf = hasOwn(valeurs, 'matricule_fiscal') ? valeurs.matricule_fiscal : t.matricule_fiscal;
      return { tiers: await lireTiers(db, d, t.id), avertissements: [...avertissements, ...await avertissementsMatricule(db, d.id, mf, t.id)], ...await resumeTiers(db, d) };
    });
    res.json(resultat);
  } catch (err) {
    repondreErreur(res, err, '[compta.tiers.modifier]');
  }
};

// POST /api/compta/dossiers/:dossierId/tiers/:tiersId/desactiver — tiers actif. Rien n'est effacé.
const desactiver = async (req, res) => {
  try {
    const resultat = await ecritureTiers(req, async (db, acces, d) => {
      const t = await tiersDe(db, d.id, req.params.tiersId);
      if (!t.actif) throw erreur(409, `Le ${minuscule(t.type)} ${t.code} est déjà désactivé`, 'DEJA_FAIT');
      await db.query('UPDATE compta.tiers SET actif = false, updated_at = NOW() WHERE id = $1', [t.id]);
      await journaliser(db, acces.espace_id, req.user.id, 'tiers_desactive', { dossier: d.id, tiers: t.id, type: t.type, code: t.code, nom: t.nom });
      return { tiers: await lireTiers(db, d, t.id), avertissements: [], ...await resumeTiers(db, d) };
    });
    res.json(resultat);
  } catch (err) {
    repondreErreur(res, err, '[compta.tiers.desactiver]');
  }
};

// POST /api/compta/dossiers/:dossierId/tiers/:tiersId/reactiver — tiers désactivé.
const reactiver = async (req, res) => {
  try {
    const resultat = await ecritureTiers(req, async (db, acces, d) => {
      const t = await tiersDe(db, d.id, req.params.tiersId);
      if (t.actif) throw erreur(409, `Le ${minuscule(t.type)} ${t.code} n'est pas désactivé`, 'DEJA_FAIT');
      await db.query('UPDATE compta.tiers SET actif = true, updated_at = NOW() WHERE id = $1', [t.id]);
      await journaliser(db, acces.espace_id, req.user.id, 'tiers_reactive', { dossier: d.id, tiers: t.id, type: t.type, code: t.code, nom: t.nom });
      return { tiers: await lireTiers(db, d, t.id), avertissements: [], ...await resumeTiers(db, d) };
    });
    res.json(resultat);
  } catch (err) {
    repondreErreur(res, err, '[compta.tiers.reactiver]');
  }
};

// DELETE /api/compta/dossiers/:dossierId/tiers/:tiersId — un tiers SANS écriture (titulaire ou Complet) ; sinon il se
// désactive. Le journal garde de quoi l'identifier. → { supprime, nb, modele }.
const supprimer = async (req, res) => {
  try {
    const resultat = await ecritureTiers(req, async (db, acces, d) => {
      const t = await tiersDe(db, d.id, req.params.tiersId);
      if (await tiersMouvemente(db, t.id)) throw erreur(409, `Le ${minuscule(t.type)} ${t.code} a des écritures : il ne se supprime pas, désactivez-le`, 'TIERS_MOUVEMENTE');
      await db.query('DELETE FROM compta.tiers WHERE id = $1', [t.id]);
      await journaliser(db, acces.espace_id, req.user.id, 'tiers_supprime', { dossier: d.id, tiers: t.id, type: t.type, code: t.code, nom: t.nom, ...(t.matricule_fiscal ? { matricule: t.matricule_fiscal } : {}) });
      return { supprime: { id: t.id, type: t.type, code: t.code }, ...await resumeTiers(db, d) };
    }, 'configurer');
    res.json(resultat);
  } catch (err) {
    repondreErreur(res, err, '[compta.tiers.supprimer]');
  }
};

// PUT /api/compta/dossiers/:dossierId/tiers/modele — { prefixeFournisseur?, prefixeClient?, chiffres? } (titulaire ou
// Complet) : les codes déjà attribués ne changent pas. → { nb, modele }.
const modele = async (req, res) => {
  try {
    const m = lireModele(req.body || {});
    const resultat = await ecritureTiers(req, async (db, acces, d) => {
      const changements = {};
      for (const [colonne, valeur] of Object.entries(m)) {
        if (d[colonne] !== valeur) changements[colonne === 'tiers_prefixe_fournisseur' ? 'prefixeFournisseur' : colonne === 'tiers_prefixe_client' ? 'prefixeClient' : 'chiffres'] = { avant: d[colonne], apres: valeur };
      }
      if (Object.keys(changements).length) {
        const colonnes = Object.keys(m);
        await db.query(`UPDATE compta.dossiers SET ${colonnes.map((c, i) => `${c} = $${i + 2}`).join(', ')}, updated_at = NOW() WHERE id = $1`, [d.id, ...colonnes.map((c) => m[c])]);
        await journaliser(db, acces.espace_id, req.user.id, 'tiers_modele_modifie', { dossier: d.id, changements });
      }
      return resumeTiers(db, { ...d, ...m });
    }, 'configurer');
    res.json(resultat);
  } catch (err) {
    repondreErreur(res, err, '[compta.tiers.modele]');
  }
};

// ── Import Excel (D18 : tout ou rien) ───────────────────────────────────────────────────────────────────────────────
// Colonnes du modèle, dans l'ordre (le code en première colonne : une ligne « Exemple : … » n'est jamais un tiers).
const EN_TETES_IMPORT = ['Code', 'Nom', 'Matricule fiscal', 'Adresse', 'Ville', 'Téléphone', 'Email', 'Compte collectif', 'Régime de TVA', 'Retenue par défaut', 'Délai de paiement (jours)'];
const LARGEURS_IMPORT = [12, 36, 20, 36, 16, 16, 28, 16, 18, 18, 14];
// S7b : colonnes facultatives, après celles de S5c (un fichier fait sur l'ancien modèle s'importe toujours).
const FACULTATIFS_IMPORT = ['Régime fiscal', 'Résident', 'Type d\'identifiant', 'Numéro d\'identifiant', 'Date de naissance', 'Pays de l\'identifiant'];
const LARGEURS_FACULTATIFS = [34, 10, 20, 18, 14, 12];
const EXEMPLE_IMPORT = {
  fournisseur: ['Exemple : F0001', 'Société Essai SARL', '1234567A/A/M/000', '12 rue de la Liberté', 'Tunis', '71 000 000', 'contact@essai.tn', '4011', 'Assujetti', 'RS_MAR15', '30', 'Personne morale à l\'IS de 25 % ou plus', 'Oui', '', '', '', ''],
  client: ['Exemple : C0001', 'Hôtel Essai SA', '7654321B/A/M/000', '5 avenue de Carthage', 'Sousse', '73 000 000', 'compta@essai.tn', '4111', 'Assujetti', '', '45', '', 'Oui', '', '', '', ''],
};
// Contrôle d'une ligne lue (textes), hors base : → { ligne, repere, valeurs, compteId, retenueId, erreurs, avertissements }.
// `ctx` : { type, codesPris (dossier), codesFichier (lignes précédentes), collectifs: Map numéro → compte, retenues:
// Map code → taxe, collectifDefaut (compte ou null), matricules: Map 7 chiffres → repère (dossier, puis fichier) }.
const controlerLigne = ({ ligne, cellules }, ctx) => {
  const [code, nom, matricule, adresse, ville, telephone, email, collectif, regime, retenue, delai, regimeFiscal = '', resident = '', idType = '', idNumero = '', idNaissance = '', idPays = ''] = cellules;
  const erreurs = [];
  const avertissements = [];
  const valeurs = {};
  const essayer = (libelle, f) => {
    try { return f(); } catch (e) { erreurs.push(e.statusCode === 400 ? e.message : `${libelle} : valeur refusée`); return undefined; }
  };
  valeurs.code = essayer('Code', () => lireCode(code));
  if (valeurs.code) {
    if (ctx.codesPris.has(valeurs.code)) erreurs.push(`Code ${valeurs.code} : déjà dans le dossier`);
    else if (ctx.codesFichier.has(valeurs.code)) erreurs.push(`Code ${valeurs.code} : en double dans le fichier`);
  }
  valeurs.nom = essayer('Nom', () => lireNom(nom));
  const mf = essayer('Matricule fiscal', () => lireMatricule(matricule));
  valeurs.matricule_fiscal = mf ? mf.valeur : null;
  if (mf?.avertissement) avertissements.push(mf.avertissement);
  valeurs.adresse = essayer('Adresse', () => lireAdresse(adresse));
  valeurs.ville = essayer('Ville', () => lireVille(ville));
  valeurs.telephone = essayer('Téléphone', () => lireTelephone(telephone));
  valeurs.email = essayer('Email', () => lireEmail(email));
  valeurs.regime_tva = essayer('Régime de TVA', () => lireRegimeTva(regime));
  valeurs.delai_paiement = essayer('Délai de paiement', () => lireDelai(delai));
  // S7b : régime fiscal (sa valeur ou son libellé), résidence (oui / non), identifiant de secours.
  const rf = texte(regimeFiscal);
  valeurs.regime_fiscal = null;
  if (rf) {
    const v = (ctx.regimesFiscaux || new Map()).get(normaliserMot(rf));
    if (v) valeurs.regime_fiscal = v;
    else erreurs.push(`Régime fiscal « ${rf} » inconnu (voir la liste de la fenêtre d'un fournisseur)`);
  }
  valeurs.resident = essayer('Résident', () => lireResident(resident));
  Object.assign(valeurs, essayer('Identifiant', () => lireIdentifiant({ type: idType, numero: idNumero, naissance: idNaissance, pays: idPays })) || {});
  let compteId = null;
  const numero = texte(collectif);
  if (numero) {
    const k = ctx.collectifs.get(numero);
    if (!k) erreurs.push(`Compte collectif ${numero} : absent du plan ou pas de nature ${NATURES_LIBELLES[NATURE_PAR_TYPE_TIERS[ctx.type]].toLowerCase()}`);
    else if (!k.actif) erreurs.push(`Compte collectif ${numero} : désactivé`);
    else compteId = k.id;
  } else if (ctx.collectifDefaut) compteId = ctx.collectifDefaut.id;
  else erreurs.push('Compte collectif : indiquez-le (aucun compte par défaut dans ce dossier)');
  let retenueId = null;
  const codeRetenue = texte(retenue).toUpperCase();
  if (codeRetenue) {
    const x = ctx.retenues.get(codeRetenue);
    if (!x) erreurs.push(`Retenue par défaut ${codeRetenue} : aucun code de retenue de ce nom dans le dossier (page Taxes)`);
    else if (!x.actif) erreurs.push(`Retenue par défaut ${codeRetenue} : code désactivé`);
    else retenueId = x.id;
  }
  if (valeurs.matricule_fiscal) {
    const cle = valeurs.matricule_fiscal.slice(0, 7);
    const deja = ctx.matricules.get(cle);
    if (deja) avertissements.push(`Matricule fiscal déjà porté par ${deja}`);
    else ctx.matricules.set(cle, `la ligne ${ligne}`);
  }
  if (valeurs.code) ctx.codesFichier.add(valeurs.code);
  return { ligne, repere: [valeurs.code || code, valeurs.nom || nom].filter(Boolean).join(' — '), valeurs, compteId, retenueId, erreurs, avertissements };
};
// Contrôle de toutes les lignes : → { valides, fausses: [{ ligne, repere, erreurs }], avertissements: ['Ligne n : …'] }.
const controlerLignes = (lignes, ctx) => {
  const valides = [];
  const fausses = [];
  const avertissements = [];
  for (const l of lignes) {
    const r = controlerLigne(l, ctx);
    for (const a of r.avertissements) avertissements.push(`Ligne ${r.ligne} (${r.repere}) : ${a}`);
    if (r.erreurs.length) fausses.push({ ligne: r.ligne, repere: r.repere, erreurs: r.erreurs });
    else valides.push(r);
  }
  return { valides, fausses, avertissements };
};

// GET /api/compta/dossiers/:dossierId/tiers/modele-import?type= — le modèle à la charte (lecture : tout niveau).
const modeleImport = async (req, res) => {
  try {
    const type = req.query.type === undefined || req.query.type === '' ? 'fournisseur' : lireType(req.query.type);
    const { d } = await lectureDossier(req.user, req.params.dossierId);
    const { wb } = modeleClasseur({
      feuille: `${TYPES_TIERS_LIBELLES[type]}s`,
      titre: `Modèle d'import — ${minuscule(type)}s`,
      sousTitre: d.nom,
      meta: `Une ligne par ${minuscule(type)} sous les en-têtes ; la ligne d'exemple (grisée) est ignorée. Code vide = généré (modèle ${modeleDe(d).prefixes[type]}${'0'.repeat(modeleDe(d).chiffres - 1)}1) ; seul le nom est obligatoire ; compte collectif par son numéro (vide = ${collectifDefautNumero(d, type) || 'à indiquer'}) ; retenue par son code (page Taxes) ; colonnes facultatives : régime fiscal (libellé de la liste de la page Tiers), résident (oui ou non), identifiant d'un bénéficiaire sans matricule (CIN, passeport, carte de séjour, autre ; numéro ; date de naissance JJ/MM/AAAA ; pays en deux lettres). Toutes les lignes sont contrôlées : rien n'est importé à la moindre erreur.`,
      enTetes: [...EN_TETES_IMPORT, ...FACULTATIFS_IMPORT],
      largeurs: [...LARGEURS_IMPORT, ...LARGEURS_FACULTATIFS],
      exemple: EXEMPLE_IMPORT[type],
    });
    await envoyerClasseur(res, wb, `modele-${minuscule(type)}s-${d.id}.xlsx`);
  } catch (err) {
    repondreErreur(res, err, '[compta.tiers.modeleImport]');
  }
};

// POST /api/compta/dossiers/:dossierId/tiers/import — fichier « fichier » (multipart) + type (corps ou adresse) ;
// titulaire ou Complet. Toutes les lignes sont contrôlées (codes, doublons dans le fichier et dans le dossier, nom,
// matricule, compte collectif, régime, retenue, délai) ; à la moindre erreur, 400 avec le rapport ligne par ligne et
// rien d'écrit ; sinon une transaction, les codes vides générés dans l'ordre du fichier, un événement de journal.
// → 201 { importes, avertissements, nb, modele }.
const importer = async (req, res) => {
  try {
    if (!req.file?.buffer) throw erreur(400, 'Fichier requis (classeur Excel .xlsx dans le champ « fichier »)', 'FICHIER_REQUIS');
    const type = lireType((req.body || {}).type ?? req.query.type);
    // Accès, droit et état du dossier jugés AVANT d'analyser le classeur (relecture) ; la transaction les rejoue.
    const garde = await lectureDossier(req.user, req.params.dossierId);
    if (!droits(garde.acces).configurer) throw erreur(403, MSG_CONFIGURER, 'NIVEAU_INSUFFISANT');
    if (garde.d.etat === 'archive') throw erreur(409, 'Dossier archivé : désarchivez-le d\'abord', 'DOSSIER_ARCHIVE');
    const lignes = await lireClasseur(req.file.buffer, { enTetes: EN_TETES_IMPORT, facultatifs: FACULTATIFS_IMPORT });
    const fichier = nomFichier(req.file);
    const resultat = await ecritureTiers(req, async (db, acces, d) => {
      const nature = NATURE_PAR_TYPE_TIERS[type];
      const [codes, comptes, taxes, portes] = await Promise.all([
        codesDuType(db, d.id, type),
        db.query('SELECT id, numero, actif FROM compta.comptes WHERE dossier_id = $1 AND nature = $2', [d.id, nature]),
        db.query(`SELECT id, code, actif FROM compta.taxes WHERE dossier_id = $1 AND type = 'retenue'`, [d.id]),
        db.query('SELECT LEFT(matricule_fiscal, 7) AS cle, type, code FROM compta.tiers WHERE dossier_id = $1 AND matricule_fiscal IS NOT NULL ORDER BY id', [d.id]),
      ]);
      const collectifs = new Map(comptes.rows.map((k) => [k.numero, k]));
      const numeroDefaut = collectifDefautNumero(d, type);
      const defaut = numeroDefaut ? collectifs.get(numeroDefaut) : null;
      const ctx = {
        type, codesPris: codes, codesFichier: new Set(), collectifs, collectifDefaut: defaut && defaut.actif ? defaut : null,
        retenues: new Map(taxes.rows.map((x) => [x.code, x])),
        matricules: new Map(),
        regimesFiscaux: regimesParMot(d.pays),
      };
      for (const p of portes.rows) if (!ctx.matricules.has(p.cle)) ctx.matricules.set(p.cle, `le ${minuscule(p.type)} ${p.code}`);
      const { valides, fausses, avertissements } = controlerLignes(lignes, ctx);
      // Les codes à générer tiennent-ils dans la série du modèle ? Sinon, chaque ligne sans code au-delà est fausse.
      const modele = modeleDe(d);
      const sansCode = valides.filter((v) => !v.valeurs.code);
      if (sansCode.length) {
        const essai = generateurCodes(modele, type, new Set([...codes, ...ctx.codesFichier]));
        let libres = 0;
        try { while (libres < sansCode.length) { essai(); libres += 1; } } catch (e) { if (e.code !== 'SERIE_PLEINE') throw e; }
        for (const v of sansCode.slice(libres)) fausses.push({ ligne: v.ligne, repere: v.repere, erreurs: [`Code : la série ${modele.prefixes[type]}${'9'.repeat(modele.chiffres)} est pleine (${libres} code${libres > 1 ? 's' : ''} libre${libres > 1 ? 's' : ''} pour ${sansCode.length} à générer) : indiquez le code ou changez le modèle des codes`] });
        fausses.sort((a, b) => a.ligne - b.ligne);
      }
      if (fausses.length) throw erreurImport(fausses, lignes.length);
      const generer = generateurCodes(modele, type, new Set([...codes, ...ctx.codesFichier]));
      let codesGeneres = 0;
      for (const v of valides) {
        const code = v.valeurs.code || generer();
        if (!v.valeurs.code) codesGeneres += 1;
        await db.query(
          `INSERT INTO compta.tiers (dossier_id, type, code, nom, matricule_fiscal, adresse, ville, telephone, email, compte_id, regime_tva, retenue_id, delai_paiement, origine, cree_par,
                                     regime_fiscal, resident, id_type, id_numero, id_naissance, id_pays)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'import', $14, $15, $16, $17, $18, $19, $20)`,
          [d.id, type, code, v.valeurs.nom, v.valeurs.matricule_fiscal, v.valeurs.adresse, v.valeurs.ville, v.valeurs.telephone, v.valeurs.email, v.compteId, v.valeurs.regime_tva, v.retenueId, v.valeurs.delai_paiement, req.user.id,
            v.valeurs.regime_fiscal, v.valeurs.resident !== false, v.valeurs.id_type ?? null, v.valeurs.id_numero ?? null, v.valeurs.id_naissance ?? null, v.valeurs.id_pays ?? null]
        );
      }
      await journaliser(db, acces.espace_id, req.user.id, 'tiers_importes', { dossier: d.id, type, nombre: valides.length, codesGeneres, fichier });
      return { importes: valides.length, codesGeneres, avertissements, ...await resumeTiers(db, d) };
    }, 'configurer');
    res.status(201).json(resultat);
  } catch (err) {
    repondreImport(res, err, '[compta.tiers.importer]');
  }
};

// GET /api/compta/dossiers/:dossierId/tiers/export?type= — les tiers de l'onglet (actifs d'abord), classeur à la charte
// (excelBrandService, règle du projet : un seul onglet, jamais de PDF), colonnes du modèle d'import plus l'état et
// l'origine. Lecture : tout niveau.
const COLONNES_EXPORT = [...EN_TETES_IMPORT, ...FACULTATIFS_IMPORT, 'État', 'Origine'];
const exporter = async (req, res) => {
  try {
    const type = req.query.type === undefined || req.query.type === '' ? 'fournisseur' : lireType(req.query.type);
    const { d } = await lectureDossier(req.user, req.params.dossierId);
    const lignes = (await db_lignesExport(d.id, type)).map((t) => presenterTiers(t, d.pays));
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(`${TYPES_TIERS_LIBELLES[type]}s`);
    const n = COLONNES_EXPORT.length;
    const actifs = lignes.filter((t) => t.actif).length;
    const enTete = brandHeader(wb, ws, {
      titre: `${TYPES_TIERS_LIBELLES[type]}s`,
      sousTitre: d.nom,
      meta: `${lignes.length} ${minuscule(type)}${lignes.length > 1 ? 's' : ''} (${actifs} actif${actifs > 1 ? 's' : ''}) · exporté le ${jourTunis()}`,
      colCount: n,
    });
    headerRow(ws, enTete, COLONNES_EXPORT, { widths: [...LARGEURS_IMPORT, ...LARGEURS_FACULTATIFS, 12, 10] });
    for (let c = 1; c <= n; c++) ws.getColumn(c).numFmt = '@';
    let ligne = enTete;
    lignes.forEach((t, i) => {
      ligne += 1;
      const row = ws.getRow(ligne);
      row.values = [t.code, t.nom, t.matriculeFiscal || '', t.adresse || '', t.ville || '', t.telephone || '', t.email || '', t.compte ? t.compte.numero : '', t.regimeTvaLibelle, t.retenue ? t.retenue.code : '', String(t.delaiPaiement),
        t.regimeFiscalLibelle || '', t.resident ? 'Oui' : 'Non', t.identifiant ? t.identifiant.typeLibelle : '', t.identifiant ? t.identifiant.numero : '', t.identifiant && t.identifiant.naissance ? `${t.identifiant.naissance.slice(8, 10)}/${t.identifiant.naissance.slice(5, 7)}/${t.identifiant.naissance.slice(0, 4)}` : '', t.identifiant && t.identifiant.pays ? t.identifiant.pays : '',
        t.actif ? 'Actif' : 'Désactivé', t.origine === 'import' ? 'Importé' : 'Saisi'];
      dataRowStyle(row, { index: i, colCount: n });
    });
    brandFooter(ws, n);
    finalize(ws, { headerRowIdx: enTete, colCount: n, lastDataRow: ligne });
    await envoyerClasseur(res, wb, `${minuscule(type)}s-${d.id}.xlsx`);
  } catch (err) {
    repondreErreur(res, err, '[compta.tiers.exporter]');
  }
};
const db_lignesExport = async (dossierId, type) => (await pool.query(`${SQL_SELECT} WHERE t.dossier_id = $1 AND t.type = $2 ORDER BY t.actif DESC, t.code`, [dossierId, type])).rows;

module.exports = {
  MSG_TIERS, MSG_CONFIGURER, EN_TETES_IMPORT, FACULTATIFS_IMPORT, COLONNES_EXPORT, EXEMPLE_IMPORT,
  lireType, lireTexte, lireNom, lireCode, lireMatricule, lireEmail, lireRegimeTva, lireDelai, lireChamps, lireModele, lireFiltres,
  lireRegimeFiscal, lireResident, lireIdentifiant, lireNaissance, regimesParMot, choixFiscaux,
  modeleDe, prochainCode, generateurCodes, tiersMouvemente, SQL_SELECT, SQL_FILTRES, presenterTiers, controlerLigne, controlerLignes, collectifDefautNumero,
  lire, creer, modifier, desactiver, reactiver, supprimer, modele, modeleImport, importer, exporter,
};
