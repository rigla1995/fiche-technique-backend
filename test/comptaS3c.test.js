// LabFlow Compta, étape S3c (labflow-reprise/achats-compta/PLAN-S3c.md ; SPEC-SOCLE D2, D4, D14) : les gérants du
// cabinet. Tests sans base : routes réservées au titulaire, saisies refusées avant toute requête, accès désactivé,
// validation d'une demande de cabinet, cloche de LabFlow Compta, emails échappés, migration 207.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');

const comptables = require('../src/compta/comptablesClient');
const gerants = require('../src/compta/gerantsCabinet');
const moduleCompta = require('../src/compta/moduleClient');
const notifications = require('../src/controllers/notificationController');

const reponse = () => {
  const res = { statut: 200, corps: null };
  res.status = (s) => { res.statut = s; return res; };
  res.json = (c) => { res.corps = c; return res; };
  return res;
};

test('routes du cabinet : réservées au titulaire (vérifié sur compta.acces) ; la page du collaborateur à part', () => {
  const src = lire('src', 'compta', 'routes.js');
  const lignes = src.split('\n').filter((l) => /router\.\w+\('\/cabinet\//.test(l));
  assert.equal(lignes.length, 8, 'routes du titulaire trouvées');
  for (const l of lignes) assert.ok(l.includes('authenticate, exigerTitulaireCabinet,'), l);
  for (const l of lignes.filter((x) => !/router\.get/.test(x))) assert.ok(l.includes('limiteComptables'), `${l} : limite de débit`);
  assert.ok(src.includes("router.get('/cabinets/:espaceId', authenticate, gerants.membre);"));
  assert.ok(!/router\.\w+\('\/cabinets\/:espaceId\/quitter'/.test(src), 'le titulaire gère son équipe : pas de « Quitter »');
});

test('saisies refusées avant toute requête : gérant, demande, page du collaborateur', async () => {
  const res = reponse();
  await gerants.ajouter({ user: { id: 1, role: 'comptable' }, body: { nom: 'A', email: 'pas-une-adresse' } }, res);
  assert.equal(res.statut, 400);
  for (const nombre of [0, -1, 1.5, 51, 'x', null]) {
    const r = reponse();
    await gerants.demander({ user: { id: 1, role: 'comptable' }, body: { nombre } }, r);
    assert.equal(r.statut, 400, String(nombre));
  }
  const r2 = reponse();
  await gerants.membre({ user: { id: 1, role: 'comptable' }, params: { espaceId: '1; DROP' } }, r2);
  assert.equal(r2.statut, 404, 'identifiant invalide : introuvable, sans requête');
  assert.deepEqual(Object.keys(gerants.TEXTES_CABINET).sort(), ['double', 'titulaire']);
});

test('présentation : un accès désactivé se dit « desactive » ; un accès vide reste « à attribuer »', () => {
  const base = { id: 7, obligatoire: false, niveau: 'saisie', personne_id: 9, nom: 'G', email: 'g@x.tn', personne_role: 'comptable', activated_at: new Date(), a_mot_de_passe: true };
  assert.equal(comptables.presenterComptable({ ...base, etat_acces: 'desactive' }).etat, 'desactive');
  assert.equal(comptables.presenterComptable({ ...base, etat_acces: 'actif' }).etat, 'actif');
  assert.equal(comptables.presenterComptable({ ...base, personne_id: null, etat_acces: 'desactive' }).etat, 'a_attribuer');
  assert.ok(comptables.SQL_COMPTABLES.includes('a.etat AS etat_acces'));
});

test('désactiver, retirer : sans garde ; ajouter, modifier, réactiver, renvoyer, demander : sous la garde', () => {
  const src = lire('src', 'compta', 'gerantsCabinet.js');
  const corps = (nom) => {
    const debut = src.indexOf(`const ${nom} = async (req, res) => {`);
    return src.slice(debut, src.indexOf('\n};\n', debut));
  };
  for (const nom of ['desactiver', 'retirer']) assert.ok(corps(nom).includes('}, { garde: false });'), nom);
  for (const nom of ['ajouter', 'modifier', 'reactiver', 'inviter', 'demander']) assert.ok(!corps(nom).includes('garde: false'), nom);
  // Places : désactivés compris ; un accès désactivé se réactive avant d'être modifié ou réinvité.
  assert.ok(src.includes("WHERE espace_id = $1 AND role = 'gerant'`, [espaceId])).rows[0].n;"));
  assert.ok(corps('modifier').includes("if (acces.etat_acces === 'desactive') throw erreur(409, MSG_DESACTIVE, 'ACCES_DESACTIVE');"));
  assert.ok(corps('inviter').includes("if (acces.etat_acces === 'desactive') throw erreur(409, MSG_DESACTIVE, 'ACCES_DESACTIVE');"));
  // Côté client (S3b) : retirer son comptable est aussi permis quel que soit l'abonnement.
  const client = lire('src', 'compta', 'comptablesClient.js');
  const retirer = client.slice(client.indexOf('const retirer = async'), client.indexOf('\n};\n', client.indexOf('const retirer = async')));
  assert.ok(retirer.includes('}, { garde: false });'));
});

test('validation d\'une demande : un cabinet n\'a pas besoin du module ; un client si', async () => {
  const requetes = [];
  const db = { query: async (sql, params) => { requetes.push({ sql, params }); return { rows: [{ id: 42 }] }; } };
  await moduleCompta.ajouterGerantsDemandes(db, { cur: { abonnement_id: 5, nb_gerants_compta: 2, module_compta_actif: null }, clientId: 9, n: 3, auteurId: 1, demandeId: 8, cabinet: true });
  assert.deepEqual(requetes[0].params, [5, 5], 'gérants achetés : 2 + 3');
  assert.deepEqual(requetes[1].params, [9, 'cabinet']);
  assert.equal(requetes[2].params[2], 'gerants_modifies');
  await assert.rejects(
    moduleCompta.ajouterGerantsDemandes(db, { cur: { abonnement_id: 5, nb_gerants_compta: 0, module_compta_actif: false }, clientId: 9, n: 1 }),
    (e) => e.statusCode === 409
  );
  await assert.rejects(
    moduleCompta.ajouterGerantsDemandes(db, { cur: { abonnement_id: 5, nb_gerants_compta: 49 }, clientId: 9, n: 2, cabinet: true }),
    (e) => e.statusCode === 409 && /cabinet/.test(e.message)
  );
  const support = lire('src', 'controllers', 'supportController.js');
  assert.ok(support.includes('estCabinet = await gerantsCabinet.estAbonnementCabinet(db, cur.abonnement_id);'));
  assert.ok(support.includes("if (statut === 'validée' && demande.type === 'supplement' && demande.client_email && !estCabinet) {"), 'pas d\'email LabFlow pour un cabinet');
  assert.ok(support.includes("LEFT JOIN compta.espaces ce    ON ce.titulaire_id = sd.client_id AND ce.type = 'cabinet'"));
});

test('cloche de LabFlow Compta : un comptable voit tout ; un client, seulement les types Compta (aucun pour l\'instant)', () => {
  assert.equal(notifications.filtreProduit({ query: {}, user: { role: 'client' } }), null, 'cloche de LabFlow inchangée');
  assert.equal(notifications.filtreProduit({ query: { produit: 'compta' }, user: { role: 'comptable' } }), null);
  const f = notifications.filtreProduit({ query: { produit: 'compta' }, user: { role: 'client' } });
  assert.equal(f.sql, ' AND event_type = ANY($2::text[])');
  assert.deepEqual(f.valeur, []);
  assert.deepEqual(notifications.TYPES_COMPTA, []);
  // Liste, « vues » et effacement : tous filtrés (ouvrir la cloche Compta n'efface jamais celles de LabFlow).
  const src = lire('src', 'controllers', 'notificationController.js');
  assert.equal((src.match(/const filtre = filtreProduit\(req\);/g) || []).length, 3);
  assert.ok(src.includes('if (filtre) { sql += filtre.sql; params.push(filtre.valeur); }'), 'effacement : filtre en $2');
});

test('admin : la limite d\'un cabinet ne descend pas sous les gérants en place ; cabinet sur un compte existant', () => {
  const src = lire('src', 'compta', 'cabinetsController.js');
  const maj = src.slice(src.indexOf('const updateGerants = async'), src.indexOf('\n};\n', src.indexOf('const updateGerants = async')));
  assert.ok(maj.indexOf('FOR UPDATE') < maj.indexOf("role = 'gerant'"), 'configuration verrouillée avant le décompte');
  assert.ok(maj.includes('if (nbGerants < enPlace) {'));
  // Rattachement : seulement un compte « comptable » actif, sans abonnement, espace ni fiche ; revérifié sous verrou.
  assert.ok(src.includes("const rattachable = r.rows.length === 1 && p.role === 'comptable' && p.actif === true && !p.a_abonnement && !p.a_espace && !p.a_profil;"));
  assert.ok(src.includes('const encore = await etatAdresse(db, email, true);'));
  // Suppression : une personne qui garde d'autres accès reste.
  assert.ok(src.includes("const autres = await db.query('SELECT 1 FROM compta.acces WHERE personne_id = $1 LIMIT 1', [c.id]);"));
  assert.ok(lire('src', 'compta', 'adminRoutes.js').includes("router.get('/adresse', c.verifierAdresse);"));
});

test('accueil : la carte d\'un collaborateur ouvre la page du cabinet ; niveau transmis', () => {
  const src = lire('src', 'compta', 'accesController.js');
  assert.ok(src.includes("const LIENS_GERANT = { cabinet: (id) => `/cabinets/${id}`, client_labflow: (id) => `/confiee/${id}` };"));
  assert.ok(src.includes('niveau: x.niveau, lien: lienCarte(x)'));
});

test('emails du cabinet : invitation ou accès ajouté, demande validée, cabinet ouvert ; textes échappés', async () => {
  const envois = [];
  const chemin = require.resolve('resend');
  const avant = require.cache[chemin];
  require.cache[chemin] = { id: chemin, filename: chemin, loaded: true, exports: { Resend: class { constructor() { this.emails = { send: async (m) => { envois.push(m); return { data: { id: 'x' } }; } }; } } } };
  const cle = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = 're_essai';
  process.env.APP_URL_COMPTA = 'https://compta.exemple.tn';
  delete require.cache[require.resolve('../src/services/emailService')];
  delete require.cache[require.resolve('../src/compta/emails')];
  try {
    const email = require('../src/compta/emails');
    await email.sendAccesCabinetEmail({ to: 'g@x.tn', nom: '<b>Sami</b>', cabinetNom: 'Cabinet "Audit" & Fils', token: 'jeton' });
    await email.sendAccesCabinetEmail({ to: 'g@x.tn', nom: 'Sami', cabinetNom: 'Cabinet' });
    await email.sendGerantsCabinetEmail({ to: 'c@x.tn', nom: 'Titulaire', nbAjoutes: 2, nbGerants: 5, ancienMensuel: 210, nouveauMensuel: 270, notesAdmin: '<i>ok</i>' });
    await email.sendCabinetOuvertEmail({ to: 'c@x.tn', nom: 'Titulaire', cabinetNom: '<Cabinet>' });
    assert.equal(envois.length, 4);
    assert.ok(envois[0].html.includes('https://compta.exemple.tn/invite/jeton') && envois[0].html.includes('48 heures'));
    assert.ok(envois[0].html.includes('&lt;b&gt;Sami&lt;/b&gt;') && envois[0].html.includes('Cabinet &quot;Audit&quot; &amp; Fils'));
    assert.match(envois[0].subject, /^LabFlow Compta — Le cabinet Cabinet "Audit" & Fils vous ouvre un accès$/);
    assert.ok(envois[1].html.includes('https://compta.exemple.tn/login') && !envois[1].html.includes('/invite/'));
    assert.ok(envois[1].html.includes('Mon cabinet'));
    assert.ok(envois[2].html.includes('https://compta.exemple.tn/gerants') && envois[2].html.includes('<strong>5</strong>'));
    assert.ok(envois[2].html.includes('&lt;i&gt;ok&lt;/i&gt;'));
    assert.ok(envois[3].html.includes('&lt;Cabinet&gt;') && envois[3].html.includes('https://compta.exemple.tn/login'));
  } finally {
    if (avant) require.cache[chemin] = avant; else delete require.cache[chemin];
    if (cle === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = cle;
    delete process.env.APP_URL_COMPTA;
    delete require.cache[require.resolve('../src/services/emailService')];
    delete require.cache[require.resolve('../src/compta/emails')];
  }
});

test('migration 207 : fiches Compta gardées par empreinte, deux nouvelles fiches, sans balise, en LF', () => {
  const sql = fs.readFileSync(path.join(RACINE, 'migrations', '207_compta_gerants_cabinet.sql'), 'utf8');
  assert.ok(!sql.includes('\r'), 'fins de ligne LF');
  assert.match(sql, /'compta-bienvenue', 'efe7fc1cdca543ec8789ae66b9cc767a'/);
  assert.match(sql, /'compta-cabinet', '01f54acaff1ef173414618be17111b90'/);
  assert.match(sql, /'compta-abonnement', '4d5ea679f175c4f1ddccb29d700e9f65'/);
  assert.match(sql, /md5\(replace\(manuel_sections\.contenu_defaut, chr\(13\), ''\)\) = f\.garde/);
  assert.match(sql, /SET contenu = CASE WHEN contenu = contenu_defaut THEN f\.texte ELSE contenu END/, 'une fiche retouchée garde sa retouche');
  assert.match(sql, /\('compta-gerants', 'Mes gérants', '👥', 1015,/);
  assert.match(sql, /\('compta-cabinet-membre', 'Cabinet \(collaborateur\)', '🏢', 1050,/);
  assert.match(sql, /ON CONFLICT \(slug\) DO NOTHING;/);
  assert.ok(!/\[\[/.test(sql), 'jamais de balise de vocabulaire dans une fiche Compta');
  assert.ok(!/ALTER TABLE|CREATE TABLE/.test(sql), 'aucune table ne change');
});
