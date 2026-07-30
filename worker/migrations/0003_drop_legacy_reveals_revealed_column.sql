-- Migration number: 0003 	 2026-07-30T01:36:06.702Z
-- The global `revealed` flag has been fully superseded by per-campaign
-- state (migrated in 0002) — drop it now that nothing reads it.
ALTER TABLE reveal_defs DROP COLUMN revealed;
