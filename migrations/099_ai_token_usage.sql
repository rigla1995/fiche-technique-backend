CREATE TABLE IF NOT EXISTS ai_token_usage (
  id            SERIAL PRIMARY KEY,
  client_id     INT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  usage_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  tokens_input  INT NOT NULL DEFAULT 0,
  tokens_output INT NOT NULL DEFAULT 0,
  tokens_total  INT NOT NULL DEFAULT 0,
  msg_count     INT NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_token_usage_client_date
  ON ai_token_usage(client_id, usage_date);

CREATE INDEX IF NOT EXISTS idx_ai_token_usage_client
  ON ai_token_usage(client_id);
