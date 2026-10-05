// Lot 3, étape 6 — « Mon entreprise » côté client : PUT /api/entreprise/identite (updateIdentiteClient) et
// GET /api/entreprise (identite + identiteComplete ajoutés par mapEntreprise).
// Sans base de données : le pool est remplacé par un faux qui enregistre chaque requête et tient UNE ligne
// profil_entreprise en mémoire (celle du client 2) ; l'email est bouchonné (authController le charge).
//   node --test test/entrepriseIdentite.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'secret-de-test-entrepriseIdentite-0123456789abcdef0123456789abcdef';

const CONTACT = { nom: 'Contact Test', email: 'contact@example.com' };
const requetes = [];
let ligne = null;        // ligne profil_entreprise du client 2 (null = absente)
let enPanne = false;     // true : toute requête lève (base indisponible)
let nonFigees = 0;       // nombre de factures de vente sans copie figée (étape 8)
let panneFactures = false; // true : la lecture de ce nombre lève (la route doit répondre quand même)

const fauxPool = {
  query: async (sql, params = []) => {
    const texte = String(sql).replace(/\s+/g, ' ').trim();
    requetes.push({ texte, params });
    if (enPanne) throw new Error('base en panne');
    if (texte === 'SELECT nom, email FROM utilisateurs WHERE id = $1') return { rows: [{ ...CONTACT }] };
    const insertion = texte.match(/^INSERT INTO profil_entreprise \(client_id, nom, email, ([a-z_, ]+)\) VALUES /);
    if (insertion) {
      // Même effet que la requête réelle : ligne créée si absente (nom et email du contact), sinon seules les
      // colonnes listées sont réécrites (ON CONFLICT (client_id) DO UPDATE SET <colonnes>).
      const colonnes = insertion[1].split(', ');
      if (!ligne) ligne = { id: 1, client_id: params[0], nom: params[1], email: params[2] };
      colonnes.forEach((c, i) => { ligne[c] = params[i + 3]; });
      return { rows: [], rowCount: 1 };
    }
    if (texte === 'SELECT * FROM profil_entreprise WHERE client_id = $1') {
      return { rows: ligne && ligne.client_id === params[0] ? [{ ...ligne }] : [] };
    }
    // Lecture de getEntreprise ajoutée à l'étape 8 : factures de vente d'avant la copie figée.
    if (texte === 'SELECT COUNT(*)::int AS n FROM factures_acheteur WHERE client_id = $1 AND vendeur_fige_le IS NULL') {
      if (panneFactures) throw new Error('colonne absente');
      return { rows: [{ n: nonFigees }] };
    }
    // Lectures de getEntreprise (formule du compte, domaine du compte) : aucun abonnement, aucun domaine.
    if (texte.startsWith('SELECT ac.formule_activites FROM abonnements a JOIN abonnement_config ac')) return { rows: [{ formule_activites: 'premium' }] };
    if (texte.startsWith('SELECT ac.domaine_id FROM abonnements a JOIN abonnement_config ac')) return { rows: [] };
    if (texte.startsWith("SELECT id FROM domaines_activite WHERE slug = 'restauration'")) return { rows: [] };
    throw new Error(`requête inattendue : ${texte.slice(0, 120)}`);
  },
};
const remplacer = (relatif, exports) => {
  const chemin = require.resolve(relatif);
  require.cache[chemin] = { id: chemin, filename: chemin, loaded: true, exports, children: [], paths: [] };
};
remplacer('../src/config/database', fauxPool);
remplacer('../src/services/emailService', {
  generateInviteToken: () => 'jeton',
  sendInviteEmail: async () => ({ success: true }),
  sendPasswordResetEmail: async () => ({ success: true }),
});

const controleur = require('../src/controllers/entrepriseController');
const { updateIdentiteClient, getEntreprise } = controleur;
const { requireClientOwner, requireEntreprise } = require('../src/middleware/auth');

const CLIENT = { id: 2, role: 'client' };
const reponse = () => ({ code: 200, corps: undefined, status(c) { this.code = c; return this; }, json(b) { this.corps = b; return this; } });
const mettre = async (body, user = CLIENT) => {
  const res = reponse();
  await updateIdentiteClient({ body, user }, res);
  return res;
};
const lire = async (user = CLIENT) => {
  const res = reponse();
  await getEntreprise({ user }, res);
  return res;
};
const LIGNE_ADMIN = () => ({
  id: 1, client_id: 2, nom: 'Contact Test', email: 'contact@example.com', telephone: '20000000',
  raison_sociale: 'Dar Yasmine SARL', nom_commercial: 'Le Jasmin', forme_juridique: 'SARL',
  matricule_fiscal: '1234567A/A/M/000', rne: '1234567A',
  adresse: 'Ancienne adresse', ville: 'Ancienne ville', representant_nom: null, representant_qualite: null,
  meme_activite: false, created_at: '2026-10-01T00:00:00Z',
});
const raz = (l = null) => { requetes.length = 0; ligne = l; enPanne = false; };
const ecritures = () => requetes.filter((r) => /^(INSERT|UPDATE|DELETE)\b/.test(r.texte));
const CLES_IDENTITE = ['raisonSociale', 'nomCommercial', 'formeJuridique', 'matriculeFiscal', 'rne', 'adresse', 'ville', 'representantNom', 'representantQualite'];
const HORS_LISTE_SQL = /matricule_fiscal|raison_sociale|forme_juridique|nom_commercial|\brne\b/;

test('liste blanche : seuls adresse, ville, representantNom et representantQualite sont écrits', async () => {
  raz(LIGNE_ADMIN());
  const res = await mettre({
    adresse: '12 rue de Marseille', ville: '1000 Tunis', representantNom: 'Ali Ben Salah', representantQualite: 'Gérant',
    matriculeFiscal: '7654321B/A/M/000', raisonSociale: 'PIRATE SARL', formeJuridique: 'SA', rne: '9999999Z', nomCommercial: 'Pirate',
    nom: 'PIRATE', email: 'pirate@example.com', client_id: 999, module_acheteurs_actif: true,
  });
  assert.equal(res.code, 200);
  const ecrit = ecritures();
  assert.equal(ecrit.length, 1, 'une seule écriture');
  assert.match(ecrit[0].texte, /^INSERT INTO profil_entreprise \(client_id, nom, email, adresse, ville, representant_nom, representant_qualite\) VALUES \(\$1, \$2, \$3, \$4, \$5, \$6, \$7\) ON CONFLICT \(client_id\) DO UPDATE SET adresse = EXCLUDED\.adresse, ville = EXCLUDED\.ville, representant_nom = EXCLUDED\.representant_nom, representant_qualite = EXCLUDED\.representant_qualite, updated_at = NOW\(\)$/);
  assert.deepEqual(ecrit[0].params, [2, 'Contact Test', 'contact@example.com', '12 rue de Marseille', '1000 Tunis', 'Ali Ben Salah', 'Gérant']);
  // Aucune requête ne nomme une colonne hors liste, aucune ne porte une valeur hors liste.
  for (const r of requetes) {
    assert.equal(HORS_LISTE_SQL.test(r.texte), false, r.texte);
    assert.equal(/module_acheteurs_actif/.test(r.texte), false, r.texte);
    for (const v of ['7654321B/A/M/000', 'PIRATE SARL', 'SA', '9999999Z', 'Pirate', 'PIRATE', 'pirate@example.com', 999, true]) {
      assert.equal(r.params.includes(v), false, `valeur hors liste dans les paramètres : ${v}`);
    }
  }
  // La réponse relit la ligne : l'identité posée par l'équipe LabFlow est intacte.
  assert.deepEqual(Object.keys(res.corps), ['identite', 'identiteComplete']);
  assert.deepEqual(Object.keys(res.corps.identite), CLES_IDENTITE);
  assert.deepEqual(res.corps.identite, {
    raisonSociale: 'Dar Yasmine SARL', nomCommercial: 'Le Jasmin', formeJuridique: 'SARL', matriculeFiscal: '1234567A/A/M/000', rne: '1234567A',
    adresse: '12 rue de Marseille', ville: '1000 Tunis', representantNom: 'Ali Ben Salah', representantQualite: 'Gérant',
  });
  assert.equal(res.corps.identiteComplete, true);
  assert.equal(ligne.nom, 'Contact Test');
  assert.equal(ligne.email, 'contact@example.com');
});

test('champs hors liste seuls (même invalides ou non texte) : 200, ignorés, aucune écriture', async () => {
  for (const body of [
    { matriculeFiscal: '7654321B/A/M/000' },
    { matriculeFiscal: 'B0123452024' },            // matricule invalide : refusé par la route admin, ignoré ici
    { raisonSociale: 'شركة', formeJuridique: 'GIE' }, // arabe et forme inconnue : ignorés aussi
    { rne: 12345, nomCommercial: { a: 1 } },
  ]) {
    raz(LIGNE_ADMIN());
    const res = await mettre(body);
    assert.equal(res.code, 200, JSON.stringify(body));
    assert.equal(ecritures().length, 0, JSON.stringify(body));
    assert.equal(res.corps.identite.matriculeFiscal, '1234567A/A/M/000');
    assert.equal(res.corps.identite.raisonSociale, 'Dar Yasmine SARL');
    for (const r of requetes) assert.equal(HORS_LISTE_SQL.test(r.texte), false, r.texte);
  }
});

test('champ absent : non écrit (la colonne n\'apparaît pas dans la requête)', async () => {
  raz(LIGNE_ADMIN());
  const res = await mettre({ ville: 'Sfax' });
  assert.equal(res.code, 200);
  const ecrit = ecritures();
  assert.equal(ecrit.length, 1);
  assert.match(ecrit[0].texte, /^INSERT INTO profil_entreprise \(client_id, nom, email, ville\) VALUES \(\$1, \$2, \$3, \$4\) ON CONFLICT \(client_id\) DO UPDATE SET ville = EXCLUDED\.ville, updated_at = NOW\(\)$/);
  assert.equal(/adresse|representant/.test(ecrit[0].texte), false);
  assert.deepEqual(ecrit[0].params, [2, 'Contact Test', 'contact@example.com', 'Sfax']);
  assert.equal(res.corps.identite.adresse, 'Ancienne adresse', 'adresse non touchée');
  assert.equal(res.corps.identite.ville, 'Sfax');
});

test('chaîne vide, espaces seuls ou null : NULL en base', async () => {
  for (const vide of ['', '   ', ' ', null]) {
    raz(LIGNE_ADMIN());
    const res = await mettre({ adresse: vide, representantQualite: vide });
    assert.equal(res.code, 200, JSON.stringify(vide));
    const ecrit = ecritures();
    assert.equal(ecrit.length, 1);
    assert.deepEqual(ecrit[0].params, [2, 'Contact Test', 'contact@example.com', null, null], JSON.stringify(vide));
    assert.equal(res.corps.identite.adresse, null);
    assert.equal(res.corps.identiteComplete, false, 'sans adresse, l\'identité n\'est plus complète');
    assert.equal(res.corps.identite.ville, 'Ancienne ville');
  }
});

test('valeur non texte (nombre, objet, tableau, booléen) : 400 « Requête invalide », aucune requête', async () => {
  for (const body of [
    { ville: 1000 },
    { adresse: { rue: '12 rue de Marseille' } },
    { representantNom: ['Ali'] },
    { representantQualite: true },
    { adresse: 'Adresse valide', ville: 0 },   // un seul champ fautif suffit : rien n'est écrit
  ]) {
    raz(LIGNE_ADMIN());
    const res = await mettre(body);
    assert.equal(res.code, 400, JSON.stringify(body));
    assert.deepEqual(res.corps, { message: 'Requête invalide' });
    assert.equal(requetes.length, 0, JSON.stringify(body));
    assert.equal(ligne.adresse, 'Ancienne adresse');
  }
});

test('trop long : 400 avec le libellé du champ, aucune requête ; à la limite : 200', async () => {
  for (const [champ, max, libelle] of [
    ['adresse', 300, 'Adresse'], ['ville', 120, 'Ville'], ['representantNom', 150, 'Représentant'], ['representantQualite', 80, 'Qualité du représentant'],
  ]) {
    raz(LIGNE_ADMIN());
    let res = await mettre({ [champ]: 'x'.repeat(max + 1) });
    assert.equal(res.code, 400, `${champ} à ${max + 1}`);
    assert.equal(res.corps.message, `${libelle} : ${max} caractères au maximum`);
    assert.deepEqual(res.corps.erreurs, [{ champ, message: `${libelle} : ${max} caractères au maximum` }]);
    assert.equal(requetes.length, 0);
    res = await mettre({ [champ]: 'x'.repeat(max) });
    assert.equal(res.code, 200, `${champ} à ${max}`);
    assert.equal(res.corps.identite[champ], 'x'.repeat(max));
  }
});

test('arabe ou émoji : 400 lisible, aucune requête, même si un autre champ est valide', async () => {
  for (const body of [
    { adresse: 'شارع الحبيب بورقيبة' },
    { ville: 'Tunis 🌴' },
    { representantNom: 'علي بن صالح' },
    { adresse: '12 rue de Marseille', representantQualite: 'Gérant ✅' },
  ]) {
    raz(LIGNE_ADMIN());
    const res = await mettre(body);
    assert.equal(res.code, 400, JSON.stringify(body));
    assert.match(res.corps.message, /caractères latins seulement/);
    assert.notEqual(res.corps.message, 'Erreur serveur');
    assert.ok(Array.isArray(res.corps.erreurs) && res.corps.erreurs.length === 1);
    assert.equal(requetes.length, 0, JSON.stringify(body));
    assert.equal(ligne.adresse, 'Ancienne adresse');
  }
});

test('corps vide ou absent : 200, aucune écriture, ligne absente non créée', async () => {
  for (const body of [{}, undefined, null]) {
    raz(LIGNE_ADMIN());
    let res = await mettre(body);
    assert.equal(res.code, 200);
    assert.equal(ecritures().length, 0);
    assert.deepEqual(requetes.map((r) => r.texte), ['SELECT * FROM profil_entreprise WHERE client_id = $1'], 'une seule requête : la relecture');
    assert.equal(res.corps.identite.adresse, 'Ancienne adresse');
    assert.equal(res.corps.identiteComplete, true);

    raz(null); // client sans ligne profil_entreprise
    res = await mettre(body);
    assert.equal(res.code, 200);
    assert.equal(ecritures().length, 0);
    assert.equal(ligne, null, 'aucune ligne créée');
    assert.deepEqual(res.corps, { identite: Object.fromEntries(CLES_IDENTITE.map((k) => [k, null])), identiteComplete: false });
  }
});

test('texte nettoyé avant l\'écriture : espaces multiples, espace insécable, accents décomposés', async () => {
  raz(LIGNE_ADMIN());
  const res = await mettre({ adresse: '  12   rue de   Marseille ', ville: '1000 Tunis', representantNom: 'Ali\tBen\nSalah', representantQualite: 'Gérant' });
  assert.equal(res.code, 200);
  assert.deepEqual(ecritures()[0].params.slice(3), ['12 rue de Marseille', '1000 Tunis', 'Ali Ben Salah', 'Gérant']);
  assert.equal(res.corps.identite.adresse, '12 rue de Marseille');
});

test('client sans ligne profil_entreprise : ligne créée avec le nom et l\'email du contact, sous req.user.id', async () => {
  raz(null);
  const res = await mettre({ adresse: '5 avenue Habib Bourguiba', ville: 'Sousse' });
  assert.equal(res.code, 200);
  assert.equal(requetes.length, 3, 'lecture du contact, écriture, relecture');
  assert.equal(requetes[0].texte, 'SELECT nom, email FROM utilisateurs WHERE id = $1');
  assert.match(requetes[1].texte, /^INSERT INTO profil_entreprise \(client_id, nom, email, adresse, ville\) /);
  assert.equal(requetes[2].texte, 'SELECT * FROM profil_entreprise WHERE client_id = $1');
  assert.deepEqual(requetes[0].params, [2]);
  assert.deepEqual(requetes[1].params, [2, 'Contact Test', 'contact@example.com', '5 avenue Habib Bourguiba', 'Sousse']);
  assert.deepEqual(requetes[2].params, [2]);
  assert.equal(ligne.nom, 'Contact Test');
  assert.equal(ligne.email, 'contact@example.com');
  assert.equal(res.corps.identite.adresse, '5 avenue Habib Bourguiba');
  assert.equal(res.corps.identiteComplete, false, 'ni raison sociale ni matricule : incomplète');
});

test('base en panne : 500 « Erreur serveur » (jamais d\'exception non rattrapée)', async () => {
  raz(LIGNE_ADMIN());
  enPanne = true;
  const erreurOrigine = console.error;
  console.error = () => {};
  try {
    const res = await mettre({ ville: 'Sfax' });
    assert.equal(res.code, 500);
    assert.deepEqual(res.corps, { message: 'Erreur serveur' });
  } finally {
    console.error = erreurOrigine;
  }
});

test('GET /api/entreprise : identite (9 champs) et identiteComplete ajoutés, champs existants intacts', async () => {
  raz(LIGNE_ADMIN());
  let res = await lire();
  assert.equal(res.code, 200);
  assert.deepEqual(Object.keys(res.corps.identite), CLES_IDENTITE);
  assert.equal(res.corps.identite.raisonSociale, 'Dar Yasmine SARL');
  assert.equal(res.corps.identite.matriculeFiscal, '1234567A/A/M/000');
  assert.equal(res.corps.identiteComplete, true);
  // Champs d'avant l'étape 6 : mêmes clés, même ordre, mêmes valeurs ; identite et identiteComplete viennent après.
  assert.deepEqual(Object.keys(res.corps), [
    'id', 'clientId', 'nom', 'email', 'telephone', 'adresse', 'memeActivite',
    'module_vente_actif', 'module_vente_activated_at', 'module_acheteurs_actif', 'module_acheteurs_activated_at', 'createdAt',
    'identite', 'identiteComplete', 'facturesNonFigees', 'formule_activites', 'domaine',
  ]);
  assert.equal(res.corps.facturesNonFigees, 0, 'aucune facture de vente sans copie figée');
  assert.equal(res.corps.id, 1);
  assert.equal(res.corps.clientId, 2);
  assert.equal(res.corps.nom, 'Contact Test');
  assert.equal(res.corps.adresse, 'Ancienne adresse');
  assert.equal(res.corps.formule_activites, 'premium');
  assert.equal(res.corps.domaine, null);
  assert.equal(ecritures().length, 0);

  // Identité incomplète : il manque la ville.
  raz({ ...LIGNE_ADMIN(), ville: null });
  res = await lire();
  assert.equal(res.corps.identiteComplete, false);
  assert.equal(res.corps.identite.ville, null);

  // Gérant : il lit la fiche de son compte parent.
  raz(LIGNE_ADMIN());
  res = await lire({ id: 7, role: 'gerant', gerant_parent_id: 2 });
  assert.equal(res.code, 200);
  assert.equal(res.corps.clientId, 2);
  assert.equal(res.corps.identite.raisonSociale, 'Dar Yasmine SARL');
  assert.deepEqual(requetes.find((r) => r.texte === 'SELECT * FROM profil_entreprise WHERE client_id = $1').params, [2]);

  // Étape 8 : des factures de vente d'avant la copie figée lisent encore la fiche — leur nombre, demandé pour le
  // compte parent ; si cette lecture accessoire échoue, la route répond quand même (0).
  nonFigees = 8;
  res = await lire({ id: 7, role: 'gerant', gerant_parent_id: 2 });
  assert.equal(res.corps.facturesNonFigees, 8);
  assert.deepEqual(requetes.find((r) => r.texte.includes('FROM factures_acheteur')).params, [2]);
  panneFactures = true;
  const avertir = console.warn;
  console.warn = () => {};
  try {
    res = await lire();
  } finally {
    console.warn = avertir;
    panneFactures = false;
    nonFigees = 0;
  }
  assert.equal(res.code, 200, 'lecture accessoire en panne : la route répond');
  assert.equal(res.corps.facturesNonFigees, 0);
  assert.equal(res.corps.identite.raisonSociale, 'Dar Yasmine SARL');

  // Aucune ligne : null (comme avant l'étape 6).
  raz(null);
  res = await lire();
  assert.equal(res.code, 200);
  assert.equal(res.corps, null);
});

test('gardes des routes : écriture réservée au compte client ; l\'ancienne PUT /api/entreprise n\'existe plus', () => {
  const passe = (garde, role) => { let ok = false; const res = { status() { return this; }, json() { return this; } }; garde({ user: { role } }, res, () => { ok = true; }); return ok; };
  assert.equal(passe(requireClientOwner, 'client'), true);
  for (const role of ['gerant', 'super_admin', 'boss', 'acheteur']) assert.equal(passe(requireClientOwner, role), false, role);
  assert.equal(passe(requireEntreprise, 'gerant'), true, 'la lecture reste ouverte au gérant');

  const lf = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');
  const routes = lf('src/routes/entreprise.js');
  assert.ok(routes.includes("router.put('/identite', authenticate, requireClientOwner, updateIdentiteClient);"), 'route du client propriétaire');
  assert.ok(routes.includes("router.get('/', authenticate, requireEntreprise, getEntreprise);"), 'lecture inchangée');
  assert.equal(/router\.(put|post|patch|delete)\('\/'/.test(routes), false, 'plus aucune écriture sur /api/entreprise');
  assert.equal(/upsertEntreprise/.test(routes), false);
  assert.equal('upsertEntreprise' in controleur, false, 'upsertEntreprise n\'est plus exportée');
  assert.equal(/upsertEntreprise/.test(lf('src/controllers/entrepriseController.js')), false);
  assert.ok(lf('src/routes/admin.js').includes("router.put('/clients/:id/identite', authenticate, requireSuperAdmin, updateIdentite);"), 'route admin inchangée');
});
