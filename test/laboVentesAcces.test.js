// Ventes Labo (GET /api/labo-ventes, /stats, /export-excel — aussi montées sous /api/labo/ventes) :
// le laboId vient de l'URL ; le labo doit appartenir au compte et, pour un gérant, être dans son
// périmètre. Sans base de données : le pool est remplacé par un faux qui enregistre chaque requête.
//   node --test test/laboVentesAcces.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'secret-de-test-laboVentes-0123456789abcdef0123456789abcdef';

// Labos connus : id → client propriétaire.
const LABOS = new Map([[21, 2], [22, 2], [99, 3]]);
const requetes = [];
const fauxPool = {
  query: async (sql, params = []) => {
    const texte = String(sql).replace(/\s+/g, ' ').trim();
    requetes.push(texte);
    if (texte.includes('FROM labos l JOIN profil_entreprise pe')) {
      const client = LABOS.get(Number(params[0]));
      return { rows: client ? [{ client_id: client }] : [] };
    }
    if (texte.includes('FROM labo_transfers lt')) {
      if (texte.includes('valeur_mois')) return { rows: [{ valeur_mois: 0, valeur_semaine: 0, nb_transferts_mois: 0 }] };
      return { rows: [] };
    }
    throw new Error(`requête inattendue : ${texte.slice(0, 120)}`);
  },
};
const cheminPool = require.resolve('../src/config/database');
require.cache[cheminPool] = { id: cheminPool, filename: cheminPool, loaded: true, exports: fauxPool, children: [], paths: [] };

const { laboVentes, laboVentesStats, exportLaboVentesExcel } = require('../src/controllers/ventesController');

const CLIENT = { id: 2, role: 'client', gerant_parent_id: null };
const GERANT = { id: 7, role: 'gerant', gerant_parent_id: 2, gerantLaboIds: [21], gerantActiviteIds: [] };

// Faux res : flux (l'export écrit le classeur dedans) + status/json/setHeader.
const fauxRes = () => {
  const res = new PassThrough();
  res.resume();
  res.statusCode = 200;
  res.corps = null;
  res.entetes = {};
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (corps) => { res.corps = corps; return res; };
  res.setHeader = (k, v) => { res.entetes[k.toLowerCase()] = v; };
  return res;
};

const appeler = async (handler, user, laboId) => {
  requetes.length = 0;
  const res = fauxRes();
  await handler({ user, query: { laboId: laboId == null ? undefined : String(laboId) } }, res);
  return res;
};

const lectureTransferts = () => requetes.some((t) => t.includes('FROM labo_transfers'));

const HANDLERS = { laboVentes, laboVentesStats, exportLaboVentesExcel };

for (const [nom, handler] of Object.entries(HANDLERS)) {
  test(`${nom} : labo d'un autre client → 403, aucune lecture des transferts`, async () => {
    const res = await appeler(handler, CLIENT, 99);
    assert.equal(res.statusCode, 403);
    assert.equal(lectureTransferts(), false);
  });

  test(`${nom} : labo inconnu → 403`, async () => {
    const res = await appeler(handler, CLIENT, 12345);
    assert.equal(res.statusCode, 403);
    assert.equal(lectureTransferts(), false);
  });

  test(`${nom} : laboId non entier → 400, aucune requête`, async () => {
    const res = await appeler(handler, CLIENT, '21 OR 1=1');
    assert.equal(res.statusCode, 400);
    assert.equal(requetes.length, 0);
  });

  test(`${nom} : labo du compte → accepté`, async () => {
    const res = await appeler(handler, CLIENT, 22);
    assert.equal(res.statusCode, 200);
    assert.equal(lectureTransferts(), true);
  });

  test(`${nom} : gérant — labo de son périmètre accepté, autre labo du compte refusé`, async () => {
    const ok = await appeler(handler, GERANT, 21);
    assert.equal(ok.statusCode, 200);
    assert.equal(lectureTransferts(), true);
    const refuse = await appeler(handler, GERANT, 22);
    assert.equal(refuse.statusCode, 403);
    assert.equal(lectureTransferts(), false);
  });
}

test('laboVentes : sans laboId → 400 (inchangé)', async () => {
  const res = await appeler(laboVentes, CLIENT, null);
  assert.equal(res.statusCode, 400);
});
