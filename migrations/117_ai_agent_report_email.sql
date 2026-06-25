-- Migration 117: email de destination des rapports / activation de l'agent par client.
-- L'admin saisit l'email lors de l'activation Messenger (par défaut l'email du client,
-- modifiable). Sert à : (1) envoyer le mail d'activation de l'agent, (2) destinataire des
-- rapports demandés via l'agent. Le compte Messenger qui ouvre le lien envoyé à cet email
-- devient le PSID lié.
ALTER TABLE ai_assistant_config ADD COLUMN IF NOT EXISTS report_email VARCHAR(255);
