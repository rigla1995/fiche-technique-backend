// Lot 2b, spec §5.6 — plomberie `voc` des emails.
// Les 5 fonctions d'email à terme reçoivent le vocabulaire du DESTINATAIRE en clé `voc` de leur
// objet d'arguments. Deux preuves :
//   1. contrôle statique, par lecture des sources : chaque appel de ces 5 fonctions dans src/
//      passe un objet littéral qui porte une clé `voc` à son premier niveau (`voc` ou `voc: …`) ;
//      un appel à objet tout fait s'écrit `f({ ...inv, voc })` ;
//   2. repli : sans `voc`, la fonction journalise l'oubli et envoie quand même l'email, rendu
//      avec le vocabulaire par défaut (même HTML, même sujet qu'avec vocabDefaut).
// Aucun envoi réel : le module `resend` est remplacé par un faux AVANT le chargement.
//   node --test test/emailVoc.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RACINE = path.join(__dirname, '..');
const SRC = path.join(RACINE, 'src');
const FONCTIONS = ['sendInviteEmail', 'sendDocusealSigningEmail', 'sendAvenantEmail', 'sendRapportWithAttachment', 'sendMessengerInviteEmail'];

// ── 1. Contrôle statique ─────────────────────────────────────────────────────────────────────

const fichiersJs = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) return fichiersJs(p);
  return e.name.endsWith('.js') ? [p] : [];
});

// Lecteur minimal : chaînes, gabarits (trous `${…}` imbriqués), commentaires, blocs ( { [.
const finChaine = (src, i) => {
  for (let j = i + 1; j < src.length; j++) {
    if (src[j] === '\\') j++;
    else if (src[j] === src[i]) return j;
  }
  throw new Error('chaîne non fermée');
};
const finGabarit = (src, i) => {
  for (let j = i + 1; j < src.length; j++) {
    if (src[j] === '\\') j++;
    else if (src[j] === '`') return j;
    else if (src[j] === '$' && src[j + 1] === '{') j = fermant(src, j + 1);
  }
  throw new Error('gabarit non fermé');
};
// Index du fermant de l'ouvrant ( { [ placé en `i`.
const fermant = (src, i) => {
  let prof = 0;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '/' && src[j + 1] === '/') { const n = src.indexOf('\n', j); if (n < 0) break; j = n; continue; }
    if (c === '/' && src[j + 1] === '*') { const n = src.indexOf('*/', j + 2); if (n < 0) break; j = n + 1; continue; }
    if (c === "'" || c === '"') { j = finChaine(src, j); continue; }
    if (c === '`') { j = finGabarit(src, j); continue; }
    if (c === '(' || c === '{' || c === '[') prof++;
    else if ((c === ')' || c === '}' || c === ']') && --prof === 0) return j;
  }
  throw new Error('bloc non fermé');
};

// Texte de l'argument d'un appel dont la parenthèse ouvrante est en `i`.
const argumentDe = (src, i) => src.slice(i + 1, fermant(src, i));

// Commentaires de tête d'un membre retirés (`// …` et `/* … */`).
const sansCommentaireDeTete = (m) => {
  let s = m.trim();
  for (;;) {
    if (s.startsWith('//')) { const n = s.indexOf('\n'); s = n < 0 ? '' : s.slice(n + 1).trim(); }
    else if (s.startsWith('/*')) { const n = s.indexOf('*/'); s = n < 0 ? '' : s.slice(n + 2).trim(); }
    else return s;
  }
};

// Membres de premier niveau d'un objet littéral `{ … }`, ou null si ce n'en est pas un.
const membresDeNiveau1 = (texte) => {
  const t = texte.trim();
  if (!t.startsWith('{') || fermant(t, 0) !== t.length - 1) return null;
  const corps = t.slice(1, -1);
  const membres = [];
  let debut = 0;
  for (let j = 0; j < corps.length; j++) {
    const c = corps[j];
    if (c === '/' && corps[j + 1] === '/') { const n = corps.indexOf('\n', j); j = n < 0 ? corps.length : n; continue; }
    if (c === '/' && corps[j + 1] === '*') { const n = corps.indexOf('*/', j + 2); j = n < 0 ? corps.length : n + 1; continue; }
    if (c === "'" || c === '"') { j = finChaine(corps, j); continue; }
    if (c === '`') { j = finGabarit(corps, j); continue; }
    if (c === '(' || c === '{' || c === '[') { j = fermant(corps, j); continue; }
    if (c === ',') { membres.push(corps.slice(debut, j)); debut = j + 1; }
  }
  membres.push(corps.slice(debut));
  return membres.map(sansCommentaireDeTete).filter(Boolean);
};

const porteVoc = (arg) => {
  const membres = membresDeNiveau1(arg);
  return !!membres && membres.some((m) => m === 'voc' || /^voc\s*:/.test(m));
};

// Appels des 5 fonctions dans src/ : `nom(` hors commentaire (les définitions s'écrivent
// `const nom = async (`, les imports et exports sans parenthèse).
const appels = () => {
  const out = [];
  for (const f of fichiersJs(SRC)) {
    const src = fs.readFileSync(f, 'utf8');
    const motif = new RegExp(`\\b(${FONCTIONS.join('|')})\\s*\\(`, 'g');
    let m;
    while ((m = motif.exec(src))) {
      const debutLigne = src.lastIndexOf('\n', m.index) + 1;
      const avant = src.slice(debutLigne, m.index);
      if (avant.includes('//') || /^\s*\*/.test(avant) || /^\s*\/\*/.test(avant)) continue;
      const ligne = src.slice(0, m.index).split('\n').length;
      const arg = argumentDe(src, m.index + m[0].length - 1);
      out.push({ ou: `${path.relative(RACINE, f).replace(/\\/g, '/')}:${ligne}`, fonction: m[1], arg });
    }
  }
  return out;
};

test('outil : un objet porte `voc` seulement à son premier niveau', () => {
  assert.equal(porteVoc('{ to, nom, voc }'), true);
  assert.equal(porteVoc('{ ...inv, voc: req.voc }'), true);
  assert.equal(porteVoc('{\n  to: x, // voc ici ?\n  voc: await f(id),\n}'), true);
  assert.equal(porteVoc('{ to, avenant: { voc } }'), false);
  assert.equal(porteVoc('{ to, vocabulaire: v }'), false);
  assert.equal(porteVoc('{ to, nom: `voc: ${a}` }'), false);
  assert.equal(porteVoc('inv'), false);
  assert.equal(porteVoc('{ ...inv }'), false);
  assert.equal(porteVoc('{ to: `a${b({ voc })}`, nom }'), false);
  assert.equal(porteVoc("{ url: 'https://x', /* c */ voc }"), true);
  assert.equal(porteVoc("{ to, nom: 'voc' }"), false);
});

test('chaque appel des 5 fonctions d\'email dans src/ porte une clé `voc` (spec §5.6)', () => {
  const tous = appels();
  // Non-vacuité : les 12 appels du §5.6, moins les 2 de clientsController retirés au lot 3, étape 3 (contrat de
  // création et acte de résiliation : plus de contrat) — 10 au moins (un appel ajouté plus tard doit aussi la porter).
  assert.ok(tous.length >= 10, `${tous.length} appel(s) trouvé(s), 10 attendus au moins`);
  const fautifs = tous.filter((a) => !porteVoc(a.arg)).map((a) => `${a.ou} ${a.fonction}(${a.arg.trim().slice(0, 80)})`);
  assert.deepEqual(fautifs, [], `appels sans clé voc :\n${fautifs.join('\n')}`);
  // Les fichiers du §5.6 (clientsController n'en appelle plus aucune depuis le lot 3, étape 3 : son email de
  // bienvenue, sendWelcomeEmail, n'écrit aucun terme du lexique)
  const fichiers = [...new Set(tous.map((a) => a.ou.split(':')[0]))].sort();
  for (const f of [
    'src/controllers/abonnementController.js', 'src/controllers/acheteursController.js',
    'src/controllers/aiAssistantController.js', 'src/controllers/authController.js',
    'src/controllers/gerantController.js',
    'src/controllers/supportController.js', 'src/services/reportService.js',
  ]) assert.ok(fichiers.includes(f), `aucun appel lu dans ${f}`);
});

test('les 5 fonctions prennent `voc` dans leur objet d\'arguments, avec repli', () => {
  const src = fs.readFileSync(path.join(SRC, 'services/emailService.js'), 'utf8').replace(/\r\n/g, '\n');
  for (const nom of FONCTIONS) {
    const m = new RegExp(`const ${nom} = async \\(\\{([\\s\\S]*?)\\}\\) => \\{\\n\\s*const voc = vocDuDestinataire\\(vocRecu, ${nom}\\);`).exec(src);
    assert.ok(m, `${nom} : signature attendue « ({ …, voc: vocRecu }) » suivie du repli`);
    assert.ok(membresDeNiveau1(`{${m[1]}}`).some((x) => /^voc\s*:\s*vocRecu$/.test(x)), `${nom} : clé voc absente`);
  }
});

// ── 2. Repli sans `voc` ──────────────────────────────────────────────────────────────────────

const envois = [];
const cheminResend = require.resolve('resend', { paths: [RACINE] });
require.cache[cheminResend] = {
  id: cheminResend, filename: cheminResend, loaded: true, children: [], paths: [],
  exports: {
    Resend: class {
      constructor() {
        this.emails = { send: async (m) => { envois.push(m); return { data: { id: `faux-${envois.length}` }, error: null }; } };
      }
    },
  },
};
// Clé factice NON vide : sinon 4 des 5 fonctions sortent avant l'envoi (garde de développement).
process.env.RESEND_API_KEY = 'faux-test-emailVoc';

const email = require('../src/services/emailService');
const { vocabDefaut } = require('../src/utils/vocab');

const ARGS = {
  sendInviteEmail: { to: 'a@test.invalid', nom: 'Nom', token: 'jeton', role: 'gerant' },
  sendDocusealSigningEmail: {
    to: 'a@test.invalid', nom: 'Nom', signingUrl: 'https://signature.invalid/s',
    avenant: { addActivites: 1, addLabos: 2, addGerants: 1, setAcheteurs: 20 },
  },
  sendAvenantEmail: {
    to: 'a@test.invalid', nom: 'Nom', notesAdmin: 'Note',
    nbActivitesAdded: 1, nbLabosAdded: 2, nbGerantsAdded: 1, nbActivites: 2, nbLabos: 3, nbGerants: 1,
    activiteCost: 10, laboCost: 20, gerantCost: 5, newMensuel: 35, promoApplied: false, effectifMensuel: 35,
    dateAvenant: '2026-10-01T10:00:00.000Z', pdfBase64: null,
  },
  sendRapportWithAttachment: {
    to: 'a@test.invalid', clientNom: 'Compte', buffer: Buffer.from('x'), filename: 'r.xlsx',
    mimeType: 'application/octet-stream', format: 'excel',
  },
  sendMessengerInviteEmail: { to: 'a@test.invalid', clientNom: 'Compte', inviteLink: 'https://m.me/x?ref=y', appName: 'LabFlow' },
};

for (const nom of FONCTIONS) {
  test(`${nom} sans voc : oubli journalisé, email envoyé avec le vocabulaire par défaut`, async (t) => {
    const erreurs = t.mock.method(console, 'error', () => {});
    envois.length = 0;
    await email[nom]({ ...ARGS[nom] });
    assert.equal(envois.length, 1, 'un email n\'est jamais perdu');
    assert.deepEqual(erreurs.mock.calls.map((c) => c.arguments), [['[email] voc manquant', nom]]);

    const sansVoc = envois[0];
    envois.length = 0;
    await email[nom]({ ...ARGS[nom], voc: vocabDefaut });
    assert.equal(envois.length, 1);
    assert.equal(erreurs.mock.calls.length, 1, 'avec voc : rien de journalisé');
    assert.equal(envois[0].subject, sansVoc.subject);
    assert.equal(envois[0].html, sansVoc.html);
  });
}
