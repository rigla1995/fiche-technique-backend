const pool = require('../config/database');

async function recordTokenUsage(clientId, inputTokens, outputTokens) {
  if (!clientId || (!inputTokens && !outputTokens)) return;
  const total = (inputTokens || 0) + (outputTokens || 0);
  await pool.query(
    `INSERT INTO ai_token_usage (client_id, usage_date, tokens_input, tokens_output, tokens_total, msg_count)
     VALUES ($1, CURRENT_DATE, $2, $3, $4, 1)
     ON CONFLICT (client_id, usage_date) DO UPDATE
       SET tokens_input  = ai_token_usage.tokens_input  + $2,
           tokens_output = ai_token_usage.tokens_output + $3,
           tokens_total  = ai_token_usage.tokens_total  + $4,
           msg_count     = ai_token_usage.msg_count     + 1,
           updated_at    = NOW()`,
    [clientId, inputTokens || 0, outputTokens || 0, total]
  ).catch(e => console.warn('[AI] Token usage record error:', e.message));
}

// (formatWithGroq et son pipeline de formatage ont été retirés avec Groq —
// seul le suivi de consommation de tokens reste utilisé, par aiService.)

module.exports = { recordTokenUsage };
