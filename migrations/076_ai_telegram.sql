-- Telegram integration: replace WhatsApp columns with Telegram
ALTER TABLE ai_assistant_config
  ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(50),
  ADD COLUMN IF NOT EXISTS invite_token VARCHAR(64) UNIQUE,
  ADD COLUMN IF NOT EXISTS confidence_threshold DECIMAL(3,2) NOT NULL DEFAULT 0.75;

-- Store last seen confidence per conversation for the admin view
ALTER TABLE ai_conversations
  ADD COLUMN IF NOT EXISTS last_confidence DECIMAL(3,2);

CREATE INDEX IF NOT EXISTS idx_ai_config_invite_token ON ai_assistant_config(invite_token) WHERE invite_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_config_telegram_chat_id ON ai_assistant_config(telegram_chat_id) WHERE telegram_chat_id IS NOT NULL;
