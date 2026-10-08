// LabFlow Compta, étape S5b « Les journaux et les codes de taxe » (labflow-reprise/achats-compta/PLAN-S5.md §1, §2, §4 ;
// réponses du client du 07/10 — réponse 8 : un journal par compte bancaire, le compte 532x subdivisé dans le plan puis
// choisi ici — et du 08/10 — point 4 : tout type de journal s'ajoute, sauf un seul à-nouveaux). Les journaux d'un dossier
// (compta.journaux, copiés du paquet par configDossier.js) : lecture, ajout (banque et caisse pointent un compte de même
// nature du plan), modification (libellé ; compte de contrepartie tant que le journal n'a pas d'écriture), désactivation
// (sans écriture) et réactivation (compte actif) ; jamais de suppression. Routes (D3) : /api/compta/dossiers/:dossierId/
// journaux… ; chaque écriture passe par la transaction verrouillée du dossier (dansEspaceDuDossier : comptabilité
// verrouillée, dossier relu sous verrou, garde par comptabilité D4), puis par les droits et l'état du dossier.
// « Sans écriture » : journalMouvemente lit compta.ecritures depuis S6a (les écritures en brouillard comptent).
const pool = require('../config/database');
const { journaliser } = require('./journal');
const { modeTitulaire, etatAbonnement } = require('./garde');
const { erreur, idValide, repondreErreur } = require('./comptablesClient');
const { TYPES_JOURNAUX, TYPES_JOURNAUX_LIBELLES, TYPES_AVEC_COMPTE, NATURE_PAR_TYPE, NATURES_LIBELLES, CODE_JOURNAL_MAX, RE_CODE_JOURNAL } = require('./paquets');
const { droits, dansEspaceDuDossier } = require('./dossiers');
const { lectureDossier, lireLibelle, presenterDossier } = require('./planComptes');
const { SQL_FEUILLE, choixComptes, presenterCompteCourt, compteDuDossier } = require('./configDossier');

const MSG_CONFIGURER = 'Seul le titulaire ou un gérant de niveau Complet peut modifier les journaux';
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const minuscule = (type) => TYPES_JOURNAUX_LIBELLES[type].toLowerCase();

// ── Lecture des saisies ─────────────────────────────────────────────────────────────────────────────────────────────
// Code : 2 à 4 lettres ou chiffres, rendu en majuscules (« bq2 » → « BQ2 »), figé après création.
const lireCode = (v) => {
  if (v != null && typeof v !== 'string') throw erreur(400, 'Code : requête invalide');
  const s = String(v ?? '').trim().toUpperCase();
  if (!RE_CODE_JOURNAL.test(s)) throw erreur(400, `Code : 2 à ${CODE_JOURNAL_MAX} lettres ou chiffres`);
  return s;
};
const lireType = (v) => {
  if (!TYPES_JOURNAUX.includes(v)) throw erreur(400, 'Type de journal inconnu');
  return v;
};
const lireCompteId = (v) => {
  if (v == null || v === '') return null;
  if (!idValide(v)) throw erreur(400, 'Compte : requête invalide');
  return Number(v);
};

// Un journal « mouvementé » porte au moins une écriture (S6a : compta.ecritures, migration 215, brouillard compris) : il
// ne se désactive plus et son compte de contrepartie ne change plus.
const journalMouvemente = async (db, journalId) => (await db.query('SELECT 1 FROM compta.ecritures WHERE journal_id = $1 LIMIT 1', [journalId])).rows.length > 0;

// ── Lectures ────────────────────────────────────────────────────────────────────────────────────────────────────────
const SQL_JOURNAUX = `
  SELECT j.id, j.code, j.libelle, j.type, j.origine, j.actif, j.compte_id,
         k.numero AS compte_numero, k.libelle AS compte_libelle, k.nature AS compte_nature, k.actif AS compte_actif, ${SQL_FEUILLE('k')} AS compte_feuille
    FROM compta.journaux j
    LEFT JOIN compta.comptes k ON k.id = j.compte_id
   WHERE j.dossier_id = $1
   ORDER BY j.id`;
const presenterJournal = (j) => ({
  id: j.id,
  code: j.code,
  libelle: j.libelle,
  type: j.type,
  typeLibelle: TYPES_JOURNAUX_LIBELLES[j.type] || j.type,
  avecCompte: TYPES_AVEC_COMPTE.includes(j.type),
  compte: j.compte_id ? presenterCompteCourt({ id: j.compte_id, numero: j.compte_numero, libelle: j.compte_libelle, nature: j.compte_nature, actif: j.compte_actif, feuille: j.compte_feuille }) : null,
  origine: j.origine,
  actif: j.actif,
});
// L'état des journaux : le dossier, les droits, les journaux, les types, les comptes de contrepartie possibles (banque,
// caisse ; actifs), l'état de l'abonnement.
const etatJournaux = async (db, acces, d) => {
  const [j, comptes, mode] = await Promise.all([db.query(SQL_JOURNAUX, [d.id]), choixComptes(db, d.id, Object.values(NATURE_PAR_TYPE)), modeTitulaire(db, acces.espace_id)]);
  return {
    dossier: presenterDossier(acces, d),
    droits: droits(acces),
    nb: { actifs: j.rows.filter((x) => x.actif).length, total: j.rows.length },
    types: TYPES_JOURNAUX.map((valeur) => ({ valeur, libelle: TYPES_JOURNAUX_LIBELLES[valeur], avecCompte: TYPES_AVEC_COMPTE.includes(valeur), nature: NATURE_PAR_TYPE[valeur] || null })),
    code: { max: CODE_JOURNAL_MAX },
    journaux: j.rows.map(presenterJournal),
    comptes,
    etatAbonnement: etatAbonnement(mode),
  };
};
// Le journal, s'il est dans le dossier ; verrouillé (écriture).
const journalDe = async (db, dossierId, journalId) => {
  if (!idValide(journalId)) throw erreur(404, 'Journal introuvable');
  const r = await db.query('SELECT * FROM compta.journaux WHERE dossier_id = $1 AND id = $2 FOR UPDATE', [dossierId, journalId]);
  if (!r.rows.length) throw erreur(404, 'Journal introuvable');
  return r.rows[0];
};
// Le compte de contrepartie d'un journal de banque ou de caisse : un compte du dossier, actif, de la nature du type.
const compteContrepartie = async (db, dossierId, compteId, type) => {
  const k = await compteDuDossier(db, dossierId, compteId);
  if (!k) throw erreur(404, 'Compte introuvable');
  if (k.nature !== NATURE_PAR_TYPE[type]) throw erreur(400, `Choisissez un compte de nature ${NATURES_LIBELLES[NATURE_PAR_TYPE[type]].toLowerCase()} (${k.numero} est de nature ${NATURES_LIBELLES[k.nature].toLowerCase()})`);
  if (!k.actif) throw erreur(409, `Le compte ${k.numero} est désactivé : réactivez-le d'abord`, 'COMPTE_DESACTIVE');
  return k;
};

// ── Écritures ───────────────────────────────────────────────────────────────────────────────────────────────────────
// Toute écriture : transaction verrouillée du dossier (comptabilité verrouillée, dossier relu sous verrou, garde par
// comptabilité), droits (Complet ou titulaire), dossier non archivé ; puis l'état des journaux.
const ecritureJournaux = (req, travail) => dansEspaceDuDossier(req.user, req.params.dossierId, async (db, acces, d) => {
  if (!droits(acces).configurer) throw erreur(403, MSG_CONFIGURER, 'NIVEAU_INSUFFISANT');
  if (d.etat === 'archive') throw erreur(409, 'Dossier archivé : désarchivez-le d\'abord', 'DOSSIER_ARCHIVE');
  await travail(db, acces, d);
  return etatJournaux(db, acces, d);
});

// GET /api/compta/dossiers/:dossierId/journaux — la liste (lecture : tout niveau).
const lire = async (req, res) => {
  try {
    const { acces, d } = await lectureDossier(req.user, req.params.dossierId);
    res.json(await etatJournaux(pool, acces, d));
  } catch (err) {
    repondreErreur(res, err, '[compta.journaux.lire]');
  }
};

// POST /api/compta/dossiers/:dossierId/journaux — { code, libelle, type, compteId? } : banque et caisse exigent un compte
// de contrepartie de même nature (actif) ; les autres types n'en ont pas ; un seul journal d'à-nouveaux ; code unique.
const creer = async (req, res) => {
  try {
    const corps = req.body || {};
    const code = lireCode(corps.code);
    const libelle = lireLibelle(corps.libelle);
    const type = lireType(corps.type);
    const compteId = lireCompteId(corps.compteId);
    if (TYPES_AVEC_COMPTE.includes(type) && !compteId) throw erreur(400, `Un journal de ${minuscule(type)} a un compte de contrepartie : choisissez-le dans le plan`);
    if (!TYPES_AVEC_COMPTE.includes(type) && compteId) throw erreur(400, `Un journal ${type === 'an' ? 'd\'' : 'de type '}${minuscule(type)} n'a pas de compte de contrepartie`);
    const etat = await ecritureJournaux(req, async (db, acces, d) => {
      if (type === 'an' && (await db.query(`SELECT 1 FROM compta.journaux WHERE dossier_id = $1 AND type = 'an'`, [d.id])).rows.length) throw erreur(409, 'Ce dossier a déjà son journal d\'à-nouveaux', 'UN_SEUL_AN');
      if ((await db.query('SELECT 1 FROM compta.journaux WHERE dossier_id = $1 AND code = $2', [d.id, code])).rows.length) throw erreur(409, `Le journal ${code} existe déjà`, 'CODE_EXISTANT');
      const k = compteId ? await compteContrepartie(db, d.id, compteId, type) : null;
      const ins = await db.query(
        `INSERT INTO compta.journaux (dossier_id, code, libelle, type, compte_id, origine, cree_par) VALUES ($1, $2, $3, $4, $5, 'ajout', $6) RETURNING id`,
        [d.id, code, libelle, type, k ? k.id : null, req.user.id]
      );
      await journaliser(db, acces.espace_id, req.user.id, 'journal_cree', { dossier: d.id, journal: ins.rows[0].id, code, libelle, type, ...(k ? { compte: k.numero } : {}) });
    });
    res.status(201).json(etat);
  } catch (err) {
    repondreErreur(res, err, '[compta.journaux.creer]');
  }
};

// PUT /api/compta/dossiers/:dossierId/journaux/:journalId — { libelle?, compteId? } : le libellé de tout journal ; le
// compte de contrepartie d'un journal de banque ou de caisse, tant qu'il n'a pas d'écriture. Le journal garde, pour
// chaque champ changé, la valeur d'avant et celle d'après (D16) ; rien ne change : ni écriture ni journal.
const modifier = async (req, res) => {
  try {
    const corps = req.body || {};
    const libelle = hasOwn(corps, 'libelle') ? lireLibelle(corps.libelle) : null;
    const compteId = hasOwn(corps, 'compteId') ? lireCompteId(corps.compteId) : undefined;
    if (libelle == null && compteId === undefined) throw erreur(400, 'Rien à modifier');
    const etat = await ecritureJournaux(req, async (db, acces, d) => {
      const j = await journalDe(db, d.id, req.params.journalId);
      const sets = [];
      const params = [j.id];
      const changements = {};
      const poser = (colonne, valeur, avant, apres) => {
        params.push(valeur);
        sets.push(`${colonne} = $${params.length}`);
        if ((avant ?? null) !== (apres ?? null)) changements[colonne === 'compte_id' ? 'compte' : colonne] = { avant: avant ?? null, apres: apres ?? null };
      };
      if (libelle != null) poser('libelle', libelle, j.libelle, libelle);
      if (compteId !== undefined) {
        if (!TYPES_AVEC_COMPTE.includes(j.type)) throw erreur(400, `Un journal ${j.type === 'an' ? 'd\'' : 'de type '}${minuscule(j.type)} n'a pas de compte de contrepartie`);
        if (!compteId) throw erreur(400, `Un journal de ${minuscule(j.type)} a un compte de contrepartie : choisissez-le dans le plan`);
        if (compteId !== j.compte_id) {
          if (await journalMouvemente(db, j.id)) throw erreur(409, `Le journal ${j.code} a des écritures : son compte ne change plus`, 'JOURNAL_MOUVEMENTE');
          const avant = j.compte_id ? (await db.query('SELECT numero FROM compta.comptes WHERE id = $1', [j.compte_id])).rows[0]?.numero : null;
          const k = await compteContrepartie(db, d.id, compteId, j.type);
          poser('compte_id', k.id, avant, k.numero);
        }
      }
      if (!Object.keys(changements).length) return;
      await db.query(`UPDATE compta.journaux SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1`, params);
      await journaliser(db, acces.espace_id, req.user.id, 'journal_modifie', { dossier: d.id, journal: j.id, code: j.code, changements });
    });
    res.json(etat);
  } catch (err) {
    repondreErreur(res, err, '[compta.journaux.modifier]');
  }
};

// POST /api/compta/dossiers/:dossierId/journaux/:journalId/desactiver — journal actif, sans écriture. Rien n'est effacé.
const desactiver = async (req, res) => {
  try {
    const etat = await ecritureJournaux(req, async (db, acces, d) => {
      const j = await journalDe(db, d.id, req.params.journalId);
      if (!j.actif) throw erreur(409, `Le journal ${j.code} est déjà désactivé`, 'DEJA_FAIT');
      if (await journalMouvemente(db, j.id)) throw erreur(409, `Le journal ${j.code} a des écritures : il ne se désactive pas`, 'JOURNAL_MOUVEMENTE');
      await db.query('UPDATE compta.journaux SET actif = false, updated_at = NOW() WHERE id = $1', [j.id]);
      await journaliser(db, acces.espace_id, req.user.id, 'journal_desactive', { dossier: d.id, journal: j.id, code: j.code, libelle: j.libelle });
    });
    res.json(etat);
  } catch (err) {
    repondreErreur(res, err, '[compta.journaux.desactiver]');
  }
};

// POST /api/compta/dossiers/:dossierId/journaux/:journalId/reactiver — journal désactivé dont le compte (s'il en a un)
// est actif.
const reactiver = async (req, res) => {
  try {
    const etat = await ecritureJournaux(req, async (db, acces, d) => {
      const j = await journalDe(db, d.id, req.params.journalId);
      if (j.actif) throw erreur(409, `Le journal ${j.code} n'est pas désactivé`, 'DEJA_FAIT');
      if (j.compte_id) {
        const k = (await db.query('SELECT numero, actif FROM compta.comptes WHERE id = $1', [j.compte_id])).rows[0];
        if (k && !k.actif) throw erreur(409, `Réactivez d'abord le compte ${k.numero}`, 'COMPTE_DESACTIVE');
      }
      await db.query('UPDATE compta.journaux SET actif = true, updated_at = NOW() WHERE id = $1', [j.id]);
      await journaliser(db, acces.espace_id, req.user.id, 'journal_reactive', { dossier: d.id, journal: j.id, code: j.code, libelle: j.libelle });
    });
    res.json(etat);
  } catch (err) {
    repondreErreur(res, err, '[compta.journaux.reactiver]');
  }
};

module.exports = {
  MSG_CONFIGURER, lireCode, lireType, lireCompteId, journalMouvemente, SQL_JOURNAUX, presenterJournal,
  lire, creer, modifier, desactiver, reactiver,
};
