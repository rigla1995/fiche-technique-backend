// Lot 2b, B2 — les 5 emails à terme écrivent leurs termes par appels voc (spec docs/lot-2b-spec.md §8.1).
//   node --test test/B2-emails.test.js
//
// 1. Vocabulaire par défaut : sujet, HTML et pièces jointes IDENTIQUES à ceux de la référence (emailService.js
//    au commit du socle, 62288e4), pour chaque fonction et plusieurs variantes (rôles, pluriels, lignes absentes).
//    Lot 3, étape 4 : sendAvenantEmail est remplacée par sendSupplementValideEmail, dont le texte change VOLONTAIREMENT
//    (plus d'avenant ni de PDF, option Acheteurs ajoutée, nom et note échappés) : plus de comparaison à la référence
//    pour elle, mais des vérifications de son contenu (sujet, aucune pièce jointe, jamais le mot « avenant », option
//    Acheteurs, échappement du nom et de la note, date de validation).
// 2. Hôtellerie, Céramique, miroir (lexiques d'essai résolus comme en production) : les termes du domaine, et
//    plus aucune forme par défaut dans les passages réécrits.
// Aucun envoi réel : le module `resend` est remplacé par un faux AVANT tout chargement.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');

const RACINE = path.resolve(__dirname, '..');
const REFERENCE = '62288e4'; // socle du lot 2b, avant le balayage B2

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
process.env.RESEND_API_KEY = 'faux-test-B2-emails';

const chargerReference = (relatif) => {
  let source;
  try {
    source = execFileSync('git', ['-C', RACINE, 'show', `${REFERENCE}:${relatif}`], { encoding: 'utf8', maxBuffer: 1 << 26 });
  } catch {
    return null;
  }
  const chemin = path.join(RACINE, path.dirname(relatif), `__reference_${path.basename(relatif)}`);
  const m = new Module(chemin, module);
  m.filename = chemin;
  m.paths = Module._nodeModulePaths(path.dirname(chemin));
  m._compile(source, chemin);
  return m.exports;
};

const email = require('../src/services/emailService');
const reference = chargerReference('src/services/emailService.js');
const { vocabDefaut, vocabDuLexique, resoudreLexique } = require('../src/utils/vocab');
const { LEXIQUE_DEFAUT } = require('../src/config/lexiqueDefaut');
const ESSAIS = JSON.parse(fs.readFileSync(path.join(RACINE, 'test/vocab-lexiques-test.json'), 'utf8'));
// Comme en production (domaineProfilService) : écarts du domaine résolus sur le lexique par défaut.
const VOC = {
  hotellerie: vocabDuLexique(resoudreLexique(LEXIQUE_DEFAUT, ESSAIS.hotellerie)),
  ceramique: vocabDuLexique(resoudreLexique(LEXIQUE_DEFAUT, ESSAIS.ceramique)),
  miroir: vocabDuLexique(resoudreLexique(LEXIQUE_DEFAUT, ESSAIS.miroir)),
};

// Lot 3, étape 4 : arguments de sendSupplementValideEmail (configuration après l'ajout).
const SUPPLEMENT = {
  to: 'a@test.invalid', nom: 'Nom', notesAdmin: 'Note', nbActivites: 3, nbLabos: 2, nbGerants: 1, nbAcheteurs: 20,
  activiteCost: 10, laboCost: 20, gerantCost: 5, acheteursCost: 15, newMensuel: 50, ancienMensuel: 30,
  dateValidation: '2026-10-01T10:00:00.000Z',
};
const VARIANTES = [
  ['sendInviteEmail', { to: 'a@test.invalid', nom: 'Nom', token: 'jeton', role: 'gerant' }],
  ['sendInviteEmail', { to: 'a@test.invalid', nom: 'Nom', token: 'jeton', role: 'acheteur' }],
  ['sendInviteEmail', { to: 'a@test.invalid', nom: 'Nom', token: 'jeton', role: 'client' }],
  ['sendDocusealSigningEmail', { to: 'a@test.invalid', nom: 'Nom', signingUrl: 'https://s.invalid/1', avenant: { addActivites: 1, addLabos: 1, addGerants: 1, setAcheteurs: 10 } }],
  ['sendDocusealSigningEmail', { to: 'a@test.invalid', nom: 'Nom', signingUrl: 'https://s.invalid/2', avenant: { addActivites: 2, addLabos: 3, addGerants: 2, setAcheteurs: 50 } }],
  ['sendDocusealSigningEmail', { to: 'a@test.invalid', nom: 'Nom', signingUrl: 'https://s.invalid/3', avenant: { addLabos: '1' } }],
  ['sendDocusealSigningEmail', { to: 'a@test.invalid', nom: 'Nom', signingUrl: 'https://s.invalid/4' }],
  ['sendDocusealSigningEmail', { to: 'a@test.invalid', nom: 'Nom', signingUrl: 'https://s.invalid/5', type: 'resiliation' }],
  // (lot 3, étape 4 : les 2 variantes de sendAvenantEmail sont retirées — fonction remplacée, texte changé)
  ['sendRapportWithAttachment', { to: 'a@test.invalid', clientNom: 'Compte', buffer: Buffer.from('x'), filename: 'r.xlsx', mimeType: 'application/octet-stream', format: 'excel' }],
  ['sendRapportWithAttachment', { to: 'a@test.invalid', clientNom: 'Compte', buffer: Buffer.from('x'), filename: 'r.pdf', mimeType: 'application/pdf', format: 'pdf' }],
  ['sendMessengerInviteEmail', { to: 'a@test.invalid', clientNom: 'Compte', inviteLink: 'https://m.me/x?ref=y', appName: 'LabFlow' }],
];

const envoyer = async (module_, nom, args) => {
  envois.length = 0;
  await module_[nom](args);
  assert.equal(envois.length, 1, `${nom} : un envoi`);
  return envois[0];
};

test('vocabulaire par défaut : chaque email IDENTIQUE à la référence (sujet, HTML, pièces jointes)', { skip: !reference && 'git indisponible' }, async () => {
  for (const [nom, args] of VARIANTES) {
    const avant = await envoyer(reference, nom, { ...args, voc: vocabDefaut });
    const apres = await envoyer(email, nom, { ...args, voc: vocabDefaut });
    assert.deepEqual(apres, avant, `${nom} ${JSON.stringify(args).slice(0, 80)}`);
  }
});

// Texte visible d'un HTML (balises retirées, blancs réduits, entités &amp; rendues).
const texte = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const extrait = (t, re) => { const m = re.exec(t); assert.ok(m, `motif ${re} absent de : ${t.slice(0, 200)}`); return m[1]; };

// Lot 3, étape 4 : email de confirmation d'un ajout de capacité validé (remplace l'email d'avenant).
test('sendSupplementValideEmail (lot 3, étape 4) : sujet, sans pièce jointe ni « avenant », option Acheteurs, échappement', async () => {
  const complet = await envoyer(email, 'sendSupplementValideEmail', {
    ...SUPPLEMENT, nbActivitesAdded: 2, nbLabosAdded: 1, nbGerantsAdded: 1, acheteursCible: 20, voc: vocabDefaut,
  });
  assert.equal(complet.subject, "LabFlow — Ajout de capacité validé : +2 activités · +1 labo · +1 gérant · Option Acheteurs : jusqu'à 20 acheteurs");
  assert.deepEqual(Object.keys(complet).sort(), ['from', 'html', 'subject', 'to'], 'aucune pièce jointe (plus de PDF)');
  assert.equal(complet.to, 'a@test.invalid');
  assert.doesNotMatch(`${complet.subject}\n${complet.html}`, /avenant/i, 'jamais le mot « avenant »');
  assert.doesNotMatch(complet.html, /contrat/i, 'sans engagement : aucune mention de contrat');
  const t = texte(complet.html);
  assert.equal(extrait(t, /Capacité ajoutée (.*?) Votre nouvelle configuration/), complet.subject.split(' : ').slice(1).join(' : '));
  assert.equal(extrait(t, /Votre nouvelle configuration (.*?) Note de/),
    "Activités 3 10.00 DT Labos 2 20.00 DT Gérants 1 5.00 DT Option Acheteurs jusqu'à 20 15.00 DT Mensuel avant l'ajout 30.00 DT/mois Nouveau mensuel de base 50.00 DT/mois");
  assert.match(t, /validée le 01 octobre 2026 \. Elle est active dès maintenant/);
  assert.match(t, /Note de l'équipe LabFlow Note Votre espace/);

  // Option Acheteurs seule (oubliée par l'ancien email d'avenant) : sujet et capacité ajoutée non vides
  const seule = await envoyer(email, 'sendSupplementValideEmail', {
    ...SUPPLEMENT, nbActivitesAdded: 0, nbLabosAdded: 0, nbGerantsAdded: 0, acheteursCible: 50, nbAcheteurs: 50, voc: vocabDefaut,
  });
  assert.equal(seule.subject, "LabFlow — Ajout de capacité validé : Option Acheteurs : jusqu'à 50 acheteurs");
  assert.match(texte(seule.html), /Option Acheteurs jusqu'à 50 15\.00 DT/);

  // Sans labo, sans gérant, sans option, sans note ni ancien mensuel : lignes absentes
  const minimal = await envoyer(email, 'sendSupplementValideEmail', {
    ...SUPPLEMENT, nbActivitesAdded: 1, nbLabos: 0, nbGerants: 0, nbAcheteurs: 0, notesAdmin: null, ancienMensuel: null, voc: vocabDefaut,
  });
  assert.equal(minimal.subject, 'LabFlow — Ajout de capacité validé : +1 activité');
  assert.equal(extrait(texte(minimal.html), /Votre nouvelle configuration (.*?) Votre espace/), 'Activités 3 10.00 DT Nouveau mensuel de base 50.00 DT/mois');

  // Nom et note saisis : échappés dans le HTML (plus d'insertion brute)
  const piege = await envoyer(email, 'sendSupplementValideEmail', {
    ...SUPPLEMENT, nbLabosAdded: 1, nom: 'Léa <b>"&\'</b>', notesAdmin: '<script>alert(1)</script> & « ok »', voc: vocabDefaut,
  });
  assert.ok(piege.html.includes('Bonjour Léa &lt;b&gt;&quot;&amp;&#39;&lt;/b&gt;,'), 'nom échappé');
  assert.ok(piege.html.includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp; « ok »'), 'note échappée');
  assert.ok(!piege.html.includes('<script>') && !piege.html.includes('<b>"'), 'aucune balise saisie dans le HTML');
});

const ATTENDUS = {
  hotellerie: {
    roles: ['responsable de service', 'client professionnel', 'client'],
    demande: "1 service, 2 cuisines centrales, 1 responsable de service, l'option Clients professionnels (palier jusqu'à 20 clients professionnels)",
    sujetSupplement: "LabFlow — Ajout de capacité validé : +2 services · +1 cuisine centrale · +1 responsable de service · Option Clients professionnels : jusqu'à 20 clients professionnels",
    tableau: "Services 3 10.00 DT Cuisines centrales 2 20.00 DT Responsables de service 1 5.00 DT Option Clients professionnels jusqu'à 20 15.00 DT",
    rapport: 'votre stock actuel, vos pertes récentes et vos inventaires',
    messenger: '🏪 Services & cuisines centrales 🧾 Ventes & CA 📦 Stock & seuils 🛒 Approvisionnements 🔄 Livraisons internes 📉 Pertes & inventaires 📚 Référentiel & fournisseurs 💳 Abonnement & produits Filtrez par service, cuisine centrale ou période',
  },
  ceramique: {
    roles: ['responsable de site', 'revendeur', 'client'],
    demande: "1 point de vente, 2 sites de production, 1 responsable de site, l'option Revendeurs (palier jusqu'à 20 revendeurs)",
    sujetSupplement: "LabFlow — Ajout de capacité validé : +2 points de vente · +1 site de production · +1 responsable de site · Option Revendeurs : jusqu'à 20 revendeurs",
    tableau: "Points de vente 3 10.00 DT Sites de production 2 20.00 DT Responsables de site 1 5.00 DT Option Revendeurs jusqu'à 20 15.00 DT",
    rapport: 'votre stock actuel, vos pertes récentes et vos inventaires',
    messenger: '🏪 Points de vente & sites de production 🧾 Ventes & CA 📦 Stock & seuils 🛒 Réceptions 🔄 Livraisons internes 📉 Pertes & inventaires 📚 Référentiel & fournisseurs 💳 Abonnement & produits Filtrez par point de vente, site de production ou période',
  },
  miroir: {
    roles: ['animatrice', 'cliente', 'client'],
    demande: "1 local, 2 usines, 1 animatrice, l'option Clientes (palier jusqu'à 20 clientes)",
    sujetSupplement: "LabFlow — Ajout de capacité validé : +2 locaux · +1 usine · +1 animatrice · Option Clientes : jusqu'à 20 clientes",
    tableau: "Locaux 3 10.00 DT Usines 2 20.00 DT Animatrices 1 5.00 DT Option Clientes jusqu'à 20 15.00 DT",
    rapport: 'votre armoire actuelle, vos abandons récents et vos pesées',
    messenger: '🏪 Locaux & usines 🧾 Encaissements & CA 📦 Armoire & seuils 🛒 Rentrées 🔄 Expéditions 📉 Abandons & pesées 📚 Encyclopédie & enseignes 💳 Abonnement & inventions Filtrez par local, usine ou période',
  },
};

for (const [domaine, att] of Object.entries(ATTENDUS)) {
  test(`${domaine} : termes du domaine dans les 5 emails`, async () => {
    const voc = VOC[domaine];
    const roles = [];
    for (const role of ['gerant', 'acheteur', 'client']) {
      const m = await envoyer(email, 'sendInviteEmail', { to: 'a@test.invalid', nom: 'N', token: 't', role, voc });
      roles.push(extrait(texte(m.html), /en tant que (.*?) \. Cliquez/));
    }
    assert.deepEqual(roles, att.roles);

    const sig = await envoyer(email, 'sendDocusealSigningEmail', { to: 'a@test.invalid', nom: 'N', signingUrl: 'https://s.invalid', voc, avenant: { addActivites: 1, addLabos: 2, addGerants: 1, setAcheteurs: 20 } });
    assert.equal(extrait(texte(sig.html), /ajout de (.*?) , votre avenant/), att.demande);

    // Lot 3, étape 4 : email de confirmation (remplace l'email d'avenant), option Acheteurs comprise
    const sup = await envoyer(email, 'sendSupplementValideEmail', { ...SUPPLEMENT, nbActivitesAdded: 2, nbLabosAdded: 1, nbGerantsAdded: 1, acheteursCible: 20, voc });
    assert.equal(sup.subject, att.sujetSupplement);
    assert.equal(extrait(texte(sup.html), /Capacité ajoutée (.*?) Votre nouvelle configuration/), att.sujetSupplement.split(' : ').slice(1).join(' : '));
    assert.equal(extrait(texte(sup.html), /Votre nouvelle configuration (.*?) Mensuel avant/), att.tableau);
    // Plus aucune forme par défaut (activité, labo, gérant, acheteur), ni « avenant », ni pièce jointe
    assert.doesNotMatch(`${sup.subject} ${texte(sup.html)}`, /(^|[^\p{L}])(activités?|labos?|gérants?|acheteurs?|avenants?)(?![\p{L}])/iu);
    assert.equal(sup.attachments, undefined);

    const rap = await envoyer(email, 'sendRapportWithAttachment', { to: 'a@test.invalid', clientNom: 'C', buffer: Buffer.from('x'), filename: 'r.xlsx', mimeType: 'x', format: 'excel', voc });
    assert.equal(extrait(texte(rap.html), /Il contient (.*?)\./), att.rapport);

    const mes = await envoyer(email, 'sendMessengerInviteEmail', { to: 'a@test.invalid', clientNom: 'C', inviteLink: 'https://m.me/x', appName: 'LabFlow', voc });
    assert.ok(texte(mes.html).includes(att.messenger), texte(mes.html));
  });
}
