// LabFlow Compta, étape S3b (labflow-reprise/achats-compta/PLAN-S3b.md ; SPEC-SOCLE D2, D4, D14) : le comptable du
// client. Tests sans base : garde par comptabilité sur chaque route d'écriture, saisie refusée avant toute requête,
// présentation des accès, emails échappés, connexion d'un cabinet bloqué, migration 205.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');

const garde = require('../src/compta/garde');
const comptables = require('../src/compta/comptablesClient');
const routes = require('../src/compta/routes');

const reponse = () => {
  const res = { statut: 200, corps: null };
  res.status = (s) => { res.statut = s; return res; };
  res.json = (c) => { res.corps = c; return res; };
  return res;
};

test('garde par comptabilité (D4) : lecture seule, suspendu et bloqué refusés avec les codes de la garde globale', () => {
  assert.equal(garde.erreurEcriture('actif'), null);
  assert.equal(garde.erreurEcriture(undefined), null);
  for (const [mode, code] of [['read_only', 'READ_ONLY'], ['desactive', 'SUSPENDED'], ['archive', 'SUSPENDED'], ['bloque', 'BLOCKED']]) {
    const e = garde.erreurEcriture(mode);
    assert.equal(e.statusCode, 403, mode);
    assert.equal(e.code, code, mode);
  }
  assert.equal(garde.etatAbonnement('actif'), 'actif');
  assert.equal(garde.etatAbonnement(null), 'actif');
  assert.equal(garde.etatAbonnement('read_only'), 'lecture_seule');
  assert.equal(garde.etatAbonnement('bloque'), 'bloque');
  assert.equal(garde.etatAbonnement('desactive'), 'suspendu');
  assert.equal(garde.etatAbonnement('archive'), 'suspendu');
});

test('chaque route d\'écriture de /api/compta porte la garde par comptabilité, sauf celles qui n\'écrivent dans aucune comptabilité', () => {
  const src = lire('src', 'compta', 'routes.js');
  const ecritures = [...src.matchAll(/router\.(post|put|patch|delete)\('([^']+)',[^\n]*?(\w+(?:\.\w+)?)\);/g)]
    .map(([, methode, chemin, gestionnaire]) => ({ cle: `${methode.toUpperCase()} ${chemin}`, gestionnaire }));
  assert.equal(ecritures.length, 6, 'routes d\'écriture trouvées');
  const ctrl = lire('src', 'compta', 'comptablesClient.js');
  const corps = (nom) => {
    const debut = ctrl.indexOf(`const ${nom} = async (req, res) => {`);
    assert.ok(debut > 0, nom);
    return ctrl.slice(debut, ctrl.indexOf('\n};\n', debut));
  };
  for (const { cle, gestionnaire } of ecritures) {
    if (routes.ECRITURES_SANS_GARDE.includes(cle)) continue;
    assert.match(gestionnaire, /^comptables\.\w+$/, `${cle} : gestionnaire de comptablesClient`);
    assert.ok(corps(gestionnaire.split('.')[1]).includes('await dansEspace(req.user,'), `${cle} : écriture sous la garde`);
  }
  const dansEspace = ctrl.slice(ctrl.indexOf('const dansEspace = async'), ctrl.indexOf('\n};\n', ctrl.indexOf('const dansEspace = async')));
  assert.ok(dansEspace.includes('const espace = await exigerEspace(db, user, true);\n    await exigerEcriture(db, espace.id);'), 'espace verrouillé puis garde');
  assert.deepEqual(routes.ECRITURES_SANS_GARDE, ['POST /passage', 'POST /confiees/:espaceId/quitter']);
  // La garde globale ne juge plus /api/compta (sinon un cabinet bloqué ne pourrait rien écrire, même chez ses clients).
  const app = lire('src', 'app.js');
  const exemption = app.indexOf("if (req.path === '/compta' || req.path.startsWith('/compta/')) return next();");
  assert.ok(exemption > 0 && exemption < app.indexOf('authenticate(req, res, () => requireWriteAccess(req, res, next));'));
});

test('saisie d\'un comptable : nom, adresse (minuscules) et niveau contrôlés, refus avant toute requête', async () => {
  assert.deepEqual(comptables.lireSaisie({ nom: '  Ali Ben Salah ', email: ' Ali@Cabinet.TN ', niveau: 'saisie' }), { nom: 'Ali Ben Salah', email: 'ali@cabinet.tn', niveau: 'saisie' });
  assert.equal(comptables.lireSaisie({ nom: 'A', email: 'a@b.tn' }).niveau, 'complet', 'Complet par défaut');
  for (const corps of [{ email: 'a@b.tn' }, { nom: ' ', email: 'a@b.tn' }, { nom: 'A', email: 'pas-une-adresse' }, { nom: 'A', email: 'a@b.tn', niveau: 'admin' }, { nom: 'x'.repeat(101), email: 'a@b.tn' }]) {
    assert.throws(() => comptables.lireSaisie(corps), (e) => e.statusCode === 400, JSON.stringify(corps));
  }
  assert.deepEqual(comptables.lireSaisie({ niveau: 'consultation' }, true), { niveau: 'consultation' }, 'modification partielle');
  assert.deepEqual(comptables.NIVEAUX, ['consultation', 'saisie', 'complet']);
  assert.deepEqual(comptables.ROLES_REFUSES, ['super_admin', 'boss', 'acheteur']);
  const res = reponse();
  await comptables.ajouter({ user: { id: 1, role: 'client' }, body: { nom: 'A', email: 'faux' } }, res);
  assert.equal(res.statut, 400);
  const res2 = reponse();
  await comptables.confiee({ user: { id: 1, role: 'comptable' }, params: { espaceId: '1; DROP' } }, res2);
  assert.equal(res2.statut, 404, 'identifiant invalide : introuvable, sans requête');
});

test('présentation d\'un accès : vide « à attribuer », invitation en attente, renvoi réservé aux comptes LabFlow Compta', () => {
  const vide = comptables.presenterComptable({ id: 3, obligatoire: true, niveau: 'complet', personne_id: null, nom_attendu: null, email_attendu: null });
  assert.deepEqual({ etat: vide.etat, nom: vide.nom, email: vide.email, invitation: vide.invitationEnAttente }, { etat: 'a_attribuer', nom: null, email: null, invitation: false });
  const nouveau = comptables.presenterComptable({ id: 4, obligatoire: false, niveau: 'saisie', personne_id: 9, nom_attendu: 'Nom saisi', nom: 'Nom du compte', email: 'x@y.tn', personne_role: 'comptable', activated_at: null, a_mot_de_passe: false });
  assert.equal(nouveau.etat, 'actif');
  assert.equal(nouveau.nom, 'Nom saisi', 'nom saisi par le client d\'abord');
  assert.equal(nouveau.invitationEnAttente, true);
  assert.equal(nouveau.invitationRenvoyable, true);
  const gerant = comptables.presenterComptable({ id: 5, obligatoire: false, niveau: 'complet', personne_id: 10, nom: 'G', email: 'g@y.tn', personne_role: 'gerant', activated_at: null, a_mot_de_passe: false });
  assert.equal(gerant.invitationRenvoyable, false, 'un gérant Stock / Vente a sa propre invitation');
  const active = comptables.presenterComptable({ id: 6, obligatoire: true, niveau: 'complet', personne_id: 11, nom: 'C', email: 'c@y.tn', personne_role: 'comptable', activated_at: new Date(), a_mot_de_passe: true });
  assert.equal(active.invitationEnAttente, false);
});

test('emails : invitation vers LabFlow Compta (48 h) ou accès ajouté ; comptable parti ; textes du client échappés', async () => {
  const envois = [];
  const chemin = require.resolve('resend');
  const avant = require.cache[chemin];
  require.cache[chemin] = { id: chemin, filename: chemin, loaded: true, exports: { Resend: class { constructor() { this.emails = { send: async (m) => { envois.push(m); return { data: { id: 'x' } }; } }; } } } };
  const cle = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = 're_essai';
  process.env.APP_URL_COMPTA = 'https://compta.exemple.tn';
  process.env.APP_URL = 'https://app.exemple.tn';
  delete require.cache[require.resolve('../src/services/emailService')];
  delete require.cache[require.resolve('../src/compta/emails')];
  try {
    const email = require('../src/compta/emails');
    await email.sendAccesComptaEmail({ to: 'c@x.tn', nom: '<b>Ali</b>', clientNom: 'Café "Le Port" & Co', token: 'jeton' });
    await email.sendAccesComptaEmail({ to: 'c@x.tn', nom: 'Ali', clientNom: 'Café' });
    await email.sendComptablePartiEmail({ to: 'p@x.tn', nom: 'Patron', comptableNom: '<script>' });
    assert.equal(envois.length, 3);
    assert.ok(envois[0].html.includes('https://compta.exemple.tn/invite/jeton'));
    assert.ok(envois[0].html.includes('48 heures'));
    assert.ok(envois[0].html.includes('&lt;b&gt;Ali&lt;/b&gt;') && !envois[0].html.includes('<b>Ali</b>'));
    assert.ok(envois[0].html.includes('Café &quot;Le Port&quot; &amp; Co'));
    assert.match(envois[0].subject, /^LabFlow Compta — Café "Le Port" & Co vous confie sa comptabilité$/);
    assert.ok(envois[1].html.includes('https://compta.exemple.tn/login') && !envois[1].html.includes('/invite/'));
    assert.ok(envois[1].html.includes('Comptabilités confiées par des clients LabFlow'));
    assert.ok(envois[2].html.includes('https://app.exemple.tn/client/gerants'));
    assert.ok(envois[2].html.includes('&lt;script&gt;') && !envois[2].html.includes('<script>'));
    assert.ok(envois[2].html.includes('page <strong>Gérants</strong>'), 'nom de la page dans le vocabulaire par défaut');
  } finally {
    if (avant) require.cache[chemin] = avant; else delete require.cache[chemin];
    if (cle === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = cle;
    delete process.env.APP_URL_COMPTA;
    delete process.env.APP_URL;
    delete require.cache[require.resolve('../src/services/emailService')];
    delete require.cache[require.resolve('../src/compta/emails')];
  }
});

test('connexion : un compte « comptable » dont le cabinet est bloqué se connecte encore ; les autres comptes bloqués non', () => {
  const src = lire('src', 'controllers', 'authController.js');
  assert.ok(src.includes("if (utilisateur.role !== 'super_admin' && utilisateur.role !== 'boss' && utilisateur.role !== 'comptable') {"));
  assert.ok(src.includes("return res.status(403).json({ message: 'account_blocked' });"));
});

test('manuel : un gérant Stock / Vente à qui une comptabilité est confiée lit toutes les fiches de LabFlow Compta', () => {
  const src = lire('src', 'controllers', 'manuelController.js');
  assert.ok(src.includes("const gerant = req.user.role === 'gerant' && !compta;"));
});

test('migration 205 : demande d\'ajout, date d\'attribution, fiches Compta gardées par empreinte, sans balise', () => {
  const sql = fs.readFileSync(path.join(RACINE, 'migrations', '205_compta_comptable_client.sql'), 'utf8');
  assert.ok(!sql.includes('\r'), 'fins de ligne LF');
  assert.match(sql, /ALTER TABLE support_demandes ADD COLUMN IF NOT EXISTS nb_gerants_compta_supp INTEGER NOT NULL DEFAULT 0;/);
  assert.match(sql, /CHECK \(nb_gerants_compta_supp BETWEEN 0 AND 50\)/);
  assert.match(sql, /ALTER TABLE compta\.acces ADD COLUMN IF NOT EXISTS attribue_le TIMESTAMPTZ;/);
  assert.match(sql, /'compta-bienvenue', '2708424ef9bd7692e5217d06bced9474'/);
  assert.match(sql, /'compta-ma-comptabilite', '3a1aa989fe48c069fd8166619240b1b3'/);
  assert.match(sql, /md5\(replace\(manuel_sections\.contenu_defaut, chr\(13\), ''\)\) = f\.garde/);
  assert.match(sql, /SET contenu = CASE WHEN contenu = contenu_defaut THEN f\.texte ELSE contenu END/, 'une fiche retouchée garde sa retouche');
  assert.match(sql, /\('compta-confiee', 'Comptabilité confiée', '🤝', 1040,/);
  assert.match(sql, /ON CONFLICT \(slug\) DO NOTHING;/);
  assert.ok(!/\[\[/.test(sql), 'jamais de balise de vocabulaire dans une fiche Compta');
});
