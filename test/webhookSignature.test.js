const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
// Lot 3, étape 5 : verifyDocusealSignature est retirée avec le webhook DocuSeal (plus de contrat ni d'avenant) ;
// ses 4 tests partent avec elle. Restent la comparaison à temps constant et la signature Meta (Messenger).
const webhookSignature = require('../src/utils/webhookSignature');
const { verifyMetaSignature, timingSafeEqualStr } = webhookSignature;

test('exports : timingSafeEqualStr et verifyMetaSignature seulement (plus de signature DocuSeal)', () => {
  assert.deepEqual(Object.keys(webhookSignature).sort(), ['timingSafeEqualStr', 'verifyMetaSignature']);
});

test('timingSafeEqualStr: equal and unequal', () => {
  assert.equal(timingSafeEqualStr('abc', 'abc'), true);
  assert.equal(timingSafeEqualStr('abc', 'abd'), false);
  assert.equal(timingSafeEqualStr('abc', 'abcd'), false);
});

test('meta: fail-open (not enforced) when no app secret configured', () => {
  const r = verifyMetaSignature(Buffer.from('{}'), undefined, '');
  assert.equal(r.enforced, false);
  assert.equal(r.ok, true);
});

test('meta: valid X-Hub-Signature-256 accepted', () => {
  const secret = 's3cr3t';
  const body = Buffer.from(JSON.stringify({ object: 'page' }));
  const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
  const r = verifyMetaSignature(body, sig, secret);
  assert.equal(r.enforced, true);
  assert.equal(r.ok, true);
});

test('meta: forged/invalid signature rejected when enforced', () => {
  const r = verifyMetaSignature(Buffer.from('{}'), 'sha256=deadbeef', 'secret');
  assert.equal(r.enforced, true);
  assert.equal(r.ok, false);
});

test('meta: missing signature header rejected when enforced', () => {
  const r = verifyMetaSignature(Buffer.from('{}'), undefined, 'secret');
  assert.equal(r.ok, false);
});
