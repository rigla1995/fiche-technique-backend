/* Oracle du vocabulaire — CONTRÔLE (lot 2b, docs/lot-2b-spec.md §2.1, §2.4 à §2.6).
 *
 *   node scripts/check-invariant-vocab.js [--domaine restauration]      (défaut)
 *     Refait la capture du domaine restauration (scripts/capture-vocab-baseline.js, UN processus) et la
 *     compare à la référence scripts/vocab-baseline/restauration.json :
 *       - non-vacuité : chaque clé de capture a un compte > 0, égal à celui de la référence ;
 *       - même mois civil que la référence (sinon : recapturer la référence, code 2) ;
 *       - tout écart doit figurer dans scripts/vocab-baseline/ecarts-restauration-attendus.json
 *         ({ cle, chemin, avant, apres, raison: '§11.1.n' | '§11.2.n' }) ; une entrée sans emploi = échec ;
 *       - un écart d'ordre SEUL (même multi-ensemble) est signalé à part, « ordre seul ». Il n'est admis
 *         que par scripts/vocab-baseline/ordre-libre.json ({ cle, chemin, raison, cleTri? }) :
 *           · entrée SANS cleTri : requête sans ORDER BY, toute permutation de la liste est admise (§2.4) ;
 *           · entrée AVEC cleTri (pointeur dans l'élément, ex. « /date_appro ») : requête triée sur une
 *             clé non unique. Seules les permutations ENTRE EX AEQUO sont admises : la capture écrit, pour
 *             chaque liste, la suite des rangs de la clé de tri AVANT masquage (meta.rangsTri) ; si la
 *             suite est identique à celle de la référence, chaque groupe d'ex aequo est trié (JSON)
 *             dans les deux listes avant la comparaison. Toute autre permutation reste un écart.
 *
 *   node scripts/check-invariant-vocab.js --domaine hotellerie|ceramique|miroir
 *     Refait la capture du domaine X et y cherche les formes par défaut (§2.5) : formes F(X) calculées
 *     par le moteur courant, données de l'oracle masquées « ⟦d⟧ », recherche par sortie, exceptions
 *     typées de scripts/vocab-baseline/exceptions-hors-restauration.json ({ cle, chemin (motif), texte (forme
 *     trouvée ou texte entier), type, justification, domaines? }), puis recherche des mots de la
 *     restauration hors lexique. Code 1 s'il reste une forme hors exceptions (attendu : 0 à la fin du lot).
 *     Textes lus : ceux du §2.5 point 3. Les étiquettes de capture de l'oracle (clés de premier niveau,
 *     ex. « v2.labo.sansFiltre ») ne sont jamais lues comme du texte. Les NOMS DE FICHIERS
 *     (Content-Disposition des exports et des PDF, pièces jointes des emails, rapportIA.nomFichier) ne
 *     sont PAS lus : hors lot 2b (spec §0 « Noms de fichiers téléchargés (I2) », §6.3 « inchangés ») ;
 *     en restauration, ils restent comparés à l'identique. Le type « nom-de-fichier » sert à un nom de
 *     fichier cité DANS un texte lu.
 *     --liste-avant : écrit la section du domaine dans scripts/vocab-baseline/hors-restauration-avant.json
 *     (liste de travail de l'étape O, chiffrée par famille) ; code 0 si l'écriture a réussi.
 *
 *   Options communes :
 *     --capture <fichier>    analyser une capture déjà faite (aucun nouveau passage) ;
 *     --reference <fichier>  autre référence (ex. : preuve de déterminisme entre deux captures) ;
 *     --rapport <fichier>    rapport détaillé JSON (défaut : dossier temporaire du système) ;
 *     --port <n>             port de la capture (défaut 3197).
 *
 * ⚠️ Une capture applique les migrations en attente à la base locale : seul l'intégrateur la lance. */
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const { pathToFileURL } = require('url');

const RACINE = path.resolve(__dirname, '..');
const DOSSIER = path.join(RACINE, 'scripts', 'vocab-baseline');
const FICHIERS = {
  reference: path.join(DOSSIER, 'restauration.json'),
  ecarts: path.join(DOSSIER, 'ecarts-restauration-attendus.json'),
  ordre: path.join(DOSSIER, 'ordre-libre.json'),
  exceptions: path.join(DOSSIER, 'exceptions-hors-restauration.json'),
  avant: path.join(DOSSIER, 'hors-restauration-avant.json'),
};

const argv = process.argv.slice(2);
const arg = (nom, defaut = null) => {
  const i = argv.indexOf(`--${nom}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : defaut;
};
const DOMAINE = arg('domaine', 'restauration');
const HORS = ['hotellerie', 'ceramique', 'miroir'];
if (DOMAINE !== 'restauration' && !HORS.includes(DOMAINE)) {
  console.error(`[check-vocab] domaine inconnu « ${DOMAINE} » (restauration, ${HORS.join(', ')})`);
  process.exit(2);
}
const RAPPORT = path.resolve(arg('rapport', path.join(os.tmpdir(), `check-invariant-vocab-${DOMAINE}.json`)));

const lireJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const ecrireJson = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 1) + '\n', 'utf8'); };
const court = (v, n = 160) => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s === undefined ? 'undefined' : (s.length > n ? `${s.slice(0, n)}…` : s); };

// ── Capture (un processus par domaine) ───────────────────────────────────────────────────────
function capturer() {
  const fourni = arg('capture');
  if (fourni) return lireJson(path.resolve(fourni));
  const sortie = path.join(os.tmpdir(), `capture-vocab-${DOMAINE}-${process.pid}.json`);
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(__dirname, 'capture-vocab-baseline.js'), '--domaine', DOMAINE, '--sortie', sortie, '--port', arg('port', '3197')], { stdio: 'inherit', cwd: RACINE });
  console.log(`[check-vocab] capture ${DOMAINE} : code ${r.status}, ${Math.round((Date.now() - t0) / 1000)} s`);
  if (r.status !== 0 || !fs.existsSync(sortie)) {
    console.error('[check-vocab] ÉCHEC : la capture n\'a rien écrit (voir son journal ci-dessus).');
    process.exit(1);
  }
  const c = lireJson(sortie);
  fs.unlinkSync(sortie);
  return c;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// Mode restauration : comparaison à la référence
// ══════════════════════════════════════════════════════════════════════════════════════════════
const ABSENT = '⟨absent⟩';
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const multiEnsemble = (l) => l.map((x) => JSON.stringify(x)).sort();
const seg = (k) => String(k).replace(/~/g, '~0').replace(/\//g, '~1');

// Chemin « /a/b~1c » → valeur (segments échappés par seg()).
const resoudre = (v, chemin) => {
  if (!chemin || chemin === '/') return v;
  let x = v;
  for (const brut of chemin.split('/').slice(1)) {
    const k = brut.replace(/~1/g, '/').replace(/~0/g, '~');
    if (x == null || typeof x !== 'object' || !(k in x)) return undefined;
    x = x[k];
  }
  return x;
};

// Listes triées sur une clé non unique (ordre-libre.json avec cleTri) : si la suite des rangs de la
// clé de tri est la même que dans la référence, chaque groupe CONTIGU d'ex aequo est trié (JSON) dans
// les deux listes. Une permutation entre ex aequo disparaît ; toute autre différence reste visible.
function normaliserExAequo(ref, courante, libres, problemes) {
  const info = [];
  for (const l of libres.filter((x) => x && x.cleTri)) {
    const id = `${l.cle}${l.chemin}`;
    const ra = ref.meta && ref.meta.rangsTri && ref.meta.rangsTri[id];
    const rb = courante.meta && courante.meta.rangsTri && courante.meta.rangsTri[id];
    const la = resoudre(ref.captures[l.cle], l.chemin);
    const lb = resoudre(courante.captures[l.cle], l.chemin);
    if (!Array.isArray(ra)) { problemes.push(`ordre-libre.json ${id} : rangs de tri absents de la référence (meta.rangsTri) — recapturer la référence`); continue; }
    if (!Array.isArray(rb)) { problemes.push(`ordre-libre.json ${id} : rangs de tri absents de la capture (meta.rangsTri)`); continue; }
    if (!Array.isArray(la) || !Array.isArray(lb) || la.length !== ra.length || lb.length !== rb.length) { info.push({ id, normalise: false, motif: 'liste absente ou de longueur différente de ses rangs' }); continue; }
    if (!egal(ra, rb)) { info.push({ id, normalise: false, motif: 'suite des rangs de tri différente de la référence' }); continue; }
    const avantEgal = egal(la, lb);
    for (const liste of [la, lb]) {
      let i = 0;
      while (i < liste.length) {
        let j = i + 1;
        while (j < liste.length && ra[j] === ra[i]) j += 1;
        if (j - i > 1) {
          const groupe = liste.slice(i, j).sort((x, y) => { const a = JSON.stringify(x); const b = JSON.stringify(y); return a < b ? -1 : a > b ? 1 : 0; });
          liste.splice(i, j - i, ...groupe);
        }
        i = j;
      }
    }
    info.push({ id, normalise: true, permutationEntreExAequo: !avantEgal && egal(la, lb) });
  }
  return info;
}

function comparer(avant, apres, chemin, sortie) {
  if (egal(avant, apres)) return;
  if (Array.isArray(avant) && Array.isArray(apres)) {
    if (avant.length === apres.length && egal(multiEnsemble(avant), multiEnsemble(apres))) {
      sortie.ordre.push({ chemin });
      return;
    }
    if (avant.length === apres.length) {
      for (let i = 0; i < avant.length; i++) comparer(avant[i], apres[i], `${chemin}/${i}`, sortie);
      return;
    }
    sortie.ecarts.push({ chemin, avant, apres });
    return;
  }
  const objet = (v) => v && typeof v === 'object' && !Array.isArray(v);
  if (objet(avant) && objet(apres)) {
    for (const k of new Set([...Object.keys(avant), ...Object.keys(apres)])) {
      comparer(k in avant ? avant[k] : ABSENT, k in apres ? apres[k] : ABSENT, `${chemin}/${seg(k)}`, sortie);
    }
    return;
  }
  sortie.ecarts.push({ chemin, avant, apres });
}

function verifierRestauration(courante) {
  const refFichier = path.resolve(arg('reference', FICHIERS.reference));
  if (!fs.existsSync(refFichier)) { console.error(`[check-vocab] référence absente : ${refFichier}`); process.exit(2); }
  const ref = lireJson(refFichier);
  const problemes = [];
  const libres = fs.existsSync(FICHIERS.ordre) ? lireJson(FICHIERS.ordre) : [];
  libres.forEach((l, i) => {
    if (!l || !l.cle || !l.chemin || !l.raison) problemes.push(`ordre-libre.json[${i}] : cle, chemin et raison obligatoires`);
  });

  // Comparabilité : même domaine, même mois civil.
  if (courante.meta.domaine !== ref.meta.domaine) problemes.push(`domaine ${courante.meta.domaine} ≠ référence ${ref.meta.domaine}`);
  if (courante.meta.moisCapture !== ref.meta.moisCapture) {
    console.error(`[check-vocab] mois civil ${courante.meta.moisCapture} ≠ référence ${ref.meta.moisCapture} : recapturer la référence sur la tête de develop (spec §2.4).`);
    process.exit(2);
  }

  // Non-vacuité (§2.1).
  const cles = new Set([...Object.keys(ref.comptes), ...Object.keys(courante.comptes)]);
  for (const k of cles) {
    const a = ref.comptes[k];
    const b = courante.comptes[k];
    if (!a) problemes.push(`clé « ${k} » vide ou absente dans la référence`);
    if (!b) problemes.push(`clé « ${k} » vide ou absente dans la capture`);
    else if (a && a !== b) problemes.push(`clé « ${k} » : ${b} élément(s), ${a} dans la référence`);
  }

  // Ex aequo des listes triées sur une clé non unique (ordre-libre.json avec cleTri) : normalisés
  // sur des copies, AVANT la comparaison.
  const refN = { ...ref, captures: JSON.parse(JSON.stringify(ref.captures)) };
  const courN = { ...courante, captures: JSON.parse(JSON.stringify(courante.captures)) };
  const exAequo = normaliserExAequo(refN, courN, libres, problemes);

  // Écarts.
  const brut = { ecarts: [], ordre: [] };
  for (const k of cles) {
    const s = { ecarts: [], ordre: [] };
    comparer(refN.captures[k], courN.captures[k], '', s);
    for (const e of s.ecarts) brut.ecarts.push({ cle: k, ...e, chemin: e.chemin || '/' });
    for (const o of s.ordre) brut.ordre.push({ cle: k, chemin: o.chemin || '/' });
  }

  // Écarts attendus (§2.6) : chaque écart listé, chaque entrée employée.
  const attendus = fs.existsSync(FICHIERS.ecarts) ? lireJson(FICHIERS.ecarts) : [];
  if (!Array.isArray(attendus)) { console.error('[check-vocab] ecarts-restauration-attendus.json : tableau attendu'); process.exit(2); }
  attendus.forEach((e, i) => {
    const manque = ['cle', 'chemin', 'avant', 'apres', 'raison'].filter((c) => !(c in e));
    if (manque.length) problemes.push(`ecarts-restauration-attendus.json[${i}] : champ(s) manquant(s) ${manque.join(', ')}`);
    else if (!/^§11\.[12]\.\d+$/.test(e.raison)) problemes.push(`ecarts-restauration-attendus.json[${i}] : raison « ${e.raison} » (attendu §11.1.n ou §11.2.n)`);
  });
  const employees = new Set();
  const nonListes = [];
  for (const e of brut.ecarts) {
    const i = attendus.findIndex((a) => a.cle === e.cle && a.chemin === e.chemin && egal(a.avant, e.avant) && egal(a.apres, e.apres));
    if (i >= 0) employees.add(i); else nonListes.push(e);
  }
  const sansEmploi = attendus.map((a, i) => ({ ...a, i })).filter((a) => !employees.has(a.i));

  // Ordre seul : admis seulement par une entrée SANS cleTri (requête sans ORDER BY). Une liste à
  // cleTri a déjà été normalisée : un ordre seul qui y reste est une permutation hors ex aequo.
  const ordreNonAdmis = brut.ordre.filter((o) => !libres.some((l) => !l.cleTri && l.cle === o.cle && l.chemin === o.chemin));
  const ordreAdmis = brut.ordre.length - ordreNonAdmis.length;
  const exAequoPermutes = exAequo.filter((x) => x.permutationEntreExAequo).map((x) => x.id);
  const libresSansEmploi = libres.filter((l) => (l.cleTri
    ? !exAequoPermutes.includes(`${l.cle}${l.chemin}`)
    : !brut.ordre.some((o) => l.cle === o.cle && l.chemin === o.chemin)));

  ecrireJson(RAPPORT, { reference: path.relative(RACINE, refFichier), problemes, ecartsNonListes: nonListes, entreesSansEmploi: sansEmploi, ordreSeul: brut.ordre, ordreNonAdmis, exAequo, libresSansEmploi, comptes: courante.comptes });

  console.log(`[check-vocab] restauration — référence ${path.relative(RACINE, refFichier)} (migration ${ref.meta.derniereMigration}) ; capture (migration ${courante.meta.derniereMigration})`);
  console.log(`[check-vocab] comptes par clé : ${JSON.stringify(courante.comptes)}`);
  for (const p of problemes) console.log(`  ✗ ${p}`);
  for (const e of nonListes.slice(0, 40)) console.log(`  ✗ écart non listé ${e.cle}${e.chemin}\n      avant : ${court(e.avant)}\n      après : ${court(e.apres)}`);
  if (nonListes.length > 40) console.log(`  … ${nonListes.length - 40} autre(s) écart(s) : voir ${RAPPORT}`);
  for (const a of sansEmploi) console.log(`  ✗ entrée sans emploi : ${a.cle}${a.chemin} (${a.raison})`);
  for (const o of ordreNonAdmis.slice(0, 20)) console.log(`  ✗ ordre seul, non admis : ${o.cle}${o.chemin}`);
  for (const x of exAequo) {
    if (!x.normalise) console.log(`  · ex aequo non normalisés ${x.id} : ${x.motif} (toute permutation y reste un écart)`);
    else if (x.permutationEntreExAequo) console.log(`  · ${x.id} : permutation entre ex aequo de la clé de tri (admise, ordre-libre.json)`);
  }
  for (const l of libresSansEmploi) console.log(`  · ordre-libre.json : entrée sans emploi ${l.cle}${l.chemin} (aucune permutation à ce passage)`);
  const ok = !problemes.length && !nonListes.length && !sansEmploi.length && !ordreNonAdmis.length;
  console.log(`[check-vocab] ${ok ? 'IDENTIQUE' : 'ÉCHEC'} — ${brut.ecarts.length} écart(s) dont ${brut.ecarts.length - nonListes.length} attendu(s), ${nonListes.length} non listé(s) ; ${sansEmploi.length} entrée(s) sans emploi ; ordre seul : ${brut.ordre.length} (${ordreAdmis} admis) ; permutations entre ex aequo : ${exAequoPermutes.length} ; rapport : ${RAPPORT}`);
  return ok ? 0 : 1;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// Mode hors restauration (§2.5)
// ══════════════════════════════════════════════════════════════════════════════════════════════
const TYPES_EXCEPTION = ['lot-3', '2c', 'fiscal', 'formule', 'non-repliable', 'nom-de-fichier', 'code-api', 'donnee', 'locution', 'homonyme', 'admin'];
// Mots de la restauration hors lexique (§2.5, point 6), cherchés en mot entier, sans casse.
const MOTS_HORS_LEXIQUE = ['restaurant', 'restaurants', 'restauration', 'plat', 'plats', 'menu', 'menus', 'chef', 'chefs', 'couverts', 'carte', 'cartes', 'métiers de bouche', 'food'];
// Clés *_abr de la spec §4.3, ajoutées à l'étape S1 : absentes avant, la liste « avant » est incomplète pour elles.
const CLES_ABR = ['pt_abr', 'produit_utilisable_abr', 'produit_vendable_abr', 'produit_valorise_abr'];

// Familles de sorties (liste fermée du §0).
const FAMILLE = {
  messages: 'messages', tableauxDeBord: 'donnees', donneesLibelles: 'donnees', auth: 'donnees',
  exports: 'excel', pdf: 'documents', valeursContrat: 'documents', emails: 'emails',
  prompt: 'assistant', promptReel: 'assistant', outils: 'assistant', resultatsOutils: 'assistant', recherches: 'assistant',
  contexte: 'assistant', guide: 'assistant', accueilMessenger: 'assistant', rapportIA: 'assistant', persistes: 'persistes',
};

// Recherche : formesDans de l'outil de preuve (E11, vocab-check.mjs du frontend), sinon le même motif.
let formesDans = null;
async function chargerFormesDans() {
  const outil = path.join(RACINE, '..', 'fiche-technique-frontend', 'scripts', 'vocab-check.mjs');
  try {
    const m = await import(pathToFileURL(outil).href);
    if (typeof m.formesDans === 'function') { formesDans = m.formesDans; return 'vocab-check.mjs (E11)'; }
  } catch (_) { /* outil indisponible : repli local */ }
  const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const SIGLE = /^[\p{Lu}\d]{2,4}$/u;
  formesDans = (texte, formes) => {
    if (typeof texte !== 'string' || !texte) return [];
    return [...new Set(formes)].filter((f) => f && new RegExp(`(?<![\\p{L}\\p{N}_])${echapper(f)}(?![\\p{L}\\p{N}_])`, SIGLE.test(f) ? 'u' : 'iu').test(texte));
  };
  return 'repli local (même motif que vocab-check.mjs)';
}

// F(X) : formes par défaut dont le rendu diffère dans X, moins celles que X rend aussi.
function formesCherchees(lexiqueX) {
  const { LEXIQUE_DEFAUT } = require(path.join(RACINE, 'src', 'config', 'lexiqueDefaut'));
  const { vocabDefaut, vocabDuLexique } = require(path.join(RACINE, 'src', 'utils', 'vocab'));
  const vX = vocabDuLexique(lexiqueX);
  const formes = (v, k) => [['Nom', v.Nom(k)], ['Pl', v.Pl(k)], ['Court', v.Court(k)], ['Court(pl)', v.Court(k, 2)]];
  const cles = Object.keys(LEXIQUE_DEFAUT);
  const rendusX = new Set();
  for (const k of cles) for (const [, f] of formes(vX, k)) rendusX.add(String(f).toLowerCase());
  const F = new Map();
  const retirees = new Map();
  for (const k of cles) {
    const d = formes(vocabDefaut, k);
    const x = formes(vX, k);
    d.forEach(([type, f], i) => {
      if (String(f) === String(x[i][1])) return;
      const cible = rendusX.has(String(f).toLowerCase()) ? retirees : F;
      if (!cible.has(f)) cible.set(f, []);
      const l = cible.get(f);
      if (!l.includes(`${k}:${type}`)) l.push(`${k}:${type}`);
    });
  }
  return { F, retirees, vX, cles, clesAbsentes: CLES_ABR.filter((k) => !cles.includes(k)) };
}

// Texte visible d'un HTML d'email : balises, attributs et URL retirés, entités décodées.
const ENTITES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ', eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à', acirc: 'â', ccedil: 'ç', ocirc: 'ô', ucirc: 'û', icirc: 'î', rsquo: '’', lsquo: '‘', laquo: '«', raquo: '»', middot: '·', hellip: '…', mdash: '—', ndash: '–', euro: '€', copy: '©' };
const texteVisible = (html) => String(html || '')
  .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
  .replace(/&([a-z]+);/gi, (m, n) => (n.toLowerCase() in ENTITES ? ENTITES[n.toLowerCase()] : m))
  .replace(/\bhttps?:\/\/\S+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const CODE = [/^[a-z0-9_\-./:#?=&]+$/, /^[A-Z0-9_]{2,}$/];
const estCode = (s) => CODE.some((re) => re.test(s));

// Textes d'une capture, par sortie (§2.5, point 3) : [{ cle, chemin, texte }].
function textes(captures) {
  const out = [];
  const pousser = (cle, chemin, t) => { if (typeof t === 'string' && t.trim()) out.push({ cle, chemin, texte: t }); };
  // JSON de données : clés ignorées (sauf clé avec espace ou capitale), valeurs de forme code ignorées.
  const donnees = (cle, v, chemin) => {
    if (v == null) return;
    if (typeof v === 'string') { if (!estCode(v)) pousser(cle, chemin, v); return; }
    if (Array.isArray(v)) { v.forEach((x, i) => donnees(cle, x, `${chemin}/${i}`)); return; }
    if (typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        if (/[\s\p{Lu}]/u.test(k)) pousser(cle, `${chemin}/${seg(k)}#cle`, k);
        donnees(cle, x, `${chemin}/${seg(k)}`);
      }
    }
  };
  // Valeur sous une étiquette : chaîne lue telle quelle (même de forme code), sinon lue comme JSON de données.
  const valeur = (cle, chemin, v) => { if (typeof v === 'string') pousser(cle, chemin, v); else donnees(cle, v, chemin); };
  const classeur = (cle, onglets, chemin) => (onglets || []).forEach((o, i) => {
    pousser(cle, `${chemin}/onglets/${i}/nom`, o.nom);
    (o.lignes || []).forEach((l, j) => l.forEach((c, k) => pousser(cle, `${chemin}/onglets/${i}/lignes/${j}/${k}`, c)));
  });
  const emails = (cle, liste, chemin) => (liste || []).forEach((e, i) => {
    pousser(cle, `${chemin}/${i}/subject`, e.subject);
    pousser(cle, `${chemin}/${i}/html`, texteVisible(e.html));
  });
  const pdfs = (cle, docs, chemin) => (docs || []).forEach((d, i) => {
    (d.textes || []).forEach((t, j) => pousser(cle, `${chemin}/${i}/textes/${j}`, t));
    for (const [k, v] of Object.entries(d.info || {})) pousser(cle, `${chemin}/${i}/info/${k}`, v);
  });
  const descriptions = (cle, v, chemin) => {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) { v.forEach((x, i) => descriptions(cle, x, `${chemin}/${i}`)); return; }
    for (const [k, x] of Object.entries(v)) {
      if (k === 'description' && typeof x === 'string') pousser(cle, `${chemin}/description`, x);
      else descriptions(cle, x, `${chemin}/${seg(k)}`);
    }
  };

  for (const [nom, m] of Object.entries(captures.messages || {})) {
    const b = m && m.body;
    if (!b || typeof b !== 'object') { pousser('messages', `/${seg(nom)}/body`, b); continue; }
    pousser('messages', `/${seg(nom)}/body/message`, b.message);
    (Array.isArray(b.erreurs) ? b.erreurs : []).forEach((e, i) => pousser('messages', `/${seg(nom)}/body/erreurs/${i}/message`, e && e.message));
    (Array.isArray(b.errors) ? b.errors : []).forEach((e, i) => pousser('messages', `/${seg(nom)}/body/errors/${i}/msg`, e && e.msg));
    (Array.isArray(b.details) ? b.details : []).forEach((e, i) => pousser('messages', `/${seg(nom)}/body/details/${i}/error`, e && e.error));
  }
  // `recherches` (résultats de search_knowledge_base = manuel et base de connaissances) n'est PAS lue : lot 2c,
  // hors lot 2b (spec §0) ; elle reste comparée à l'identique en restauration.
  // Clés de premier niveau = étiquettes de capture de l'oracle (« v2.labo.sansFiltre », « get_ventes canal=… ») :
  // jamais lues comme du texte du serveur.
  for (const k of ['tableauxDeBord', 'donneesLibelles', 'resultatsOutils', 'auth', 'persistes', 'valeursContrat']) {
    for (const [nom, v] of Object.entries(captures[k] || {})) donnees(k, v, `/${seg(nom)}`);
  }
  for (const [nom, x] of Object.entries(captures.exports || {})) {
    if (x.onglets) classeur('exports', x.onglets, `/${seg(nom)}`);
    else if (x.corps && typeof x.corps === 'object') pousser('exports', `/${seg(nom)}/corps/message`, x.corps.message);
  }
  for (const [nom, l] of Object.entries(captures.emails || {})) emails('emails', l, `/${seg(nom)}`);
  for (const [nom, p] of Object.entries(captures.pdf || {})) pdfs('pdf', Array.isArray(p) ? p : p.documents, `/${seg(nom)}${Array.isArray(p) ? '' : '/documents'}`);
  descriptions('outils', captures.outils, '');
  for (const [k, t] of Object.entries(captures.prompt || {})) valeur('prompt', `/${seg(k)}`, t);
  (captures.promptReel && captures.promptReel.corps || []).forEach((c, i) => {
    pousser('promptReel', `/corps/${i}/systeme`, c.systeme);
    descriptions('promptReel', c.outils, `/corps/${i}/outils`);
  });
  // Ligne de contexte : { nom, line, seuil_cout_matiere_pct, types_perte } par compte (A, B, C).
  for (const [k, t] of Object.entries(captures.contexte || {})) {
    if (t && typeof t === 'object' && !Array.isArray(t)) for (const [c, v] of Object.entries(t)) valeur('contexte', `/${seg(k)}/${seg(c)}`, v);
    else valeur('contexte', `/${seg(k)}`, t);
  }
  for (const [k, v] of Object.entries(captures.guide || {})) {
    if (typeof v === 'string') pousser('guide', `/${seg(k)}`, v); else donnees('guide', v, `/${seg(k)}`);
  }
  for (const [k, t] of Object.entries(captures.accueilMessenger || {})) valeur('accueilMessenger', `/${seg(k)}`, t);
  if (captures.rapportIA) {
    classeur('rapportIA', captures.rapportIA.classeur, '/classeur');
    emails('rapportIA', captures.rapportIA.email, '/email');
  }
  return out;
}

const extrait = (t, f) => {
  if (t.length <= 160) return t;
  const i = t.toLowerCase().indexOf(String(f).toLowerCase());
  const d = Math.max(0, i - 70);
  return `${d > 0 ? '…' : ''}${t.slice(d, d + 160)}${d + 160 < t.length ? '…' : ''}`;
};
// Chemin générique (indices de lignes et de documents remplacés), pour regrouper la liste de travail.
const cheminGenerique = (c) => c.replace(/\/\d+(?=\/|$)/g, '/n');

async function verifierHorsRestauration(capture) {
  const source = await chargerFormesDans();
  const { F, retirees, vX, clesAbsentes } = formesCherchees(capture.meta.lexique);
  const listeF = [...F.keys()];

  // Données de l'oracle → « ⟦d⟧ », du plus long au plus court (jamais relues en base).
  const donnees = [...new Set([...(capture.meta.donnees || []), ...(capture.meta.composantsOracle || [])])].filter(Boolean).sort((a, b) => b.length - a.length);
  const masquerDonnees = (t) => donnees.reduce((s, d) => s.split(d).join('⟦d⟧'), t);

  const exceptions = fs.existsSync(FICHIERS.exceptions) ? lireJson(FICHIERS.exceptions) : [];
  const problemes = [];
  exceptions.forEach((e, i) => {
    if (!e || !e.cle || !e.chemin || !e.texte || !e.justification) problemes.push(`exceptions-hors-restauration.json[${i}] : cle, chemin, texte et justification obligatoires`);
    if (!TYPES_EXCEPTION.includes(e && e.type)) problemes.push(`exceptions-hors-restauration.json[${i}] : type « ${e && e.type} » hors liste (${TYPES_EXCEPTION.join(', ')})`);
    try { if (e && e.chemin) new RegExp(e.chemin); } catch (err) { problemes.push(`exceptions-hors-restauration.json[${i}] : chemin invalide (${err.message})`); }
  });
  // `domaines` (facultatif) : domaines où l'entrée s'applique ; une entrée n'est « sans emploi » que là.
  const applicable = (e) => !Array.isArray(e.domaines) || e.domaines.includes(capture.meta.domaine);
  const employees = new Set();
  const exception = (f) => {
    const i = exceptions.findIndex((e) => applicable(e) && e.cle === f.cle && new RegExp(e.chemin).test(f.chemin) && (e.texte === f.forme || e.texte === f.texte));
    if (i >= 0) employees.add(i);
    return i;
  };

  const trouvees = [];
  const horsLexique = [];
  let nTextes = 0;
  for (const t of textes(capture.captures)) {
    nTextes += 1;
    const texte = masquerDonnees(t.texte);
    for (const forme of formesDans(texte, listeF)) {
      const f = { famille: FAMILLE[t.cle], cle: t.cle, chemin: t.chemin, forme, cles: F.get(forme), texte };
      if (exception(f) < 0) trouvees.push(f);
    }
    for (const mot of formesDans(texte, MOTS_HORS_LEXIQUE)) {
      const f = { famille: FAMILLE[t.cle], cle: t.cle, chemin: t.chemin, forme: mot, texte };
      if (exception(f) < 0) horsLexique.push(f);
    }
  }

  // Libellés écrits par le serveur (création à la volée, webhook) : jamais masqués, comparés à l'attendu exact.
  const attenduGerant = { libelle: vX.Nom('gerant'), libelle_pluriel: vX.Pl('gerant') };
  const libellesServeur = [];
  if (capture.meta.domaine === 'miroir') {
    const p = capture.captures.persistes || {};
    const lignes = [
      ...(p['creation.composantsAlaVolee'] || []).map((r, i) => ({ chemin: `/creation.composantsAlaVolee/${i}`, r })),
      ...(p['webhook.avenant.composants'] || []).filter((r) => r.type_technique === 'gerant').map((r, i) => ({ chemin: `/webhook.avenant.composants/gerant/${i}`, r })),
    ];
    if (!lignes.length) problemes.push('miroir : aucun composant gérant créé à la volée n\'a été capturé (non-vacuité)');
    for (const { chemin, r } of lignes) {
      const ok = r.libelle === attenduGerant.libelle && r.libelle_pluriel === attenduGerant.libelle_pluriel;
      libellesServeur.push({ chemin, obtenu: { libelle: r.libelle, libelle_pluriel: r.libelle_pluriel }, attendu: attenduGerant, ok });
    }
  }
  const libellesKo = libellesServeur.filter((l) => !l.ok);
  const sansEmploi = exceptions.map((e, i) => ({ ...e, i })).filter((e) => applicable(e) && !employees.has(e.i));

  // Synthèse par famille, puis liste de travail regroupée par texte distinct.
  const synthese = (liste) => {
    const parFamille = {};
    for (const f of liste) {
      const s = parFamille[f.famille] || (parFamille[f.famille] = { occurrences: 0, textes: 0, parCle: {}, parForme: {} });
      s.occurrences += 1;
      s.parCle[f.cle] = (s.parCle[f.cle] || 0) + 1;
      s.parForme[f.forme] = (s.parForme[f.forme] || 0) + 1;
    }
    const groupes = new Map();
    for (const f of liste) {
      const k = `${f.famille}|${f.cle}|${cheminGenerique(f.chemin)}|${f.texte}`;
      if (!groupes.has(k)) groupes.set(k, { famille: f.famille, cle: f.cle, chemin: cheminGenerique(f.chemin), exemple: f.chemin, formes: [], occurrences: 0, texte: extrait(f.texte, f.forme) });
      const g = groupes.get(k);
      g.occurrences += 1;
      if (!g.formes.includes(f.forme)) g.formes.push(f.forme);
    }
    const elements = [...groupes.values()].sort((a, b) => `${a.famille}|${a.cle}|${a.chemin}|${a.texte}`.localeCompare(`${b.famille}|${b.cle}|${b.chemin}|${b.texte}`));
    for (const g of elements) parFamille[g.famille].textes += 1;
    const tri = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
    for (const s of Object.values(parFamille)) { s.parCle = tri(s.parCle); s.parForme = tri(s.parForme); }
    return { occurrences: liste.length, textes: elements.length, parFamille: tri(parFamille), elements };
  };
  const res = {
    domaine: capture.meta.domaine,
    domaineNom: capture.meta.domaineNom,
    migration: capture.meta.derniereMigration,
    rechercheFormes: source,
    incompletePour: clesAbsentes,
    textesLus: nTextes,
    formesCherchees: Object.fromEntries([...F.entries()].sort(([a], [b]) => a.localeCompare(b))),
    formesRetirees: Object.fromEntries([...retirees.entries()].sort(([a], [b]) => a.localeCompare(b))),
    exceptionsEmployees: employees.size,
    formes: synthese(trouvees),
    horsLexique: synthese(horsLexique),
    libellesServeur,
  };

  ecrireJson(RAPPORT, { ...res, problemes, exceptionsSansEmploi: sansEmploi });
  console.log(`[check-vocab] ${res.domaine} (${res.domaineNom}) — ${listeF.length} forme(s) cherchée(s) (${retirees.size} retirée(s) car rendue(s) aussi par le domaine), ${nTextes} texte(s) lu(s), recherche : ${source}`);
  if (clesAbsentes.length) console.log(`[check-vocab] liste INCOMPLÈTE pour les clés absentes du moteur courant : ${clesAbsentes.join(', ')} (à relancer après S1)`);
  for (const [fam, s] of Object.entries(res.formes.parFamille)) console.log(`  ${fam.padEnd(10)} ${String(s.occurrences).padStart(5)} occurrence(s), ${String(s.textes).padStart(4)} texte(s) distinct(s)`);
  console.log(`  hors lexique : ${res.horsLexique.occurrences} occurrence(s) (${Object.entries(res.horsLexique.parFamille).map(([f, s]) => `${f} ${s.occurrences}`).join(', ') || 'aucune'})`);
  for (const l of libellesKo) console.log(`  ✗ libellé écrit par le serveur ${l.chemin} : ${JSON.stringify(l.obtenu)} (attendu ${JSON.stringify(l.attendu)})`);
  for (const p of problemes) console.log(`  ✗ ${p}`);
  for (const e of sansEmploi) console.log(`  ✗ exception sans emploi : ${e.cle} ${e.chemin} « ${e.texte} » (${e.type})`);
  console.log(`[check-vocab] rapport : ${RAPPORT}`);

  if (argv.includes('--liste-avant')) {
    if (problemes.length) { console.error('[check-vocab] liste non écrite (problèmes ci-dessus)'); return 1; }
    const avant = fs.existsSync(FICHIERS.avant) ? lireJson(FICHIERS.avant) : {};
    avant._lisezmoi = 'Liste de travail hors restauration capturée à l\'étape O (spec lot 2b §2.5) : formes par défaut trouvées dans les sorties du serveur pour un compte de chaque domaine, hors exceptions typées, regroupées par famille puis par texte distinct. Incomplète pour les clés *_abr (absentes du lexique avant S1) : relancer le scan après S1. Régénérer : node scripts/check-invariant-vocab.js --domaine <X> --liste-avant.';
    avant.domaines = avant.domaines || {};
    avant.domaines[res.domaine] = { ...res, exceptionsSansEmploi: sansEmploi.length };
    avant.domaines = Object.fromEntries(Object.entries(avant.domaines).sort(([a], [b]) => a.localeCompare(b)));
    ecrireJson(FICHIERS.avant, avant);
    console.log(`[check-vocab] liste de travail écrite : ${path.relative(RACINE, FICHIERS.avant)} (section ${res.domaine})`);
    return 0;
  }
  const total = res.formes.occurrences + res.horsLexique.occurrences + libellesKo.length;
  const ok = !total && !problemes.length && !sansEmploi.length;
  console.log(`[check-vocab] ${ok ? 'AUCUNE forme par défaut hors exceptions' : `ÉCHEC — ${res.formes.occurrences} forme(s), ${res.horsLexique.occurrences} mot(s) hors lexique, ${libellesKo.length} libellé(s) serveur, ${sansEmploi.length} exception(s) sans emploi`}`);
  return ok ? 0 : 1;
}

(async () => {
  const capture = capturer();
  if (capture.meta.domaine !== DOMAINE) {
    console.error(`[check-vocab] la capture est du domaine ${capture.meta.domaine}, pas ${DOMAINE}`);
    process.exit(2);
  }
  const code = DOMAINE === 'restauration' ? verifierRestauration(capture) : await verifierHorsRestauration(capture);
  process.exit(code);
})().catch((e) => { console.error('[check-vocab] ERREUR :', e.stack || e.message); process.exit(2); });
