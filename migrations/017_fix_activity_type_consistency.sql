-- Enforce invariant: activities without a franchise_group cannot have type='franchise'.
-- Runs on every server start but is safe/idempotent — corrects any data inconsistency
-- where a 'distincte' activity was incorrectly saved as 'franchise' (e.g. by migration 010
-- before the AND type IS NULL guard was added).
UPDATE activites
SET type = 'distincte'
WHERE franchise_group IS NULL AND type = 'franchise';
