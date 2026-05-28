ALTER TABLE ai_assistant_config
  ADD COLUMN IF NOT EXISTS context_json JSONB,
  ADD COLUMN IF NOT EXISTS context_updated_at TIMESTAMPTZ;
