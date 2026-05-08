-- Remove orphaned subscription rows left by previous ON DELETE SET NULL behaviour
DELETE FROM abonnements WHERE client_id IS NULL;
