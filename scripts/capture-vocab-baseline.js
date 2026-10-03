/* Oracle du vocabulaire — CAPTURE (lot 2b, docs/lot-2b-spec.md §2).
 *
 * Capture, sur des comptes ÉPHÉMÈRES d'un domaine, tout ce que le serveur produit comme texte
 * (liste fermée du §0) : prompt et outils de l'assistant, guide de mise en route, emails (jeux
 * fixes ET sites d'appel réels), PDF, valeurs du contrat, exports Excel, tableaux de bord,
 * données à libellés, textes persistés, messages, authentification.
 *
 *   node scripts/capture-vocab-baseline.js [--domaine restauration|hotellerie|ceramique|miroir]
 *                                          [--sortie <fichier.json>] [--reference] [--port 3197]
 *
 *   --reference   écrit la référence commitée scripts/vocab-baseline/restauration.json
 *                 (domaine restauration seulement) ;
 *   --sortie      fichier de sortie (défaut : dossier temporaire du système).
 *
 * UN PROCESSUS PAR DOMAINE (limiteur de connexion en mémoire, 20 / 15 min). L'application est
 * chargée DANS ce processus (port dédié, attente de /health) avec les bouchons du mode
 * « capture » (scripts/lib/bouchons-test.js), posés AVANT dotenv et avant tout require de
 * l'application : aucun email ne part, DocuSeal et Gemini sont factices et leurs corps captés,
 * tout autre hôte est refusé. ⚠️ Charger l'application APPLIQUE les migrations en attente à la
 * base locale (src/app.js) : seul l'intégrateur lance l'oracle.
 *
 * Comptes créés par l'API admin (super_admin temporaire à mot de passe aléatoire), supprimés par
 * DELETE /admin/clients/:id ; purge par motif d'email au démarrage. Domaine « miroir » créé puis
 * supprimé. La base locale est contrôlée avant/après (mêmes comptes, mêmes domaines).
 *
 * Données datées dans le MOIS PRÉCÉDENT (jours 2 à 22) : deux captures du même mois civil sont
 * comparables (spec §2.4). Refus de démarrer en janvier (le mois précédent serait d'un autre
 * exercice), entre 00:45 et 01:15 (job quotidien de 01:00), et quand la date locale n'est pas la date UTC
 * (relecture de l'étape O du lot 2c : abonnementController.js:506-508 calcule le mois de la mensualité en UTC ;
 * en heure d'été, entre 00:00 et 02:00, le mois courant devient le mois précédent, la promotion « 1er mois
 * offert » ne s'applique pas et auth/client.abonnement change : faux écart sans aucune modification).
 *
 * Sortie : { meta, comptes: { cle: n }, captures: { cle: { element: valeur } } }, valeurs
 * masquées (§2.4). `comptes` = éléments non vides par clé (règle de non-vacuité).
 *
 * Lot 2c (docs/lot-2c-spec.md §2.3, §2.8) :
 *   - clé `manuel` : GET /api/manuel pour 6 lecteurs (client.A, client.B, gerant.B, client.C, acheteur.C, admin) ;
 *     `manuel.lecteurs.<lecteur>` = slugs reçus, dans l'ordre ; `manuel.sections.<slug>` = la section telle que l'API
 *     la renvoie, écrite une fois par slug (restauration : union des 6 lecteurs ; ailleurs : des 5 lecteurs hors
 *     admin) ; `meta.empreintesManuel.<lecteur>.<slug>` = md5 du JSON BRUT (non masqué) de la section, `id` retiré,
 *     `updatedAt` gardé ; `meta.sectionsParLecteur`. Arrêt (aucune sortie) si un lecteur reçoit 0 section, ou si deux
 *     lecteurs d'une même union reçoivent le même slug différemment (champ `id` ignoré) ;
 *   - clé `recherchesDomaine` : les 5 recherches fixes écrites en gabarits balisés, rendues avec le vocabulaire du
 *     domaine (compte B) ; les questions du guide de mise en route des comptes A, B, C, chacune cherchée avec SON
 *     compte ; « Comment créer <mon composant> ? » pour chaque composant activite / labo actif du domaine (compte A) ;
 *   - clé `recherches` : une 6ᵉ question sans résultat (« zzz qwerty ») capte la liste `disponibles` (R2.2) ;
 *   - `--brut <dossier>` (hors dépôt) : écrit aussi la réponse brute, non masquée, de GET /api/manuel du client B
 *     (`manuel-client-B.json`), pour scripts/controle-manuel-pdf.mjs du frontend (§2.6) ;
 *   - garde R2.8.3 : `--reference` refuse d'écrire si `_migrations` contient 194, 195 ou 196 (une référence se
 *     capture toujours sur un manuel non balisé) ;
 *   - `meta.empreintesBase.<titre rendu>` (relecture de l'étape O : 21 des 32 entrées de la base n'étaient captées
 *     par aucune recherche) : chaque entrée active de ai_knowledge_base, dans l'ordre des id, est cherchée par son
 *     titre (titre en base rendu avec le vocabulaire du passage), compte B, sans voc ; md5 NON masqué du JSON
 *     { titre, contenu } du résultat de même titre. Arrêt (aucune sortie) si l'entrée n'est pas parmi les résultats,
 *     ou si deux entrées ont le même titre rendu. `meta.entreesBase` = nombre d'entrées actives ;
 *   - clé `baseParTitre` (réserve R1 du contrôle de O et S0, spec R2.4.8), HORS RESTAURATION SEULEMENT : pour
 *     chacune de ces recherches par titre, `baseParTitre.<titre rendu>` = { titre, contenu } RENDUS du résultat (masqués
 *     comme toute capture), scannés par check-invariant-vocab.js dans la famille assistant : `meta` n'est pas scanné, et
 *     sans cette clé le contenu de 20 des 32 entrées n'apparaissait nulle part hors restauration. Arrêt si un contenu est
 *     vide. Jamais capturée en restauration : la référence n'est pas recapturée pour elle. */
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const RACINE = path.resolve(__dirname, '..');
const DEBUT = Date.now();

// ── Arguments ────────────────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg = (nom, defaut = null) => {
  const i = argv.indexOf(`--${nom}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : defaut;
};
const DOMAINES = ['restauration', 'hotellerie', 'ceramique', 'miroir'];
const DOMAINE = arg('domaine', 'restauration');
if (!DOMAINES.includes(DOMAINE)) {
  console.error(`[capture] domaine inconnu « ${DOMAINE} » (${DOMAINES.join(', ')})`);
  process.exit(2);
}
const REFERENCE = argv.includes('--reference');
if (REFERENCE && DOMAINE !== 'restauration') {
  console.error('[capture] --reference : domaine restauration seulement');
  process.exit(2);
}
const SORTIE = REFERENCE
  ? path.join(RACINE, 'scripts', 'vocab-baseline', 'restauration.json')
  : path.resolve(arg('sortie', path.join(os.tmpdir(), `capture-vocab-${DOMAINE}.json`)));
const PORT = arg('port', '3197');
// Lot 2c (R2.3.1) : réponse brute du manuel du client B, écrite HORS des dépôts (jamais versionnée).
const BRUT = arg('brut') ? path.resolve(arg('brut')) : null;
if (BRUT) {
  const dedans = (d) => (BRUT.toLowerCase() + path.sep).startsWith(path.resolve(d).toLowerCase() + path.sep);
  if (dedans(RACINE) || dedans(path.join(RACINE, '..', 'fiche-technique-frontend'))) {
    console.error('[capture] --brut : dossier hors des dépôts seulement (la réponse brute n\'est jamais versionnée)');
    process.exit(2);
  }
}
let brutManuelB = null;

// ── Fenêtres interdites ──────────────────────────────────────────────────────────────────────
{
  const n = new Date();
  const minutes = n.getHours() * 60 + n.getMinutes();
  if (minutes >= 45 && minutes <= 75) {
    console.error('[capture] refus : entre 00:45 et 01:15 (job quotidien de 01:00).');
    process.exit(2);
  }
  if (n.getMonth() === 0) {
    console.error('[capture] refus : en janvier, le mois précédent est d\'un autre exercice (données de l\'oracle).');
    process.exit(2);
  }
  // Le serveur calcule le mois de la mensualité en UTC (abonnementController.js:506-508) : quand la date locale n'est
  // pas la date UTC (en heure d'été, de 00:00 à 02:00 ; en heure d'hiver, de 00:00 à 01:00), le « mois courant »
  // est le mois précédent et la capture diffère de la référence sans aucune modification (relecture de l'étape O).
  if (n.getDate() !== n.getUTCDate()) {
    console.error(`[capture] refus : date locale (${n.getDate()}) ≠ date UTC (${n.getUTCDate()}) ; le serveur prendrait le mois précédent pour la mensualité (abonnementController.js:506-508). Relancer quand les deux dates sont de nouveau égales (heure de Paris : après 02:00 en été, après 01:00 en hiver ; heure de Tunis : après 01:00).`);
    process.exit(2);
  }
}

// ── 1. Bouchons du mode capture : AVANT dotenv et avant tout require de l'application ───────
const bouchons = require('./lib/bouchons-test');
const { journal } = bouchons.installer({ capture: true });
process.env.PORT = PORT;

// ── 2. PDF : chaînes de text() et métadonnées, par document (à la fin du document) ──────────
const PDFDocument = require('pdfkit');
const pdfsTermines = [];
{
  const textOrigine = PDFDocument.prototype.text;
  PDFDocument.prototype.text = function texteCapte(t, ...reste) {
    if (!this.__oracleTextes) this.__oracleTextes = [];
    if (t != null && typeof t !== 'object') this.__oracleTextes.push(String(t));
    return textOrigine.call(this, t, ...reste);
  };
  const endOrigine = PDFDocument.prototype.end;
  PDFDocument.prototype.end = function finCaptee(...a) {
    const info = {};
    for (const [k, v] of Object.entries(this.info || {})) info[k] = v instanceof Date ? '⟨date⟩' : String(v);
    pdfsTermines.push({ info, textes: this.__oracleTextes || [] });
    return endOrigine.apply(this, a);
  };
}

// ── 3. Horloge figée autour des appels purs (jamais dans le serveur) ────────────────────────
const DateOrigine = Date;
const INSTANT_FIGE = DateOrigine.parse('2030-06-15T09:30:00+01:00');
const figer = async (fn) => {
  class DateFigee extends DateOrigine {
    constructor(...a) { if (a.length === 0) super(INSTANT_FIGE); else super(...a); }
    static now() { return INSTANT_FIGE; }
  }
  global.Date = DateFigee;
  try { return await fn(); } finally { global.Date = DateOrigine; }
};

// ── 4. Application ───────────────────────────────────────────────────────────────────────────
// Variables retirées toujours vides (DOCUSEAL_PDF_FLOW : flux modèle garanti, §2.2), valeurs
// fixées intactes, avant ET après le chargement (src/app.js rappelle dotenv) : sinon arrêt.
const envCapture = (quand) => {
  try { bouchons.controlerEnvCapture(); } catch (e) { console.error(`[capture] ${quand} : ${e.message}`); process.exit(2); }
};
envCapture("avant le chargement de l’application");
require(path.join(RACINE, 'src', 'app.js'));
envCapture("après le chargement de l’application");
const pool = require(path.join(RACINE, 'src', 'config', 'database'));
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const ExcelJS = require('exceljs');
const { vocabDuDomaine, vocabDefaut } = require(path.join(RACINE, 'src', 'utils', 'vocabCompte'));
const { rendre, entreeComposantVoc } = require(path.join(RACINE, 'src', 'utils', 'vocab'));
const BASE = `http://127.0.0.1:${PORT}`;

// ── Utilitaires ──────────────────────────────────────────────────────────────────────────────
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const journaux = () => [journal.emails.length, journal.docuseal.length, journal.gemini.length, journal.sse.length, pdfsTermines.length];
// Envois en tâche de fond : on lit quand les journaux sont stables depuis 500 ms.
const attendreStable = async (maxMs = 20000) => {
  let dernier = JSON.stringify(journaux());
  let depuis = Date.now();
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    await attendre(100);
    const cur = JSON.stringify(journaux());
    if (cur !== dernier) { dernier = cur; depuis = Date.now(); }
    else if (Date.now() - depuis >= 500) return;
  }
};
const triEmails = (l) => [...l].sort((a, b) => `${a.to}|${a.subject}`.localeCompare(`${b.to}|${b.subject}`));
const cle = (o) => JSON.stringify(o);
const triStable = (l) => [...l].sort((a, b) => cle(a).localeCompare(cle(b)));

// Fenêtre de capture : ce que les journaux ont reçu pendant fn (envois de fond compris).
const fenetre = async (fn) => {
  await attendreStable();
  const [e0, d0, g0, s0, p0] = journaux();
  const resultat = await fn();
  await attendreStable();
  return {
    resultat,
    emails: triEmails(journal.emails.slice(e0)),
    docuseal: journal.docuseal.slice(d0),
    gemini: journal.gemini.slice(g0),
    sse: triStable(journal.sse.slice(s0)),
    pdfs: pdfsTermines.slice(p0),
  };
};

let JWT_SECRET = null;
const jeton = (userId, role) => jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: '3h' });

const appel = async (tok, methode, url, corps, { brut = false, formulaire = null } = {}) => {
  const headers = {};
  if (tok) headers.Authorization = `Bearer ${tok}`;
  let body;
  if (formulaire) body = formulaire;
  else if (corps !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(corps); }
  const res = await fetch(`${BASE}${url}`, { method: methode, headers, body });
  const ct = res.headers.get('content-type') || '';
  const disposition = res.headers.get('content-disposition');
  if (brut || /spreadsheet|pdf|octet-stream/.test(ct)) {
    const buf = Buffer.from(await res.arrayBuffer());
    if (/json/.test(ct)) {
      let j = null;
      try { j = JSON.parse(buf.toString('utf8')); } catch (_) { j = buf.toString('utf8'); }
      return { status: res.status, body: j, contentType: ct, disposition };
    }
    return { status: res.status, buffer: buf, contentType: ct, disposition };
  }
  const texte = await res.text();
  let j = null;
  try { j = texte ? JSON.parse(texte) : null; } catch (_) { j = texte; }
  return { status: res.status, body: j, contentType: ct, disposition };
};
const exiger = (r, attendus, libelle) => {
  const liste = Array.isArray(attendus) ? attendus : [attendus];
  if (!liste.includes(r.status)) {
    throw new Error(`${libelle} → ${r.status} ${JSON.stringify(r.body).slice(0, 400)}`);
  }
  return r.body;
};
const api = (tok) => ({
  get: (u, o) => appel(tok, 'GET', u, undefined, o),
  post: (u, c, o) => appel(tok, 'POST', u, c, o),
  put: (u, c, o) => appel(tok, 'PUT', u, c, o),
  patch: (u, c, o) => appel(tok, 'PATCH', u, c, o),
  del: (u, o) => appel(tok, 'DELETE', u, undefined, o),
});
const qs = (o) => Object.entries(o).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');

// Classeur → { onglets: [{ nom, lignes: [[cell.text…]] }] } (cellules fusionnées dédoublonnées)
const lireClasseur = async (buffer) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb.worksheets.map((ws) => {
    const lignes = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells = [];
      row.eachCell({ includeEmpty: true }, (cell) => {
        if (cell.isMerged && cell.master && cell.master.address !== cell.address) return;
        cells.push(String(cell.text ?? ''));
      });
      while (cells.length && cells[cells.length - 1] === '') cells.pop();
      lignes.push(cells);
    });
    return { nom: ws.name, lignes };
  });
};
const reponseExport = async (r) => {
  if (r.buffer && /spreadsheet/.test(r.contentType)) {
    try {
      return { status: r.status, disposition: r.disposition, onglets: await lireClasseur(r.buffer) };
    } catch (e) {
      // En-tête de classeur posé puis erreur du serveur : corps illisible comme classeur
      const texte = r.buffer.toString('utf8');
      let corps = texte;
      try { corps = JSON.parse(texte); } catch (_) { /* texte brut */ }
      return { status: r.status, disposition: r.disposition, classeurIllisible: true, corps };
    }
  }
  return { status: r.status, disposition: r.disposition || null, corps: r.body ?? null };
};

// ── Masquage (spec §2.4) ─────────────────────────────────────────────────────────────────────
const MOIS = 'janv\\.?|févr\\.?|mars|avr\\.?|mai|juin|juil\\.?|août|sept\\.?|oct\\.?|nov\\.?|déc\\.?|janvier|février|avril|juillet|septembre|octobre|novembre|décembre';
const MOIS_LONGS = 'janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre';
const MASQUES = [
  // jetons et contenus
  [/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, '⟨jwt⟩'],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '⟨uuid⟩'],
  [/\b[a-f0-9]{32,}\b/gi, '⟨jeton⟩'],
  // références (avant les dates : CTR-2026-00042)
  [/\b(?:CTR|AVN?|RES|FA|BL|BC)-[\w-]+/g, '⟨ref⟩'],
  // dates et heures (parcours-2a/lib.cjs:47-59), ISO complets d'abord
  [/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?/g, '⟨date⟩'],
  [/(?<!\d)\d{1,2}\/\d{1,2}\/\d{2,4}(?!\d)/g, '⟨date⟩'],
  [/(?<!\d)\d{4}-\d{2}-\d{2}(?!\d)/g, '⟨date⟩'],
  [new RegExp(`\\b\\d{1,2}(?:er)?\\s+(?:${MOIS})\\s+\\d{4}\\b`, 'gi'), '⟨date⟩'],
  [new RegExp(`\\b\\d{1,2}(?:er)?[\\s-]+(?:${MOIS})[\\s-]+\\d{4}\\b`, 'gi'), '⟨date⟩'],
  [new RegExp(`\\b\\d{1,2}(?:er)?\\s+(?:${MOIS})\\b`, 'gi'), '⟨date⟩'],
  [new RegExp(`(?<![\\p{L}])(?:${MOIS_LONGS})\\s+\\d{4}\\b`, 'giu'), '⟨mois⟩'],
  [/\b(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+⟨date⟩/gi, '⟨date⟩'],
  [/(?<![\d-])\d{4}-\d{2}(?![\d-])/g, '⟨mois⟩'],
  [/\b\d{1,2}[:h]\d{2}(?::\d{2})?\b/g, '⟨heure⟩'],
  [/\bil y a\s+\d+\s*(?:s|sec|seconde|min|minute|h|heure|j|jour|sem|semaine|mois|an|année)s?\b/gi, '⟨relatif⟩'],
  [/\bà l'instant\b/gi, '⟨relatif⟩'],
  [/\bdans\s+\d+\s*(?:j|jour|h|heure|min|minute)s?\b/gi, '⟨relatif⟩'],
  [/\b(?:depuis|reste|restant)\s+\d+\s*(?:j|jour|h|heure|min|minute)s?\b/gi, '⟨relatif⟩'],
  // ids : ligne de contexte (12=Nom), URL (/123), #123
  [/(?<![\p{L}\p{N}_])\d+=(?=\S)/gu, '⟨id⟩='],
  [/(?<=\/[A-Za-z_-]+)\/\d+\b/g, '/⟨id⟩'],
  [/#\d+\b/g, '#⟨id⟩'],
];
const masquerTexte = (s) => {
  let t = s;
  for (const [re, rep] of MASQUES) t = t.replace(re, rep);
  return t;
};
const CLE_ID = /^(id|ids)$|Ids?$|_ids?$|^userId$|^token$|^inviteToken$|Token$|By$|_by$/;
// Clés composées « a-314 » / « l-12 » (destKey, sourceKey…) : le numéro est un id.
const CLE_COMPOSEE = /Key$/;
const estBase64Long = (s) => s.length >= 200 && /^[A-Za-z0-9+/=\r\n]+$/.test(s);
const masquer = (v, cleParent = '') => {
  if (v == null) return v;
  if (typeof v === 'string') {
    if (estBase64Long(v)) return '⟨base64⟩';
    if (CLE_ID.test(cleParent) && /^\d+$/.test(v)) return '⟨id⟩';
    if (CLE_COMPOSEE.test(cleParent) && /^[a-z]+-\d+$/.test(v)) return v.replace(/\d+$/, '⟨id⟩');
    return masquerTexte(v);
  }
  if (typeof v === 'number') return CLE_ID.test(cleParent) ? '⟨id⟩' : v;
  if (Array.isArray(v)) return v.map((x) => masquer(x, cleParent));
  if (Buffer.isBuffer(v)) return '⟨base64⟩';
  if (typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) {
      if ((k === 'content' || k === 'pdfBase64' || k === 'contractPdfBase64' || k === 'file') && typeof x === 'string') { o[k] = '⟨base64⟩'; continue; }
      // Clé masquée (date, id numérique) : suffixe en cas de collision, rien n'est perdu.
      let k2 = /^\d{3,}$/.test(k) ? '⟨id⟩' : masquerTexte(k);
      if (k2 !== k) { let i = 2; const base = k2; while (k2 in o) k2 = `${base}·${i++}`; }
      o[k2] = masquer(x, k);
    }
    return o;
  }
  return v;
};

// ── Jeu de valeurs fixes (aucune égalité entre deux lignes triées ou regroupées) ────────────
const maintenant = new DateOrigine();
const AN = maintenant.getFullYear();
const MOIS_PREC = maintenant.getMonth(); // 1..11 (janvier refusé) : mois précédent en base 1
const mm = String(MOIS_PREC).padStart(2, '0');
const D = (j) => `${AN}-${mm}-${String(j).padStart(2, '0')}`;
const DERNIER_JOUR = new DateOrigine(AN, MOIS_PREC, 0).getDate();
const PERIODE = { from: D(1), to: D(DERNIER_JOUR) };

const DOM_INDEX = { restauration: 1, hotellerie: 2, ceramique: 3, miroir: 4 }[DOMAINE];
const SLUG_EMAIL = DOMAINE;
const EMAIL = (suffixe) => `oracle-vocab-${SLUG_EMAIL}-${suffixe}@example.com`;
const TEL = (n) => `7099${DOM_INDEX}${n}00`;
const ADMIN_EMAIL = 'oracle-vocab-admin@example.com';
const MIROIR = { nom: 'Oracle Miroir', slug: 'oracle-miroir' };
const MOTIF_EMAILS = 'oracle-vocab-%@example.com';

// Noms saisis par l'oracle : sans mot du lexique par défaut, sans double espace ni espace en
// 31ᵉ position ; un labo avec « / » et une activité avec « — » (assainisseurs, §5.5) ; la 2ᵉ activité
// porte un guillemet droit « " » (Latin-1, admis par Node, mais il fermerait filename="…" : nomFichierSur le
// remplace par « - », §11.1.4) ; le labo du
// compte C porte « ’ » (hors Latin-1) et finit par une apostrophe : ses exports exercent, côté labo,
// les en-têtes Content-Disposition et l'en-tête mort des pertes labo (§11.1.4) et la règle des
// onglets (§11.1.7).
const N = {
  clientA: 'Dar Yasmine Essai', clientA2: 'Dar Narjes Essai', clientB: 'Riad Zitouna Essai', clientC: 'Fournil Carthage Essai',
  gerant: 'Sami Ben Salem',
  acheteur1: 'Épicerie نور', acheteur1Ent: 'Épicerie Nour SARL',
  acheteur2: 'Maison Kamel', acheteur2Ent: 'Kamel Frères',
  acheteur3: 'Comptoir Hédi', acheteur3Ent: 'Hédi et Fils',
  labo1: 'Réserve Nord / Est', labo2: 'Bloc chaud', laboC: 'Four d’Ali\'',
  act1: 'Terrasse du Lac — Salon', act2: 'Étages "Nord"',
  famille: 'Denrées sèches', cat1: 'Épicerie fine', cat2: 'Lingerie', catC: 'Semoules',
  riz: 'Riz basmati', huile: 'Huile de tournesol', cafe: 'Café moulu', drap: 'Drap 240x300', savon: 'Savon 30 g', semoule: 'Semoule fine',
  fournisseur: 'Comptoir Bejaoui', fournisseurC: 'Minoterie du Kef',
  cpVendable: 'Créations maison', cpSupplement: 'Extras', cpValorise: 'Épicerie revendue', cpVendableC: 'Spécialités',
  ptUtil: 'Fond brun', ptVend: 'Terrine maison', compose: 'Assiette du jour', ptC: 'Couscous royal',
  adresse: 'Route de la Corniche', adresseF: 'Zone industrielle Sidi Rezig', adresseF2: 'Route de Tajerouine',
  note: 'Comptage du soir', notesAdmin: 'Validé après échange téléphonique.',
};
// Libellés de composants posés par l'oracle (domaine miroir seulement)
const COMPOSANTS_MIROIR = {
  activite: { libelle: 'Unité Alpha', libellePluriel: 'Unités Alpha' },
  labo: { libelle: 'Pôle Bêta', libellePluriel: 'Pôles Bêta' },
  acheteurs: { libelle: 'Cercle Gamma', libellePluriel: 'Cercle Gamma' },
};
// Recherches fixes de l'assistant (clé `recherches`, mots de la restauration, dans tous les domaines) et leurs
// gabarits balisés (clé `recherchesDomaine`, lot 2c R2.3.2) : en restauration, le rendu du gabarit EST la recherche
// fixe (vérifié à chaque passage).
const RECHERCHES_FIXES = ['créer un labo', 'transfert vers une activité', 'calcul du food cost', 'inventaire de fin de mois', 'inviter un acheteur'];
const GABARITS_RECHERCHE = ['créer [[un:labo]]', '[[nom:transfert]] vers [[un:activite]]', 'calcul [[du:food_cost]]', '[[nom:inventaire]] de fin de mois', 'inviter [[un:acheteur]]'];
const QUESTION_SANS_RESULTAT = 'zzz qwerty';

// ── État de la base (contrôle avant / après) ────────────────────────────────────────────────
const etatBase = async () => {
  const r = await pool.query(
    // Le super_admin temporaire de l'oracle n'est pas compté (créé avant la photo « avant »).
    `SELECT (SELECT json_object_agg(role, n ORDER BY role) FROM (SELECT role, COUNT(*)::int AS n FROM utilisateurs WHERE email <> $2 GROUP BY role) x) AS roles,
            (SELECT COUNT(*)::int FROM domaines_activite) AS domaines,
            (SELECT COUNT(*)::int FROM domaine_composants) AS composants,
            (SELECT COUNT(*)::int FROM abonnements) AS abonnements,
            (SELECT COUNT(*)::int FROM support_demandes) AS demandes,
            (SELECT COUNT(*)::int FROM ai_conversations) AS conversations,
            (SELECT COUNT(*)::int FROM utilisateurs WHERE email LIKE $1 AND email <> $2) AS comptes_oracle`,
    [MOTIF_EMAILS, ADMIN_EMAIL]
  );
  return r.rows[0];
};

// ── Nettoyage ────────────────────────────────────────────────────────────────────────────────
const ctx = { clients: [], adminId: null, adminTok: null, miroirId: null, notifMaxId: 0 };
const supprimerClient = async (id) => {
  const r = await fetch(`${BASE}/admin/clients/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${ctx.adminTok}` } });
  return r.status;
};
const purgerOracle = async () => {
  // Comptes clients d'un passage interrompu (par motif d'email), puis admin, puis domaine miroir.
  const restes = await pool.query(`SELECT id FROM utilisateurs WHERE role = 'client' AND email LIKE $1`, [MOTIF_EMAILS]);
  if (restes.rows.length && ctx.adminTok) {
    for (const { id } of restes.rows) {
      const s = await supprimerClient(id);
      console.log(`[capture] purge du compte ${id} d'un passage précédent → ${s}`);
    }
  }
  await pool.query(`DELETE FROM utilisateurs WHERE role IN ('gerant','acheteur') AND email LIKE $1`, [MOTIF_EMAILS]);
  const dom = await pool.query('SELECT id FROM domaines_activite WHERE slug = $1', [MIROIR.slug]);
  for (const { id } of dom.rows) {
    await pool.query('DELETE FROM client_domaines WHERE domaine_id = $1', [id]);
    await pool.query('DELETE FROM domaines_activite WHERE id = $1', [id]);
  }
};

// ── Captures ─────────────────────────────────────────────────────────────────────────────────
const C = {
  prompt: {}, promptReel: {}, outils: {}, resultatsOutils: {}, recherches: {}, recherchesDomaine: {}, contexte: {}, guide: {},
  accueilMessenger: {}, emails: {}, pdf: {}, valeursContrat: {}, exports: {}, rapportIA: {},
  tableauxDeBord: {}, donneesLibelles: {}, persistes: {}, messages: {}, auth: {}, manuel: {},
};
// Réserve R1 (spec R2.4.8) : contenu des entrées de la base, hors restauration seulement (la référence restauration ne
// porte pas cette clé ; en restauration, ces entrées sont tenues par meta.empreintesBase).
if (DOMAINE !== 'restauration') C.baseParTitre = {};
const CLES_CAPTURE = Object.keys(C);
const pdfsDe = (f) => f.pdfs.map((p) => ({ info: p.info, textes: p.textes }));
const emailsDe = (f) => f.emails.map((e) => ({
  to: e.to, subject: e.subject, html: e.html,
  attachments: (e.attachments || []).map((a) => ({ filename: a.filename, content: a.content ? '⟨base64⟩' : null })),
}));

// Signatures cibles (§2.7) : forme finale si elle existe, sinon repli d'avant le lot.
const ai = require(path.join(RACINE, 'src', 'services', 'aiService'));
const outilsIA = require(path.join(RACINE, 'src', 'services', 'aiToolHandlers'));
const onboarding = require(path.join(RACINE, 'src', 'services', 'onboardingEtat'));
const clientConfig = require(path.join(RACINE, 'src', 'services', 'clientConfigService'));
const messenger = require(path.join(RACINE, 'src', 'services', 'messengerService'));
const emailService = require(path.join(RACINE, 'src', 'services', 'emailService'));
const pdfService = require(path.join(RACINE, 'src', 'services', 'pdfService'));
const contractPdf = require(path.join(RACINE, 'src', 'services', 'contractPdfService'));
const clientsCtrl = require(path.join(RACINE, 'src', 'controllers', 'clientsController'));
const domaineProfil = require(path.join(RACINE, 'src', 'services', 'domaineProfilService'));
const SIGNATURES = {
  outils: typeof outilsIA.toolsFor === 'function' ? 'toolsFor(voc)' : 'TOOLS_OPENAI',
  messenger: typeof messenger.texteAccueilMessenger === 'function' ? 'texteAccueilMessenger(nom, voc)' : 'absente',
  pricingFields: typeof clientsCtrl.buildContractPricingFields === 'function' ? 'buildContractPricingFields(pricing, domaineNom, voc)' : 'absente',
};
const outilsPour = (voc) => (typeof outilsIA.toolsFor === 'function' ? outilsIA.toolsFor(voc) : outilsIA.TOOLS_OPENAI);

async function principal() {
  const meta = { domaine: DOMAINE, version: 1, moisCapture: `${AN}-${String(MOIS_PREC + 1).padStart(2, '0')}` };
  console.log(`[capture] domaine ${DOMAINE} — port ${PORT} — période ${PERIODE.from} → ${PERIODE.to}`);

  // Application prête (migrations appliquées)
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(`${BASE}/health`); if (r.ok) break; } catch (_) { /* pas encore à l'écoute */ }
    await attendre(500);
  }
  JWT_SECRET = process.env.JWT_SECRET;
  const mig = await pool.query('SELECT filename FROM _migrations ORDER BY filename DESC LIMIT 1');
  meta.derniereMigration = mig.rows[0]?.filename || null;
  // Garde R2.8.3 (lot 2c) : une référence se capture sur un manuel NON balisé, jamais après 194, 195 ou 196.
  if (REFERENCE) {
    const m2c = await pool.query("SELECT filename FROM _migrations WHERE filename ~ '^(194|195|196)_' ORDER BY filename");
    if (m2c.rows.length) {
      throw new Error(`--reference refusé : la base a reçu ${m2c.rows.map((r) => r.filename).join(', ')} (manuel balisé, spec lot 2c R2.8.3) ; capturer sur une copie neuve de la photo (node scripts/manuel/base-locale.js copie, puis DB_NAME=fiche_technique_2c)`);
    }
  }

  // Super_admin temporaire (mot de passe aléatoire, jeton signé en interne)
  await pool.query('DELETE FROM utilisateurs WHERE email = $1', [ADMIN_EMAIL]);
  const ins = await pool.query(
    `INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif) VALUES ('Oracle Admin', $1, $2, 'super_admin', true) RETURNING id`,
    [ADMIN_EMAIL, await bcrypt.hash(crypto.randomBytes(18).toString('base64url'), 10)]
  );
  ctx.adminId = ins.rows[0].id;
  ctx.adminTok = jeton(ctx.adminId, 'super_admin');
  await purgerOracle();
  ctx.etatAvant = await etatBase();
  ctx.notifMaxId = (await pool.query('SELECT COALESCE(MAX(id), 0)::int AS m FROM notifications')).rows[0].m;
  const A = api(ctx.adminTok);

  // ── Domaine ─────────────────────────────────────────────────────────────────────────────
  let doms = exiger(await A.get('/api/domaines'), 200, 'GET /api/domaines');
  let dom;
  if (DOMAINE === 'miroir') {
    const fichierLex = [path.join(RACINE, '..', 'fiche-technique-frontend', 'scripts', 'vocab-lexiques-test.json'), path.join(RACINE, 'test', 'vocab-lexiques-test.json')]
      .find((f) => fs.existsSync(f));
    const lexMiroir = JSON.parse(fs.readFileSync(fichierLex, 'utf8')).miroir;
    meta.lexiqueMiroir = path.relative(RACINE, fichierLex).replace(/\\/g, '/');
    const cree = exiger(await A.post('/api/domaines', { nom: MIROIR.nom, slug: MIROIR.slug, description: 'Domaine de test de l\'oracle du vocabulaire' }), 201, 'POST /api/domaines (miroir)');
    ctx.miroirId = cree.id;
    exiger(await A.put(`/api/domaines/${cree.id}`, { lexique: lexMiroir }), 200, 'PUT lexique miroir');
    // Composants neutres ; le composant gérant est RETIRÉ (création à la volée, §2.3)
    const comps = cree.composants.filter((c) => c.typeTechnique !== 'gerant').map((c) => ({
      code: c.code, typeTechnique: c.typeTechnique, icone: c.icone, ordre: c.ordre,
      libelle: COMPOSANTS_MIROIR[c.typeTechnique].libelle, libellePluriel: COMPOSANTS_MIROIR[c.typeTechnique].libellePluriel,
    }));
    exiger(await A.put(`/api/domaines/${cree.id}`, { composants: comps }), 200, 'PUT composants miroir');
    doms = exiger(await A.get('/api/domaines'), 200, 'GET /api/domaines');
    dom = doms.find((d) => d.id === cree.id);
  } else {
    dom = doms.find((d) => d.slug === DOMAINE);
  }
  if (!dom) throw new Error(`domaine ${DOMAINE} absent de la base locale`);
  const domHotel = doms.find((d) => d.slug === 'hotellerie');
  const voc = await vocabDuDomaine(dom.id);
  meta.domaineNom = dom.nom;
  meta.lexique = dom.lexique;
  meta.composantsOracle = DOMAINE === 'miroir' ? Object.values(COMPOSANTS_MIROIR).flatMap((c) => [c.libelle, c.libellePluriel]) : [];
  meta.donnees = [...new Set(Object.values(N))];
  const typesPerte = (dom.regles && Array.isArray(dom.regles.types_perte) && dom.regles.types_perte.length) ? dom.regles.types_perte : ['avarie', 'dechet'];

  const actifs = (type) => (dom.composants || []).filter((c) => c.actif !== false && c.typeTechnique === type);
  const cAct = actifs('activite');
  const cLab = actifs('labo');
  const cGer = actifs('gerant');
  const cAch = actifs('acheteurs');
  if (!cAct.length || !cLab.length || !cAch.length) throw new Error('composants activite / labo / acheteurs manquants');
  // Choix des composants : L2 (labo enfant) et le labo du compte C PRODUISENT (production_active) ;
  // L1 prend un autre composant de labo s'il en existe ; A1 VEND (vente_active), A2 un autre composant.
  const labProd = cLab.filter((c) => c.productionActive !== false);
  if (!labProd.length) throw new Error('aucun composant labo avec production active');
  const labL2 = labProd[0];
  const labL1 = cLab.find((c) => c.id !== labL2.id) || labL2;
  const actA1 = cAct.find((c) => c.venteActive !== false) || cAct[0];
  const actA2 = cAct.find((c) => c.id !== actA1.id) || actA1;
  const deux = (x, y) => (x.code === y.code ? [{ code: x.code, nb: 2 }] : [{ code: x.code, nb: 1 }, { code: y.code, nb: 1 }]);
  if (DOMAINE !== 'miroir' && !cGer.length) throw new Error('composant gerant manquant');
  const compo = {
    A: [{ code: actA1.code, nb: 1 }],
    B: [
      ...deux(actA1, actA2),
      ...deux(labL1, labL2),
      DOMAINE === 'miroir' ? { code: 'gerant', nb: 1 } : { code: cGer[0].code, nb: 1 },
    ],
    C: [{ code: labL2.code, nb: 1 }, { code: cAch[0].code, nb: 10 }],
  };

  // ── Création des comptes : passe 1 (DocuSeal configuré), passe 2 (non configuré) ─────────
  const creerCompte = async (lettre, nom, email, tel, composants) => {
    const f = await fenetre(async () => A.post('/admin/clients', {
      nom, email, telephone: tel, domaineId: dom.id, formuleActivites: 'premium', montantOnboarding: 700, composants,
    }));
    const b = exiger(f.resultat, 201, `POST /admin/clients ${lettre}`);
    ctx.clients.push(b.id);
    return { id: b.id, nom, email, f };
  };
  const passe1 = {};
  for (const [lettre, nom, suffixe, n] of [['A', N.clientA, 'a', 1], ['B', N.clientB, 'b', 2], ['C', N.clientC, 'c', 3]]) {
    passe1[lettre] = await creerCompte(lettre, nom, EMAIL(suffixe), TEL(n), compo[lettre]);
  }
  const jetonDocuseal = process.env.DOCUSEAL_API_TOKEN;
  delete process.env.DOCUSEAL_API_TOKEN;
  let compteA2;
  try {
    compteA2 = await creerCompte('A2', N.clientA2, EMAIL('a2'), TEL(4), compo.A);
  } finally {
    process.env.DOCUSEAL_API_TOKEN = jetonDocuseal;
  }
  const { A: cA, B: cB, C: cC } = passe1;
  C.emails['site.creation.passe1'] = [cA, cB, cC].flatMap((c) => emailsDe(c.f));
  C.valeursContrat['soumission.creation.passe1'] = [cA, cB, cC].flatMap((c) => c.f.docuseal);
  C.pdf['creation.passe1.contratLegacy'] = [cA, cB, cC].flatMap((c) => pdfsDe(c.f));
  C.emails['site.creation.passe2'] = emailsDe(compteA2.f);
  C.pdf['creation.passe2.contratLegacy'] = pdfsDe(compteA2.f);
  C.persistes['creation.composantsAlaVolee'] = DOMAINE === 'miroir'
    ? (await pool.query(`SELECT code, libelle, libelle_pluriel, type_technique FROM domaine_composants WHERE domaine_id = $1 AND type_technique = 'gerant' ORDER BY code`, [dom.id])).rows
    : null;

  // Mots de passe connus (connexions des captures auth et messages seulement)
  const MDP = `Oracle-${crypto.randomBytes(6).toString('hex')}!A1`;
  const hash = await bcrypt.hash(MDP, 10);
  await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), onboarding_step = 0 WHERE id = $2', [hash, cB.id]);
  await pool.query('UPDATE utilisateurs SET onboarding_step = 0 WHERE id = ANY($1::int[])', [[cA.id, cC.id, compteA2.id]]);
  const tokA = jeton(cA.id, 'client');
  const tokB = jeton(cB.id, 'client');
  const tokC = jeton(cC.id, 'client');
  const tokA2 = jeton(compteA2.id, 'client');
  const BA = api(tokB);
  const CA = api(tokC);

  // ── Jeu B ───────────────────────────────────────────────────────────────────────────────
  // Unités de mesure : celles des seeds du domaine, sinon créées (kg, L, pièce)
  const assurerUnites = async (cli) => {
    let liste = exiger(await cli.get('/api/unites'), 200, 'unités');
    for (const nom of ['kg', 'L', 'pièce']) {
      if (!liste.some((x) => (x.name || x.nom) === nom)) exiger(await cli.post('/api/unites', { name: nom }), [200, 201], `unité ${nom}`);
    }
    liste = exiger(await cli.get('/api/unites'), 200, 'unités');
    return liste;
  };
  const unites = await assurerUnites(BA);
  const uniteId = (noms) => {
    for (const n of noms) { const u = unites.find((x) => (x.name || x.nom) === n); if (u) return u.id; }
    throw new Error(`unité introuvable : ${noms.join(', ')}`);
  };
  const fam = exiger(await BA.post('/api/familles', { name: N.famille, consommable: true, vendable: true }), 201, 'famille');
  const cat1 = exiger(await BA.post('/api/categories', { name: N.cat1, familleId: fam.id }), 201, 'catégorie 1');
  const cat2 = exiger(await BA.post('/api/categories', { name: N.cat2, familleId: fam.id }), 201, 'catégorie 2');
  const art = {};
  for (const [k, nom, unitesNoms, cat, i] of [
    ['riz', N.riz, ['kg'], cat1, 0], ['huile', N.huile, ['L', 'l', 'litre'], cat1, 1], ['cafe', N.cafe, ['kg'], cat1, 2],
    ['drap', N.drap, ['pièce', 'unité'], cat2, 3], ['savon', N.savon, ['pièce', 'unité'], cat2, 4],
  ]) {
    art[k] = exiger(await BA.post('/api/articles', { name: nom, unitId: uniteId(unitesNoms), categorieId: cat.id }), 201, `article ${nom}`).id;
  }
  const L1 = exiger(await BA.post('/api/labo', { nom: N.labo1, refLabo: 'RNE', composantId: labL1.id }), 201, 'labo 1');
  // Message « nom pris » (409) : capturé quand le quota n'est pas encore atteint
  { const r = await BA.post('/api/labo', { nom: N.labo1, refLabo: 'RNX', composantId: labL2.id }); C.messages.laboNomPris = { status: r.status, body: r.body }; }
  const L2 = exiger(await BA.post('/api/labo', { nom: N.labo2, refLabo: 'BCH', composantId: labL2.id, laboParentId: L1.id }), 201, 'labo 2');
  const A1 = exiger(await BA.post('/api/entreprise/activites', { nom: N.act1, adresse: N.adresse, composantId: actA1.id, laboId: L2.id }), 201, 'activité 1');
  const A2 = exiger(await BA.post('/api/entreprise/activites', { nom: N.act2, adresse: N.adresse, composantId: actA2.id }), 201, 'activité 2');
  for (const id of Object.values(art)) for (const l of [L1, L2]) await BA.post(`/api/labo/${l.id}/ingredients/${id}/select`, {});
  const prixAff = { riz: 2.7, huile: 6.4, cafe: 31, drap: 12.5, savon: 0.45 };
  for (const [k, id] of Object.entries(art)) {
    await BA.post(`/api/entreprise/activites/${A1.id}/ingredients/${id}/select`, { prixUnitaire: prixAff[k] });
    if (k === 'drap' || k === 'savon') await BA.post(`/api/entreprise/activites/${A2.id}/ingredients/${id}/select`, { prixUnitaire: prixAff[k] + 0.01 });
  }
  const four = exiger(await BA.post('/api/entreprise/fournisseurs', { nom: N.fournisseur, adresse: N.adresseF, telephone: '+216 71 000 101', activiteIds: [A1.id, A2.id], laboIds: [L1.id, L2.id] }), 201, 'fournisseur');
  const appros = [
    ['labo', L1.id, art.riz, 100, 2.5, 7, D(2), four.id, 'FA-OR-01'],
    ['labo', L1.id, art.huile, 20, 6, 19, D(3), four.id, 'FA-OR-02'],
    ['labo', L2.id, art.huile, 10.5, 6.2, 19, D(4), four.id, 'FA-OR-03'],
    ['activite', A1.id, art.cafe, 12, 30, 19, D(5), four.id, 'FA-OR-04'],
    ['activite', A2.id, art.savon, 200, 0.4, 19, D(6), four.id, 'FA-OR-05'],
    ['labo', L2.id, art.drap, 15, 12, 19, D(7), null, 'FA-OR-06'],
  ];
  for (const [t, id, ing, q, p, tva, d, f, ref] of appros) {
    const url = t === 'labo' ? `/api/labo/${id}/stock/${ing}` : `/api/stock/entreprise/${id}/${ing}`;
    exiger(await BA.put(url, { quantite: q, prixUnitaire: p, tauxTva: tva, dateAppro: d, ...(f ? { fournisseurId: f } : {}), refFacture: ref }), [200, 201], `appro ${ref}`);
  }
  exiger(await BA.post(`/api/labo/${L1.id}/transfer`, { dateTransfert: D(8), refFacture: 'BL-OR-01', tauxTva: 7, transfers: [{ laboDestId: L2.id, ingredientId: art.riz, quantite: 30, prixUnitaire: 2.55 }] }), [200, 201], 'transfert labo→labo');
  exiger(await BA.post(`/api/labo/${L2.id}/transfer`, { dateTransfert: D(9), refFacture: 'BL-OR-02', tauxTva: 7, transfers: [{ activiteId: A1.id, ingredientId: art.riz, quantite: 10, prixUnitaire: 2.65 }] }), [200, 201], 'transfert labo→activité');
  const cpV = exiger(await BA.post('/api/categories-produit', { nom: N.cpVendable, typeProduit: 'vendable' }), 201, 'catégorie produit vendable');
  const cpS = exiger(await BA.post('/api/categories-produit', { nom: N.cpSupplement, typeProduit: 'supplement' }), 201, 'catégorie produit supplément');
  const cpVal = exiger(await BA.post('/api/categories-produit', { nom: N.cpValorise, typeProduit: 'valorise' }), 201, 'catégorie produit valorisé');
  const ptU = exiger(await BA.post('/api/produits', { nom: N.ptUtil, type: 'utilisable', origine: 'labo', laboIds: [L2.id], activiteIds: [A1.id], ingredients: [{ ingredientId: art.huile, portion: 0.1 }], subProducts: [] }), 201, 'PT utilisable');
  exiger(await BA.put(`/api/labo/${L2.id}/stock/${-ptU.id}`, { quantite: 5, dateAppro: D(10) }), [200, 201], 'production PT utilisable');
  const ptV = exiger(await BA.post('/api/produits', { nom: N.ptVend, type: 'vendable', origine: 'labo', categorieProduitId: cpV.id, laboIds: [L2.id], activiteIds: [A1.id], ingredients: [{ ingredientId: art.riz, portion: 0.25 }], subProducts: [] }), 201, 'PT vendable');
  exiger(await BA.put(`/api/labo/${L2.id}/stock/${-ptV.id}`, { quantite: 8, dateAppro: D(11) }), [200, 201], 'production PT vendable');
  const compose = exiger(await BA.post('/api/produits', { nom: N.compose, type: 'vendable', origine: 'activite', categorieProduitId: cpV.id, activiteIds: [A1.id], laboIds: [], ingredients: [{ ingredientId: art.riz, portion: 0.15 }], subProducts: [{ productId: ptU.id, portion: 0.3 }] }), 201, 'produit composé');
  await BA.put(`/api/articles-valorisables/${art.cafe}/categorie`, { categorieProduitId: cpVal.id });
  exiger(await BA.post('/api/articles-vendables', { activite_id: A1.id, article_type: 'produit', article_id: compose.id, prix_vente: 25, portion: 1, actif: true }), [200, 201], 'prix produit composé');
  exiger(await BA.post('/api/articles-vendables', { activite_id: A1.id, article_type: 'ingredient', article_id: art.cafe, prix_vente: 4.5, portion: 0.02, actif: true }), [200, 201], 'prix article valorisé');
  exiger(await BA.post('/api/ventes', { activite_id: A1.id, date_vente: D(12), type_vente: 'directe', prestataire_id: null, lignes: [{ article_type: 'produit', article_id: compose.id, quantite: 3, prix_unitaire: 25 }] }), [200, 201], 'vente directe');
  exiger(await BA.post('/api/ventes', { activite_id: A1.id, date_vente: D(13), type_vente: 'prestataire', prestataire_id: null, lignes: [{ article_type: 'produit', article_id: compose.id, quantite: 2, prix_unitaire: 27 }] }), [200, 201], 'vente prestataire sans prestataire');
  // Article valorisé vendu seul, à une autre date : deux déductions du même jour seraient ex aequo
  // dans les listes triées par date seule (get_stock, feuille Stock du rapport).
  exiger(await BA.post('/api/ventes', { activite_id: A1.id, date_vente: D(22), type_vente: 'directe', prestataire_id: null, lignes: [{ article_type: 'ingredient', article_id: art.cafe, quantite: 4, prix_unitaire: 4.5 }] }), [200, 201], 'vente article valorisé');
  exiger(await BA.post(`/api/entreprise/activites/${A1.id}/pertes`, { ingredientId: art.cafe, quantite: 0.5, typePerte: typesPerte[0], datePerte: D(14) }), [200, 201], 'perte activité');
  exiger(await BA.post(`/api/labo/${L2.id}/stock/${art.huile}/perte`, { quantite: 0.7, typePerte: typesPerte[1] || typesPerte[0], datePerte: D(15) }), [200, 201], 'perte labo');
  exiger(await BA.post('/api/charges-fixes', { activite_id: A1.id, mode: 'detail', loyer: 1000, charges_personnel: 2000, electricite_gaz: 300, eau: 50 }), [200, 201], 'charges');
  const ids = { L1: L1.id, L2: L2.id, A1: A1.id, A2: A2.id, ptU: ptU.id, ptV: ptV.id, compose: compose.id };

  // Gérant : invitation (site d'appel gerantController), renvoi admin (authController.resendInvite),
  // puis mot de passe connu (connexion de la capture auth).
  const fGer = await fenetre(async () => BA.post('/api/abonnements/gerants', { nom: N.gerant, telephone: '+216 22 000 301', email: EMAIL('gerant'), activiteIds: [A1.id], laboIds: [L2.id] }));
  const ger = exiger(fGer.resultat, 201, 'gérant');
  C.emails['site.invitationGerant'] = emailsDe(fGer);
  const fRenvoi = await fenetre(async () => A.post(`/auth/invite/resend/${ger.id}`, {}));
  exiger(fRenvoi.resultat, 200, 'renvoi d\'invitation (admin)');
  C.emails['site.renvoiInvitationAdmin.gerant'] = emailsDe(fRenvoi);
  await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW() WHERE id = $2', [hash, ger.id]);
  const tokG = jeton(ger.id, 'gerant');
  const GA = api(tokG);
  // Inventaires saisis par le gérant (notifications) puis par le client
  const fInv = await fenetre(async () => {
    exiger(await GA.post(`/api/stock/entreprise/${A1.id}/inventaire`, { dateInventaire: D(16), entries: [{ ingredientId: art.cafe, quantiteReelle: 11.2, note: N.note }] }), [200, 201], 'inventaire activité (gérant)');
    exiger(await GA.post(`/api/labo/${L2.id}/inventaire`, { dateInventaire: D(17), entries: [{ ingredientId: art.huile, quantiteReelle: 9.6, note: N.note }] }), [200, 201], 'inventaire labo (gérant)');
  });
  C.persistes['sse.inventairesGerant'] = fInv.sse;
  exiger(await BA.post(`/api/stock/entreprise/${A2.id}/inventaire`, { dateInventaire: D(18), entries: [{ ingredientId: art.savon, quantiteReelle: 198 }] }), [200, 201], 'inventaire activité 2');
  exiger(await BA.post(`/api/labo/${L1.id}/inventaire`, { dateInventaire: D(19), entries: [{ ingredientId: art.riz, quantiteReelle: 69.5 }] }), [200, 201], 'inventaire labo 1');

  // ── Jeu C (dépôt + acheteurs) ───────────────────────────────────────────────────────────
  const unitesC = await assurerUnites(CA);
  const famC = exiger(await CA.post('/api/familles', { name: N.famille, consommable: true, vendable: true }), 201, 'famille C');
  const catC = exiger(await CA.post('/api/categories', { name: N.catC, familleId: famC.id }), 201, 'catégorie C');
  const kgC = unitesC.find((u) => (u.name || u.nom) === 'kg').id;
  const semoule = exiger(await CA.post('/api/articles', { name: N.semoule, unitId: kgC, categorieId: catC.id }), 201, 'article C').id;
  exiger(await CA.put(`/api/articles/${semoule}`, { name: N.semoule, unitId: kgC, categorieId: catC.id, commandable: true }), 200, 'article C commandable');
  const LC = exiger(await CA.post('/api/labo', { nom: N.laboC, refLabo: 'FDS', composantId: labL2.id }), 201, 'labo C');
  await CA.post(`/api/labo/${LC.id}/ingredients/${semoule}/select`, {});
  const fourC = exiger(await CA.post('/api/entreprise/fournisseurs', { nom: N.fournisseurC, adresse: N.adresseF2, telephone: '+216 78 000 202', activiteIds: [], laboIds: [LC.id] }), 201, 'fournisseur C');
  exiger(await CA.put(`/api/labo/${LC.id}/stock/${semoule}`, { quantite: 50, prixUnitaire: 1.8, tauxTva: 7, dateAppro: D(2), fournisseurId: fourC.id, refFacture: 'FA-OR-11' }), [200, 201], 'appro C');
  const cpC = exiger(await CA.post('/api/categories-produit', { nom: N.cpVendableC, typeProduit: 'vendable' }), 201, 'catégorie produit C');
  const ptC = exiger(await CA.post('/api/produits', { nom: N.ptC, type: 'vendable', origine: 'labo', categorieProduitId: cpC.id, laboIds: [LC.id], activiteIds: [], ingredients: [{ ingredientId: semoule, portion: 0.4 }], subProducts: [] }), 201, 'PT vendable C');
  exiger(await CA.put(`/api/labo/${LC.id}/stock/${-ptC.id}`, { quantite: 12, dateAppro: D(3) }), [200, 201], 'production C');
  exiger(await CA.post('/api/acheteurs/offres', { articleType: 'produit', articleId: ptC.id, prixUnitaireHt: 9.5, tauxTva: 7, actif: true }), 200, 'offre PT');
  exiger(await CA.post('/api/acheteurs/offres', { articleType: 'ingredient', articleId: semoule, prixUnitaireHt: 2.4, tauxTva: 7, actif: true }), 200, 'offre article');
  // Acheteur 1 : création avec compte → invitation (acheteursController create)
  const fAch1 = await fenetre(async () => CA.post('/api/acheteurs', { acheteurs: [{ nom: N.acheteur1, entreprise: N.acheteur1Ent, email: EMAIL('acheteur1'), telephone: '+216 22 000 401', creerCompte: true }] }));
  const ach1 = exiger(fAch1.resultat, 201, 'acheteur 1').acheteurs[0];
  C.emails['site.creationAcheteur'] = emailsDe(fAch1);
  // Acheteur 2 : fiche sans compte, puis « inviter » (acheteursController inviter)
  const ach2 = exiger(await CA.post('/api/acheteurs', { acheteurs: [{ nom: N.acheteur2, entreprise: N.acheteur2Ent, email: EMAIL('acheteur2'), telephone: '+216 22 000 402' }] }), 201, 'acheteur 2').acheteurs[0];
  const fInviter = await fenetre(async () => CA.post(`/api/acheteurs/${ach2.id}/inviter`, {}));
  C.messages['C.inviterAcheteur'] = { status: fInviter.resultat.status, body: fInviter.resultat.body };
  C.emails['site.inviterAcheteur'] = emailsDe(fInviter);
  // Acheteur 3 : import Excel avec création de compte (acheteursController import)
  const wbImp = new ExcelJS.Workbook();
  const wsImp = wbImp.addWorksheet('Import');
  wsImp.addRow(['Nom', 'Entreprise', 'Email', 'Téléphone', 'Adresse', 'Matricule fiscal']);
  wsImp.addRow([N.acheteur3, N.acheteur3Ent, EMAIL('acheteur3'), '+216 22 000 403', N.adresse, '1111111/A/M/000']);
  const fdImp = new FormData();
  fdImp.append('file', new Blob([await wbImp.xlsx.writeBuffer()]), 'acheteurs.xlsx');
  fdImp.append('creerComptes', 'true');
  const fImport = await fenetre(async () => appel(tokC, 'POST', '/api/acheteurs/import', undefined, { formulaire: fdImp }));
  exiger(fImport.resultat, 200, 'import acheteurs');
  C.emails['site.importAcheteurs'] = emailsDe(fImport);
  // Renvoi d'invitation admin pour un compte acheteur non activé (acheteur 2)
  const userAch2 = (await pool.query('SELECT user_id FROM acheteurs WHERE id = $1', [ach2.id])).rows[0].user_id;
  const fRenvoiAch = await fenetre(async () => A.post(`/auth/invite/resend/${userAch2}`, {}));
  exiger(fRenvoiAch.resultat, 200, 'renvoi d\'invitation acheteur (admin)');
  C.emails['site.renvoiInvitationAdmin.acheteur'] = emailsDe(fRenvoiAch);
  // Vente directe du vendeur (2 lignes, remise) → facture acheteur
  const vente = exiger(await CA.post('/api/acheteurs/ventes', { acheteurId: ach1.id, laboId: LC.id, dateCommande: D(20), dateExpedition: D(21), remisePct: 5, lignes: [{ articleType: 'produit', articleId: ptC.id, quantite: 3 }, { articleType: 'ingredient', articleId: semoule, quantite: 4.5 }] }), [200, 201], 'vente acheteur');
  // Compte acheteur 1 : mot de passe connu (connexion de la capture auth)
  const userAch1 = (await pool.query('SELECT user_id FROM acheteurs WHERE id = $1', [ach1.id])).rows[0].user_id;
  await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW() WHERE id = $2', [hash, userAch1]);
  const tokAch = jeton(userAch1, 'acheteur');
  const AchA = api(tokAch);
  const catalogue = await AchA.get('/api/portail/catalogue');
  C.donneesLibelles['C.portail.catalogue'] = catalogue.body;
  const commande = async (q1, q2) => exiger(await AchA.post('/api/portail/commandes', { lignes: [{ articleType: 'produit', articleId: ptC.id, quantite: q1 }, { articleType: 'ingredient', articleId: semoule, quantite: q2 }] }), 201, 'commande portail');
  const fCmd = await fenetre(async () => [await commande(1, 2.5), await commande(2, 3.5)]);
  const [cmd1, cmd2] = fCmd.resultat;
  C.persistes['sse.commandesAcheteur'] = fCmd.sse;
  C.persistes['C.portail.mesCommandes'] = (await AchA.get('/api/portail/commandes')).body;

  // ── Captures de l'assistant ─────────────────────────────────────────────────────────────
  const LIGNE_FIXE = 'Client: Oracle | Mode du compte: actif | Activités: 1=Alpha, 2=Beta | Labos: 3=Gamma';
  await figer(async () => {
    C.prompt.avecContexte = ai.buildSystemPrompt(LIGNE_FIXE, voc);
    C.prompt.sansContexte = ai.buildSystemPrompt(null, voc);
  });
  C.outils.json = JSON.parse(JSON.stringify(outilsPour(voc)));
  C.accueilMessenger.texte = typeof messenger.texteAccueilMessenger === 'function' ? messenger.texteAccueilMessenger(N.clientB, voc) : null;
  // Ligne de contexte, cache vidé
  for (const [l, c] of [['A', cA], ['B', cB], ['C', cC]]) {
    clientConfig.invalidate(c.id);
    await pool.query('UPDATE ai_assistant_config SET context_updated_at = NULL WHERE client_id = $1', [c.id]);
    C.contexte[l] = await outilsIA.getClientContextLine(c.id, voc);
  }
  // Résultats des 12 outils de données, SANS voc (repli de executeToolCall prouvé)
  const outil = async (nom, args = {}) => outilsIA.executeToolCall(cB.id, nom, args);
  const filtresTableau = { canaux: 'prestataire', prestataires: '', catProduits: String(cpV.id), typesProduit: 'produit' };
  const appelsOutils = [
    ['get_client_info', {}], ['get_stock', {}], ['get_stock', { labo_id: L2.id }], ['get_stock', { activite_id: A1.id }],
    ['get_appros', {}], ['get_pertes', {}], ['get_pertes', { type_perte: typesPerte[0] }], ['get_inventaires', {}],
    ['get_transferts', {}], ['get_transferts', { labo_id: L1.id }], ['get_referentiel', {}], ['get_fournisseurs', {}],
    ['get_abonnement', {}], ['get_ventes', {}], ['get_ventes', { canal: 'directe' }], ['get_ventes', { canal: 'prestataire' }],
    ...Object.entries(filtresTableau).map(([k, v]) => ['get_ventes', { [k]: v }]),
    // Filtres réels de get_ventes : chacun allonge le tableau de paramètres partagé (spec §6.1)
    ['get_ventes', { activite_id: A1.id }], ['get_ventes', { labo_id: L2.id }],
    ['get_ventes', { date_from: PERIODE.from, date_to: PERIODE.to }],
    ['get_ventes', { activite_id: A1.id, date_from: PERIODE.from, date_to: PERIODE.to, canal: 'prestataire' }],
    ['get_produits', {}], ['get_config_vente', {}], ['get_config_vente', { activite_id: A1.id }],
  ];
  for (const [nom, args] of appelsOutils) {
    // Étiquette unique : clés et valeurs (un id numérique s'écrit « id », les dates sont masquées ensuite)
    const etiquette = `${nom}${Object.keys(args).length ? ' ' + Object.entries(args).map(([k, v]) => `${k}=${typeof v === 'number' || /^\d+$/.test(String(v)) ? 'id' : v}`).join(',') : ''}`;
    if (etiquette in C.resultatsOutils) throw new Error(`étiquette d'outil en double : ${etiquette}`);
    C.resultatsOutils[etiquette] = await outil(nom, args);
  }
  for (const q of [...RECHERCHES_FIXES, QUESTION_SANS_RESULTAT]) {
    C.recherches[q] = await outil('search_knowledge_base', { query: q });
  }
  // Guide de mise en route : A, B, C, puis A' (branche « repli » sans détail des composants)
  const aboA2 = (await pool.query('SELECT id FROM abonnements WHERE client_id = $1 ORDER BY id DESC LIMIT 1', [compteA2.id])).rows[0].id;
  await pool.query('DELETE FROM abonnement_config_composants WHERE abonnement_id = $1', [aboA2]);
  for (const [l, c, tok] of [['A', cA, tokA], ['B', cB, tokB], ['C', cC, tokC], ['A2', compteA2, tokA2]]) {
    const etat = await onboarding.computeOnboardingEtat(c.id);
    C.guide[`${l}.etat`] = etat;
    C.guide[`${l}.blocPrompt`] = onboarding.onboardingPromptBlock(etat, voc);
    C.guide[`${l}.http`] = (await api(tok).get('/api/ai-assistant/onboarding')).body;
  }

  // ── Recherches dans les mots du compte (lot 2c, R2.3.2), appels SANS voc (repli, R2.3.3) ──
  // Valeur d'une question : titres des résultats, et titre + contenu des résultats de la BASE (le contenu d'un
  // résultat du manuel est la fiche servie, captée par la clé `manuel`).
  const estManuel = (t) => typeof t === 'string' && t.startsWith('Manuel — ');
  const resumeRecherche = (r) => {
    const res = r && Array.isArray(r.results) ? r.results : [];
    return { titres: res.map((x) => x.titre), base: res.filter((x) => !estManuel(x.titre)).map((x) => ({ titre: x.titre, contenu: x.contenu })) };
  };
  for (const [i, g] of GABARITS_RECHERCHE.entries()) {
    const query = rendre(voc, g);
    if (DOMAINE === 'restauration' && query !== RECHERCHES_FIXES[i]) throw new Error(`gabarit « ${g} » rendu « ${query} » en restauration (attendu « ${RECHERCHES_FIXES[i]} »)`);
    C.recherchesDomaine[`fixe|${g}`] = { query, resultat: await outil('search_knowledge_base', { query }) };
  }
  // Questions suggérées du guide (textes envoyés à l'assistant par l'écran) : chacune avec SON compte.
  for (const [l, c] of [['A', cA], ['B', cB], ['C', cC]]) {
    const questions = [...new Set((C.guide[`${l}.etat`].etapes || []).flatMap((e) => e.questions || []))];
    for (const q of questions) {
      C.recherchesDomaine[`${l}|${q}`] = resumeRecherche(await outilsIA.executeToolCall(c.id, 'search_knowledge_base', { query: q }));
    }
  }
  // Une question par composant actif activite / labo du domaine, écrite comme onboardingEtat (compte A).
  for (const comp of (dom.composants || []).filter((c) => c.actif !== false && (c.typeTechnique === 'activite' || c.typeTechnique === 'labo'))) {
    const q = `Comment créer ${voc.avec(entreeComposantVoc(voc, comp)).mon('_')} ?`;
    if (`composant|${q}` in C.recherchesDomaine) continue;
    C.recherchesDomaine[`composant|${q}`] = resumeRecherche(await outilsIA.executeToolCall(cA.id, 'search_knowledge_base', { query: q }));
  }
  // Entrées de la base, une par une (relecture de l'étape O : 21 des 32 entrées n'étaient captées par aucune
  // recherche, une mutation de leur contenu passait inaperçue). Recherche par titre (titre en base rendu avec le
  // vocabulaire du passage), compte B, sans voc ; empreinte NON masquée de { titre, contenu } du résultat.
  const entreesBase = (await pool.query('SELECT titre FROM ai_knowledge_base WHERE actif = true ORDER BY id')).rows;
  if (!entreesBase.length) throw new Error('base de connaissances : aucune entrée active (la capture s\'arrête)');
  meta.empreintesBase = {};
  for (const { titre } of entreesBase) {
    const query = rendre(voc, titre);
    if (query in meta.empreintesBase) throw new Error(`base de connaissances : deux entrées de même titre rendu « ${query} » (la capture s'arrête)`);
    const r = await outil('search_knowledge_base', { query });
    const trouve = (r && Array.isArray(r.results) ? r.results : []).find((x) => x.titre === query && !estManuel(x.titre));
    if (!trouve) throw new Error(`base de connaissances : l'entrée « ${query} » n'est pas parmi les résultats de sa recherche par titre (la capture s'arrête)`);
    meta.empreintesBase[query] = crypto.createHash('md5').update(JSON.stringify({ titre: trouve.titre, contenu: trouve.contenu }), 'utf8').digest('hex');
    if (C.baseParTitre) {
      if (typeof trouve.contenu !== 'string' || !trouve.contenu.trim()) throw new Error(`base de connaissances : l'entrée « ${query} » a un contenu vide (baseParTitre, la capture s'arrête)`);
      C.baseParTitre[query] = { titre: trouve.titre, contenu: trouve.contenu };
    }
  }
  meta.entreesBase = entreesBase.length;

  // ── Manuel servi (lot 2c, R2.3.1) : 6 lecteurs ; l'acheteur est lu AVANT sa suppression ─────
  const lecteursManuel = [['client.A', tokA], ['client.B', tokB], ['gerant.B', tokG], ['client.C', tokC], ['acheteur.C', tokAch], ['admin', ctx.adminTok]];
  const sansId = (s) => Object.fromEntries(Object.entries(s).filter(([k]) => k !== 'id'));
  const sourceSection = {};
  C.manuel = { lecteurs: {}, sections: {} };
  meta.empreintesManuel = {};
  meta.sectionsParLecteur = {};
  for (const [l, tok] of lecteursManuel) {
    const liste = exiger(await api(tok).get('/api/manuel'), 200, `GET /api/manuel (${l})`);
    if (!Array.isArray(liste) || liste.length === 0) throw new Error(`GET /api/manuel (${l}) : aucune section (la capture s'arrête, R2.3.1)`);
    if (l === 'client.B') brutManuelB = liste;
    C.manuel.lecteurs[l] = liste.map((s) => s.slug);
    meta.sectionsParLecteur[l] = liste.length;
    meta.empreintesManuel[l] = {};
    for (const s of liste) {
      const json = JSON.stringify(sansId(s));
      meta.empreintesManuel[l][s.slug] = crypto.createHash('md5').update(json, 'utf8').digest('hex');
      // Hors restauration, l'admin lit le manuel en mots de LabFlow (I4) : hors de l'union, comparé par empreinte.
      if (l === 'admin' && DOMAINE !== 'restauration') continue;
      if (s.slug in C.manuel.sections) {
        if (JSON.stringify(sansId(C.manuel.sections[s.slug])) !== json) throw new Error(`manuel : la fiche « ${s.slug} » diffère entre ${sourceSection[s.slug]} et ${l} (R2.3.1)`);
      } else {
        C.manuel.sections[s.slug] = s;
        sourceSection[s.slug] = l;
      }
    }
  }
  // Prompt réel : chatWithAI(B) → corps capté par le bouchon Gemini
  const fChat = await fenetre(async () => ai.chatWithAI(cB.id, 'oracle-session', 'Bonjour, quel est mon stock ?'));
  C.promptReel.reponse = fChat.resultat.assistantMessage;
  C.promptReel.corps = fChat.gemini.map((g) => ({
    systeme: g && g.messages && g.messages[0] ? g.messages[0].content : null,
    outils: g && g.tools ? g.tools.map((t) => ({ nom: t.function.name, description: t.function.description, parametres: t.function.parameters })) : null,
  }));

  // ── Emails : jeux fixes (voc en clé de l'objet d'arguments, ignorée avant le lot) ───────
  const EM = 'destinataire@oracle.invalid';
  const fixe = async (nom, fn) => {
    const f = await fenetre(async () => figer(fn));
    C.emails[`fixe.${nom}`] = emailsDe(f);
  };
  for (const role of ['client', 'gerant', 'acheteur']) await fixe(`invitation.${role}`, () => emailService.sendInviteEmail({ to: EM, nom: 'Client Oracle', token: 'jeton-fixe', role, voc }));
  await fixe('signature.contrat', () => emailService.sendDocusealSigningEmail({ to: EM, nom: 'Client Oracle', signingUrl: 'http://docuseal.oracle.invalid/s/oracle', voc }));
  await fixe('signature.avenant.1', () => emailService.sendDocusealSigningEmail({ to: EM, nom: 'Client Oracle', signingUrl: 'http://docuseal.oracle.invalid/s/oracle', avenant: { addActivites: 1, addLabos: 1, addGerants: 1, setAcheteurs: 10 }, voc }));
  await fixe('signature.avenant.2', () => emailService.sendDocusealSigningEmail({ to: EM, nom: 'Client Oracle', signingUrl: 'http://docuseal.oracle.invalid/s/oracle', avenant: { addActivites: 2, addLabos: 2, addGerants: 2, setAcheteurs: 50 }, voc }));
  await fixe('signature.resiliation', () => emailService.sendDocusealSigningEmail({ to: EM, nom: 'Client Oracle', signingUrl: 'http://docuseal.oracle.invalid/s/oracle', type: 'resiliation', voc }));
  const avenantBase = {
    to: EM, nom: 'Client Oracle', notesAdmin: null, nbActivitesAdded: 1, nbLabosAdded: 2, nbGerantsAdded: 1,
    nbActivites: 3, nbLabos: 3, nbGerants: 2, activiteCost: 120, laboCost: 90, gerantCost: 40, newMensuel: 250,
    promoApplied: false, effectifMensuel: 250, dateAvenant: '2030-06-15T09:30:00Z', pdfBase64: null, voc,
  };
  await fixe('avenant.tousPostes', () => emailService.sendAvenantEmail(avenantBase));
  await fixe('avenant.labos0', () => emailService.sendAvenantEmail({ ...avenantBase, nbLabosAdded: 0, nbLabos: 0 }));
  await fixe('avenant.gerants0', () => emailService.sendAvenantEmail({ ...avenantBase, nbGerantsAdded: 0, nbGerants: 0 }));
  await fixe('avenant.promo', () => emailService.sendAvenantEmail({ ...avenantBase, promoApplied: true, effectifMensuel: 200 }));
  await fixe('avenant.noteAdmin', () => emailService.sendAvenantEmail({ ...avenantBase, notesAdmin: N.notesAdmin }));
  await fixe('avenant.acheteursSeuls', () => emailService.sendAvenantEmail({ ...avenantBase, nbActivitesAdded: 0, nbLabosAdded: 0, nbGerantsAdded: 0, acheteursCible: 20 }));
  await fixe('rapport', () => emailService.sendRapportWithAttachment({ to: EM, clientNom: 'Client Oracle', buffer: Buffer.from('oracle'), filename: 'rapport-oracle.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', format: 'excel', voc }));
  await fixe('messenger', () => emailService.sendMessengerInviteEmail({ to: EM, clientNom: 'Client Oracle', inviteLink: 'https://m.me/labflow.oracle?ref=jeton-fixe', appName: 'LabFlow', voc }));
  // Les 7 emails sans terme (preuve qu'ils ne bougent pas)
  await fixe('sansTerme.bienvenueAvecContrat', () => emailService.sendWelcomeWithContractEmail({ to: EM, nom: 'Client Oracle', token: 'jeton-fixe', contractPdfBase64: 'UERGLW9yYWNsZQ==', voc }));
  await fixe('sansTerme.bienvenueSansContrat', () => emailService.sendWelcomeWithContractEmail({ to: EM, nom: 'Client Oracle', token: 'jeton-fixe', contractPdfBase64: null, voc }));
  await fixe('sansTerme.motDePasse', () => emailService.sendPasswordResetEmail({ to: EM, nom: 'Client Oracle', token: 'jeton-fixe', voc }));
  await fixe('sansTerme.facture', () => emailService.sendFactureEmail({ to: EM, nom: 'Client Oracle', numero: 'FAC-2030-0001', periodeLabel: 'juin 2030', montantTtc: 178.5, dateReglement: '2030-06-15', pdfBase64: 'UERGLW9yYWNsZQ==', voc }));
  await fixe('sansTerme.rapportTexte', () => emailService.sendRapportEmail({ to: EM, clientNom: 'Client Oracle', rapportText: 'Texte fixe du rapport.', voc }));
  await fixe('sansTerme.codeBoss', () => emailService.sendBossRevealCode({ to: EM, code: '123456', targetLabel: 'Compte oracle', voc }));
  await fixe('sansTerme.refusDemande', () => emailService.sendDemandeAccesRefusEmail({ to: EM, nom: 'Client Oracle', voc }));

  // ── PDF et valeurs du contrat (appels directs, horloge figée) ───────────────────────────
  const pricing = {
    baseOnboarding: 900, effOnboarding: 700, baseMensuel: 150, effMensuel: 0, promoMens: true, promoOb: true, promoMonths: 1,
    baseResumeDate: '2030-07-01', hasPromo: true, palierAcheteurs: 20, formuleActivites: 'premium', nbActivites: 2, nbLabos: 1, nbGerants: 1,
  };
  const pricingSansPalier = { ...pricing, palierAcheteurs: null, hasPromo: false, promoMens: false, promoOb: false };
  const compIdentite = [
    { code: 'activite', typeTechnique: 'activite', libelle: 'Activité', libellePluriel: 'Activités', nb: 2 },
    { code: 'labo', typeTechnique: 'labo', libelle: 'Labo', libellePluriel: 'Labos', nb: 1 },
    { code: 'gerant', typeTechnique: 'gerant', libelle: 'Gérant', libellePluriel: 'Gérants', nb: 1 },
  ];
  const compHotel = (domHotel ? domHotel.composants : []).filter((c) => c.actif !== false).slice(0, 4)
    .map((c, i) => ({ code: c.code, typeTechnique: c.typeTechnique, libelle: c.libelle, libellePluriel: c.libellePluriel, nb: i + 1 }));
  const clientDoc = { nom: 'Client Oracle', email: EM, telephone: '+216 70 000 002', adresse: '1 rue Fixe, Tunis' };
  const docPdf = async (nom, fn) => {
    const f = await fenetre(async () => figer(fn));
    C.pdf[nom] = pdfsDe(f);
  };
  for (const [nom, composants, pr] of [
    ['contrat.identite.palier', compIdentite, pricing], ['contrat.identite.sansPalier', compIdentite, pricingSansPalier],
    ['contrat.hotellerie.palier', compHotel, pricing], ['contrat.hotellerie.sansPalier', compHotel, pricingSansPalier],
  ]) {
    await docPdf(nom, () => contractPdf.buildContratDocument({ abonnementId: 42, client: clientDoc, config: { nbActivites: 2, nbLabos: 1, nbGerants: 1, formuleActivites: 'premium', composants, domaineNom: 'Domaine fixe', domaineSlug: 'fixe' }, pricing: pr, montantOnboarding: 700, voc }));
  }
  await docPdf('avenant.flux', () => contractPdf.buildAvenantDocument({ demandeId: 7, client: clientDoc, pricing: { ...pricing, composants: compIdentite }, ajouts: { addActivites: 1, addLabos: 2, addGerants: 1, setAcheteurs: 20 }, abonnementId: 42, abonnementDate: '2030-01-10', voc }));
  await docPdf('resiliation', () => contractPdf.buildResiliationDocument({ clientId: 42, client: clientDoc, voc }));
  const legacyAvenant = {
    nom: 'Client Oracle', notesAdmin: N.notesAdmin, nbActivitesAdded: 1, nbLabosAdded: 1, nbGerantsAdded: 1, acheteursCible: 20,
    nbActivites: 3, nbLabos: 2, nbGerants: 2, activiteCost: 120, laboCost: 90, gerantCost: 40, formuleActivites: 'premium',
    nbAcheteurs: 20, acheteursCost: 30, newMensuel: 280, ancienMensuel: 190, promoApplied: false, effectifMensuel: 280, dateAvenant: '2030-06-15',
  };
  await docPdf('legacy.avenant', () => pdfService.generateAvenantPdf(legacyAvenant, voc));
  await docPdf('legacy.contrat', () => pdfService.generateContratPdf({ nom: 'Client Oracle', email: EM, telephone: '+216 70 000 002', adresse: '1 rue Fixe, Tunis', montantMensuel: 150, nbActivites: 2, nbLabos: 1, nbGerants: 1, formuleActivites: 'premium', nbAcheteurs: 20, dateContrat: '2030-06-15' }, voc));
  await docPdf('factureAbonnement', () => pdfService.generateFacturePdf({ numero: 'FAC-2030-0001', dateFacture: '2030-06-15', periodeLabel: 'juin 2030', clientNom: 'Client Oracle', clientEmail: EM, montantHt: 150, montantTva: 28.5, montantTtc: 178.5, tvaRate: 19 }));
  await figer(async () => {
    C.valeursContrat['avenantExtraFields.complet'] = contractPdf.avenantExtraFields({ ajouts: { addActivites: 1, addLabos: 2, addGerants: 1, setAcheteurs: 20 }, abonnementId: 42, abonnementDate: '2030-01-10', pricing, voc });
    C.valeursContrat['avenantExtraFields.unSeul'] = contractPdf.avenantExtraFields({ ajouts: { addActivites: 1 }, pricing: pricingSansPalier, voc });
    if (typeof clientsCtrl.buildContractPricingFields === 'function') {
      C.valeursContrat['pricingFields.promoPalier'] = clientsCtrl.buildContractPricingFields(pricing, dom.nom, voc);
      C.valeursContrat['pricingFields.sansPromo'] = clientsCtrl.buildContractPricingFields(pricingSansPalier, null, voc);
      C.valeursContrat['pricingFields.depot'] = clientsCtrl.buildContractPricingFields({ ...pricing, nbActivites: 0, formuleActivites: null }, dom.nom, voc);
    }
  });
  // Factures d'appro (HTTP, req.voc) et facture acheteur (compte C)
  const factures = exiger(await BA.get('/api/factures?limit=200'), 200, 'factures B');
  const listeFactures = Array.isArray(factures) ? factures : (factures.factures || factures.rows || []);
  C.donneesLibelles['B.factures'] = listeFactures;
  const triFact = [...listeFactures].sort((a, b) => `${a.refFacture}|${a.typeSource}|${a.laboNom}|${a.activiteNom}`.localeCompare(`${b.refFacture}|${b.typeSource}|${b.laboNom}|${b.activiteNom}`));
  let iFact = 0;
  for (const fa of triFact) {
    const f = await fenetre(async () => BA.get(`/api/factures/${fa.id}/pdf`));
    iFact += 1;
    C.pdf[`factureAppro.${String(iFact).padStart(2, '0')}.${fa.typeSource || 'manuel'}`] = { status: f.resultat.status, disposition: f.resultat.disposition, documents: pdfsDe(f) };
  }
  const fFactAch = await fenetre(async () => CA.get(`/api/acheteurs/factures/${vente.factureId || vente.facture_id || (vente.facture && vente.facture.id)}/pdf`));
  C.pdf.factureAcheteur = { status: fFactAch.resultat.status, disposition: fFactAch.resultat.disposition, documents: pdfsDe(fFactAch) };

  // ── Exports (16 points d'entrée) ────────────────────────────────────────────────────────
  const exporter = async (nom, tok, url) => { C.exports[nom] = await reponseExport(await appel(tok, 'GET', url, undefined, { brut: true })); };
  const per = { startDate: PERIODE.from, endDate: PERIODE.to };
  await exporter('01.modeleAcheteurs', tokC, '/api/acheteurs/template');
  await exporter('02.modeleFournisseurs', tokB, '/api/entreprise/fournisseurs/template');
  await exporter('03.modeleReferentiel', tokB, '/api/referentiel/template');
  await exporter('04.ficheTechnique.activite', tokB, `/api/produits/${compose.id}/export?${qs({ activiteId: A1.id, pricingMethod: 'both' })}`);
  await exporter('04.ficheTechnique.activite.stock', tokB, `/api/produits/${compose.id}/export?${qs({ activiteId: A1.id, mode: 'stock' })}`);
  await exporter('04.ficheTechnique.activite.manuel', tokB, `/api/produits/${compose.id}/export?${qs({ activiteId: A1.id, mode: 'manual' })}`);
  await exporter('04.ficheTechnique.labo', tokB, `/api/produits/${ptU.id}/export?${qs({ laboId: L2.id, pricingMethod: 'both' })}`);
  await exporter('05.inventaireLabo.L2', tokB, `/api/labo/${L2.id}/inventaire/historique/export-excel?${qs(per)}`);
  await exporter('05.inventaireLabo.L1', tokB, `/api/labo/${L1.id}/inventaire/historique/export-excel?${qs(per)}`);
  await exporter('06.inventaireActivite.A2', tokB, `/api/stock/entreprise/${A2.id}/inventaire/historique/export-excel?${qs(per)}`);
  await exporter('06.inventaireActivite.A1', tokB, `/api/stock/entreprise/${A1.id}/inventaire/historique/export-excel?${qs(per)}`);
  await exporter('07.historiqueAproLabo.L2', tokB, `/api/labo/${L2.id}/historique/export-excel?${qs(per)}`);
  await exporter('07.historiqueAproLabo.L1', tokB, `/api/labo/${L1.id}/historique/export-excel?${qs(per)}`);
  await exporter('08.transfertsLabo.L2', tokB, `/api/labo/${L2.id}/transfers/export-excel?${qs(per)}`);
  await exporter('08.transfertsLabo.L1', tokB, `/api/labo/${L1.id}/transfers/export-excel?${qs(per)}`);
  await exporter('09.pertesActivites', tokB, `/api/entreprise/pertes/export-excel?${qs({ dateDebut: PERIODE.from, dateFin: PERIODE.to })}`);
  await exporter('09.pertesActivites.A1', tokB, `/api/entreprise/pertes/export-excel?${qs({ activiteId: A1.id, dateDebut: PERIODE.from, dateFin: PERIODE.to })}`);
  await exporter('10.pertesLabo.L2', tokB, `/api/labo/${L2.id}/pertes/historique/export-excel?${qs({ dateDebut: PERIODE.from, dateFin: PERIODE.to })}`);
  // Labo du compte C (« ’ » hors Latin-1, apostrophe finale) : 500 avant le socle (§11.1.4, §11.1.7)
  await exporter('05.inventaireLabo.LC', tokC, `/api/labo/${LC.id}/inventaire/historique/export-excel?${qs(per)}`);
  await exporter('07.historiqueAproLabo.LC', tokC, `/api/labo/${LC.id}/historique/export-excel?${qs(per)}`);
  await exporter('08.transfertsLabo.LC', tokC, `/api/labo/${LC.id}/transfers/export-excel?${qs(per)}`);
  await exporter('10.pertesLabo.LC', tokC, `/api/labo/${LC.id}/pertes/historique/export-excel?${qs({ dateDebut: PERIODE.from, dateFin: PERIODE.to })}`);
  await exporter('11.listeProduits.vendable', tokB, `/api/produits/export-list?${qs({ type: 'vendable', withOtherSubTab: 'true' })}`);
  await exporter('11.listeProduits.utilisable', tokB, `/api/produits/export-list?${qs({ type: 'utilisable' })}`);
  await exporter('12.historiqueAppro', tokB, `/api/stock/historique/export-excel?${qs({ entType: 1, ...per })}`);
  await exporter('13.ventes', tokB, `/api/ventes/export-excel?${qs({ activiteId: A1.id, ...PERIODE })}`);
  await exporter('14.configPrix', tokB, `/api/articles-vendables/historique-config/export-excel?${qs({ activiteId: A1.id })}`);
  await exporter('15.ventesLabo', tokB, `/api/labo-ventes/export-excel?${qs({ laboId: L2.id, ...PERIODE })}`);
  await exporter('15.ventesLabo.categorie', tokB, `/api/labo-ventes/export-excel?${qs({ laboId: L2.id, ...PERIODE, filterCategorie: N.cpVendable })}`);

  // ── Tableaux de bord ────────────────────────────────────────────────────────────────────
  const prest = await BA.get(`/api/prestataires?${qs({ activiteId: A1.id })}`);
  const prestId = Array.isArray(prest.body) && prest.body[0] ? prest.body[0].id : null;
  const filtresV2 = {
    sansFiltre: {},
    typePerte: { typesPerte: typesPerte[0] },
    categorie: { catArticles: cat1.id },
    // Filtre « article » du §2.4 : le v2 n'a pas de filtre par article ; la famille est le filtre d'articles restant
    famille: { familles: fam.id },
    fournisseur: { fournisseurs: four.id },
    activite: { activites: A1.id },
    labo: { labos: L2.id },
    canal: { canaux: 'prestataire' },
    prestataire: prestId ? { prestataires: prestId } : { prestataires: '' },
    catProduit: { catProduits: cpV.id },
    typeProduit: { typesProduit: 'produit' },
  };
  for (const tab of ['overview', 'ventes', 'achats', 'pertes', 'labo', 'filtres']) {
    for (const [nomF, f] of Object.entries(filtresV2)) {
      if (tab === 'filtres' && nomF !== 'sansFiltre') continue;
      C.tableauxDeBord[`v2.${tab}.${nomF}`] = (await BA.get(`/api/dashboard/v2?${qs({ tab, ...PERIODE, ...f })}`)).body;
    }
  }
  C.tableauxDeBord['v2.acheteurs.C'] = (await CA.get(`/api/dashboard/v2?${qs({ tab: 'acheteurs', ...PERIODE })}`)).body;
  const v1 = {
    'v1.client': `/api/dashboard/client?${qs(PERIODE)}`,
    'v1.labo': `/api/dashboard/labo?${qs({ laboId: L2.id, ...PERIODE })}`,
    'v1.rapportVentes': `/api/dashboard/rapport-ventes?${qs(PERIODE)}`,
    'v1.activites': `/api/dashboard/activites?${qs(PERIODE)}`,
    'rapports.filters': '/api/rapports/filters',
    'rapports.pertes': `/api/rapports/pertes?${qs({ dateFrom: PERIODE.from, dateTo: PERIODE.to })}`,
    'rapports.coutMatiere': `/api/rapports/cout-matiere?${qs({ dateFrom: PERIODE.from, dateTo: PERIODE.to })}`,
    'rapports.appros': `/api/rapports/appros?${qs({ dateFrom: PERIODE.from, dateTo: PERIODE.to })}`,
    'rapports.stock': '/api/rapports/stock',
    'rapports.activites': '/api/rapports/activites',
  };
  for (const [nom, url] of Object.entries(v1)) C.tableauxDeBord[nom] = { status: null, ...(await BA.get(url)) };
  for (const nom of Object.keys(v1)) { const x = C.tableauxDeBord[nom]; C.tableauxDeBord[nom] = { status: x.status, body: x.body }; }
  const gd = await GA.get('/api/gerant/dashboard');
  C.tableauxDeBord['gerant.dashboard'] = { status: gd.status, body: gd.body };

  // ── Données porteuses de libellés ───────────────────────────────────────────────────────
  const dl = async (nom, tok, url) => { const r = await api(tok).get(url); C.donneesLibelles[nom] = { status: r.status, body: r.body }; };
  await dl('recette.labo.ptUtilisable', tokB, `/api/labo/${L2.id}/pt/${ptU.id}/recipe`);
  await dl('recette.labo.ptVendable', tokB, `/api/labo/${L2.id}/pt/${ptV.id}/recipe`);
  await dl('recette.stock.ptUtilisable', tokB, `/api/stock/pt/${ptU.id}/recipe?${qs({ activiteId: A1.id })}`);
  await dl('articlesValorises', tokB, `/api/articles-valorises?${qs({ activiteId: A1.id })}`);
  await dl('historique.approsActivites', tokB, `/api/stock/historique?${qs({ entType: 1, ...per })}`);
  await dl('historique.approsLabo', tokB, `/api/labo/${L2.id}/historique?${qs(per)}`);
  await dl('historique.transfertsLabo', tokB, `/api/labo/${L2.id}/transfers?${qs(per)}`);
  await dl('historique.inventaireLabo', tokB, `/api/labo/${L2.id}/inventaire/historique?${qs(per)}`);
  await dl('historique.inventaireActivite', tokB, `/api/stock/entreprise/${A1.id}/inventaire/historique?${qs(per)}`);
  await dl('historique.pertesActivites', tokB, `/api/entreprise/pertes?${qs({ dateDebut: PERIODE.from, dateFin: PERIODE.to })}`);
  await dl('historique.pertesLabo', tokB, `/api/labo/${L2.id}/pertes/historique?${qs({ dateDebut: PERIODE.from, dateFin: PERIODE.to })}`);
  await dl('historique.ventes', tokB, `/api/ventes?${qs({ activiteId: A1.id, ...PERIODE })}`);
  await dl('historique.ventesLabo', tokB, `/api/labo-ventes?${qs({ laboId: L2.id, ...PERIODE })}`);
  await dl('articles', tokB, '/api/articles');
  await dl('C.acheteurs.commandes', tokC, '/api/acheteurs/commandes');

  // ── Messages (statut + corps), connexions comprises ─────────────────────────────────────
  const msg = async (nom, r) => { C.messages[nom] = { status: r.status, body: r.body }; };
  const AA = api(tokA);
  await msg('labo404', await BA.get('/api/labo/999999'));
  await msg('activite404', await BA.put('/api/entreprise/activites/999999', { nom: 'X' }));
  await msg('acheteur404', await CA.del('/api/acheteurs/999999'));
  await msg('article404', await BA.get('/api/articles/999999'));
  await msg('laboQuota', await BA.post('/api/labo', { nom: 'Annexe Ouest', refLabo: 'ANO', composantId: labL1.id }));
  await msg('gerantSansAffectation', await BA.post('/api/abonnements/gerants', { nom: 'Sans Affectation', telephone: '+216 22 000 399', email: EMAIL('gerant-x') }));
  await msg('ecritureGerant', await GA.post('/api/produits', { nom: 'Essai gérant', type: 'vendable', categorieProduitId: cpV.id }));
  await msg('moduleAcheteursAbsent', await AA.get('/api/acheteurs'));
  await msg('categorieAvecArticles', await BA.del(`/api/categories/${cat1.id}`));
  await msg('transfertVersSoi', await BA.post(`/api/labo/${L2.id}/transfer`, { dateTransfert: D(20), tauxTva: 7, transfers: [{ laboDestId: L2.id, ingredientId: art.huile, quantite: 1, prixUnitaire: 6 }] }));
  await msg('annulationCommandeAcheteur', await CA.post(`/api/acheteurs/commandes/${cmd1.id}/annuler`, { motif: 'Rupture chez le vendeur' }));
  await msg('annulationCommandeExpediee', await CA.post(`/api/acheteurs/commandes/${vente.commande.id}/annuler`, { motif: 'Erreur de saisie' }));
  await msg('ingredientPortion0', await BA.post(`/api/produits/${compose.id}/ingredients`, { ingredientId: art.huile, portion: 0, unitId: uniteId(['L']) }));
  await msg('ingredientSansId', await BA.post(`/api/produits/${compose.id}/ingredients`, { portion: 0.1, unitId: uniteId(['L']) }));
  const wbF = new ExcelJS.Workbook();
  const wsF = wbF.addWorksheet('Import');
  wsF.addRow(['Nom', 'Téléphone', 'Adresse']);
  wsF.addRow([N.fournisseur, '+216 71 000 101', N.adresseF]);
  wsF.addRow(['Grossiste Ouled', '+216 71 000 102', N.adresseF2]);
  wsF.addRow(['Grossiste Ouled', '+216 71 000 103', N.adresseF2]);
  const fdF = new FormData();
  fdF.append('file', new Blob([await wbF.xlsx.writeBuffer()]), 'fournisseurs.xlsx');
  await msg('importFournisseursDoublons', await appel(tokB, 'POST', '/api/entreprise/fournisseurs/import', undefined, { formulaire: fdF }));
  const login = (email, password) => appel(null, 'POST', '/auth/login', { email, password });
  await msg('connexionErronee', await login(cB.email, 'Mauvais-Mot-2030!'));

  // ── Authentification (3 connexions) ─────────────────────────────────────────────────────
  for (const [l, email, tokRole] of [['client', cB.email], ['gerant', EMAIL('gerant')], ['acheteur', EMAIL('acheteur1')]]) {
    const r = await login(email, MDP);
    const t = r.body && r.body.token;
    C.auth[`${l}.login`] = { status: r.status, body: r.body };
    C.auth[`${l}.me`] = (await appel(t, 'GET', '/auth/me')).body;
    C.auth[`${l}.domaines`] = (await appel(t, 'GET', '/api/domaines')).body;
    void tokRole;
  }
  C.auth['client.entreprise'] = (await BA.get('/api/entreprise')).body;
  // config.composants de l'abonnement (§11.2.2 : genre et elision, comparés explicitement)
  C.auth['client.abonnement'] = (await BA.get('/api/abonnements/mon-abonnement')).body;

  // ── Suppression de l'acheteur avec une commande en attente : motif persisté ─────────────
  const fSupp = await fenetre(async () => CA.del(`/api/acheteurs/${ach1.id}`));
  C.messages['suppressionAcheteur'] = { status: fSupp.resultat.status, body: fSupp.resultat.body };
  C.persistes['C.commandeAnnuleeParSuppression'] = (await CA.get(`/api/acheteurs/commandes/${cmd2.id}`)).body;
  C.persistes['C.commandeAnnuleeParVendeur'] = (await CA.get(`/api/acheteurs/commandes/${cmd1.id}`)).body;

  // ── Sites d'appel admin et demandes d'avenant ───────────────────────────────────────────
  // Demande d'avenant du client, DocuSeal configuré → soumission + email de signature
  const fDem1 = await fenetre(async () => BA.post('/api/abonnements/support', { type: 'supplement', nbActivitesSupp: 1, nbLabosSupp: 1, nbGerantsSupp: 1 }));
  const dem1 = exiger(fDem1.resultat, 201, 'demande d\'avenant (DocuSeal)');
  C.emails['site.demandeAvenantClient'] = emailsDe(fDem1);
  C.valeursContrat['soumission.demandeAvenant'] = fDem1.docuseal;
  // Demande sans DocuSeal, puis traitement admin → email d'avenant + PDF legacy
  delete process.env.DOCUSEAL_API_TOKEN;
  let dem2;
  try {
    dem2 = exiger(await BA.post('/api/abonnements/support', { type: 'supplement', nbLabosSupp: 1 }), 201, 'demande d\'avenant (sans DocuSeal)');
    const fTraiter = await fenetre(async () => A.put(`/api/abonnements/admin/support/${dem2.id}`, { statut: 'validée', notesAdmin: N.notesAdmin }));
    exiger(fTraiter.resultat, 200, 'traitement de la demande (admin)');
    C.emails['site.traitementDemande'] = emailsDe(fTraiter);
    C.pdf['site.traitementDemande.avenantLegacy'] = pdfsDe(fTraiter);
    C.persistes['sse.traitementDemande'] = fTraiter.sse;
  } finally {
    process.env.DOCUSEAL_API_TOKEN = jetonDocuseal;
  }
  // Webhook DocuSeal signé (miroir) : avenant (applyComposants add, notification) puis contrat
  // (email de bienvenue)
  if (DOMAINE === 'miroir') {
    const autres = await pool.query(`SELECT COUNT(*)::int AS n FROM support_demandes WHERE docuseal_submission_id = '1' AND statut = 'en_attente'`);
    if (autres.rows[0].n !== 1) throw new Error(`webhook : ${autres.rows[0].n} demande(s) en attente avec la soumission 1 (1 attendue)`);
    const webhook = (corps) => fetch(`${BASE}/api/webhooks/docuseal`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Docuseal-Secret': process.env.DOCUSEAL_WEBHOOK_SECRET }, body: JSON.stringify(corps),
    });
    const fWh1 = await fenetre(async () => (await webhook({ event_type: 'form.completed', data: { submission_id: 1 } })).status);
    const fWh2 = await fenetre(async () => (await webhook({ event_type: 'form.completed', data: { email: cA.email, completed_at: '2030-06-15T09:30:00Z' } })).status);
    C.persistes['webhook.avenant.sse'] = fWh1.sse;
    C.persistes['webhook.avenant.statut'] = fWh1.resultat;
    C.persistes['webhook.avenant.composants'] = (await pool.query(
      `SELECT dc.code, dc.libelle, dc.libelle_pluriel, dc.type_technique, acc.nb FROM abonnement_config_composants acc
         JOIN domaine_composants dc ON dc.id = acc.composant_id JOIN abonnements a ON a.id = acc.abonnement_id
        WHERE a.client_id = $1 ORDER BY dc.type_technique, dc.code`, [cB.id])).rows;
    C.emails['site.webhookContrat'] = emailsDe(fWh2);
    C.persistes['webhook.contrat.statut'] = fWh2.resultat;
  } else {
    C.persistes['webhook.avenant.sse'] = null;
  }
  void dem1;
  // Invitation Messenger (admin), confirmation d'invitation (admin, compte A')
  const fMsgr = await fenetre(async () => A.post(`/api/ai-assistant/config/${cB.id}/messenger-invite`, {}));
  exiger(fMsgr.resultat, 200, 'invitation Messenger');
  C.emails['site.invitationMessenger'] = emailsDe(fMsgr);
  const fConf = await fenetre(async () => A.post(`/api/abonnements/client/${compteA2.id}/confirm-invite`, {}));
  exiger(fConf.resultat, 200, 'confirmation d\'invitation');
  C.emails['site.confirmationInvitation'] = emailsDe(fConf);
  // Rapport de l'assistant : executeToolCall SANS voc
  const fRap = await fenetre(async () => outilsIA.executeToolCall(cB.id, 'send_report', {}));
  C.emails['site.rapport'] = emailsDe(fRap);
  const piece = fRap.emails[0] && fRap.emails[0].attachments && fRap.emails[0].attachments[0];
  C.rapportIA.resultatOutil = fRap.resultat;
  C.rapportIA.email = emailsDe(fRap);
  C.rapportIA.classeur = piece && piece.content ? await lireClasseur(Buffer.isBuffer(piece.content) ? piece.content : Buffer.from(piece.content, 'base64')) : null;
  C.rapportIA.nomFichier = piece ? piece.filename : null;

  // ── Textes persistés : notifications des comptes ─────────────────────────────────────────
  C.persistes['B.notifications'] = (await BA.get('/api/notifications')).body;
  C.persistes['C.notifications'] = (await CA.get('/api/notifications')).body;
  C.persistes['sse.tous'] = triStable(journal.sse);

  // ── Suppression des comptes (résiliation : soumission + email, site d'appel) ────────────
  for (const [l, c] of [['A', cA], ['A2', compteA2], ['B', cB], ['C', cC]]) {
    const f = await fenetre(async () => supprimerClient(c.id));
    if (f.resultat !== 204) throw new Error(`DELETE /admin/clients/${c.id} (${l}) → ${f.resultat}`);
    ctx.clients = ctx.clients.filter((x) => x !== c.id);
    C.emails[`site.resiliation.${l}`] = emailsDe(f);
    C.valeursContrat[`soumission.resiliation.${l}`] = f.docuseal;
  }
  return meta;
}

// Rangs de la clé de tri des listes de scripts/vocab-baseline/ordre-libre.json qui portent « cleTri »,
// calculés AVANT masquage (les dates deviennent « ⟨date⟩ ») : check-invariant-vocab.js n'y admet une
// permutation qu'entre ex aequo de cette clé (§2.4). Rang = ordre de première apparition de la valeur ;
// un élément sans valeur (titre, en-tête, pied d'un onglet) reçoit un rang à lui.
const resoudreChemin = (v, chemin) => {
  let x = v;
  for (const brut of String(chemin || '').split('/').slice(1)) {
    const k = brut.replace(/~1/g, '/').replace(/~0/g, '~');
    if (x == null || typeof x !== 'object' || !(k in x)) return undefined;
    x = x[k];
  }
  return x;
};
const rangsTri = (captures) => {
  const fichier = path.join(RACINE, 'scripts', 'vocab-baseline', 'ordre-libre.json');
  const libres = fs.existsSync(fichier) ? JSON.parse(fs.readFileSync(fichier, 'utf8')) : [];
  const out = {};
  for (const l of libres.filter((x) => x && x.cleTri)) {
    const liste = resoudreChemin(captures[l.cle], l.chemin);
    if (!Array.isArray(liste)) continue;
    const vus = new Map();
    let n = 0;
    out[`${l.cle}${l.chemin}`] = liste.map((x) => {
      const v = resoudreChemin(x, l.cleTri);
      if (v === undefined || v === null || v === '') return n++;
      const k = JSON.stringify(v);
      if (!vus.has(k)) vus.set(k, n++);
      return vus.get(k);
    });
  }
  return out;
};

// Comptes par clé (non-vacuité) : éléments non vides.
const estVide = (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);
const compter = (captures) => Object.fromEntries(CLES_CAPTURE.map((k) => [k, Object.values(captures[k] || {}).filter((v) => !estVide(v)).length]));

async function nettoyer() {
  const bilan = {};
  try {
    for (const id of [...ctx.clients]) bilan[`client ${id}`] = await supprimerClient(id).catch((e) => e.message);
    await attendreStable(5000);
    if (ctx.miroirId) {
      const r = await fetch(`${BASE}/api/domaines/${ctx.miroirId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${ctx.adminTok}` } });
      bilan.domaineMiroir = r.status;
    }
    await purgerOracle();
    // Notifications écrites pour les admins pendant le passage (comptes de l'oracle)
    const noms = [N.clientA, N.clientA2, N.clientB, N.clientC, N.acheteur1, N.acheteur2, N.acheteur3, N.gerant];
    const n = await pool.query('DELETE FROM notifications WHERE id > $1 AND client_nom = ANY($2::text[])', [ctx.notifMaxId, noms]);
    bilan.notificationsAdmins = n.rowCount;
    if (ctx.adminId) await pool.query('DELETE FROM utilisateurs WHERE id = $1', [ctx.adminId]);
  } catch (e) {
    bilan.erreur = e.message;
  }
  return bilan;
}

(async () => {
  let code = 1;
  let meta = null;
  let erreur = null;
  try {
    meta = await principal();
  } catch (e) {
    erreur = e;
    console.error('[capture] ÉCHEC :', e.stack || e.message);
  } finally {
    const bilan = await nettoyer();
    let etatApres = null;
    try { etatApres = await etatBase(); } catch (e) { bilan.etatApres = e.message; }
    const propre = ctx.etatAvant && etatApres && JSON.stringify(ctx.etatAvant) === JSON.stringify(etatApres) && etatApres.comptes_oracle === 0;
    let requireCacheOk = false;
    try { requireCacheOk = bouchons.controlerRequireCache(); } catch (e) { console.error('[capture]', e.message); }
    const duree = Math.round((DateOrigine.now() - DEBUT) / 1000);
    console.log(`[capture] nettoyage : ${JSON.stringify(bilan)}`);
    console.log(`[capture] base avant : ${JSON.stringify(ctx.etatAvant)}`);
    console.log(`[capture] base après : ${JSON.stringify(etatApres)} → ${propre ? 'PROPRE' : 'DIFFÉRENTE'}`);
    console.log(`[capture] journal du bouchon : ${journal.emails.length} email(s) capté(s), AUCUN envoyé (resend réel ${requireCacheOk ? 'jamais chargé' : 'CHARGÉ'}) ; ${journal.docuseal.length} appel(s) DocuSeal factice ; ${journal.gemini.length} appel(s) Gemini factice ; hôtes refusés : ${journal.bloques.length ? [...new Set(journal.bloques)].join(', ') : 'aucun'}`);
    if (!erreur && propre && requireCacheOk && !journal.bloques.length) {
      const captures = masquer(C);
      const comptes = compter(captures);
      const vides = Object.entries(comptes).filter(([, n]) => n === 0).map(([k]) => k);
      if (vides.length) {
        console.error(`[capture] clé(s) VIDE(S) : ${vides.join(', ')} — référence non écrite`);
      } else {
        meta.signatures = SIGNATURES;
        meta.rangsTri = rangsTri(C);
        meta.periode = 'mois précédent (jours 2 à 22)';
        const sortie = { meta, comptes, captures };
        fs.mkdirSync(path.dirname(SORTIE), { recursive: true });
        fs.writeFileSync(SORTIE, JSON.stringify(sortie, null, 1) + '\n', 'utf8');
        if (BRUT) {
          fs.mkdirSync(BRUT, { recursive: true });
          fs.writeFileSync(path.join(BRUT, 'manuel-client-B.json'), JSON.stringify(brutManuelB, null, 1) + '\n', 'utf8');
          console.log(`[capture] réponse brute du manuel (client B, ${brutManuelB.length} sections) : ${path.join(BRUT, 'manuel-client-B.json')}`);
        }
        console.log(`[capture] comptes par clé : ${JSON.stringify(comptes)}`);
        console.log(`[capture] écrit : ${SORTIE} (${Math.round(fs.statSync(SORTIE).size / 1024)} Ko) — dernière migration ${meta.derniereMigration} — ${duree} s`);
        code = 0;
      }
    } else {
      console.error(`[capture] aucune sortie écrite (erreur : ${erreur ? 'oui' : 'non'}, base propre : ${propre}, resend non chargé : ${requireCacheOk}, hôtes refusés : ${journal.bloques.length}) — ${duree} s`);
    }
    await pool.end().catch(() => {});
    process.exit(code);
  }
})();
