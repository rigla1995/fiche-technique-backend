// Lot 2b, B2 — les 5 emails à terme écrivent leurs termes par appels voc (spec docs/lot-2b-spec.md §8.1).
//   node --test test/B2-emails.test.js
//
// 1. Vocabulaire par défaut : sujet, HTML et pièces jointes IDENTIQUES à ceux de la référence (emailService.js
//    au commit du socle, 62288e4), pour chaque fonction et plusieurs variantes (rôles, pluriels, lignes absentes).
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

const AVENANT = {
  to: 'a@test.invalid', nom: 'Nom', notesAdmin: 'Note', nbActivites: 3, nbLabos: 2, nbGerants: 1,
  activiteCost: 10, laboCost: 20, gerantCost: 5, newMensuel: 35, promoApplied: true, effectifMensuel: 30,
  dateAvenant: '2026-10-01T10:00:00.000Z', pdfBase64: 'JVBERi0=',
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
  ['sendAvenantEmail', { ...AVENANT, nbActivitesAdded: 1, nbLabosAdded: 2, nbGerantsAdded: 1 }],
  ['sendAvenantEmail', { ...AVENANT, nbActivitesAdded: 2, nbLabosAdded: 1, nbGerantsAdded: 0, nbLabos: 0, nbGerants: 0, notesAdmin: null, promoApplied: false }],
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

const ATTENDUS = {
  hotellerie: {
    roles: ['responsable de service', 'client professionnel', 'client'],
    demande: "1 service, 2 cuisines centrales, 1 responsable de service, l'option Clients professionnels (palier jusqu'à 20 clients professionnels)",
    sujetAvenant: 'LabFlow — Avenant validé : +2 services · +1 cuisine centrale · +1 responsable de service',
    tableau: 'Services 3 10.00 DT Cuisines centrales 2 20.00 DT Responsables de service 1 5.00 DT',
    rapport: 'votre stock actuel, vos pertes récentes et vos inventaires',
    messenger: '🏪 Services & cuisines centrales 🧾 Ventes & CA 📦 Stock & seuils 🛒 Approvisionnements 🔄 Livraisons internes 📉 Pertes & inventaires 📚 Référentiel & fournisseurs 💳 Abonnement & produits Filtrez par service, cuisine centrale ou période',
  },
  ceramique: {
    roles: ['responsable de site', 'revendeur', 'client'],
    demande: "1 point de vente, 2 sites de production, 1 responsable de site, l'option Revendeurs (palier jusqu'à 20 revendeurs)",
    sujetAvenant: 'LabFlow — Avenant validé : +2 points de vente · +1 site de production · +1 responsable de site',
    tableau: 'Points de vente 3 10.00 DT Sites de production 2 20.00 DT Responsables de site 1 5.00 DT',
    rapport: 'votre stock actuel, vos pertes récentes et vos inventaires',
    messenger: '🏪 Points de vente & sites de production 🧾 Ventes & CA 📦 Stock & seuils 🛒 Réceptions 🔄 Livraisons internes 📉 Pertes & inventaires 📚 Référentiel & fournisseurs 💳 Abonnement & produits Filtrez par point de vente, site de production ou période',
  },
  miroir: {
    roles: ['animatrice', 'cliente', 'client'],
    demande: "1 local, 2 usines, 1 animatrice, l'option Clientes (palier jusqu'à 20 clientes)",
    sujetAvenant: 'LabFlow — Avenant validé : +2 locaux · +1 usine · +1 animatrice',
    tableau: 'Locaux 3 10.00 DT Usines 2 20.00 DT Animatrices 1 5.00 DT',
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

    const av = await envoyer(email, 'sendAvenantEmail', { ...AVENANT, nbActivitesAdded: 2, nbLabosAdded: 1, nbGerantsAdded: 1, voc });
    assert.equal(av.subject, att.sujetAvenant);
    assert.equal(extrait(texte(av.html), /Capacité ajoutée (.*?) Votre configuration/), att.sujetAvenant.split(' : ')[1]);
    assert.equal(extrait(texte(av.html), /après avenant (.*?) Nouveau mensuel/), att.tableau);

    const rap = await envoyer(email, 'sendRapportWithAttachment', { to: 'a@test.invalid', clientNom: 'C', buffer: Buffer.from('x'), filename: 'r.xlsx', mimeType: 'x', format: 'excel', voc });
    assert.equal(extrait(texte(rap.html), /Il contient (.*?)\./), att.rapport);

    const mes = await envoyer(email, 'sendMessengerInviteEmail', { to: 'a@test.invalid', clientNom: 'C', inviteLink: 'https://m.me/x', appName: 'LabFlow', voc });
    assert.ok(texte(mes.html).includes(att.messenger), texte(mes.html));
  });
}
