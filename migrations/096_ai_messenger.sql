-- Messenger integration for ai_assistant_config
ALTER TABLE ai_assistant_config
  ADD COLUMN IF NOT EXISTS messenger_psid VARCHAR(100),
  ADD COLUMN IF NOT EXISTS messenger_invite_token VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_config_messenger_psid
  ON ai_assistant_config(messenger_psid) WHERE messenger_psid IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_config_messenger_invite_token
  ON ai_assistant_config(messenger_invite_token) WHERE messenger_invite_token IS NOT NULL;
