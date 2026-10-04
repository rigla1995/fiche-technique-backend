const crypto = require('crypto');

/**
 * Constant-time string comparison (avoids timing attacks on secret comparison).
 */
function timingSafeEqualStr(a, b) {
  const ba = Buffer.from(String(a == null ? '' : a), 'utf8');
  const bb = Buffer.from(String(b == null ? '' : b), 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * Meta / Facebook Messenger webhook signature.
 * Header `X-Hub-Signature-256` = 'sha256=' + HMAC-SHA256(appSecret, rawBody).
 *
 * Returns { ok, enforced }.
 *  - enforced=false when no appSecret is configured (fail-open until you set
 *    MESSENGER_APP_SECRET — so the live agent keeps working during rollout).
 *  - enforced=true + ok=false  → reject (forged/invalid signature).
 */
function verifyMetaSignature(rawBody, header, appSecret) {
  if (!appSecret) return { ok: true, enforced: false };
  if (!header || !rawBody || !rawBody.length) return { ok: false, enforced: true };
  const expected =
    'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  return { ok: timingSafeEqualStr(header, expected), enforced: true };
}

module.exports = { timingSafeEqualStr, verifyMetaSignature };
