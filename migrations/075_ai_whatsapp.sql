-- Add WhatsApp number to AI config
ALTER TABLE ai_assistant_config ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(30);

-- Allow WhatsApp conversations without a system user_id
ALTER TABLE ai_conversations ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(30);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_whatsapp ON ai_conversations(whatsapp_number) WHERE whatsapp_number IS NOT NULL;
