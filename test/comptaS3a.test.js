// LabFlow Compta, étape S3a (labflow-reprise/achats-compta/PLAN-S3.md, SPEC-SOCLE D12) : passage d'une adresse à
// l'autre par un code à usage unique. Tests sans base : formes refusées avant toute requête, code haché, migration,
// garde d'écriture et ouverture de session partagée avec la connexion.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { hacher, emettre, echanger, DUREE_SECONDES } = require('../src/compta/passage');
const auth = require('../src/controllers/authController');

const reponse = () => {
  const res = { statut: 200, corps: null };
  res.status = (s) => { res.statut = s; return res; };
  res.json = (c) => { res.corps = c; return res; };
  return res;
};

test('code de passage : haché en SHA-256 (64 caractères hexadécimaux), jamais conservé en clair ; 60 secondes', () => {
  const h = hacher('abc');
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(h, hacher('abc'));
  assert.notEqual(h, hacher('abd'));
  assert.equal(DUREE_SECONDES, 60);
});

test('émission : destination en liste fermée, refusée avant toute requête', async () => {
  for (const destination of [undefined, 'admin', 'APP', '']) {
    const res = reponse();
    await emettre({ body: { destination }, user: { id: 1, role: 'client' } }, res);
    assert.equal(res.statut, 400, String(destination));
  }
});

test('échange : un code de forme invalide est refusé avant toute requête (400 PASSAGE_INVALIDE)', async () => {
  for (const code of [undefined, '', 'court', 'a'.repeat(200), 'abc def ghi jkl mno pqr stu vwx yz0 123 456', '../../etc/passwd'.padEnd(43, 'x')]) {
    const res = reponse();
    await echanger({ body: { code, produit: 'compta' } }, res);
    assert.equal(res.statut, 400, String(code));
    assert.equal(res.corps.code, 'PASSAGE_INVALIDE');
  }
});

test('connexion et passage ouvrent la session par la même fonction (réponse identique, compte bloqué refusé)', () => {
  assert.equal(typeof auth.repondreSession, 'function');
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'controllers', 'authController.js'), 'utf8').replace(/\r\n/g, '\n');
  assert.ok(src.includes('    return await repondreSession(res, utilisateur);\n  } catch (err) {'), 'login délègue l\'ouverture de session (await : une erreur arrive dans le catch)');
  assert.ok(src.includes("return res.status(403).json({ message: 'account_blocked' });"), 'compte bloqué toujours refusé');
});

// S3b (D4) : l'exemption du seul passage est devenue celle de tout /api/compta, dont chaque route d'écriture porte sa
// garde par comptabilité (test/comptaS3b.test.js) ; le passage reste sans garde.
test('garde d\'écriture : le passage est permis à un compte en lecture seule, la garde globale reste en place', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
  const exemption = app.indexOf("if (req.path === '/compta' || req.path.startsWith('/compta/')) return next();");
  const garde = app.indexOf('if (!jetonPresent(req)) return next();\n  authenticate(req, res, () => requireWriteAccess(req, res, next));');
  assert.ok(exemption > 0 && garde > exemption, 'exemption avant la garde');
});

test('migration 204 : table des codes (hachés, destination fermée, expiration, usage), manuel Compta', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '204_compta_passage.sql'), 'utf8');
  assert.ok(!sql.includes('\r'), 'fins de ligne LF');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS compta\.sessions_passage/);
  assert.match(sql, /code_hache\s+CHAR\(64\) NOT NULL UNIQUE/);
  assert.match(sql, /CHECK \(destination IN \('app', 'compta'\)\)/);
  assert.match(sql, /REFERENCES utilisateurs\(id\) ON DELETE CASCADE/);
  assert.match(sql, /session_iat\s+BIGINT NOT NULL,\n\s+session_exp\s+BIGINT NOT NULL/, 'dates de la session d\'origine');
  assert.match(sql, /WHERE slug = 'compta-bienvenue' AND produit = 'compta' AND position\('### Passer de LabFlow' in contenu_defaut\) = 0;/);
  assert.match(sql, /WHERE slug = 'compta-ma-comptabilite' AND produit = 'compta';/);
  assert.ok(!/\[\[/.test(sql), 'jamais de balise de vocabulaire dans une fiche Compta');
});
