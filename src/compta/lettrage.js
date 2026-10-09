// LabFlow Compta, étape S7a « Lettrage, échéancier, relevés » (labflow-reprise/achats-compta/PLAN-S7.md §1 ligne S7a, §2
// « S7a », §4 « Lettrage » et « Droits » ; réponses du client du 09/10 — « ok pour les 9 » : seules les lignes
// d'écritures VALIDÉES se lettrent (un brouillard peut encore changer) ; une lettre = somme nulle, un règlement partiel
// reste non lettré jusqu'au solde ; CADRAGE §5 « Tiers et lettrage » ; NC 01 : le lettrage est une marque, jamais une
// écriture). Le lettrage des lignes d'un tiers (compta.lettrages, compta.lignes.lettrage_id — migration 218) : une LETTRE
// (AAA à ZZZ, propre à chaque tiers) réunit au moins deux lignes validées non lettrées d'un même tiers, sur un même compte
// collectif, dont le total des débits égale le total des crédits ; elle se défait en bloc ; une écriture contre-passée est
// délettrée d'office (validation.js). Lectures : la page (les tiers mouvementés et leurs lignes à lettrer), un tiers (ses
// lignes non lettrées, ses lettres avec leurs lignes, les rapprochements proposés : même pièce, puis même montant).
// Routes (D3) : /api/compta/dossiers/:dossierId/lettrage… ; lettrer et délettrer passent par la transaction verrouillée du
// dossier (dansEspaceDuDossier : comptabilité verrouillée, dossier relu sous verrou, garde par comptabilité D4), puis par
// le droit « saisir » (titulaire, Complet, Saisie) et l'état du dossier (archivé : rien ne change). Le dossier étant
// verrouillé, la lettre suivante se calcule sans course. Montants en millimes entiers (BigInt), jamais de flottant.
const pool = require('../config/database');
const { journaliser } = require('./journal');
const { modeTitulaire, etatAbonnement } = require('./garde');
const { erreur, idValide, repondreErreur } = require('./comptablesClient');
const { TYPES_TIERS_LIBELLES } = require('./paquets');
const { droits, dansEspaceDuDossier } = require('./dossiers');
const { lectureDossier, presenterDossier } = require('./planComptes');
const { millimesDe, texteMillimes, fmtMillimes, fmtDate, numeroProvisoire } = require('./ecritures');

const MSG_LETTRER = 'Seul le titulaire ou un gérant de niveau Complet ou Saisie peut lettrer ou délettrer';
// Bornes : lignes non lettrées montrées pour un tiers (les plus anciennes d'abord), lettres montrées (les plus récentes),
// lettres d'une demande, lignes d'une lettre et d'une demande, propositions.
const LIGNES_MAX = 2000;
const LETTRES_MAX = 200;
const GROUPES_MAX = 500;
const LIGNES_PAR_LETTRE_MAX = 1000;
const LIGNES_DEMANDE_MAX = 5000;
const LIGNES_DES_LETTRES_MAX = 2000;
const PROPOSITIONS_MAX = 500;

// ── Lettres AAA → ZZZ ───────────────────────────────────────────────────────────────────────────────────────────────
const A = 'A'.charCodeAt(0);
const LETTRES_NB = 26 * 26 * 26;
const lettreDe = (n) => String.fromCharCode(A + Math.floor(n / 676), A + (Math.floor(n / 26) % 26), A + (n % 26));
const rangDeLettre = (l) => (l.charCodeAt(0) - A) * 676 + (l.charCodeAt(1) - A) * 26 + (l.charCodeAt(2) - A);
// Les `n` lettres suivantes d'un tiers : après la plus haute déjà prise (AAA s'il n'en a aucune) ; au-delà de ZZZ, les
// premières libres (lettres défaites) ; 409 quand toutes sont prises.
const lettresSuivantes = (prises, n = 1) => {
  const pris = new Set(prises);
  let haut = -1;
  for (const l of pris) haut = Math.max(haut, rangDeLettre(l));
  const res = [];
  for (let r = haut + 1; r < LETTRES_NB && res.length < n; r += 1) res.push(lettreDe(r));
  for (let r = 0; r <= haut && res.length < n; r += 1) if (!pris.has(lettreDe(r))) res.push(lettreDe(r));
  if (res.length < n) throw erreur(409, `Plus aucune lettre libre pour ce tiers (${LETTRES_NB} au plus) : délettrez d'anciennes lettres`, 'LETTRES_EPUISEES');
  return res;
};

// ── Lecture des demandes ────────────────────────────────────────────────────────────────────────────────────────────
// Corps : { tiersId, groupes: [[ligneId, …], …] } (une lettre par groupe : « Lettrer les propositions ») ou { tiersId,
// lignes: [ligneId, …] } (une seule lettre : les lignes cochées). Tout est contrôlé avant la moindre requête.
const lireLettrage = (corps) => {
  if (!corps || typeof corps !== 'object') throw erreur(400, 'Lettrage : requête invalide');
  if (!idValide(corps.tiersId)) throw erreur(400, 'Choisissez le tiers', 'TIERS_REQUIS');
  const brut = corps.groupes !== undefined ? corps.groupes : [corps.lignes];
  if (!Array.isArray(brut) || !brut.length) throw erreur(400, 'Cochez les lignes à lettrer', 'LIGNES_REQUISES');
  if (brut.length > GROUPES_MAX) throw erreur(400, `${GROUPES_MAX} lettres au plus à la fois`);
  const vues = new Set();
  const groupes = brut.map((g) => {
    if (!Array.isArray(g)) throw erreur(400, 'Cochez les lignes à lettrer', 'LIGNES_REQUISES');
    if (g.length > LIGNES_PAR_LETTRE_MAX) throw erreur(400, `${LIGNES_PAR_LETTRE_MAX} lignes au plus par lettre`);
    const ids = g.map((id) => {
      if (!idValide(id)) throw erreur(400, 'Ligne : requête invalide');
      return Number(id);
    });
    if (ids.length < 2) throw erreur(400, 'Une lettre réunit au moins deux lignes (par exemple une facture et son règlement)', 'LIGNES_MIN');
    for (const id of ids) {
      if (vues.has(id)) throw erreur(400, 'Une même ligne est cochée deux fois', 'LIGNE_EN_DOUBLE');
      vues.add(id);
    }
    return ids;
  });
  if (vues.size > LIGNES_DEMANDE_MAX) throw erreur(400, `${LIGNES_DEMANDE_MAX} lignes au plus à la fois`);
  return { tiersId: Number(corps.tiersId), groupes };
};
// Une lettre se fait sur un seul compte, à écart nul : → le montant (total des débits = total des crédits), en millimes.
// `lignes` : lues en base (montants en texte). Chaque ligne n'a qu'un côté (CHECK de la 215) : l'égalité des totaux
// suppose donc au moins une ligne de chaque côté.
const montantDuGroupe = (lignes) => {
  const comptes = [...new Set(lignes.map((l) => l.compte_numero))];
  if (comptes.length > 1) throw erreur(400, `Les lignes d'une lettre sont sur un même compte collectif (ici ${comptes.join(' et ')}) : lettrez-les compte par compte`, 'COMPTES_DIFFERENTS');
  let d = 0n;
  let c = 0n;
  for (const l of lignes) { d += millimesDe(l.debit); c += millimesDe(l.credit); }
  if (d !== c) throw erreur(400, `Écart de ${fmtMillimes(d > c ? d - c : c - d)} : débits ${fmtMillimes(d)} ≠ crédits ${fmtMillimes(c)} — une lettre se fait à écart nul (un règlement partiel reste non lettré jusqu'au solde)`, 'ECART');
  return d;
};

// ── Lectures ────────────────────────────────────────────────────────────────────────────────────────────────────────
const SQL_LIGNE = `
  SELECT l.id, l.date::text AS date, l.rang, l.libelle, l.debit::text AS debit, l.credit::text AS credit, l.echeance::text AS echeance, l.lettrage_id, l.tiers_id,
         k.id AS compte_id, k.numero AS compte_numero, k.libelle AS compte_libelle,
         e.id AS ecriture_id, e.numero, e.numero_provisoire, e.etat, e.reference, e.libelle AS ecriture_libelle, e.date_reelle::text AS date_reelle, e.origine, e.origine_id,
         j.code AS journal_code
    FROM compta.lignes l
    JOIN compta.ecritures e ON e.id = l.ecriture_id
    JOIN compta.journaux j ON j.id = e.journal_id
    JOIN compta.comptes k ON k.id = l.compte_id`;
const ORDRE_LIGNES = 'ORDER BY l.date, e.numero NULLS LAST, e.numero_provisoire, l.rang';
// Les lignes non lettrées d'un tiers ($1 dossier, $2 tiers), les plus anciennes d'abord, bornées ($3).
const SQL_NON_LETTREES = `${SQL_LIGNE}
   WHERE l.dossier_id = $1 AND l.tiers_id = $2 AND l.lettrage_id IS NULL
   ${ORDRE_LIGNES}
   LIMIT $3`;
// Leurs comptes rendus (toutes, pas seulement celles montrées) : nombre, à lettrer (validées), en brouillard, totaux.
const SQL_SOMMES_NON_LETTREES = `
  SELECT COUNT(*)::int AS nb, COUNT(*) FILTER (WHERE e.etat = 'validee')::int AS nb_validees, COUNT(*) FILTER (WHERE e.etat = 'brouillard')::int AS nb_brouillard,
         COALESCE(SUM(l.debit), 0)::numeric(18,3)::text AS debit, COALESCE(SUM(l.credit), 0)::numeric(18,3)::text AS credit
    FROM compta.lignes l JOIN compta.ecritures e ON e.id = l.ecriture_id
   WHERE l.dossier_id = $1 AND l.tiers_id = $2 AND l.lettrage_id IS NULL`;
// Les lettres d'un tiers ($1 dossier, $2 tiers), les plus récentes d'abord, bornées ($3), et leur nombre.
const SQL_LETTRES = `
  SELECT lt.id, lt.lettre, lt.montant::text AS montant, lt.nb_lignes, lt.created_at, u.nom AS cree_par_nom, k.id AS compte_id, k.numero AS compte_numero
    FROM compta.lettrages lt
    JOIN compta.comptes k ON k.id = lt.compte_id
    LEFT JOIN utilisateurs u ON u.id = lt.cree_par
   WHERE lt.dossier_id = $1 AND lt.tiers_id = $2
   ORDER BY lt.id DESC
   LIMIT $3`;
// Les lignes de lettres ($2), les lettres les plus récentes d'abord, bornées ($3 : relecture de S7a — 200 lettres de
// règlements globaux pouvaient rendre des dizaines de milliers de lignes, sous le verrou du dossier après un lettrage).
const SQL_LIGNES_DES_LETTRES = `${SQL_LIGNE}
   WHERE l.dossier_id = $1 AND l.lettrage_id = ANY($2)
   ORDER BY l.lettrage_id DESC, l.date, e.numero NULLS LAST, e.numero_provisoire, l.rang
   LIMIT $3`;
// Les tiers mouvementés du dossier ($1), avec leurs lignes à lettrer (validées non lettrées), en brouillard et lettrées.
const SQL_TIERS = `
  SELECT t.id, t.type, t.code, t.nom, t.actif, t.compte_id, t.delai_paiement,
         COUNT(*) FILTER (WHERE l.lettrage_id IS NULL AND e.etat = 'validee')::int AS nb_a_lettrer,
         COUNT(*) FILTER (WHERE l.lettrage_id IS NULL AND e.etat = 'brouillard')::int AS nb_brouillard,
         COUNT(*) FILTER (WHERE l.lettrage_id IS NOT NULL)::int AS nb_lettrees
    FROM compta.tiers t
    JOIN compta.lignes l ON l.tiers_id = t.id AND l.dossier_id = $1
    JOIN compta.ecritures e ON e.id = l.ecriture_id
   WHERE t.dossier_id = $1
   GROUP BY t.id
   ORDER BY t.type, t.code`;
const presenterLigne = (l) => ({
  id: l.id, date: l.date, dateReelle: l.date_reelle, rang: l.rang, libelle: l.libelle || l.ecriture_libelle, debit: l.debit, credit: l.credit, echeance: l.echeance,
  compte: { id: l.compte_id, numero: l.compte_numero, libelle: l.compte_libelle },
  ecriture: { id: l.ecriture_id, numero: l.numero, numeroProvisoire: numeroProvisoire(l.numero_provisoire), etat: l.etat, reference: l.reference, libelle: l.ecriture_libelle, origine: l.origine, origineId: l.origine_id, journal: l.journal_code },
});
const presenterTiersLettrage = (t) => ({
  id: t.id, type: t.type, typeLibelle: TYPES_TIERS_LIBELLES[t.type] || t.type, code: t.code, nom: t.nom, actif: t.actif, compteId: t.compte_id, delaiPaiement: t.delai_paiement, retenue: null,
  nbALettrer: t.nb_a_lettrer, nbBrouillard: t.nb_brouillard, nbLettrees: t.nb_lettrees,
});
// Les rapprochements évidents parmi les lignes VALIDÉES non lettrées (présentées, dans l'ordre chronologique) : 0) une
// ligne d'une contre-passation avec la ligne qu'elle annule (même compte, même montant, côté opposé, dans l'écriture
// d'origine : relecture de S7a — sans quoi une facture pouvait s'apparier à l'ancien règlement de même pièce) ; 1) les
// lignes d'une même pièce, sur un même compte, qui se soldent (une facture et son règlement référencé) ; 2) puis, compte
// par compte, une ligne au débit et une ligne au crédit du même montant, la plus ancienne avec la plus ancienne. Une ligne
// n'entre que dans une proposition ; rien n'est lettré d'office. → [{ motif ('contrepassation' | 'piece' | 'montant'),
// piece, lignes (identifiants), montant }], dans l'ordre de leur première ligne.
const proposer = (lignes) => {
  const ordre = new Map(lignes.map((l, i) => [l.id, i]));
  const libres = lignes.filter((l) => l.ecriture.etat === 'validee');
  const prises = new Set();
  const propositions = [];
  for (const cp of libres.filter((l) => l.ecriture.origine === 'contrepassation' && l.ecriture.origineId)) {
    if (prises.has(cp.id)) continue;
    const dCp = millimesDe(cp.debit);
    const mCp = dCp > 0n ? dCp : millimesDe(cp.credit);
    const origine = libres.find((l) => !prises.has(l.id) && l.ecriture.id === cp.ecriture.origineId && l.compte.id === cp.compte.id
      && (dCp > 0n ? millimesDe(l.credit) : millimesDe(l.debit)) === mCp);
    if (!origine) continue;
    propositions.push({ motif: 'contrepassation', piece: origine.ecriture.reference, lignes: [origine.id, cp.id], montant: texteMillimes(mCp) });
    prises.add(origine.id);
    prises.add(cp.id);
  }
  const parPiece = new Map();
  for (const l of libres) {
    if (prises.has(l.id)) continue;
    const piece = String(l.ecriture.reference || '').trim().toUpperCase();
    if (!piece) continue;
    const cle = `${l.compte.id}\u0000${piece}`;
    if (!parPiece.has(cle)) parPiece.set(cle, []);
    parPiece.get(cle).push(l);
  }
  for (const g of parPiece.values()) {
    if (g.length < 2 || g.length > 50) continue;
    let d = 0n;
    let c = 0n;
    for (const l of g) { d += millimesDe(l.debit); c += millimesDe(l.credit); }
    if (d !== c || d === 0n) continue;
    propositions.push({ motif: 'piece', piece: g[0].ecriture.reference, lignes: g.map((l) => l.id), montant: texteMillimes(d) });
    for (const l of g) prises.add(l.id);
  }
  const parMontant = new Map();
  for (const l of libres) {
    if (prises.has(l.id)) continue;
    const d = millimesDe(l.debit);
    const m = d > 0n ? d : millimesDe(l.credit);
    const cle = `${l.compte.id}\u0000${m}`;
    if (!parMontant.has(cle)) parMontant.set(cle, { montant: m, debits: [], credits: [] });
    (d > 0n ? parMontant.get(cle).debits : parMontant.get(cle).credits).push(l);
  }
  for (const x of parMontant.values()) {
    const n = Math.min(x.debits.length, x.credits.length);
    for (let i = 0; i < n; i += 1) propositions.push({ motif: 'montant', piece: null, lignes: [x.debits[i].id, x.credits[i].id], montant: texteMillimes(x.montant) });
  }
  const premier = (p) => Math.min(...p.lignes.map((id) => ordre.get(id)));
  return propositions.sort((a, b) => premier(a) - premier(b)).slice(0, PROPOSITIONS_MAX);
};

// Le tiers, s'il est dans le dossier. `statut` : 404 en lecture ; 409 dans la transaction d'un lettrage (un 404 y
// deviendrait « Dossier introuvable » : relecture de S7a).
const tiersDuDossier = async (db, dossierId, tiersId, statut = 404) => {
  if (!idValide(tiersId)) throw erreur(statut, 'Tiers introuvable : relisez la page', 'TIERS_INTROUVABLE');
  const t = (await db.query('SELECT id, type, code, nom, actif, compte_id, delai_paiement FROM compta.tiers WHERE dossier_id = $1 AND id = $2', [dossierId, tiersId])).rows[0];
  if (!t) throw erreur(statut, 'Tiers introuvable : relisez la page', 'TIERS_INTROUVABLE');
  return t;
};
// Les lettres d'un tiers avec leurs lignes (les plus récentes d'abord, lignes bornées : une lettre montre alors moins de
// lignes que son nombre) et leur nombre. Requêtes en série : elles passent aussi par le client de la transaction d'un
// lettrage (pg refuse bientôt les requêtes simultanées sur un même client : relecture de S7a).
const lettresDe = async (db, dossierId, tiersId) => {
  const lt = await db.query(SQL_LETTRES, [dossierId, tiersId, LETTRES_MAX]);
  const n = await db.query('SELECT COUNT(*)::int AS n FROM compta.lettrages WHERE dossier_id = $1 AND tiers_id = $2', [dossierId, tiersId]);
  const parLettre = new Map(lt.rows.map((x) => [x.id, []]));
  if (lt.rows.length) for (const l of (await db.query(SQL_LIGNES_DES_LETTRES, [dossierId, lt.rows.map((x) => x.id), LIGNES_DES_LETTRES_MAX])).rows) parLettre.get(l.lettrage_id).push(presenterLigne(l));
  return {
    lettres: lt.rows.map((x) => ({ id: x.id, lettre: x.lettre, montant: x.montant, nbLignes: x.nb_lignes, compte: { id: x.compte_id, numero: x.compte_numero }, creePar: x.cree_par_nom || null, creeLe: x.created_at, lignes: parLettre.get(x.id) })),
    nbLettres: n.rows[0].n,
  };
};
// L'état d'un tiers : ses lignes non lettrées (bornées), leurs comptes rendus et leur solde, ses lettres, les propositions.
const etatTiers = async (db, d, t) => {
  const lignes = await db.query(SQL_NON_LETTREES, [d.id, t.id, LIGNES_MAX]);
  const sommes = await db.query(SQL_SOMMES_NON_LETTREES, [d.id, t.id]);
  const lettres = await lettresDe(db, d.id, t.id);
  const s = sommes.rows[0];
  const solde = millimesDe(s.debit) - millimesDe(s.credit);
  const presentees = lignes.rows.map(presenterLigne);
  return {
    // compteId : le choix du tiers de la page le propose même sans ligne (ouvert depuis la page Tiers ; relecture).
    tiers: { id: t.id, type: t.type, typeLibelle: TYPES_TIERS_LIBELLES[t.type] || t.type, code: t.code, nom: t.nom, actif: t.actif, delaiPaiement: t.delai_paiement, compteId: t.compte_id },
    lignes: presentees,
    total: s.nb,
    totaux: { nb: s.nb, nbALettrer: s.nb_validees, nbBrouillard: s.nb_brouillard, debit: s.debit, credit: s.credit, solde: texteMillimes(solde), soldeDebit: texteMillimes(solde > 0n ? solde : 0n), soldeCredit: texteMillimes(solde < 0n ? -solde : 0n) },
    ...lettres,
    propositions: proposer(presentees),
  };
};
// L'état de la page : le dossier, les droits, les tiers mouvementés (choix), les comptes rendus, les bornes, l'abonnement.
const etatLettrage = async (db, acces, d) => {
  const [tiers, nb, mode] = await Promise.all([
    db.query(SQL_TIERS, [d.id]),
    db.query('SELECT COUNT(*)::int AS n FROM compta.lettrages WHERE dossier_id = $1', [d.id]),
    modeTitulaire(db, acces.espace_id),
  ]);
  const liste = tiers.rows.map(presenterTiersLettrage);
  return {
    dossier: presenterDossier(acces, d),
    droits: droits(acces),
    tiers: liste,
    nb: { aLettrer: liste.reduce((n, t) => n + t.nbALettrer, 0), brouillard: liste.reduce((n, t) => n + t.nbBrouillard, 0), lettres: nb.rows[0].n },
    bornes: { lignesMax: LIGNES_MAX, lettresMax: LETTRES_MAX },
    etatAbonnement: etatAbonnement(mode),
  };
};

// ── Défaire des lettres (délettrer, contre-passation) ───────────────────────────────────────────────────────────────
// Les lettres `ids` du dossier, verrouillées, avec le code du tiers et leurs lignes (pour le journal) ; puis défaites :
// leurs lignes redeviennent non lettrées, les lettres disparaissent. → leur résumé D16.
const defaireLettres = async (db, dossierId, ids) => {
  if (!ids.length) return [];
  const lt = (await db.query(
    `SELECT lt.id, lt.lettre, lt.montant::text AS montant, lt.tiers_id, t.code AS tiers_code, k.numero AS compte_numero
       FROM compta.lettrages lt JOIN compta.tiers t ON t.id = lt.tiers_id JOIN compta.comptes k ON k.id = lt.compte_id
      WHERE lt.dossier_id = $1 AND lt.id = ANY($2)
      ORDER BY lt.id FOR UPDATE OF lt`,
    [dossierId, ids]
  )).rows;
  if (!lt.length) return [];
  const lignes = (await db.query(SQL_LIGNES_DES_LETTRES, [dossierId, lt.map((x) => x.id), lt.length * LIGNES_PAR_LETTRE_MAX])).rows;
  await db.query('UPDATE compta.lignes SET lettrage_id = NULL WHERE dossier_id = $1 AND lettrage_id = ANY($2)', [dossierId, lt.map((x) => x.id)]);
  await db.query('DELETE FROM compta.lettrages WHERE dossier_id = $1 AND id = ANY($2)', [dossierId, lt.map((x) => x.id)]);
  return lt.map((x) => ({
    id: x.id, lettre: x.lettre, tiers: x.tiers_code, tiersId: x.tiers_id, compte: x.compte_numero, montant: x.montant,
    lignes: lignes.filter((l) => l.lettrage_id === x.id).map((l) => ({ id: l.id, ecriture: l.numero || numeroProvisoire(l.numero_provisoire), date: l.date, debit: l.debit, credit: l.credit })),
  }));
};
// S6b + S7a : une écriture contre-passée est délettrée d'office (ses lignes lettrées perdent leur lettre, et les autres
// lignes de ces lettres aussi : une lettre se défait en bloc). Appelé dans la transaction de la contre-passation. →
// les lettres défaites (journal `lettrage_defait`, motif « contre-passation »).
const delettrerEcriture = async (db, { espaceId, auteurId, dossierId }, ecriture) => {
  const ids = (await db.query('SELECT DISTINCT lettrage_id FROM compta.lignes WHERE dossier_id = $1 AND ecriture_id = $2 AND lettrage_id IS NOT NULL', [dossierId, ecriture.id])).rows.map((r) => r.lettrage_id);
  const defaites = await defaireLettres(db, dossierId, ids);
  for (const x of defaites) await journaliser(db, espaceId, auteurId, 'lettrage_defait', { dossier: dossierId, motif: 'contrepassation', ecriture: ecriture.id, numero: ecriture.numero, ...x });
  return defaites.map((x) => `${x.tiers} ${x.lettre}`);
};

// ── Routes ──────────────────────────────────────────────────────────────────────────────────────────────────────────
// Lettrer et délettrer : transaction verrouillée du dossier, droit « saisir » (titulaire, Complet, Saisie — PLAN-S7 §4
// « Droits »), dossier non archivé ; puis ce que le travail rend.
const ecritureLettrage = (req, travail) => dansEspaceDuDossier(req.user, req.params.dossierId, async (db, acces, d) => {
  if (!droits(acces).saisir) throw erreur(403, MSG_LETTRER, 'NIVEAU_INSUFFISANT');
  if (d.etat === 'archive') throw erreur(409, 'Dossier archivé : désarchivez-le d\'abord', 'DOSSIER_ARCHIVE');
  return travail(db, acces, d);
});

// GET /api/compta/dossiers/:dossierId/lettrage — la page (lecture : tout niveau).
const lire = async (req, res) => {
  try {
    const { acces, d } = await lectureDossier(req.user, req.params.dossierId);
    res.json(await etatLettrage(pool, acces, d));
  } catch (err) {
    repondreErreur(res, err, '[compta.lettrage.lire]');
  }
};

// GET /api/compta/dossiers/:dossierId/lettrage/tiers/:tiersId — un tiers : lignes non lettrées, lettres, propositions.
const unTiers = async (req, res) => {
  try {
    if (!idValide(req.params.tiersId)) throw erreur(404, 'Tiers introuvable');
    const { d } = await lectureDossier(req.user, req.params.dossierId);
    res.json(await etatTiers(pool, d, await tiersDuDossier(pool, d.id, req.params.tiersId)));
  } catch (err) {
    repondreErreur(res, err, '[compta.lettrage.tiers]');
  }
};

// POST /api/compta/dossiers/:dossierId/lettrage — { tiersId, lignes } ou { tiersId, groupes } : une lettre par groupe ;
// chaque ligne : du dossier, du tiers, d'une écriture validée, non lettrée ; chaque groupe : un seul compte, écart nul ;
// lettres suivantes du tiers ; journal D16 `lettrage_fait`. Tout ou rien. → 201 l'état du tiers (+ lettres faites).
const lettrer = async (req, res) => {
  try {
    const demande = lireLettrage(req.body || {});
    const resultat = await ecritureLettrage(req, async (db, acces, d) => {
      const t = await tiersDuDossier(db, d.id, demande.tiersId, 409);
      const ids = demande.groupes.flat();
      const lues = new Map((await db.query(`${SQL_LIGNE} WHERE l.dossier_id = $1 AND l.id = ANY($2) FOR UPDATE OF l`, [d.id, ids])).rows.map((l) => [l.id, l]));
      const groupes = demande.groupes.map((g) => g.map((id) => {
        const l = lues.get(id);
        // 409 et non 404 : dans la transaction du dossier, un 404 devient « Dossier introuvable » (S4c) ; une ligne d'un
        // autre dossier reçoit la même réponse qu'une ligne supprimée (rien n'est révélé).
        if (!l) throw erreur(409, 'Une ligne cochée est introuvable (supprimée entre-temps ?) : relisez la page', 'LIGNE_INTROUVABLE');
        const qui = `${l.numero || numeroProvisoire(l.numero_provisoire)} du ${fmtDate(l.date)}`;
        if (l.tiers_id !== t.id) throw erreur(400, `La ligne de l'écriture ${qui} n'est pas du ${(TYPES_TIERS_LIBELLES[t.type] || 'tiers').toLowerCase()} ${t.code}`, 'TIERS_DIFFERENT');
        if (l.etat !== 'validee') throw erreur(409, `L'écriture ${qui} est en brouillard : validez-la d'abord (seules les lignes d'écritures validées se lettrent)`, 'LIGNE_BROUILLARD');
        if (l.lettrage_id) throw erreur(409, `La ligne de l'écriture ${qui} est déjà lettrée : relisez la page`, 'DEJA_LETTREE');
        return l;
      }));
      const montants = groupes.map(montantDuGroupe);
      const prises = (await db.query('SELECT lettre FROM compta.lettrages WHERE tiers_id = $1', [t.id])).rows.map((r) => r.lettre);
      const lettres = lettresSuivantes(prises, groupes.length);
      // Toutes les lettres en une requête, puis toutes les lignes en une autre (relecture de S7a : 500 propositions ne font
      // plus 1 000 allers-retours sous le verrou du dossier).
      const ins = await db.query(
        `INSERT INTO compta.lettrages (dossier_id, tiers_id, compte_id, lettre, montant, nb_lignes, cree_par)
         SELECT $1, $2, v.compte_id, v.lettre, v.montant, v.nb, $7 FROM unnest($3::int[], $4::text[], $5::numeric[], $6::int[]) AS v(compte_id, lettre, montant, nb)
         RETURNING id, lettre`,
        [d.id, t.id, groupes.map((g) => g[0].compte_id), lettres, montants.map(texteMillimes), groupes.map((g) => g.length), req.user.id]
      );
      const idParLettre = new Map(ins.rows.map((x) => [x.lettre.trim(), x.id]));
      const lignesLettre = groupes.flatMap((g, i) => g.map((l) => [l.id, idParLettre.get(lettres[i])]));
      const maj = await db.query(
        `UPDATE compta.lignes l SET lettrage_id = v.lettrage_id FROM unnest($2::int[], $3::int[]) AS v(ligne_id, lettrage_id)
          WHERE l.id = v.ligne_id AND l.dossier_id = $1 AND l.lettrage_id IS NULL`,
        [d.id, lignesLettre.map((x) => x[0]), lignesLettre.map((x) => x[1])]
      );
      if (maj.rowCount !== lignesLettre.length) throw erreur(409, 'Des lignes ont changé pendant le lettrage : relisez la page', 'PERIME');
      const faites = groupes.map((g, i) => ({
        id: idParLettre.get(lettres[i]), lettre: lettres[i], compte: g[0].compte_numero, montant: texteMillimes(montants[i]),
        lignes: g.map((l) => ({ id: l.id, ecriture: l.numero || numeroProvisoire(l.numero_provisoire), date: l.date, debit: l.debit, credit: l.credit })),
      }));
      await journaliser(db, acces.espace_id, req.user.id, 'lettrage_fait', { dossier: d.id, tiers: t.code, tiersId: t.id, lettres: faites });
      return { ...(await etatTiers(db, d, t)), faites: faites.map((x) => ({ id: x.id, lettre: x.lettre, montant: x.montant, nbLignes: x.lignes.length })) };
    });
    res.status(201).json(resultat);
  } catch (err) {
    repondreErreur(res, err, '[compta.lettrage.lettrer]');
  }
};

// DELETE /api/compta/dossiers/:dossierId/lettrage/:lettrageId — la lettre (en bloc) : ses lignes redeviennent non
// lettrées ; journal D16 `lettrage_defait` (motif « demande »). → l'état du tiers.
const delettrer = async (req, res) => {
  try {
    // Jugé avant la transaction (relecture de S7a : sans verrou inutile, et sans la conversion des 404 en « Dossier
    // introuvable » propre à la transaction du dossier).
    if (!idValide(req.params.lettrageId)) throw erreur(404, 'Lettre introuvable', 'LETTRE_INTROUVABLE');
    const resultat = await ecritureLettrage(req, async (db, acces, d) => {
      const x =(await db.query('SELECT id, tiers_id FROM compta.lettrages WHERE dossier_id = $1 AND id = $2', [d.id, req.params.lettrageId])).rows[0];
      // 409 (état périmé) : un 404 deviendrait « Dossier introuvable » dans la transaction du dossier.
      if (!x) throw erreur(409, 'Lettre introuvable (déjà délettrée ?) : relisez la page', 'LETTRE_INTROUVABLE');
      const [defaite] = await defaireLettres(db, d.id, [x.id]);
      await journaliser(db, acces.espace_id, req.user.id, 'lettrage_defait', { dossier: d.id, motif: 'demande', ...defaite });
      return { ...(await etatTiers(db, d, await tiersDuDossier(db, d.id, x.tiers_id))), defaite: { id: defaite.id, lettre: defaite.lettre, montant: defaite.montant } };
    });
    res.json(resultat);
  } catch (err) {
    repondreErreur(res, err, '[compta.lettrage.delettrer]');
  }
};

module.exports = {
  MSG_LETTRER, LIGNES_MAX, LETTRES_MAX, LIGNES_DES_LETTRES_MAX, GROUPES_MAX, LIGNES_PAR_LETTRE_MAX, LIGNES_DEMANDE_MAX, PROPOSITIONS_MAX, LETTRES_NB,
  lettreDe, rangDeLettre, lettresSuivantes, lireLettrage, montantDuGroupe, proposer, presenterLigne,
  SQL_LIGNE, SQL_NON_LETTREES, SQL_SOMMES_NON_LETTREES, SQL_LETTRES, SQL_LIGNES_DES_LETTRES, SQL_TIERS,
  tiersDuDossier, etatTiers, etatLettrage, defaireLettres, delettrerEcriture, ecritureLettrage,
  lire, unTiers, lettrer, delettrer,
};
