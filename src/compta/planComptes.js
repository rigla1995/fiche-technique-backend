// LabFlow Compta, étape S5a « Le paquet Tunisie et le plan de comptes » (labflow-reprise/achats-compta/PLAN-S5.md §1,
// §2, §4 ; réponses du client du 07/10 : comptes de 2 à 8 chiffres ; Complet configure, Saisie et Consultation lisent).
// Le plan de comptes d'un dossier (compta.comptes, copié du paquet pays par planInit.js) : lecture de l'arbre, subdivision
// (le numéro commence par celui du parent et le prolonge), renommage (et rétablissement du libellé de la norme),
// désactivation d'un compte sans mouvement ni sous-compte actif, réactivation (parent actif), suppression d'un compte
// ajouté sans sous-compte, export Excel à la charte. Routes (D3) : /api/compta/dossiers/:dossierId/plan… ; chaque
// écriture passe par la transaction verrouillée du dossier (dansEspaceDuDossier : comptabilité verrouillée, dossier
// relu sous verrou, garde par comptabilité D4), puis par les droits et l'état du dossier (archivé : rien ne change).
// « Sans mouvement » est toujours vrai avant la saisie : compteMouvemente est le seul endroit à compléter alors.
// S5c « Les tiers et les imports » : un compte porté par un tiers (compte collectif) ne se désactive ni ne se supprime ;
// import Excel du plan d'un autre logiciel en tout-ou-rien (D18 ; importExcel.js) : un numéro connu est renommé, un
// numéro inconnu est ajouté sous son plus long préfixe (plan ou fichier), nature héritée sauf indication, expliqué.
const ExcelJS = require('exceljs');
const pool = require('../config/database');
const { journaliser } = require('./journal');
const { modeTitulaire, etatAbonnement } = require('./garde');
const { erreur, idValide, repondreErreur } = require('./comptablesClient');
const { NATURES, NATURES_LIBELLES, NUMERO_MIN, NUMERO_MAX, RE_NUMERO, LIBELLE_MAX, NOTE_MAX, parentParmi } = require('./paquets');
const { accesSurEspace, dossierDe, droits, presenterEspace, dansEspaceDuDossier } = require('./dossiers');
const { resumePlan } = require('./planInit');
const { brandHeader, headerRow, dataRowStyle, brandFooter, finalize } = require('../services/excelBrandService');
const { lireClasseur, modeleClasseur, envoyerClasseur, erreurImport, repondreImport, nomFichier, jourTunis } = require('./importExcel');

const MSG_CONFIGURER = 'Seul le titulaire ou un gérant de niveau Complet peut modifier le plan de comptes';
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// ── Lecture des saisies ─────────────────────────────────────────────────────────────────────────────────────────────
// Caractères imprimables sur les états (même table que HORS_W1252 de src/utils/identite.js : un libellé de compte
// s'imprime sur le grand livre et la balance comme une identité sur une facture).
const HORS_W1252 = /[^\x20-\xFF€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/u;
const texte = (v) => (v == null ? '' : String(v).normalize('NFC').replace(/\s+/g, ' ').trim());
const lireNumero = (v) => {
  if (v != null && typeof v !== 'string' && typeof v !== 'number') throw erreur(400, 'Numéro : requête invalide');
  // Rogné aux extrémités seulement : « 53 211 » n'est pas un numéro (relecture).
  const s = texte(v);
  if (!RE_NUMERO.test(s)) throw erreur(400, `Numéro : ${NUMERO_MIN} à ${NUMERO_MAX} chiffres`);
  return s;
};
const lireLibelle = (v) => {
  if (v != null && typeof v !== 'string') throw erreur(400, 'Libellé : requête invalide');
  const s = texte(v);
  if (!s) throw erreur(400, 'Libellé obligatoire');
  if (s.length > LIBELLE_MAX) throw erreur(400, `Libellé : ${LIBELLE_MAX} caractères au maximum`);
  if (HORS_W1252.test(s)) throw erreur(400, 'Libellé : caractères latins seulement (les lettres arabes et les émojis ne s\'impriment pas sur les états)');
  return s;
};
const lireNature = (v) => {
  if (!NATURES.includes(v)) throw erreur(400, 'Nature inconnue');
  return v;
};
// Explication d'un ajout (NC 01, 3ᵉ partie §3 : chaque ajout expliqué) : facultative, vide = aucune.
const lireExplication = (v) => {
  if (v == null || v === '') return null;
  if (typeof v !== 'string') throw erreur(400, 'Explication : requête invalide');
  const s = texte(v);
  if (s.length > NOTE_MAX) throw erreur(400, `Explication : ${NOTE_MAX} caractères au maximum`);
  if (HORS_W1252.test(s)) throw erreur(400, 'Explication : caractères latins seulement');
  return s || null;
};

// Un compte « mouvementé » a au moins une ligne d'écriture : aucune table d'écritures n'existe avant l'étape de la
// saisie, toujours faux ici. Seul endroit à compléter alors (désactiver, supprimer).
const compteMouvemente = async (_db, _compteId) => false;
// Un compte « utilisé » est porté par un journal (S5b : compte de contrepartie), un code de taxe (S5b : compte à l'achat,
// à la vente, sur immobilisations) ou un tiers (S5c : compte collectif), actif ou non. Il ne se désactive ni ne se
// supprime : on change d'abord le compte du journal, du code ou du tiers (pages Journaux, Taxes et Tiers).
const compteUtilise = async (db, compteId) => {
  const r = await db.query(
    `SELECT 1 FROM compta.journaux WHERE compte_id = $1
     UNION ALL
     SELECT 1 FROM compta.taxes WHERE compte_achat_id = $1 OR compte_vente_id = $1 OR compte_immo_id = $1
     UNION ALL
     SELECT 1 FROM compta.tiers WHERE compte_id = $1
     LIMIT 1`,
    [compteId]
  );
  return r.rows.length > 0;
};

// ── Lectures ────────────────────────────────────────────────────────────────────────────────────────────────────────
// L'arbre complet (600 à 1 000 comptes, chargé en une fois), avec le nombre de sous-comptes (tous, actifs) de chacun.
const SQL_COMPTES = `
  SELECT c.id, c.numero, c.libelle, c.classe, c.parent_id, c.nature, c.origine, c.libelle_paquet, c.note, c.explication, c.actif,
         COALESCE(f.nb, 0) AS nb_enfants, COALESCE(f.nb_actifs, 0) AS nb_enfants_actifs
    FROM compta.comptes c
    LEFT JOIN (
      SELECT parent_id, COUNT(*)::int AS nb, COUNT(*) FILTER (WHERE actif)::int AS nb_actifs
        FROM compta.comptes WHERE dossier_id = $1 GROUP BY parent_id
    ) f ON f.parent_id = c.id
   WHERE c.dossier_id = $1
   ORDER BY c.numero`;
const presenterCompte = (c) => ({
  id: c.id,
  numero: c.numero,
  libelle: c.libelle,
  classe: c.classe,
  parentId: c.parent_id,
  nature: c.nature,
  origine: c.origine,
  libellePaquet: c.libelle_paquet,
  note: c.note,
  explication: c.explication,
  actif: c.actif,
  nbEnfants: c.nb_enfants,
  nbEnfantsActifs: c.nb_enfants_actifs,
  // Un compte « feuille » (sans sous-compte actif) recevra des écritures ; l'arbre le montre, rien n'est bloqué en S5.
  feuille: c.nb_enfants_actifs === 0,
  renomme: c.origine === 'paquet' && c.libelle_paquet != null && c.libelle !== c.libelle_paquet,
});
const presenterDossier = (acces, d) => ({ id: d.id, nom: d.nom, etat: d.etat, source: d.source, espace: presenterEspace(acces) });
// L'état du plan : le dossier, les droits, le paquet d'origine, les comptes, les comptes rendus, l'état de l'abonnement.
const etatPlan = async (db, acces, d) => {
  const [c, resume, mode] = await Promise.all([db.query(SQL_COMPTES, [d.id]), resumePlan(db, d.id), modeTitulaire(db, acces.espace_id)]);
  return {
    dossier: presenterDossier(acces, d),
    droits: droits(acces),
    paquet: resume.paquet,
    nb: { total: c.rows.length, actifs: resume.nbActifs, ajoutes: resume.nbAjoutes, desactives: resume.nbDesactives },
    natures: NATURES.map((valeur) => ({ valeur, libelle: NATURES_LIBELLES[valeur] })),
    numero: { min: NUMERO_MIN, max: NUMERO_MAX },
    comptes: c.rows.map(presenterCompte),
    etatAbonnement: etatAbonnement(mode),
  };
};

// Le dossier en lecture (tout niveau) : sa comptabilité, l'accès de la personne, le dossier ouvert à elle (SQL_VISIBLE).
const lectureDossier = async (user, dossierId) => {
  if (!idValide(dossierId)) throw erreur(404, 'Dossier introuvable');
  const e = await pool.query('SELECT espace_id FROM compta.dossiers WHERE id = $1', [dossierId]);
  const acces = e.rows.length ? await accesSurEspace(pool, user, e.rows[0].espace_id) : null;
  if (!acces) throw erreur(404, 'Dossier introuvable');
  return { acces, d: await dossierDe(pool, acces, dossierId) };
};
// Le compte, s'il est dans le dossier ; verrouillé (écriture).
const compteDe = async (db, dossierId, compteId) => {
  if (!idValide(compteId)) throw erreur(404, 'Compte introuvable');
  const r = await db.query('SELECT * FROM compta.comptes WHERE dossier_id = $1 AND id = $2 FOR UPDATE', [dossierId, compteId]);
  if (!r.rows.length) throw erreur(404, 'Compte introuvable');
  return r.rows[0];
};

// ── Écritures ───────────────────────────────────────────────────────────────────────────────────────────────────────
// Toute écriture du plan : transaction verrouillée du dossier (dansEspaceDuDossier : comptabilité verrouillée, dossier
// relu sous verrou, garde par comptabilité), droits (Complet ou titulaire), dossier non archivé ; puis l'état du plan.
const ecriturePlan = (req, travail) => dansEspaceDuDossier(req.user, req.params.dossierId, async (db, acces, d) => {
  if (!droits(acces).configurer) throw erreur(403, MSG_CONFIGURER, 'NIVEAU_INSUFFISANT');
  if (d.etat === 'archive') throw erreur(409, 'Dossier archivé : désarchivez-le d\'abord', 'DOSSIER_ARCHIVE');
  await travail(db, acces, d);
  return etatPlan(db, acces, d);
});

// GET /api/compta/dossiers/:dossierId/plan — l'arbre (lecture : tout niveau).
const lire = async (req, res) => {
  try {
    const { acces, d } = await lectureDossier(req.user, req.params.dossierId);
    res.json(await etatPlan(pool, acces, d));
  } catch (err) {
    repondreErreur(res, err, '[compta.plan.lire]');
  }
};

// POST /api/compta/dossiers/:dossierId/plan/comptes — subdiviser : { parentId, numero, libelle, nature?, explication? }.
// Le numéro commence par celui du parent et le prolonge d'au moins un chiffre (2 à 8 chiffres) ; son vrai parent est son
// plus long préfixe existant (un numéro qui dépend d'un compte plus précis se subdivise depuis ce compte) ; unique par
// dossier ; nature héritée du parent sauf choix ; les comptes existants que le nouveau numéro préfixe passent sous lui.
const ajouter = async (req, res) => {
  try {
    const corps = req.body || {};
    if (!idValide(corps.parentId)) throw erreur(400, 'Compte parent : requête invalide');
    const numero = lireNumero(corps.numero);
    const libelle = lireLibelle(corps.libelle);
    const nature = hasOwn(corps, 'nature') && corps.nature != null && corps.nature !== '' ? lireNature(corps.nature) : null;
    const explication = lireExplication(corps.explication);
    const plan = await ecriturePlan(req, async (db, acces, d) => {
      const parent = await compteDe(db, d.id, corps.parentId);
      if (!parent.actif) throw erreur(409, `Le compte ${parent.numero} est désactivé : réactivez-le avant de le subdiviser`, 'COMPTE_DESACTIVE');
      if (!numero.startsWith(parent.numero) || numero.length <= parent.numero.length) throw erreur(400, `Le numéro doit commencer par ${parent.numero} et le prolonger d'au moins un chiffre`);
      const vrai = (await db.query(
        'SELECT numero FROM compta.comptes WHERE dossier_id = $1 AND LENGTH(numero) < LENGTH($2) AND LEFT($2, LENGTH(numero)) = numero ORDER BY LENGTH(numero) DESC LIMIT 1',
        [d.id, numero]
      )).rows[0];
      if (vrai && vrai.numero !== parent.numero) throw erreur(400, `Ce numéro dépend du compte ${vrai.numero} : subdivisez-le depuis ce compte`);
      if ((await db.query('SELECT 1 FROM compta.comptes WHERE dossier_id = $1 AND numero = $2', [d.id, numero])).rows.length) throw erreur(409, `Le compte ${numero} existe déjà`, 'NUMERO_EXISTANT');
      const natureFinale = nature || parent.nature;
      const ins = await db.query(
        `INSERT INTO compta.comptes (dossier_id, numero, libelle, classe, parent_id, nature, origine, explication, cree_par)
         VALUES ($1, $2, $3, $4, $5, $6, 'ajout', $7, $8) RETURNING id`,
        [d.id, numero, libelle, Number(numero[0]), parent.id, natureFinale, explication, req.user.id]
      );
      const id = ins.rows[0].id;
      await db.query(
        'UPDATE compta.comptes SET parent_id = $3, updated_at = NOW() WHERE dossier_id = $1 AND parent_id = $2 AND id <> $3 AND LEFT(numero, LENGTH($4)) = $4',
        [d.id, parent.id, id, numero]
      );
      await journaliser(db, acces.espace_id, req.user.id, 'compte_ajoute', { dossier: d.id, compte: id, numero, libelle, parent: parent.numero, nature: natureFinale, ...(explication ? { explication } : {}) });
    });
    res.status(201).json(plan);
  } catch (err) {
    repondreErreur(res, err, '[compta.plan.ajouter]');
  }
};

// PUT /api/compta/dossiers/:dossierId/plan/comptes/:compteId — { libelle?, nature?, explication? } : renommer tout compte
// (rétablir = renvoyer le libellé de la norme) ; nature et explication sur un compte ajouté seulement. Le journal garde,
// pour chaque champ changé, la valeur d'avant et celle d'après (D16) ; rien ne change : ni écriture ni journal.
const modifier = async (req, res) => {
  try {
    const corps = req.body || {};
    const libelle = hasOwn(corps, 'libelle') ? lireLibelle(corps.libelle) : null;
    const nature = hasOwn(corps, 'nature') ? lireNature(corps.nature) : null;
    const explication = hasOwn(corps, 'explication') ? lireExplication(corps.explication) : undefined;
    if (libelle == null && nature == null && explication === undefined) throw erreur(400, 'Rien à modifier');
    const plan = await ecriturePlan(req, async (db, acces, d) => {
      const c = await compteDe(db, d.id, req.params.compteId);
      const sets = [];
      const params = [c.id];
      const changements = {};
      const poser = (colonne, valeur) => {
        params.push(valeur);
        sets.push(`${colonne} = $${params.length}`);
        if ((c[colonne] ?? null) !== (valeur ?? null)) changements[colonne] = { avant: c[colonne] ?? null, apres: valeur ?? null };
      };
      if (libelle != null) poser('libelle', libelle);
      if (nature != null) poser('nature', nature);
      if (explication !== undefined) poser('explication', explication);
      // Relecture : seul un CHANGEMENT réel de nature ou d'explication est refusé sur un compte de la norme (un formulaire
      // qui renvoie la nature actuelle peut renommer ou rétablir).
      if (c.origine !== 'ajout' && (changements.nature || changements.explication)) throw erreur(409, 'La nature et l\'explication d\'un compte de la norme ne se modifient pas', 'COMPTE_PAQUET');
      // S5c : un compte porté (contrepartie d'un journal, compte d'un code, collectif d'un tiers) garde sa nature.
      if (changements.nature && await compteUtilise(db, c.id)) throw erreur(409, `Le compte ${c.numero} est porté par un journal, un code de taxe ou un tiers : sa nature ne change plus`, 'COMPTE_UTILISE');
      if (!Object.keys(changements).length) return;
      await db.query(`UPDATE compta.comptes SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1`, params);
      await journaliser(db, acces.espace_id, req.user.id, 'compte_modifie', { dossier: d.id, compte: c.id, numero: c.numero, changements });
    });
    res.json(plan);
  } catch (err) {
    repondreErreur(res, err, '[compta.plan.modifier]');
  }
};

// POST /api/compta/dossiers/:dossierId/plan/comptes/:compteId/desactiver — compte actif, sans sous-compte actif (du bas
// vers le haut), sans mouvement. Rien n'est effacé.
const desactiver = async (req, res) => {
  try {
    const plan = await ecriturePlan(req, async (db, acces, d) => {
      const c = await compteDe(db, d.id, req.params.compteId);
      if (!c.actif) throw erreur(409, `Le compte ${c.numero} est déjà désactivé`, 'DEJA_FAIT');
      const actifs = (await db.query('SELECT numero FROM compta.comptes WHERE parent_id = $1 AND actif ORDER BY numero LIMIT 4', [c.id])).rows.map((x) => x.numero);
      if (actifs.length) throw erreur(409, `Désactivez d'abord ses sous-comptes actifs (${actifs.slice(0, 3).join(', ')}${actifs.length > 3 ? '…' : ''})`, 'SOUS_COMPTES_ACTIFS');
      if (await compteMouvemente(db, c.id)) throw erreur(409, `Le compte ${c.numero} a des écritures : il ne se désactive pas`, 'COMPTE_MOUVEMENTE');
      if (await compteUtilise(db, c.id)) throw erreur(409, `Le compte ${c.numero} est porté par un journal, un code de taxe ou un tiers : il ne se désactive pas`, 'COMPTE_UTILISE');
      await db.query('UPDATE compta.comptes SET actif = false, updated_at = NOW() WHERE id = $1', [c.id]);
      await journaliser(db, acces.espace_id, req.user.id, 'compte_desactive', { dossier: d.id, compte: c.id, numero: c.numero, libelle: c.libelle });
    });
    res.json(plan);
  } catch (err) {
    repondreErreur(res, err, '[compta.plan.desactiver]');
  }
};

// POST /api/compta/dossiers/:dossierId/plan/comptes/:compteId/reactiver — compte désactivé dont le parent est actif.
const reactiver = async (req, res) => {
  try {
    const plan = await ecriturePlan(req, async (db, acces, d) => {
      const c = await compteDe(db, d.id, req.params.compteId);
      if (c.actif) throw erreur(409, `Le compte ${c.numero} n'est pas désactivé`, 'DEJA_FAIT');
      if (c.parent_id) {
        const parent = (await db.query('SELECT numero, actif FROM compta.comptes WHERE id = $1', [c.parent_id])).rows[0];
        if (parent && !parent.actif) throw erreur(409, `Réactivez d'abord le compte parent ${parent.numero}`, 'PARENT_DESACTIVE');
      }
      await db.query('UPDATE compta.comptes SET actif = true, updated_at = NOW() WHERE id = $1', [c.id]);
      await journaliser(db, acces.espace_id, req.user.id, 'compte_reactive', { dossier: d.id, compte: c.id, numero: c.numero, libelle: c.libelle });
    });
    res.json(plan);
  } catch (err) {
    repondreErreur(res, err, '[compta.plan.reactiver]');
  }
};

// DELETE /api/compta/dossiers/:dossierId/plan/comptes/:compteId — un compte AJOUTÉ, sans sous-compte, sans mouvement ;
// un compte de la norme ne se supprime jamais (il se désactive). Le journal garde de quoi l'identifier.
const supprimer = async (req, res) => {
  try {
    const plan = await ecriturePlan(req, async (db, acces, d) => {
      const c = await compteDe(db, d.id, req.params.compteId);
      if (c.origine !== 'ajout') throw erreur(409, `Le compte ${c.numero} vient de la norme : il ne se supprime pas, désactivez-le`, 'COMPTE_PAQUET');
      const enfants = (await db.query('SELECT numero FROM compta.comptes WHERE parent_id = $1 ORDER BY numero LIMIT 4', [c.id])).rows.map((x) => x.numero);
      if (enfants.length) throw erreur(409, `Supprimez d'abord ses sous-comptes (${enfants.slice(0, 3).join(', ')}${enfants.length > 3 ? '…' : ''})`, 'SOUS_COMPTES');
      if (await compteMouvemente(db, c.id)) throw erreur(409, `Le compte ${c.numero} a des écritures : il ne se supprime pas`, 'COMPTE_MOUVEMENTE');
      if (await compteUtilise(db, c.id)) throw erreur(409, `Le compte ${c.numero} est porté par un journal, un code de taxe ou un tiers : il ne se supprime pas`, 'COMPTE_UTILISE');
      const parent = c.parent_id ? (await db.query('SELECT numero FROM compta.comptes WHERE id = $1', [c.parent_id])).rows[0] : null;
      await db.query('DELETE FROM compta.comptes WHERE id = $1', [c.id]);
      await journaliser(db, acces.espace_id, req.user.id, 'compte_supprime', { dossier: d.id, compte: c.id, numero: c.numero, libelle: c.libelle, ...(parent ? { parent: parent.numero } : {}) });
    });
    res.json(plan);
  } catch (err) {
    repondreErreur(res, err, '[compta.plan.supprimer]');
  }
};

// GET /api/compta/dossiers/:dossierId/plan/export — le plan complet, classeur à la charte (excelBrandService, règle du
// projet : un seul onglet, jamais de PDF). Lecture : tout niveau.
const COLONNES_EXPORT = ['Numéro', 'Libellé', 'Libellé de la norme', 'Nature', 'Origine', 'État', 'Explication'];
const exporter = async (req, res) => {
  try {
    const { acces, d } = await lectureDossier(req.user, req.params.dossierId);
    const [c, resume] = await Promise.all([pool.query(SQL_COMPTES, [d.id]), resumePlan(pool, d.id)]);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Plan de comptes');
    const n = COLONNES_EXPORT.length;
    const jour = new Date().toLocaleDateString('fr-FR', { timeZone: 'Africa/Tunis' });
    const enTete = brandHeader(wb, ws, {
      titre: 'Plan de comptes',
      sousTitre: d.nom,
      meta: `${resume.paquet ? `Paquet ${resume.paquet.pays} ${resume.paquet.version} · ` : ''}${c.rows.length} comptes (${resume.nbActifs} actifs) · exporté le ${jour}`,
      colCount: n,
    });
    headerRow(ws, enTete, COLONNES_EXPORT, { widths: [12, 64, 44, 20, 10, 12, 40] });
    let ligne = enTete;
    c.rows.forEach((x, i) => {
      ligne += 1;
      const row = ws.getRow(ligne);
      // Le libellé de la norme n'est écrit que s'il diffère (compte renommé) ; vide pour un ajout.
      row.values = [x.numero, x.libelle, x.libelle_paquet && x.libelle_paquet !== x.libelle ? x.libelle_paquet : '', NATURES_LIBELLES[x.nature] || x.nature, x.origine === 'paquet' ? 'Norme' : 'Ajouté', x.actif ? 'Actif' : 'Désactivé', x.explication || ''];
      dataRowStyle(row, { index: i, colCount: n });
    });
    brandFooter(ws, n);
    finalize(ws, { headerRowIdx: enTete, colCount: n, lastDataRow: ligne });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="plan-de-comptes-${d.id}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    repondreErreur(res, err, '[compta.plan.exporter]');
  }
};

// ── Import Excel du plan (S5c ; D18 : tout ou rien) ─────────────────────────────────────────────────────────────────
// Colonnes du modèle : Numéro, Libellé, Nature (facultative : libellé ou valeur de la liste ; sinon héritée du parent).
const EN_TETES_IMPORT = ['Numéro', 'Libellé', 'Nature'];
const EXEMPLE_IMPORT = ['Exemple : 53211', 'BIAT - compte courant', 'Banque'];
const normaliserMot = (s) => texte(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[\s_-]+/g, ' ');
const NATURES_PAR_MOT = new Map([...NATURES.map((n) => [normaliserMot(n), n]), ...NATURES.map((n) => [normaliserMot(NATURES_LIBELLES[n]), n])]);
// Contrôle d'une ligne lue (textes), hors base : → { ligne, repere, numero?, libelle?, nature?, erreurs }.
const controlerLigneImport = ({ ligne, cellules }, numerosFichier) => {
  const [numero, libelle, nature] = cellules;
  const r = { ligne, repere: [numero, libelle].filter(Boolean).join(' — '), erreurs: [] };
  try { r.numero = lireNumero(numero); } catch (e) { r.erreurs.push(e.statusCode === 400 ? e.message : 'Numéro refusé'); }
  if (r.numero) {
    if (numerosFichier.has(r.numero)) r.erreurs.push(`Numéro ${r.numero} : en double dans le fichier`);
    numerosFichier.add(r.numero);
  }
  try { r.libelle = lireLibelle(libelle); } catch (e) { r.erreurs.push(e.statusCode === 400 ? e.message : 'Libellé refusé'); }
  const n = texte(nature);
  if (n) {
    const v = NATURES_PAR_MOT.get(normaliserMot(n));
    if (!v) r.erreurs.push(`Nature « ${n} » inconnue (${NATURES.map((x) => NATURES_LIBELLES[x]).join(', ')})`);
    else r.nature = v;
  }
  return r;
};
// Contrôle de toutes les lignes, puis des parents : un numéro inconnu du plan doit prolonger un compte du plan ou du
// fichier (son plus long préfixe) ; un numéro à deux chiffres est une racine de classe (1 à 7).
// → { valides: [{ ligne, numero, libelle, nature?, parent? }], fausses: [{ ligne, repere, erreurs }] }
const controlerLignesImport = (lignes, numerosPlan) => {
  const numerosFichier = new Set();
  const valides = [];
  const fausses = [];
  for (const l of lignes) {
    const r = controlerLigneImport(l, numerosFichier);
    if (r.erreurs.length) fausses.push({ ligne: r.ligne, repere: r.repere, erreurs: r.erreurs });
    else valides.push(r);
  }
  const tous = new Set([...numerosPlan, ...valides.map((v) => v.numero)]);
  for (const v of valides) {
    if (numerosPlan.has(v.numero)) continue;
    if (v.numero.length > NUMERO_MIN) {
      v.parent = parentParmi(v.numero, tous);
      if (!v.parent) fausses.push({ ligne: v.ligne, repere: v.repere, erreurs: [`Numéro ${v.numero} : aucun compte parent, ni dans le plan ni dans le fichier`] });
    } else if (!(Number(v.numero[0]) >= 1 && Number(v.numero[0]) <= 7)) {
      fausses.push({ ligne: v.ligne, repere: v.repere, erreurs: [`Numéro ${v.numero} : classe hors 1 à 7`] });
    }
  }
  const fautives = new Set(fausses.map((f) => f.ligne));
  return { valides: valides.filter((v) => !fautives.has(v.ligne)), fausses: fausses.sort((a, b) => a.ligne - b.ligne) };
};

// GET /api/compta/dossiers/:dossierId/plan/modele-import — le modèle à la charte (lecture : tout niveau).
const modeleImport = async (req, res) => {
  try {
    const { d } = await lectureDossier(req.user, req.params.dossierId);
    const { wb } = modeleClasseur({
      feuille: 'Plan de comptes',
      titre: 'Modèle d\'import — plan de comptes',
      sousTitre: d.nom,
      meta: `Une ligne par compte sous les en-têtes ; la ligne d'exemple (grisée) est ignorée. Numéro de ${NUMERO_MIN} à ${NUMERO_MAX} chiffres : un numéro déjà dans le plan est renommé, un numéro inconnu est ajouté sous le compte dont il prolonge le numéro ; nature facultative, pour les comptes ajoutés seulement (Banque, Caisse, Fournisseurs… ; sinon celle du parent). Toutes les lignes sont contrôlées : rien n'est importé à la moindre erreur.`,
      enTetes: EN_TETES_IMPORT,
      largeurs: [14, 60, 28],
      exemple: EXEMPLE_IMPORT,
    });
    await envoyerClasseur(res, wb, `modele-plan-de-comptes-${d.id}.xlsx`);
  } catch (err) {
    repondreErreur(res, err, '[compta.plan.modeleImport]');
  }
};

// POST /api/compta/dossiers/:dossierId/plan/import — fichier « fichier » (multipart) ; titulaire ou Complet. Toutes les
// lignes sont contrôlées ; à la moindre erreur, 400 avec le rapport ligne par ligne et rien d'écrit ; sinon, dans une
// transaction : les numéros connus sont renommés (libellé différent), les inconnus ajoutés du plus court au plus long
// (origine « ajout », explication « Importé d'un autre logiciel », actif si le parent l'est, les comptes qu'ils préfixent
// passent sous eux), un événement de journal. Jamais de désactivation ni de suppression. → 201 { …plan, importation }.
const importer = async (req, res) => {
  try {
    if (!req.file?.buffer) throw erreur(400, 'Fichier requis (classeur Excel .xlsx dans le champ « fichier »)', 'FICHIER_REQUIS');
    // Accès, droit et état du dossier jugés AVANT d'analyser le classeur (relecture) ; la transaction les rejoue.
    const garde = await lectureDossier(req.user, req.params.dossierId);
    if (!droits(garde.acces).configurer) throw erreur(403, MSG_CONFIGURER, 'NIVEAU_INSUFFISANT');
    if (garde.d.etat === 'archive') throw erreur(409, 'Dossier archivé : désarchivez-le d\'abord', 'DOSSIER_ARCHIVE');
    const lignes = await lireClasseur(req.file.buffer, { enTetes: EN_TETES_IMPORT });
    const fichier = nomFichier(req.file);
    let importation = null;
    const plan = await ecriturePlan(req, async (db, acces, d) => {
      const parNumero = new Map((await db.query('SELECT id, numero, libelle, nature, actif FROM compta.comptes WHERE dossier_id = $1', [d.id])).rows.map((c) => [c.numero, c]));
      const { valides, fausses } = controlerLignesImport(lignes, new Set(parNumero.keys()));
      if (fausses.length) throw erreurImport(fausses, lignes.length);
      const renommes = [];
      const ajoutes = [];
      let inchanges = 0;
      for (const v of valides) {
        const c = parNumero.get(v.numero);
        if (!c) continue;
        if (c.libelle === v.libelle) { inchanges += 1; continue; }
        await db.query('UPDATE compta.comptes SET libelle = $2, updated_at = NOW() WHERE id = $1', [c.id, v.libelle]);
        renommes.push({ numero: v.numero, avant: c.libelle, apres: v.libelle });
      }
      const explication = `Importé d'un autre logiciel le ${jourTunis()}`;
      const nouveaux = valides.filter((v) => !parNumero.has(v.numero)).sort((a, b) => (a.numero < b.numero ? -1 : a.numero > b.numero ? 1 : 0));
      for (const v of nouveaux) {
        const parent = v.parent ? parNumero.get(v.parent) : null;
        const nature = v.nature || (parent ? parent.nature : 'general');
        const actif = parent ? parent.actif : true;
        const ins = await db.query(
          `INSERT INTO compta.comptes (dossier_id, numero, libelle, classe, parent_id, nature, origine, explication, actif, cree_par)
           VALUES ($1, $2, $3, $4, $5, $6, 'ajout', $7, $8, $9) RETURNING id`,
          [d.id, v.numero, v.libelle, Number(v.numero[0]), parent ? parent.id : null, nature, explication, actif, req.user.id]
        );
        const id = ins.rows[0].id;
        // Même invariant que « Subdiviser » : les comptes existants que le nouveau numéro préfixe passent sous lui.
        if (parent) await db.query('UPDATE compta.comptes SET parent_id = $3, updated_at = NOW() WHERE dossier_id = $1 AND parent_id = $2 AND id <> $3 AND LEFT(numero, LENGTH($4)) = $4', [d.id, parent.id, id, v.numero]);
        parNumero.set(v.numero, { id, numero: v.numero, libelle: v.libelle, nature, actif });
        ajoutes.push({ numero: v.numero, libelle: v.libelle, parent: v.parent || null, nature });
      }
      importation = { fichier, nbLignes: lignes.length, renommes: renommes.length, ajoutes: ajoutes.length, inchanges };
      await journaliser(db, acces.espace_id, req.user.id, 'plan_importe', { dossier: d.id, ...importation, comptesRenommes: renommes, comptesAjoutes: ajoutes.map((a) => a.numero) });
    });
    res.status(201).json({ ...plan, importation });
  } catch (err) {
    repondreImport(res, err, '[compta.plan.importer]');
  }
};

module.exports = {
  MSG_CONFIGURER, HORS_W1252, lireNumero, lireLibelle, lireNature, lireExplication, compteMouvemente, compteUtilise, SQL_COMPTES, presenterCompte, COLONNES_EXPORT,
  lectureDossier, presenterDossier, EN_TETES_IMPORT, EXEMPLE_IMPORT, controlerLigneImport, controlerLignesImport,
  lire, ajouter, modifier, desactiver, reactiver, supprimer, exporter, modeleImport, importer,
};
