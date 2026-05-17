-- AI assistant configuration per client
CREATE TABLE IF NOT EXISTS ai_assistant_config (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL UNIQUE REFERENCES utilisateurs(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- AI conversation history per client
CREATE TABLE IF NOT EXISTS ai_conversations (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  messages JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_client_id ON ai_conversations(client_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_id ON ai_conversations(user_id);
