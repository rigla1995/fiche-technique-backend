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

/**
 * Docuseal webhook authentication.
 * Docuseal lets you attach a custom header (key/value) to outgoing webhooks, and
 * Pro plans can also HMAC-sign the payload. We accept either:
 *   1) a shared secret sent in `X-Docuseal-Secret` / `X-Webhook-Secret`
 *   2) an HMAC signature in `X-Docuseal-Signature` (hex, optionally `sha256=` prefixed)
 *
 * Returns { ok, enforced } with the same fail-open-until-configured semantics as above
 * (set DOCUSEAL_WEBHOOK_SECRET in Coolify + the matching header/secret in Docuseal to enforce).
 */
function verifyDocusealSignature(rawBody, headers, secret) {
  if (!secret) return { ok: true, enforced: false };
  const h = headers || {};
  const headerSecret = h['x-docuseal-secret'] || h['x-webhook-secret'];
  if (headerSecret) return { ok: timingSafeEqualStr(headerSecret, secret), enforced: true };

  const sig = h['x-docuseal-signature'];
  if (sig && rawBody && rawBody.length) {
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const provided = String(sig).replace(/^sha256=/i, '');
    return { ok: timingSafeEqualStr(provided, expected), enforced: true };
  }
  return { ok: false, enforced: true };
}

module.exports = { timingSafeEqualStr, verifyMetaSignature, verifyDocusealSignature };
