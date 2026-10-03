/* Oracle du vocabulaire — CONTRÔLE (lot 2b, docs/lot-2b-spec.md §2.1, §2.4 à §2.6).
 *
 *   node scripts/check-invariant-vocab.js [--domaine restauration]      (défaut)
 *     Refait la capture du domaine restauration (scripts/capture-vocab-baseline.js, UN processus) et la
 *     compare à la référence scripts/vocab-baseline/restauration.json :
 *       - non-vacuité : chaque clé de capture a un compte > 0, égal à celui de la référence ;
 *       - même mois civil que la référence (sinon : recapturer la référence, code 2) ;
 *       - tout écart doit figurer dans scripts/vocab-baseline/ecarts-restauration-attendus.json
 *         ({ cle, chemin, avant, apres, raison: '§11.1.n' | '§11.2.n' }) ; une entrée sans emploi = échec ;
 *       - ordre des clés (I9) : deux objets comparés gardent la même suite de clés COMMUNES ; une
 *         permutation est un écart de type « ordre-cles » (avant / apres = les deux suites), admis seulement
 *         par une entrée qui porte type: 'ordre-cles' ;
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
 *     trouvée ou texte entier), type, justification, domaines?, extrait? }), puis recherche des mots de la
 *     restauration hors lexique. Une exception `extrait: true` retire son `texte` (un passage exact) du
 *     texte lu avant la recherche : elle ne vise que ce passage, pas toute forme du texte (un prompt est UN
 *     texte). Glossaire « ## Vocabulaire du compte » du prompt (spec §7.3) : sa colonne de gauche EST la
 *     forme par défaut, par définition ; il est retiré du texte, et seule sa colonne de DROITE (mots du
 *     compte) est cherchée, sous le chemin « …/glossaire/droite ». Code 1 s'il reste une forme hors exceptions (attendu : 0 à la fin du lot).
 *     Textes lus : ceux du §2.5 point 3. Les étiquettes de capture de l'oracle (clés de premier niveau,
 *     ex. « v2.labo.sansFiltre ») ne sont jamais lues comme du texte. Les NOMS DE FICHIERS
 *     (Content-Disposition des exports et des PDF, pièces jointes des emails, rapportIA.nomFichier) ne
 *     sont PAS lus : hors lot 2b (spec §0 « Noms de fichiers téléchargés (I2) », §6.3 « inchangés ») ;
 *     en restauration, ils restent comparés à l'identique. Le type « nom-de-fichier » sert à un nom de
 *     fichier cité DANS un texte lu.
 *     --liste-avant : écrit la section du domaine dans scripts/vocab-baseline/hors-restauration-avant.json
 *     (liste de travail de l'étape O, chiffrée par famille) ; code 0 si l'écriture a réussi.
 *
 *   Lot 2c (docs/lot-2c-spec.md §2.3, §2.4) :
 *     - restauration : `meta.empreintesManuel` (md5 NON masqués du manuel servi, lecteur par lecteur et slug par slug)
 *       doivent être ÉGALES à celles de la référence ; un écart est un échec qu'aucune entrée de
 *       ecarts-restauration-attendus.json ne peut admettre (I1 : manuel et PDF au caractère près) ; de même
 *       `meta.empreintesBase` (md5 NON masqués de { titre, contenu } de chaque entrée active de la base, cherchée par
 *       son titre, dans l'ordre des id ; relecture de l'étape O) ;
 *     - hors restauration (R2.4.1 à R2.4.7) : sont lus aussi les résultats de la recherche (`recherches`,
 *       `recherchesDomaine`, famille assistant : titres et contenus des résultats de la BASE, titres de `disponibles`)
 *       et le manuel servi (famille manuel : titre, partie, contenu de `manuel.sections`, jamais `motsCles` ni le
 *       lecteur admin) ; passages exclus au balisage retirés avant la recherche (champ `extrait` des fichiers de
 *       scripts/manuel/balise/manuel/<slug>.json, de scripts/manuel/variantes/<domaine>/<slug>.json, et de
 *       scripts/manuel/balise/base/*.json pour une entrée retrouvée par son titre rendu avec meta.lexique) ;
 *       MOTS_HORS_LEXIQUE ne s'applique ni à la famille manuel ni aux recherches. Échecs : « [[ », « ]] » ou
 *       « ‹clé› » dans les familles manuel et assistant ; résultat du manuel qui n'est pas le début (suivi de « … »)
 *       de la fiche servie de même citation ; empreintes du lecteur admin ≠ référence restauration (I4) ; clé de
 *       `recherchesDomaine` sans résultat ; mots-clés servis sans la forme du domaine (R2.4.4) ; comptes des
 *       familles manuel et assistant au-dessus de ceux de hors-restauration-avant.json. Rapports (non bloquants) :
 *       terme du domaine dans les résultats, fiche de la référence parmi les 4 résultats (R2.4.6).
 *     - --hors-manuel (porte de S à C, R2.4.7) : les formes trouvées dans la famille manuel et dans les recherches
 *       sont comptées à part et ne font pas échouer ; le contrôle des mots-clés enrichis (famille manuel) est un
 *       rapport ; tout le reste échoue comme sans l'option. Le rapport complet est gardé et comparé à la liste avant.
 *     - baseParTitre (réserve R1 du contrôle de O et S0, R2.4.8) : { titre, contenu } rendus des 32 recherches par titre,
 *       capturés hors restauration seulement ; lus dans la famille assistant avec les exclusions de
 *       scripts/manuel/balise/base/*.json ; ignorés par --hors-manuel comme les recherches (base pas encore balisée) ;
 *       non-vacuité : clé présente, autant d'entrées que meta.entreesBase, aucun contenu vide (sinon échec).
 *
 *   Options communes :
 *     --capture <fichier>    analyser une capture déjà faite (aucun nouveau passage) ;
 *     --reference <fichier>  autre référence (ex. : preuve de déterminisme entre deux captures) ;
 *     --rapport <fichier>    rapport détaillé JSON (défaut : dossier temporaire du système) ;
 *     --port <n>             port de la capture (défaut 3197) ;
 *     --brut <dossier>       transmis à la capture : réponse brute du manuel du client B (hors dépôt, lot 2c §2.6).
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
const HORS_MANUEL = argv.includes('--hors-manuel');

const lireJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const ecrireJson = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 1) + '\n', 'utf8'); };
const court = (v, n = 160) => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s === undefined ? 'undefined' : (s.length > n ? `${s.slice(0, n)}…` : s); };

// ── Capture (un processus par domaine) ───────────────────────────────────────────────────────
function capturer() {
  const fourni = arg('capture');
  if (fourni) return lireJson(path.resolve(fourni));
  const sortie = path.join(os.tmpdir(), `capture-vocab-${DOMAINE}-${process.pid}.json`);
  const t0 = Date.now();
  const brut = arg('brut');
  const r = spawnSync(process.execPath, [path.join(__dirname, 'capture-vocab-baseline.js'), '--domaine', DOMAINE, '--sortie', sortie, '--port', arg('port', '3197'), ...(brut ? ['--brut', path.resolve(brut)] : [])], { stdio: 'inherit', cwd: RACINE });
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
    // Ordre des clés (I9) : la suite des clés COMMUNES doit être la même. Une clé ajoutée ou retirée est
    // un écart de valeur (⟨absent⟩) ; une permutation, un écart de type « ordre-cles », admis seulement par
    // une entrée explicite qui porte ce type.
    const ca = Object.keys(avant).filter((k) => k in apres);
    const cb = Object.keys(apres).filter((k) => k in avant);
    if (!egal(ca, cb)) sortie.ecarts.push({ chemin, avant: ca, apres: cb, type: 'ordre-cles' });
    for (const k of new Set([...Object.keys(avant), ...Object.keys(apres)])) {
      comparer(k in avant ? avant[k] : ABSENT, k in apres ? apres[k] : ABSENT, `${chemin}/${seg(k)}`, sortie);
    }
    return;
  }
  sortie.ecarts.push({ chemin, avant, apres });
}

// Empreintes du manuel (meta.empreintesManuel) : mêmes lecteurs, mêmes slugs dans le même ordre, mêmes md5.
function ecartsEmpreintes(ref, cour, lecteurs = null) {
  const out = [];
  for (const l of lecteurs || [...new Set([...Object.keys(ref), ...Object.keys(cour)])]) {
    const a = ref[l];
    const b = cour[l];
    if (!a || !b) { out.push(`manuel ${l} : lecteur absent ${!a ? 'de la référence' : 'de la capture'} (meta.empreintesManuel)`); continue; }
    if (!egal(Object.keys(a), Object.keys(b))) out.push(`manuel ${l} : fiches reçues différentes ou dans un autre ordre (${Object.keys(a).length} → ${Object.keys(b).length})`);
    for (const s of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (a[s] !== b[s]) out.push(`manuel ${l} › ${s} : empreinte ${a[s] || ABSENT} → ${b[s] || ABSENT}`);
    }
  }
  return out;
}

// Empreintes de la base (meta.empreintesBase) : mêmes titres, dans le même ordre, mêmes md5 ; aucun écart admissible.
function ecartsEmpreintesBase(ref, cour) {
  const out = [];
  if (!egal(Object.keys(ref), Object.keys(cour))) out.push(`base de connaissances : entrées différentes ou dans un autre ordre (${Object.keys(ref).length} → ${Object.keys(cour).length})`);
  for (const t of new Set([...Object.keys(ref), ...Object.keys(cour)])) {
    if (ref[t] !== cour[t]) out.push(`base de connaissances › ${t} : empreinte ${ref[t] || ABSENT} → ${cour[t] || ABSENT}`);
  }
  return out;
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

  // Lot 2c (R2.3.1) : empreintes NON masquées du manuel servi, lecteur par lecteur et slug par slug (ordre compris).
  // Un écart est un échec qu'aucune entrée de ecarts-restauration-attendus.json ne peut admettre.
  if (!ref.meta.empreintesManuel) problemes.push('meta.empreintesManuel absent de la référence : recapturer la référence avec la capture du lot 2c');
  else if (!courante.meta.empreintesManuel) problemes.push('meta.empreintesManuel absent de la capture');
  else problemes.push(...ecartsEmpreintes(ref.meta.empreintesManuel, courante.meta.empreintesManuel));
  // Relecture de l'étape O : chaque entrée active de la base, par son titre (empreintes NON masquées de { titre,
  // contenu }) ; un écart est un échec qu'aucune entrée de ecarts-restauration-attendus.json ne peut admettre.
  if (!ref.meta.empreintesBase) problemes.push('meta.empreintesBase absent de la référence : recapturer la référence avec la capture du lot 2c');
  else if (!courante.meta.empreintesBase) problemes.push('meta.empreintesBase absent de la capture');
  else problemes.push(...ecartsEmpreintesBase(ref.meta.empreintesBase, courante.meta.empreintesBase));

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
    else if ('type' in e && e.type !== 'ordre-cles') problemes.push(`ecarts-restauration-attendus.json[${i}] : type « ${e.type} » (seul type admis : ordre-cles)`);
  });
  const employees = new Set();
  const nonListes = [];
  for (const e of brut.ecarts) {
    const i = attendus.findIndex((a) => a.cle === e.cle && a.chemin === e.chemin && (a.type || null) === (e.type || null)
      && egal(a.avant, e.avant) && egal(a.apres, e.apres));
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
  for (const e of nonListes.slice(0, 40)) console.log(`  ✗ écart non listé ${e.cle}${e.chemin}${e.type ? ` (${e.type})` : ''}\n      avant : ${court(e.avant)}\n      après : ${court(e.apres)}`);
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
  recherchesDomaine: 'assistant', contexte: 'assistant', guide: 'assistant', accueilMessenger: 'assistant', rapportIA: 'assistant',
  persistes: 'persistes', manuel: 'manuel', baseParTitre: 'assistant',
};
// Textes du lot 2c (R2.4.3, R2.4.7) : le manuel servi et les résultats de la recherche (manuel et base).
// baseParTitre (R2.4.8) : contenu des 32 entrées de la base, hors restauration ; texte de la base, comme les recherches.
const CLES_2C = ['manuel', 'recherches', 'recherchesDomaine', 'baseParTitre'];
const estManuel = (t) => typeof t === 'string' && t.startsWith('Manuel — ');
const citation = (s) => `Manuel — ${s.partie} › ${s.titre}`;

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

// Glossaire « Vocabulaire du compte » du prompt (lot 2b §7.3, aiService.glossaireVocabulaire) : bloc retiré du
// texte lu ; on ne cherche que sa colonne de DROITE (à droite de « → », ou entre « = » et la parenthèse finale
// d'une ligne d'unités), la gauche étant la forme de LabFlow par définition, et les noms d'unités des données.
const TITRE_GLOSSAIRE = '\n\n## Vocabulaire du compte\n';
function separerGlossaire(texte) {
  const debut = texte.indexOf(TITRE_GLOSSAIRE);
  if (debut < 0) return { reste: texte, droites: [] };
  const suite = texte.indexOf('\n\n## ', debut + TITRE_GLOSSAIRE.length);
  const fin = suite < 0 ? texte.length : suite;
  const bloc = texte.slice(debut + TITRE_GLOSSAIRE.length, fin);
  const droites = [];
  for (const ligne of bloc.split('\n')) {
    if (/^Ce compte n'emploie pas|^Unités du compte|^Règles :|^\d+\. /.test(ligne)) continue;
    if (ligne.includes(' → ')) {
      for (const morceau of ligne.split(' ; ')) {
        const droite = morceau.split(' → ').slice(1).join(' → ').replace(/ — dans les données : .*$/, '');
        if (droite) droites.push(droite);
      }
    } else if (ligne.includes(' = ')) {
      const droite = ligne.slice(ligne.indexOf(' = ') + 3).replace(/ \([^()]*\)$/, '');
      if (droite) droites.push(droite);
    }
  }
  return { reste: texte.slice(0, debut) + texte.slice(fin), droites };
}

const CODE = [/^[a-z0-9_\-./:#?=&]+$/, /^[A-Z0-9_]{2,}$/];
const estCode = (s) => CODE.some((re) => re.test(s));

// Textes d'une capture, par sortie (§2.5, point 3) : [{ cle, chemin, texte }].
function textes(captures) {
  const out = [];
  const pousser = (cle, chemin, t, plus = null) => { if (typeof t === 'string' && t.trim()) out.push({ cle, chemin, texte: t, ...(plus || {}) }); };
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
  // Recherches (lot 2c, R2.4.1, R2.4.2) : résultats de la BASE lus (titre, contenu ; entrée retrouvée par son titre
  // pour ses exclusions), titres de `disponibles` lus ; résultats du MANUEL non relus : contrôlés à part (citation
  // d'une fiche servie, contenu = début de la fiche), voir controlerResultatsManuel().
  const resultat = (cle, r, chemin) => {
    if (!r || typeof r !== 'object') return;
    (Array.isArray(r.results) ? r.results : []).forEach((x, i) => {
      if (!x || estManuel(x.titre)) return;
      pousser(cle, `${chemin}/results/${i}/titre`, x.titre, { entreeBase: x.titre });
      pousser(cle, `${chemin}/results/${i}/contenu`, x.contenu, { entreeBase: x.titre });
    });
    (Array.isArray(r.disponibles) ? r.disponibles : []).forEach((t, i) => pousser(cle, `${chemin}/disponibles/${i}`, t, { entreeBase: t }));
    if (typeof r.error === 'string') pousser(cle, `${chemin}/error`, r.error);
  };
  for (const [q, r] of Object.entries(captures.recherches || {})) resultat('recherches', r, `/${seg(q)}`);
  for (const [k, v] of Object.entries(captures.recherchesDomaine || {})) {
    if (!v || typeof v !== 'object') continue;
    if (v.resultat) { resultat('recherchesDomaine', v.resultat, `/${seg(k)}/resultat`); continue; }
    // Question du guide ou d'un composant : les titres de la base sont aussi dans `base` (lus une seule fois).
    (Array.isArray(v.base) ? v.base : []).forEach((x, i) => {
      pousser('recherchesDomaine', `/${seg(k)}/base/${i}/titre`, x && x.titre, { entreeBase: x && x.titre });
      pousser('recherchesDomaine', `/${seg(k)}/base/${i}/contenu`, x && x.contenu, { entreeBase: x && x.titre });
    });
  }
  // Entrées de la base par titre (R2.4.8) : titre et contenu rendus, entrée retrouvée par son titre pour ses exclusions.
  for (const [t, v] of Object.entries(captures.baseParTitre || {})) {
    pousser('baseParTitre', `/${seg(t)}/titre`, v && v.titre, { entreeBase: v && v.titre });
    pousser('baseParTitre', `/${seg(t)}/contenu`, v && v.contenu, { entreeBase: v && v.titre });
  }
  // Manuel servi (lot 2c, R2.4.1) : titre, partie, contenu ; jamais motsCles (non affiché, contrôle R2.4.4).
  for (const [slug, s] of Object.entries((captures.manuel && captures.manuel.sections) || {})) {
    for (const champ of ['titre', 'partie', 'contenu']) pousser('manuel', `/sections/${seg(slug)}/${champ}`, s && s[champ], { slug });
  }
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

// Lot 2c (R2.4.2) : passages exclus au balisage, retirés du texte avant la recherche. Fiche : par slug (fichier
// balisé et, s'il existe, celui de la variante du domaine du passage). Entrée de la base : par son titre balisé rendu
// avec le lexique du passage. Une exclusion « sans emploi » ne compte jamais ici (seulement dans controler.mjs).
function chargerExclusionsBalise(vX, domaine) {
  const { rendre } = require(path.join(RACINE, 'src', 'utils', 'vocab'));
  const dossier = path.join(RACINE, 'scripts', 'manuel');
  const fiches = new Map();
  const base = new Map();
  const problemes = [];
  const fichiers = { fiches: 0, variantes: 0, base: 0 };
  const extraits = (o) => (o && Array.isArray(o.exclusions) ? o.exclusions.map((x) => x && x.extrait).filter((x) => typeof x === 'string' && x) : []);
  const ajouter = (m, k, l) => { if (!m.has(k)) m.set(k, []); m.get(k).push(...l); };
  const parcourir = (d, type, fn) => {
    if (!fs.existsSync(d)) return;
    for (const n of fs.readdirSync(d).filter((x) => x.endsWith('.json')).sort()) {
      let o;
      try { o = lireJson(path.join(d, n)); } catch (e) { problemes.push(`${path.relative(RACINE, path.join(d, n))} : JSON illisible (${e.message})`); continue; }
      fichiers[type] += 1;
      fn(n.replace(/\.json$/, ''), o);
    }
  };
  parcourir(path.join(dossier, 'balise', 'manuel'), 'fiches', (n, o) => ajouter(fiches, o.slug || n, extraits(o)));
  parcourir(path.join(dossier, 'variantes', domaine), 'variantes', (n, o) => ajouter(fiches, o.slug || n, extraits(o)));
  parcourir(path.join(dossier, 'balise', 'base'), 'base', (n, o) => {
    if (typeof o.titre === 'string') ajouter(base, rendre(vX, o.titre), extraits(o));
    else problemes.push(`scripts/manuel/balise/base/${n}.json : titre absent`);
  });
  return { fiches, base, problemes, fichiers };
}

// Lot 2c (R2.4.2) : un résultat de la recherche qui vient du manuel n'est pas relu ; sa citation doit être celle
// d'une fiche servie (manuel.sections du même passage) et son contenu le début de cette fiche, suivi de « … » s'il
// est coupé (troncature à 6 000 de aiToolHandlers). Une question du guide ne garde que les titres : citation seule.
function controlerResultatsManuel(captures) {
  const sections = (captures.manuel && captures.manuel.sections) || {};
  const parCitation = new Map(Object.entries(sections).map(([slug, s]) => [citation(s), slug]));
  const problemes = [];
  let controles = 0;
  const verifier = (chemin, titre, contenu) => {
    controles += 1;
    const slug = parCitation.get(titre);
    if (!slug) { problemes.push(`${chemin} : « ${court(titre, 100)} » n'est la citation d'aucune fiche servie (manuel.sections)`); return; }
    if (contenu === undefined) return;
    const servi = sections[slug].contenu;
    const ok = contenu === servi
      || (typeof contenu === 'string' && contenu.endsWith('…') && contenu.length - 1 < servi.length && servi.startsWith(contenu.slice(0, -1)));
    if (!ok) problemes.push(`${chemin} : le contenu n'est pas le début de la fiche servie « ${slug} »`);
  };
  const resultat = (base, r) => (r && Array.isArray(r.results) ? r.results : []).forEach((x, i) => {
    if (x && estManuel(x.titre)) verifier(`${base}/results/${i}`, x.titre, x.contenu === undefined ? null : x.contenu);
  });
  for (const [q, r] of Object.entries(captures.recherches || {})) resultat(`recherches/${seg(q)}`, r);
  for (const [k, v] of Object.entries(captures.recherchesDomaine || {})) {
    if (v && v.resultat) resultat(`recherchesDomaine/${seg(k)}/resultat`, v.resultat);
    else ((v && v.titres) || []).forEach((t, i) => { if (estManuel(t)) verifier(`recherchesDomaine/${seg(k)}/titres/${i}`, t); });
  }
  return { controles, problemes, parCitation };
}

// Lot 2c (R2.4.4) : une fiche servie dont les mots-clés d'origine (référence restauration) portent, comme entrée, une
// forme par défaut d'une clé que le domaine change doit porter la forme nom (singulier) du domaine dans ses mots-clés.
function controlerMotsCles(capture, ref, vX) {
  const { LEXIQUE_DEFAUT } = require(path.join(RACINE, 'src', 'config', 'lexiqueDefaut'));
  const { vocabDefaut } = require(path.join(RACINE, 'src', 'utils', 'vocab'));
  const entrees = (s) => String(s || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  const formes = (v, k) => [v.nom(k), v.nom(k, true), v.court(k), v.court(k, true)].map((x) => String(x).toLowerCase());
  const cles = Object.keys(LEXIQUE_DEFAUT).filter((k) => !/_abr$/.test(k));
  const origine = (ref && ref.captures && ref.captures.manuel && ref.captures.manuel.sections) || null;
  if (!origine) return { controles: 0, manques: [], note: 'référence sans manuel.sections : contrôle impossible (recapturer la référence)' };
  let controles = 0;
  const manques = [];
  for (const [slug, s] of Object.entries((capture.captures.manuel && capture.captures.manuel.sections) || {})) {
    if (!origine[slug]) continue;
    const avant = entrees(origine[slug].motsCles);
    const servis = entrees(s.motsCles);
    for (const k of cles) {
      const d = formes(vocabDefaut, k);
      if (egal(d, formes(vX, k)) || !d.some((f) => avant.includes(f))) continue;
      controles += 1;
      if (!servis.includes(String(vX.nom(k)).toLowerCase())) manques.push({ slug, cle: k, attendu: vX.nom(k) });
    }
  }
  return { controles, manques };
}

// Lot 2c (R2.4.6) : garde-fou (chaque clé de recherchesDomaine a au moins un résultat) et rapports (terme du domaine
// parmi les 4 résultats ; première fiche du manuel de la référence restauration parmi les 4 résultats d'une recherche
// fixe ; fiche « activites » parmi les 4 résultats d'une question de composant).
function coherenceRecherches(capture, ref, vX, parCitation) {
  const { LEXIQUE_DEFAUT } = require(path.join(RACINE, 'src', 'config', 'lexiqueDefaut'));
  const sections = (capture.captures.manuel && capture.captures.manuel.sections) || {};
  const formesDomaine = [...new Set(Object.keys(LEXIQUE_DEFAUT).flatMap((k) => [vX.Nom(k), vX.Pl(k), vX.Court(k), vX.Court(k, 2)].map(String)))].filter(Boolean);
  const refSections = (ref && ref.captures && ref.captures.manuel && ref.captures.manuel.sections) || {};
  const refCitations = new Map(Object.entries(refSections).map(([slug, s]) => [citation(s), slug]));
  const refRecherches = (ref && ref.captures && ref.captures.recherchesDomaine) || {};
  const sansResultat = [];
  const termes = [];
  const fiches = [];
  for (const [k, v] of Object.entries(capture.captures.recherchesDomaine || {})) {
    if (!v || typeof v !== 'object') { sansResultat.push(k); continue; }
    const res = v.resultat ? (Array.isArray(v.resultat.results) ? v.resultat.results : []) : null;
    const titres = res ? res.map((x) => x.titre) : (Array.isArray(v.titres) ? v.titres : []);
    if (!titres.length) { sansResultat.push(k); continue; }
    // Textes des résultats : titre, contenu de la base, fiche servie pour un résultat du manuel.
    const contenus = res ? res.map((x) => x.contenu) : (Array.isArray(v.base) ? v.base.map((x) => x.contenu) : []);
    const textesRes = [...titres, ...contenus, ...titres.filter(estManuel).map((t) => (sections[parCitation.get(t)] || {}).contenu)].filter((x) => typeof x === 'string');
    let cles;
    if (k.startsWith('fixe|')) cles = [...k.matchAll(/\[\[[A-Za-z]+:([a-z0-9_]+)/g)].map((m) => m[1]);
    const question = v.query || k.slice(k.indexOf('|') + 1);
    const cherches = cles
      ? [...new Set(cles.flatMap((c) => [vX.nom(c), vX.nom(c, true), vX.court(c), vX.court(c, true)].map(String)))]
      : formesDans(question, formesDomaine);
    const trouves = cherches.filter((f) => textesRes.some((t) => formesDans(t, [f]).length));
    termes.push({ cle: k, termes: cherches, trouves, ok: !cherches.length ? null : trouves.length > 0 });
    const slugs = titres.filter(estManuel).map((t) => parCitation.get(t) || null);
    if (k.startsWith('fixe|')) {
      const r0 = refRecherches[k] && refRecherches[k].resultat && Array.isArray(refRecherches[k].resultat.results) ? refRecherches[k].resultat.results : null;
      const premier = r0 ? r0.map((x) => x.titre).find(estManuel) : undefined;
      const attendu = premier ? refCitations.get(premier) || null : null;
      fiches.push({ cle: k, attendu, obtenus: slugs, ok: attendu ? slugs.includes(attendu) : null, note: r0 ? (premier ? null : 'aucune fiche du manuel dans la référence') : 'référence sans recherchesDomaine' });
    } else if (k.startsWith('composant|')) {
      fiches.push({ cle: k, attendu: 'activites', obtenus: slugs, ok: slugs.includes('activites') });
    }
  }
  return { sansResultat, termes, fiches };
}

async function verifierHorsRestauration(capture) {
  const source = await chargerFormesDans();
  const { F, retirees, vX, clesAbsentes } = formesCherchees(capture.meta.lexique);
  const listeF = [...F.keys()];
  const refFichier = path.resolve(arg('reference', FICHIERS.reference));
  const ref = fs.existsSync(refFichier) ? lireJson(refFichier) : null;
  const excl = chargerExclusionsBalise(vX, capture.meta.domaine);

  // Données de l'oracle → « ⟦d⟧ », du plus long au plus court (jamais relues en base).
  const donnees = [...new Set([...(capture.meta.donnees || []), ...(capture.meta.composantsOracle || [])])].filter(Boolean).sort((a, b) => b.length - a.length);
  const masquerDonnees = (t) => donnees.reduce((s, d) => s.split(d).join('⟦d⟧'), t);

  const exceptions = fs.existsSync(FICHIERS.exceptions) ? lireJson(FICHIERS.exceptions) : [];
  const problemes = [...excl.problemes];
  exceptions.forEach((e, i) => {
    if (!e || !e.cle || !e.chemin || !e.texte || !e.justification) problemes.push(`exceptions-hors-restauration.json[${i}] : cle, chemin, texte et justification obligatoires`);
    if (!TYPES_EXCEPTION.includes(e && e.type)) problemes.push(`exceptions-hors-restauration.json[${i}] : type « ${e && e.type} » hors liste (${TYPES_EXCEPTION.join(', ')})`);
    try { if (e && e.chemin) new RegExp(e.chemin); } catch (err) { problemes.push(`exceptions-hors-restauration.json[${i}] : chemin invalide (${err.message})`); }
  });
  // `domaines` (facultatif) : domaines où l'entrée s'applique ; une entrée n'est « sans emploi » que là.
  const applicable = (e) => !Array.isArray(e.domaines) || e.domaines.includes(capture.meta.domaine);
  const employees = new Set();
  const exception = (f) => {
    const i = exceptions.findIndex((e) => applicable(e) && !e.extrait && e.cle === f.cle && new RegExp(e.chemin).test(f.chemin) && (e.texte === f.forme || e.texte === f.texte));
    if (i >= 0) employees.add(i);
    return i;
  };

  const trouvees = [];
  const horsLexique = [];
  const balisesBrutes = [];
  let nTextes = 0;
  // Glossaire du prompt : retiré du texte, sa colonne de droite lue à part (voir separerGlossaire).
  const lus = [];
  for (const t of textes(capture.captures)) {
    if (t.cle !== 'prompt' && t.cle !== 'promptReel') { lus.push(t); continue; }
    const { reste, droites } = separerGlossaire(t.texte);
    lus.push({ ...t, texte: reste });
    droites.forEach((d) => lus.push({ cle: t.cle, chemin: `${t.chemin}/glossaire/droite`, texte: d }));
  }
  for (const t of lus) {
    nTextes += 1;
    // Lot 2c (R2.4.1, I11) : aucune balise brute ni marque de clé inconnue dans le manuel et l'assistant.
    if (FAMILLE[t.cle] === 'manuel' || FAMILLE[t.cle] === 'assistant') {
      const m = t.texte.match(/\[\[|\]\]|‹[a-z0-9_]+›/);
      if (m) balisesBrutes.push({ cle: t.cle, chemin: t.chemin, marque: m[0], texte: extrait(t.texte, m[0]) });
    }
    let texte = masquerDonnees(t.texte);
    // Exceptions « extrait » : passage exact retiré avant la recherche (il ne couvre que ce passage).
    exceptions.forEach((e, i) => {
      if (!e || !e.extrait || !applicable(e) || e.cle !== t.cle || !new RegExp(e.chemin).test(t.chemin) || !texte.includes(e.texte)) return;
      texte = texte.split(e.texte).join('⟦x⟧');
      employees.add(i);
    });
    // Lot 2c (R2.4.2) : passages exclus au balisage (fiche par slug, entrée de la base par titre rendu).
    for (const x of (t.slug ? excl.fiches.get(t.slug) : t.entreeBase ? excl.base.get(t.entreeBase) : null) || []) {
      if (texte.includes(x)) texte = texte.split(x).join('⟦x⟧');
    }
    for (const forme of formesDans(texte, listeF)) {
      const f = { famille: FAMILLE[t.cle], cle: t.cle, chemin: t.chemin, forme, cles: F.get(forme), texte };
      if (exception(f) < 0) trouvees.push(f);
    }
    // R2.4.3 : les mots du métier restent dans le texte commun par construction (I10) ; liste de travail des
    // variantes = rapport de controler.mjs --tout. Pas de recherche ici pour le manuel et les recherches.
    if (CLES_2C.includes(t.cle)) continue;
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

  // ── Lot 2c : contrôles du manuel et des recherches ─────────────────────────────────────────
  for (const b of balisesBrutes) problemes.push(`balise brute « ${b.marque} » dans ${b.cle}${b.chemin} : ${b.texte}`);
  // I4 : le lecteur admin lit le manuel en mots de LabFlow, identique à la référence restauration.
  const empAdmin = capture.meta.empreintesManuel && capture.meta.empreintesManuel.admin;
  const empAdminRef = ref && ref.meta && ref.meta.empreintesManuel && ref.meta.empreintesManuel.admin;
  if (!empAdmin) problemes.push('meta.empreintesManuel.admin absent de la capture (lecteur admin du manuel)');
  else if (!empAdminRef) problemes.push(`meta.empreintesManuel.admin absent de la référence ${path.relative(RACINE, refFichier)} (recapturer la référence)`);
  else problemes.push(...ecartsEmpreintes({ admin: empAdminRef }, { admin: empAdmin }, ['admin']).map((p) => `I4 : ${p}`));
  if (!capture.captures.manuel || !capture.captures.manuel.sections || !Object.keys(capture.captures.manuel.sections).length) problemes.push('manuel.sections vide (clé manuel)');
  // R2.4.8 : non-vacuité de baseParTitre (une entrée par entrée active de la base, chacune avec son contenu).
  const baseParTitre = capture.captures.baseParTitre;
  const nBase = baseParTitre && typeof baseParTitre === 'object' ? Object.keys(baseParTitre).length : 0;
  if (!nBase) problemes.push('baseParTitre absent ou vide (contenu des entrées de la base, R2.4.8) : capture d\'avant la réserve R1 ?');
  else {
    if (nBase !== capture.meta.entreesBase) problemes.push(`baseParTitre : ${nBase} entrée(s), ${capture.meta.entreesBase} entrée(s) active(s) dans la base (meta.entreesBase)`);
    for (const [t, v] of Object.entries(baseParTitre)) {
      if (!v || typeof v.contenu !== 'string' || !v.contenu.trim()) problemes.push(`baseParTitre « ${t} » : contenu vide ou absent`);
    }
  }
  const resManuel = controlerResultatsManuel(capture.captures);
  problemes.push(...resManuel.problemes);
  const coherence = coherenceRecherches(capture, ref, vX, resManuel.parCitation);
  for (const k of coherence.sansResultat) problemes.push(`recherchesDomaine « ${k} » : aucun résultat (R2.4.6)`);
  const motsCles = controlerMotsCles(capture, ref, vX);
  // R2.4.7 : --hors-manuel ignore les formes du manuel et des recherches ; les comptes complets des familles manuel et
  // assistant ne montent jamais au-dessus de la liste avant (une fois celle-ci écrite par le scan du lot 2c).
  const texte2c = (f) => CLES_2C.includes(f.cle);
  const retenues = HORS_MANUEL ? trouvees.filter((f) => !texte2c(f)) : trouvees;
  const ignorees = HORS_MANUEL ? trouvees.filter(texte2c) : [];
  const compte = (fam) => trouvees.filter((f) => f.famille === fam).length;
  const listeAvant = fs.existsSync(FICHIERS.avant) ? lireJson(FICHIERS.avant) : {};
  const avantDom = listeAvant.domaines && listeAvant.domaines[capture.meta.domaine];
  const comparaisonAvant = [];
  if (!argv.includes('--liste-avant')) {
    if (avantDom && avantDom.scan2c) {
      for (const fam of ['manuel', 'assistant']) {
        const n0 = (avantDom.formes && avantDom.formes.parFamille && avantDom.formes.parFamille[fam] && avantDom.formes.parFamille[fam].occurrences) || 0;
        comparaisonAvant.push({ famille: fam, avant: n0, maintenant: compte(fam), monte: compte(fam) > n0 });
      }
      for (const c of comparaisonAvant.filter((x) => x.monte)) problemes.push(`famille ${c.famille} : ${c.maintenant} forme(s), au-dessus de la liste avant (${c.avant}) (R2.4.7)`);
    } else comparaisonAvant.push({ note: 'liste avant écrite avant le scan du lot 2c : comparaison sans objet' });
  }

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
    // Lot 2c : liste écrite par le scan étendu (familles manuel et assistant avec les recherches, §2.4).
    scan2c: true,
    horsManuel: { formes: synthese(retenues).occurrences, ignorees: trouvees.length - trouvees.filter((f) => !texte2c(f)).length },
    exclusionsBalise: excl.fichiers,
    resultatsManuelControles: resManuel.controles,
    baseParTitre: nBase,
    motsCles: { controles: motsCles.controles, manques: motsCles.manques.length, ...(motsCles.note ? { note: motsCles.note } : {}) },
    coherenceRecherches: {
      cles: coherence.termes.length,
      termeAbsent: coherence.termes.filter((x) => x.ok === false).map((x) => ({ cle: x.cle, termes: x.termes })),
      sansTerme: coherence.termes.filter((x) => x.ok === null).length,
      fiches: coherence.fiches,
    },
  };

  ecrireJson(RAPPORT, { ...res, problemes, exceptionsSansEmploi: sansEmploi, motsClesManquants: motsCles.manques, coherenceTermes: coherence.termes, comparaisonAvant, horsManuelRetenues: HORS_MANUEL ? synthese(retenues) : null });
  console.log(`[check-vocab] ${res.domaine} (${res.domaineNom}) — ${listeF.length} forme(s) cherchée(s) (${retirees.size} retirée(s) car rendue(s) aussi par le domaine), ${nTextes} texte(s) lu(s), recherche : ${source}`);
  if (clesAbsentes.length) console.log(`[check-vocab] liste INCOMPLÈTE pour les clés absentes du moteur courant : ${clesAbsentes.join(', ')} (à relancer après S1)`);
  for (const [fam, s] of Object.entries(res.formes.parFamille)) console.log(`  ${fam.padEnd(10)} ${String(s.occurrences).padStart(5)} occurrence(s), ${String(s.textes).padStart(4)} texte(s) distinct(s)`);
  console.log(`  hors lexique : ${res.horsLexique.occurrences} occurrence(s) (${Object.entries(res.horsLexique.parFamille).map(([f, s]) => `${f} ${s.occurrences}`).join(', ') || 'aucune'})`);
  console.log(`  lot 2c : ${resManuel.controles} résultat(s) du manuel contrôlé(s) (citation, début de fiche) ; mots-clés enrichis : ${motsCles.controles} contrôle(s), ${motsCles.manques.length} manque(s)${motsCles.note ? ` (${motsCles.note})` : ''} ; recherches du domaine : ${coherence.termes.length} clé(s), ${coherence.sansResultat.length} sans résultat, terme du domaine absent des résultats : ${res.coherenceRecherches.termeAbsent.length} ; fiche attendue absente des 4 résultats : ${coherence.fiches.filter((x) => x.ok === false).length} sur ${coherence.fiches.length} ; exclusions lues : ${excl.fichiers.fiches} fiche(s), ${excl.fichiers.variantes} variante(s), ${excl.fichiers.base} entrée(s) ; base par titre : ${nBase} entrée(s) lue(s)`);
  for (const c of comparaisonAvant) console.log(c.note ? `  liste avant : ${c.note}` : `  liste avant : ${c.famille} ${c.maintenant} forme(s) (avant : ${c.avant})${c.monte ? ' — MONTE' : ''}`);
  if (HORS_MANUEL) {
    console.log(`  --hors-manuel : ${retenues.length} forme(s) hors manuel et recherches (${ignorees.length} ignorée(s) dans le manuel, les recherches et la base par titre)`);
    for (const f of retenues.slice(0, 30)) console.log(`    ✗ ${f.cle}${f.chemin} « ${f.forme} » : ${extrait(f.texte, f.forme)}`);
  }
  for (const l of libellesKo) console.log(`  ✗ libellé écrit par le serveur ${l.chemin} : ${JSON.stringify(l.obtenu)} (attendu ${JSON.stringify(l.attendu)})`);
  for (const p of problemes) console.log(`  ✗ ${p}`);
  for (const e of sansEmploi) console.log(`  ✗ exception sans emploi : ${e.cle} ${e.chemin} « ${e.texte} » (${e.type})`);
  console.log(`[check-vocab] rapport : ${RAPPORT}`);

  if (argv.includes('--liste-avant')) {
    if (problemes.length) { console.error('[check-vocab] liste non écrite (problèmes ci-dessus)'); return 1; }
    const avant = fs.existsSync(FICHIERS.avant) ? lireJson(FICHIERS.avant) : {};
    if (!('_lisezmoi' in avant)) avant._lisezmoi = ''; // première clé du fichier
    avant.domaines = avant.domaines || {};
    avant.domaines[res.domaine] = { ...res, exceptionsSansEmploi: sansEmploi.length };
    avant.domaines = Object.fromEntries(Object.entries(avant.domaines).sort(([a], [b]) => a.localeCompare(b)));
    // « Incomplète » seulement si un domaine a encore des clés *_abr absentes du moteur de son passage.
    const incompletes = Object.entries(avant.domaines).filter(([, d]) => (d.incompletePour || []).length).map(([nom]) => nom);
    avant._lisezmoi = 'Liste de travail hors restauration capturée à l\'étape O (spec lot 2b §2.5), étendue à l\'étape O du lot 2c (spec lot 2c §2.4 : famille manuel = manuel servi, famille assistant avec les résultats de la recherche ; « scan2c » vrai) : formes par défaut trouvées dans les sorties du serveur pour un compte de chaque domaine, hors exceptions typées, regroupées par famille puis par texte distinct. Les comptes des familles manuel et assistant ne doivent jamais monter (R2.4.7). '
      + (incompletes.length
        ? `Incomplète pour les clés *_abr (absentes du moteur du passage) dans : ${incompletes.join(', ')} ; relancer le scan de ces domaines. `
        : 'Complète depuis S1 pour tous les domaines (clés *_abr comprises). ')
      + 'Régénérer : node scripts/check-invariant-vocab.js --domaine <X> --liste-avant.';

    ecrireJson(FICHIERS.avant, avant);
    console.log(`[check-vocab] liste de travail écrite : ${path.relative(RACINE, FICHIERS.avant)} (section ${res.domaine})`);
    return 0;
  }
  // --hors-manuel : formes hors manuel et recherches seulement ; mots-clés enrichis en rapport (famille manuel).
  const manquesBloquants = HORS_MANUEL ? 0 : motsCles.manques.length;
  for (const m of (HORS_MANUEL ? [] : motsCles.manques).slice(0, 20)) console.log(`  ✗ mots-clés de « ${m.slug} » sans « ${m.attendu} » (clé ${m.cle}, R2.4.4)`);
  const total = retenues.length + res.horsLexique.occurrences + libellesKo.length + manquesBloquants;
  const ok = !total && !problemes.length && !sansEmploi.length;
  console.log(`[check-vocab] ${ok ? `AUCUNE forme par défaut hors exceptions${HORS_MANUEL ? ' (--hors-manuel : manuel, recherches et base par titre ignorés)' : ''}` : `ÉCHEC — ${retenues.length} forme(s)${HORS_MANUEL ? ' hors manuel' : ''}, ${res.horsLexique.occurrences} mot(s) hors lexique, ${libellesKo.length} libellé(s) serveur, ${manquesBloquants} mot(s)-clé(s) manquant(s), ${problemes.length} problème(s), ${sansEmploi.length} exception(s) sans emploi`}`);
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
