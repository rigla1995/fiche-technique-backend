// LabFlow Compta, étape S2a (labflow-reprise/achats-compta/SPEC-SOCLE.md, D15) : chaque fiche du manuel appartient à
// un produit. GET /api/manuel sert les fiches de LabFlow par défaut (aucun changement pour les lecteurs de app.) et,
// avec ?produit=compta, celles de LabFlow Compta, en vocabulaire comptable fixe (ni domaine, ni variante, ni filtre de
// configuration). Produit hors de la liste fermée : 400. Les fiches de LabFlow Compta ne sont jamais « sans balises ».
// Sans base de données : le pool est remplacé.
//   node --test test/comptaS2a.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const FICHES = [
  { id: 1, slug: 'stock-labo', titre: '[[Nom:stock]] [[Nom:labo]]', icone: '📦', partie: 'Gestion', ordre: 50,
    contenu: '## [[Nom:stock]] du [[nom:labo]]', contenu_defaut: '## [[Nom:stock]] du [[nom:labo]]', mots_cles: 'stock, labo',
    ecran: '/client/stock', visible_gerant: true, actif: true, produit: 'labflow', updated_at: '2026-10-06T00:00:00.000Z' },
  { id: 2, slug: 'compta-bienvenue', titre: 'Bienvenue dans LabFlow Compta', icone: '📒', partie: 'LabFlow Compta', ordre: 1000,
    contenu: '## Vos fournisseurs et vos clients', contenu_defaut: '## Vos fournisseurs et vos clients', mots_cles: 'compta, fournisseur',
    ecran: '/', visible_gerant: true, actif: true, produit: 'compta', updated_at: '2026-10-06T00:00:00.000Z' },
];

const requetes = [];
const fauxPool = {
  query: async (sql, params = []) => {
    const texte = String(sql).replace(/\s+/g, ' ').trim();
    requetes.push({ texte, params });
    if (texte.includes('FROM manuel_sections s LEFT JOIN manuel_sections_domaine d')) {
      const produit = /AND s\.produit = '(labflow|compta)'/.exec(texte)[1];
      const gerant = texte.includes('AND s.visible_gerant = true');
      const rows = FICHES.filter((f) => f.actif && f.produit === produit && (!gerant || f.visible_gerant))
        .map(({ contenu_defaut, produit: _p, ...f }) => f);
      return { rows };
    }
    if (texte.startsWith('SELECT *, (contenu_defaut IS NOT NULL AND contenu <> contenu_defaut) AS modifie')) {
      return { rows: FICHES.map((f) => ({ ...f, modifie: false })) };
    }
    // Modification : une balise dans une fiche Compta viole la contrainte de la migration 201 (simulée ici).
    if (texte.startsWith('UPDATE manuel_sections SET')) {
      if (params.some((p) => typeof p === 'string' && p.includes('[['))) {
        throw Object.assign(new Error('violation'), { code: '23514', constraint: 'manuel_sections_compta_sans_balise' });
      }
      const f = FICHES.find((x) => x.id === params[params.length - 1]);
      return { rows: f ? [{ ...f, produit: params.includes('labflow') ? 'labflow' : params.includes('compta') ? 'compta' : f.produit }] : [] };
    }
    if (texte === 'SELECT id, produit FROM manuel_sections WHERE id = $1') {
      return { rows: FICHES.filter((f) => f.id === params[0]).map((f) => ({ id: f.id, produit: f.produit })) };
    }
    if (texte === 'SELECT id, lexique FROM domaines_activite WHERE slug = $1') return { rows: [{ id: 3, lexique: {} }] };
    if (texte === 'SELECT * FROM manuel_sections_domaine WHERE section_id = $1 AND domaine_slug = $2') return { rows: [] };
    if (texte === 'SELECT titre, contenu, mots_cles FROM ai_knowledge_base WHERE actif = true ORDER BY id') return { rows: [] };
    if (texte.startsWith('INSERT INTO manuel_sections')) {
      return { rows: [{ id: 9, slug: params[0], titre: params[1], icone: params[2], partie: params[3], ordre: params[4] ?? 0,
        contenu: params[5], mots_cles: params[6], ecran: params[7], visible_gerant: params[8] ?? true, actif: params[9] ?? true,
        produit: params[10], updated_at: '2026-10-06T00:00:00.000Z' }] };
    }
    throw new Error(`requête inattendue : ${texte.slice(0, 120)}`);
  },
};
const remplacer = (relatif, exports) => {
  const chemin = require.resolve(relatif);
  require.cache[chemin] = { id: chemin, filename: chemin, loaded: true, exports, children: [], paths: [] };
};
remplacer('../src/config/database', fauxPool);

const manuel = require('../src/controllers/manuelController');
const M = require('../src/utils/manuelRendu');
const { vocabDefaut } = require('../src/utils/vocab');

const reponse = () => ({ code: 200, corps: null, status(c) { this.code = c; return this; }, json(b) { this.corps = b; return this; } });
const appeler = async (fn, req) => { const res = reponse(); await fn(req, res); return res; };
// Un vocabulaire qui n'est PAS celui par défaut : s'il était employé pour une fiche de LabFlow Compta, le serveur lirait
// le profil du domaine (requête inattendue ici) et rendrait la fiche dans les mots du compte.
const vocDomaine = { ...vocabDefaut, estDefaut: false };
const lecteur = (role, query, extra = {}) => ({ user: { id: 7, role, domaine_id: 3 }, voc: vocabDefaut, query, ...extra });

test('requeteManuel : produit LabFlow par défaut, LabFlow Compta sur demande, liste fermée', () => {
  assert.match(M.requeteManuel(null).text, /WHERE s\.actif = true AND s\.produit = 'labflow'/);
  assert.match(M.requeteManuel(null, { produit: 'compta' }).text, /WHERE s\.actif = true AND s\.produit = 'compta'/);
  assert.match(M.requeteManuel(null, { produit: 'compta', gerant: true }).text, /s\.produit = 'compta' AND s\.visible_gerant = true/);
  assert.match(M.requeteManuel(null, { recherche: true }).text, /s\.produit = 'labflow'/, 'l\'assistant de LabFlow ne cite jamais LabFlow Compta');
  for (const p of ['COMPTA', '', 'labflow\' OR 1=1 --', null, 1]) assert.throws(() => M.requeteManuel(null, { produit: p }), /manuel inconnu/);
});

test('GET /api/manuel sans paramètre : les seules fiches de LabFlow, comme avant l\'étape', async () => {
  requetes.length = 0;
  const res = await appeler(manuel.listPublic, lecteur('super_admin', {}));
  assert.equal(res.code, 200);
  assert.deepEqual(res.corps.map((s) => s.slug), ['stock-labo']);
  assert.ok(!('produit' in res.corps[0]), 'la réponse publique garde sa forme (empreintes de l\'oracle)');
  assert.equal(requetes.length, 1);
});

test('GET /api/manuel?produit=compta : les seules fiches de LabFlow Compta, sans domaine, sans variante, texte tel quel', async () => {
  for (const role of ['client', 'gerant', 'super_admin', 'acheteur']) {
    requetes.length = 0;
    const res = await appeler(manuel.listPublic, lecteur(role, { produit: 'compta' }, { voc: vocDomaine }));
    assert.equal(res.code, 200, role);
    assert.deepEqual(res.corps.map((s) => s.slug), ['compta-bienvenue'], role);
    assert.equal(res.corps[0].contenu, '## Vos fournisseurs et vos clients', `${role} : vocabulaire comptable fixe`);
    assert.equal(res.corps[0].motsCles, 'compta, fournisseur', `${role} : mots-clés jamais enrichis`);
    assert.equal(requetes.length, 1, `${role} : ni profil de domaine, ni contexte de configuration`);
    assert.deepEqual(requetes[0].params, [null], `${role} : aucune variante de domaine`);
  }
});

test('GET /api/manuel : produit hors de la liste fermée → 400, sans lecture de la base', async () => {
  for (const produit of ['COMPTA', 'app', '', ['compta', 'labflow'], { $ne: 1 }]) {
    requetes.length = 0;
    const res = await appeler(manuel.listPublic, lecteur('client', { produit }));
    assert.equal(res.code, 400, JSON.stringify(produit));
    assert.equal(requetes.length, 0);
  }
});

test('admin : produit de chaque fiche ; une fiche de LabFlow Compta n\'est jamais « sans balises »', async () => {
  const res = await appeler(manuel.adminList, {});
  const par = Object.fromEntries(res.corps.map((s) => [s.slug, s]));
  assert.equal(par['stock-labo'].produit, 'labflow');
  assert.equal(par['compta-bienvenue'].produit, 'compta');
  assert.equal(par['compta-bienvenue'].sansBalises, false, '« fournisseurs » en clair : vocabulaire comptable fixe');
  assert.deepEqual(Object.keys(par['compta-bienvenue']).slice(-3), ['produit', 'modifie', 'sansBalises']);
});

test('admin : création et modification acceptent le produit (liste fermée)', async () => {
  const corps = { slug: 'compta-test', titre: 'Essai', partie: 'LabFlow Compta', contenu: 'Texte', produit: 'compta' };
  let res = await appeler(manuel.create, { body: corps });
  assert.equal(res.code, 201);
  assert.equal(res.corps.produit, 'compta');
  res = await appeler(manuel.create, { body: { ...corps, produit: undefined } });
  assert.equal(res.corps.produit, 'labflow', 'LabFlow par défaut');
  res = await appeler(manuel.create, { body: { ...corps, produit: 'autre' } });
  assert.equal(res.code, 400);
  res = await appeler(manuel.update, { params: { id: '2' }, body: { produit: 'autre' } });
  assert.equal(res.code, 400);
});

test('une fiche de LabFlow Compta ne porte jamais de balise (création contrôlée, contrainte de la base en modification)', async () => {
  requetes.length = 0;
  let res = await appeler(manuel.create, { body: { slug: 'compta-x', titre: 'Essai', partie: 'LabFlow Compta', contenu: 'Le [[nom:stock]]', produit: 'compta' } });
  assert.equal(res.code, 400);
  assert.equal(res.corps.code, 'BALISE_INTERDITE');
  assert.equal(requetes.length, 0, 'refus avant toute écriture');
  res = await appeler(manuel.update, { params: { id: '2' }, body: { contenu: 'Le [[nom:stock]]' } });
  assert.equal(res.code, 400, 'contrainte manuel_sections_compta_sans_balise → 400, jamais 500');
  assert.equal(res.corps.code, 'BALISE_INTERDITE');
  res = await appeler(manuel.update, { params: { id: '2' }, body: { produit: 'labflow' } });
  assert.equal(res.code, 200);
  assert.equal(res.corps.produit, 'labflow', 'changement de produit accepté');
});

test('une fiche de LabFlow Compta n\'a pas de variante par domaine', async () => {
  const res = await appeler(manuel.putVariante, { params: { id: '2', domaineSlug: 'hotellerie' }, body: { contenu: 'Variante', statut: 'valide' } });
  assert.equal(res.code, 400);
  assert.equal(res.corps.code, 'VARIANTE_COMPTA');
});

test('assistant de LabFlow : la recherche dans le manuel ne lit jamais les fiches de LabFlow Compta', async () => {
  const outils = require('../src/services/aiToolHandlers');
  requetes.length = 0;
  const r = await outils.executeToolCall(null, 'search_knowledge_base', { query: 'bienvenue comptabilité cabinet' }, vocabDefaut);
  const lecture = requetes.find((q) => q.texte.includes('FROM manuel_sections s'));
  assert.match(lecture.texte, /s\.produit = 'labflow'/);
  assert.ok(!JSON.stringify(r).includes('LabFlow Compta'), JSON.stringify(r));
});

test('contrôle des balises au démarrage : les seules fiches de LabFlow', async () => {
  const lues = [];
  await M.controlerBalisesAuDemarrage({ query: async (sql) => { lues.push(String(sql).replace(/\s+/g, ' ')); return { rows: [] }; } }, []);
  assert.ok(lues.some((s) => /FROM manuel_sections WHERE actif = true AND produit = 'labflow'/.test(s)));
});

test('migration 201 : colonne produit (LabFlow par défaut, liste fermée), première fiche de LabFlow Compta', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '201_manuel_produit.sql'), 'utf8');
  assert.ok(!sql.includes('\r'), 'migration en LF (.gitattributes)');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS produit VARCHAR\(10\) NOT NULL DEFAULT 'labflow'/);
  assert.match(sql, /CHECK \(produit IN \('labflow', 'compta'\)\)/);
  assert.match(sql, /ADD CONSTRAINT manuel_sections_compta_sans_balise CHECK \(\n {2}produit <> 'compta'\n {2}OR \(strpos\(titre, '\[\['\) = 0 AND strpos\(partie, '\[\['\) = 0 AND strpos\(contenu, '\[\['\) = 0\n/);
  assert.match(sql, /SELECT 'compta-bienvenue', 'Bienvenue dans LabFlow Compta', '📒', 'LabFlow Compta', 1000, fiche\.contenu, fiche\.contenu,/);
  assert.match(sql, /, 'compta'\n {2}FROM fiche\nON CONFLICT \(slug\) DO NOTHING;/);
  const contenu = /\$compta_bienvenue\$([\s\S]*)\$compta_bienvenue\$/.exec(sql)[1];
  assert.ok(!contenu.includes('[['), 'jamais de balise');
  assert.match(contenu, /^## 📒 Bienvenue dans LabFlow Compta\n/);
  assert.ok(contenu.includes('**?**'), 'le bouton d\'aide est décrit');
});
