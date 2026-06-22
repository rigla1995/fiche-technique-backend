const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const {
  verifyMetaSignature,
  verifyDocusealSignature,
  timingSafeEqualStr,
} = require('../src/utils/webhookSignature');

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

test('docuseal: fail-open when no secret configured', () => {
  const r = verifyDocusealSignature(Buffer.from('{}'), {}, '');
  assert.equal(r.enforced, false);
  assert.equal(r.ok, true);
});

test('docuseal: shared-secret header accepted / rejected', () => {
  assert.equal(verifyDocusealSignature(Buffer.from('{}'), { 'x-docuseal-secret': 'abc' }, 'abc').ok, true);
  assert.equal(verifyDocusealSignature(Buffer.from('{}'), { 'x-docuseal-secret': 'wrong' }, 'abc').ok, false);
});

test('docuseal: HMAC signature accepted', () => {
  const secret = 'k';
  const body = Buffer.from('{"x":1}');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
  assert.equal(verifyDocusealSignature(body, { 'x-docuseal-signature': sig }, secret).ok, true);
  assert.equal(verifyDocusealSignature(body, { 'x-docuseal-signature': 'sha256=' + sig }, secret).ok, true);
});

test('docuseal: no signature/secret header present but secret configured -> reject', () => {
  const r = verifyDocusealSignature(Buffer.from('{}'), {}, 'secret');
  assert.equal(r.enforced, true);
  assert.equal(r.ok, false);
});
