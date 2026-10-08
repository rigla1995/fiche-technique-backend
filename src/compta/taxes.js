// LabFlow Compta, étape S5b « Les journaux et les codes de taxe » (labflow-reprise/achats-compta/PLAN-S5.md §1, §2, §4,
// §5 ; recherche-fiscale-tunisie.md §1 et §3 ; réponses du client du 07/10 — réponse 7 : jeu de codes du §5, dossier
// forfaitaire ou non assujetti sans TVA — et du 08/10 — points 1 à 3). Les codes de taxe d'un dossier (compta.taxes,
// copiés du paquet selon le régime par configDossier.js) : lecture, ajout depuis le paquet (les codes non encore copiés),
// ajout d'un code personnalisé, modification (libellé et comptes de tout code ; type, taux, montant et assiette d'un
// code personnalisé seulement, tant qu'il n'a pas d'écriture — un code du paquet garde les siens : un taux qui change est
// un nouveau code, par une nouvelle version du paquet), désactivation et réactivation ; jamais de suppression. Routes
// (D3) : /api/compta/dossiers/:dossierId/taxes… ; chaque écriture passe par la transaction verrouillée du dossier
// (dansEspaceDuDossier : comptabilité verrouillée, dossier relu sous verrou, garde par comptabilité D4), puis par les
// droits et l'état du dossier. Taux et montants transportés en texte (SPEC-SOCLE §0). « Sans écriture » est toujours
// vrai avant la saisie : taxeMouvementee est le seul endroit à compléter alors.
const pool = require('../config/database');
const { journaliser } = require('./journal');
const { modeTitulaire, etatAbonnement } = require('./garde');
const { erreur, idValide, repondreErreur } = require('./comptablesClient');
const { TYPES_TAXES, TYPES_TAXES_LIBELLES, ASSIETTES, ASSIETTES_LIBELLES, COPIES_LIBELLES, CODE_TAXE_MAX, RE_CODE_TAXE } = require('./paquets');
const { droits, dansEspaceDuDossier } = require('./dossiers');
const { lectureDossier, lireLibelle, presenterDossier } = require('./planComptes');
const { SQL_FEUILLE, choixComptes, presenterCompteCourt, compteDuDossier, codesDuPaquet, copierCodes } = require('./configDossier');

const MSG_CONFIGURER = 'Seul le titulaire ou un gérant de niveau Complet peut modifier les codes de taxe';
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
// Champs figés d'un code du paquet (et d'un code personnalisé qui a des écritures).
const CHAMPS_FIGES = ['type', 'taux', 'montant', 'assiette'];
const COMPTES = [['compteAchatId', 'compte_achat_id', 'achat'], ['compteVenteId', 'compte_vente_id', 'vente'], ['compteImmoId', 'compte_immo_id', 'immobilisations']];

// ── Lecture des saisies ─────────────────────────────────────────────────────────────────────────────────────────────
const lireCode = (v) => {
  if (v != null && typeof v !== 'string') throw erreur(400, 'Code : requête invalide');
  const s = String(v ?? '').trim().toUpperCase();
  if (!RE_CODE_TAXE.test(s)) throw erreur(400, `Code : 2 à ${CODE_TAXE_MAX} lettres, chiffres ou _`);
  return s;
};
const lireType = (v) => {
  if (!TYPES_TAXES.includes(v)) throw erreur(400, 'Type de taxe inconnu');
  return v;
};
const lireAssiette = (v) => {
  if (!ASSIETTES.includes(v)) throw erreur(400, 'Assiette inconnue');
  return v;
};
// Un nombre à 3 décimales, reçu en texte (ou en nombre), virgule acceptée : rendu normalisé (« 19 » → « 19.000 »).
const lireDecimal = (v, libelle, { max, entiers, strictementPositif = false }) => {
  if (v == null || v === '' || (typeof v !== 'string' && typeof v !== 'number')) throw erreur(400, `${libelle} obligatoire`);
  const s = String(v).trim().replace(',', '.');
  if (!new RegExp(`^\\d{1,${entiers}}(\\.\\d{1,3})?$`).test(s)) throw erreur(400, `${libelle} : nombre à 3 décimales au plus`);
  const n = Number(s);
  if (n > max) throw erreur(400, `${libelle} : ${max} au maximum`);
  if (strictementPositif && n <= 0) throw erreur(400, `${libelle} : supérieur à zéro`);
  return n.toFixed(3);
};
const lireTaux = (v) => lireDecimal(v, 'Taux', { max: 100, entiers: 3 });
const lireMontant = (v) => lireDecimal(v, 'Montant', { max: 999999, entiers: 6, strictementPositif: true });
const lireCompteId = (v) => {
  if (v == null || v === '') return null;
  if (!idValide(v)) throw erreur(400, 'Compte : requête invalide');
  return Number(v);
};
// Taux et montant selon l'assiette : un montant fixe par facture (et pas de taux) avec « fixe », un taux sinon.
const lireTauxMontant = (assiette, corps) => (assiette === 'fixe'
  ? { taux: null, montant: lireMontant(corps.montant) }
  : { taux: lireTaux(corps.taux), montant: null });

// Un code « mouvementé » est porté par au moins une ligne d'écriture : aucune table d'écritures n'existe avant l'étape de
// la saisie, toujours faux ici. Seul endroit à compléter alors (désactiver, changer type / taux / montant / assiette).
const taxeMouvementee = async (_db, _taxeId) => false;

// ── Lectures ────────────────────────────────────────────────────────────────────────────────────────────────────────
const colonnesCompte = (alias, prefixe) => `${alias}.numero AS ${prefixe}_numero, ${alias}.libelle AS ${prefixe}_libelle, ${alias}.nature AS ${prefixe}_nature, ${alias}.actif AS ${prefixe}_actif, ${SQL_FEUILLE(alias)} AS ${prefixe}_feuille`;
const SQL_TAXES = `
  SELECT t.id, t.code, t.libelle, t.type, t.taux::text AS taux, t.montant::text AS montant, t.assiette, t.origine, t.code_tej, t.actif,
         t.compte_achat_id, t.compte_vente_id, t.compte_immo_id,
         ${colonnesCompte('a', 'achat')}, ${colonnesCompte('v', 'vente')}, ${colonnesCompte('m', 'immo')}
    FROM compta.taxes t
    LEFT JOIN compta.comptes a ON a.id = t.compte_achat_id
    LEFT JOIN compta.comptes v ON v.id = t.compte_vente_id
    LEFT JOIN compta.comptes m ON m.id = t.compte_immo_id
   WHERE t.dossier_id = $1
   ORDER BY array_position($2::text[], t.type), t.id`;
const compteDe = (t, prefixe, id) => (id ? presenterCompteCourt({ id, numero: t[`${prefixe}_numero`], libelle: t[`${prefixe}_libelle`], nature: t[`${prefixe}_nature`], actif: t[`${prefixe}_actif`], feuille: t[`${prefixe}_feuille`] }) : null);
const presenterTaxe = (t) => ({
  id: t.id,
  code: t.code,
  libelle: t.libelle,
  type: t.type,
  typeLibelle: TYPES_TAXES_LIBELLES[t.type] || t.type,
  taux: t.taux,
  montant: t.montant,
  assiette: t.assiette,
  assietteLibelle: ASSIETTES_LIBELLES[t.assiette] || t.assiette,
  compteAchat: compteDe(t, 'achat', t.compte_achat_id),
  compteVente: compteDe(t, 'vente', t.compte_vente_id),
  compteImmo: compteDe(t, 'immo', t.compte_immo_id),
  origine: t.origine,
  codeTej: t.code_tej,
  actif: t.actif,
});
// Un code du paquet non encore copié (« Ajouter depuis le paquet ») : ce que la page montre avant de choisir.
const presenterCodePaquet = (r) => ({
  code: r.code, libelle: r.libelle, type: r.type, typeLibelle: TYPES_TAXES_LIBELLES[r.type] || r.type, taux: r.taux, montant: r.montant, assiette: r.assiette,
  assietteLibelle: ASSIETTES_LIBELLES[r.assiette] || r.assiette, comptes: { achat: r.compte_achat_numero, vente: r.compte_vente_numero, immobilisations: r.compte_immo_numero },
  copie: r.copie, copieLibelle: COPIES_LIBELLES[r.copie] || r.copie, codeTej: r.code_tej, note: r.note,
});
const SQL_PAQUET_RESTANT = `
  SELECT r.code, r.libelle, r.type, r.taux::text AS taux, r.montant::text AS montant, r.assiette, r.compte_achat_numero, r.compte_vente_numero, r.compte_immo_numero, r.copie, r.code_tej, r.note
    FROM compta.ref_taxes r
   WHERE r.paquet_id = $2 AND NOT EXISTS (SELECT 1 FROM compta.taxes t WHERE t.dossier_id = $1 AND t.code = r.code)
   ORDER BY r.ordre`;
// L'état des codes : le dossier, son régime, les droits, les codes, ceux du paquet qu'il n'a pas, les listes fermées,
// les comptes actifs du plan (choix), l'état de l'abonnement.
const etatTaxes = async (db, acces, d) => {
  const [t, reste, comptes, paquet, mode] = await Promise.all([
    db.query(SQL_TAXES, [d.id, TYPES_TAXES]),
    d.paquet_id ? db.query(SQL_PAQUET_RESTANT, [d.id, d.paquet_id]) : { rows: [] },
    choixComptes(db, d.id),
    d.paquet_id ? db.query('SELECT pays, version, libelle FROM compta.ref_paquets WHERE id = $1', [d.paquet_id]) : { rows: [] },
    modeTitulaire(db, acces.espace_id),
  ]);
  return {
    dossier: presenterDossier(acces, d),
    droits: droits(acces),
    regime: { tva: d.tva, exportateurTotal: d.exportateur_total },
    nb: { actifs: t.rows.filter((x) => x.actif).length, total: t.rows.length },
    types: TYPES_TAXES.map((valeur) => ({ valeur, libelle: TYPES_TAXES_LIBELLES[valeur] })),
    assiettes: ASSIETTES.map((valeur) => ({ valeur, libelle: ASSIETTES_LIBELLES[valeur] })),
    code: { max: CODE_TAXE_MAX },
    taxes: t.rows.map(presenterTaxe),
    paquet: paquet.rows[0] ? { pays: paquet.rows[0].pays, version: paquet.rows[0].version, libelle: paquet.rows[0].libelle, codes: reste.rows.map(presenterCodePaquet) } : null,
    comptes,
    etatAbonnement: etatAbonnement(mode),
  };
};
// Le code, s'il est dans le dossier ; verrouillé (écriture).
const taxeDe = async (db, dossierId, taxeId) => {
  if (!idValide(taxeId)) throw erreur(404, 'Code de taxe introuvable');
  const r = await db.query('SELECT * FROM compta.taxes WHERE dossier_id = $1 AND id = $2 FOR UPDATE', [dossierId, taxeId]);
  if (!r.rows.length) throw erreur(404, 'Code de taxe introuvable');
  return r.rows[0];
};
// Un compte rattaché : un compte du dossier, actif (toute nature : le timbre va en charge à l'achat, en dette à la vente).
const compteRattache = async (db, dossierId, compteId) => {
  if (!compteId) return null;
  const k = await compteDuDossier(db, dossierId, compteId);
  if (!k) throw erreur(404, 'Compte introuvable');
  if (!k.actif) throw erreur(409, `Le compte ${k.numero} est désactivé : réactivez-le d'abord`, 'COMPTE_DESACTIVE');
  return k;
};

// ── Écritures ───────────────────────────────────────────────────────────────────────────────────────────────────────
// Toute écriture : transaction verrouillée du dossier (comptabilité verrouillée, dossier relu sous verrou, garde par
// comptabilité), droits (Complet ou titulaire), dossier non archivé ; puis l'état des codes.
const ecritureTaxes = (req, travail) => dansEspaceDuDossier(req.user, req.params.dossierId, async (db, acces, d) => {
  if (!droits(acces).configurer) throw erreur(403, MSG_CONFIGURER, 'NIVEAU_INSUFFISANT');
  if (d.etat === 'archive') throw erreur(409, 'Dossier archivé : désarchivez-le d\'abord', 'DOSSIER_ARCHIVE');
  await travail(db, acces, d);
  return etatTaxes(db, acces, d);
});

// GET /api/compta/dossiers/:dossierId/taxes — la liste (lecture : tout niveau).
const lire = async (req, res) => {
  try {
    const { acces, d } = await lectureDossier(req.user, req.params.dossierId);
    res.json(await etatTaxes(pool, acces, d));
  } catch (err) {
    repondreErreur(res, err, '[compta.taxes.lire]');
  }
};

// POST /api/compta/dossiers/:dossierId/taxes/paquet — { code } : copie un code du paquet que le dossier n'a pas encore
// (ses comptes, son code TEJ ; les sous-comptes proposés qu'il vise sont créés s'il le faut).
const ajouterDepuisPaquet = async (req, res) => {
  try {
    const code = lireCode((req.body || {}).code);
    const etat = await ecritureTaxes(req, async (db, acces, d) => {
      if (!d.paquet_id) throw erreur(409, 'Ce dossier n\'a pas de paquet pays', 'SANS_PAQUET');
      const ref = (await codesDuPaquet(db, d.paquet_id, [code]))[0];
      if (!ref) throw erreur(404, `Le code ${code} n'est pas dans le paquet`);
      if ((await db.query('SELECT 1 FROM compta.taxes WHERE dossier_id = $1 AND code = $2', [d.id, code])).rows.length) throw erreur(409, `Le code ${code} est déjà dans le dossier`, 'DEJA_PRESENT');
      await copierCodes(db, { dossierId: d.id, espaceId: acces.espace_id, paquetId: d.paquet_id, refs: [ref], auteurId: req.user.id });
      const t = (await db.query('SELECT id FROM compta.taxes WHERE dossier_id = $1 AND code = $2', [d.id, code])).rows[0];
      await journaliser(db, acces.espace_id, req.user.id, 'taxe_ajoutee', { dossier: d.id, taxe: t.id, code, libelle: ref.libelle, type: ref.type, taux: ref.taux, montant: ref.montant, assiette: ref.assiette, origine: 'paquet' });
    });
    res.status(201).json(etat);
  } catch (err) {
    repondreErreur(res, err, '[compta.taxes.ajouterDepuisPaquet]');
  }
};

// POST /api/compta/dossiers/:dossierId/taxes — un code personnalisé : { code, libelle, type, assiette, taux | montant,
// compteAchatId?, compteVenteId?, compteImmoId? }. Code unique dans le dossier, et jamais celui d'un code du paquet (qui
// s'ajoute depuis le paquet) ; comptes actifs du dossier.
const ajouter = async (req, res) => {
  try {
    const corps = req.body || {};
    const code = lireCode(corps.code);
    const libelle = lireLibelle(corps.libelle);
    const type = lireType(corps.type);
    const assiette = lireAssiette(corps.assiette);
    const { taux, montant } = lireTauxMontant(assiette, corps);
    const ids = Object.fromEntries(COMPTES.map(([cle]) => [cle, lireCompteId(corps[cle])]));
    const etat = await ecritureTaxes(req, async (db, acces, d) => {
      if ((await db.query('SELECT 1 FROM compta.taxes WHERE dossier_id = $1 AND code = $2', [d.id, code])).rows.length) throw erreur(409, `Le code ${code} existe déjà`, 'CODE_EXISTANT');
      if (d.paquet_id && (await codesDuPaquet(db, d.paquet_id, [code])).length) throw erreur(409, `${code} est un code du paquet : ajoutez-le depuis le paquet`, 'CODE_PAQUET');
      const comptes = {};
      for (const [cle, , nom] of COMPTES) comptes[nom] = await compteRattache(db, d.id, ids[cle]);
      const ins = await db.query(
        `INSERT INTO compta.taxes (dossier_id, code, libelle, type, taux, montant, assiette, compte_achat_id, compte_vente_id, compte_immo_id, origine, cree_par)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'ajout', $11) RETURNING id`,
        [d.id, code, libelle, type, taux, montant, assiette, comptes.achat?.id ?? null, comptes.vente?.id ?? null, comptes.immobilisations?.id ?? null, req.user.id]
      );
      await journaliser(db, acces.espace_id, req.user.id, 'taxe_ajoutee', {
        dossier: d.id, taxe: ins.rows[0].id, code, libelle, type, taux, montant, assiette, origine: 'ajout',
        comptes: Object.fromEntries(Object.entries(comptes).map(([k, v]) => [k, v ? v.numero : null])),
      });
    });
    res.status(201).json(etat);
  } catch (err) {
    repondreErreur(res, err, '[compta.taxes.ajouter]');
  }
};

// PUT /api/compta/dossiers/:dossierId/taxes/:taxeId — { libelle?, compteAchatId?, compteVenteId?, compteImmoId?, type?,
// taux?, montant?, assiette? } : libellé et comptes de tout code ; type, taux, montant et assiette d'un code personnalisé
// sans écriture seulement (un code du paquet garde les siens, un changement RÉEL est refusé). Le journal garde, pour
// chaque champ changé, la valeur d'avant et celle d'après (D16) ; rien ne change : ni écriture ni journal.
const modifier = async (req, res) => {
  try {
    const corps = req.body || {};
    const libelle = hasOwn(corps, 'libelle') ? lireLibelle(corps.libelle) : null;
    const type = hasOwn(corps, 'type') ? lireType(corps.type) : null;
    const assietteDemandee = hasOwn(corps, 'assiette') ? lireAssiette(corps.assiette) : null;
    const ids = Object.fromEntries(COMPTES.filter(([cle]) => hasOwn(corps, cle)).map(([cle]) => [cle, lireCompteId(corps[cle])]));
    const touche = CHAMPS_FIGES.some((c) => hasOwn(corps, c));
    if (libelle == null && !touche && !Object.keys(ids).length) throw erreur(400, 'Rien à modifier');
    const etat = await ecritureTaxes(req, async (db, acces, d) => {
      const t = await taxeDe(db, d.id, req.params.taxeId);
      const sets = [];
      const params = [t.id];
      const changements = {};
      const poser = (colonne, cle, valeur, avant, apres) => {
        params.push(valeur);
        sets.push(`${colonne} = $${params.length}`);
        if ((avant ?? null) !== (apres ?? null)) changements[cle] = { avant: avant ?? null, apres: apres ?? null };
      };
      if (libelle != null) poser('libelle', 'libelle', libelle, t.libelle, libelle);
      if (touche) {
        // Taux et montant relus selon l'assiette finale seulement s'ils sont envoyés ou si l'assiette change ; sinon les
        // valeurs stockées restent (un code du paquet sans taux — TVAEXO — se renomme avec un formulaire complet, relecture).
        const assiette = assietteDemandee || t.assiette;
        // Un taux ou un montant vide vaut « non envoyé » (le formulaire renvoie le champ tel quel).
        const fourni = (cle) => hasOwn(corps, cle) && corps[cle] !== '' && corps[cle] != null;
        const relire = assiette !== t.assiette || fourni('taux') || fourni('montant');
        const { taux, montant } = relire ? lireTauxMontant(assiette, { taux: fourni('taux') ? corps.taux : t.taux, montant: fourni('montant') ? corps.montant : t.montant }) : { taux: t.taux, montant: t.montant };
        if (type != null) poser('type', 'type', type, t.type, type);
        poser('assiette', 'assiette', assiette, t.assiette, assiette);
        poser('taux', 'taux', taux, t.taux, taux);
        poser('montant', 'montant', montant, t.montant, montant);
        const change = CHAMPS_FIGES.some((c) => changements[c]);
        if (change && t.origine !== 'ajout') throw erreur(409, 'Le type, le taux, le montant et l\'assiette d\'un code du paquet ne se modifient pas : ajoutez un code personnalisé', 'TAXE_PAQUET');
        if (change && await taxeMouvementee(db, t.id)) throw erreur(409, `Le code ${t.code} a des écritures : son type, son taux, son montant et son assiette ne changent plus`, 'TAXE_MOUVEMENTEE');
      }
      for (const [cle, colonne, nom] of COMPTES) {
        if (!hasOwn(ids, cle) || ids[cle] === t[colonne]) continue;
        const avant = t[colonne] ? (await db.query('SELECT numero FROM compta.comptes WHERE id = $1', [t[colonne]])).rows[0]?.numero : null;
        const k = await compteRattache(db, d.id, ids[cle]);
        poser(colonne, `compte_${nom}`, k ? k.id : null, avant, k ? k.numero : null);
      }
      if (!Object.keys(changements).length) return;
      await db.query(`UPDATE compta.taxes SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1`, params);
      await journaliser(db, acces.espace_id, req.user.id, 'taxe_modifiee', { dossier: d.id, taxe: t.id, code: t.code, changements });
    });
    res.json(etat);
  } catch (err) {
    repondreErreur(res, err, '[compta.taxes.modifier]');
  }
};

// POST /api/compta/dossiers/:dossierId/taxes/:taxeId/desactiver — code actif, sans écriture. Rien n'est effacé.
const desactiver = async (req, res) => {
  try {
    const etat = await ecritureTaxes(req, async (db, acces, d) => {
      const t = await taxeDe(db, d.id, req.params.taxeId);
      if (!t.actif) throw erreur(409, `Le code ${t.code} est déjà désactivé`, 'DEJA_FAIT');
      if (await taxeMouvementee(db, t.id)) throw erreur(409, `Le code ${t.code} a des écritures : il ne se désactive pas`, 'TAXE_MOUVEMENTEE');
      await db.query('UPDATE compta.taxes SET actif = false, updated_at = NOW() WHERE id = $1', [t.id]);
      await journaliser(db, acces.espace_id, req.user.id, 'taxe_desactivee', { dossier: d.id, taxe: t.id, code: t.code, libelle: t.libelle });
    });
    res.json(etat);
  } catch (err) {
    repondreErreur(res, err, '[compta.taxes.desactiver]');
  }
};

// POST /api/compta/dossiers/:dossierId/taxes/:taxeId/reactiver — code désactivé dont les comptes rattachés sont actifs.
const reactiver = async (req, res) => {
  try {
    const etat = await ecritureTaxes(req, async (db, acces, d) => {
      const t = await taxeDe(db, d.id, req.params.taxeId);
      if (t.actif) throw erreur(409, `Le code ${t.code} n'est pas désactivé`, 'DEJA_FAIT');
      const inactifs = (await db.query('SELECT numero FROM compta.comptes WHERE id = ANY($1) AND NOT actif ORDER BY numero', [[t.compte_achat_id, t.compte_vente_id, t.compte_immo_id].filter(Boolean)])).rows.map((x) => x.numero);
      if (inactifs.length) throw erreur(409, `Réactivez d'abord le${inactifs.length > 1 ? 's' : ''} compte${inactifs.length > 1 ? 's' : ''} ${inactifs.join(', ')}`, 'COMPTE_DESACTIVE');
      await db.query('UPDATE compta.taxes SET actif = true, updated_at = NOW() WHERE id = $1', [t.id]);
      await journaliser(db, acces.espace_id, req.user.id, 'taxe_reactivee', { dossier: d.id, taxe: t.id, code: t.code, libelle: t.libelle });
    });
    res.json(etat);
  } catch (err) {
    repondreErreur(res, err, '[compta.taxes.reactiver]');
  }
};

module.exports = {
  MSG_CONFIGURER, CHAMPS_FIGES, lireCode, lireType, lireAssiette, lireTaux, lireMontant, lireCompteId, lireTauxMontant, taxeMouvementee, SQL_TAXES, SQL_PAQUET_RESTANT, presenterTaxe, presenterCodePaquet,
  lire, ajouterDepuisPaquet, ajouter, modifier, desactiver, reactiver,
};
