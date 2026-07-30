-- Migration number: 0001 	 2026-07-30T01:35:05.454Z
-- Phase 0: auth + multi-campaign foundation. Purely additive — existing
-- sections/reveals/creature_stats/section_references rows are untouched.

CREATE TABLE modules (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT ''
);

INSERT INTO modules (id, slug, name, description)
VALUES ('dosi', 'dosi', 'Dragons of Stormwreck Isle', 'The starting adventure module.');

-- Existing rows default to the only module that has ever existed. (SQLite
-- disallows combining a non-null DEFAULT with a REFERENCES clause on
-- ALTER TABLE ADD COLUMN, so the FK to modules(id) is application-enforced.)
ALTER TABLE sections ADD COLUMN module_id TEXT NOT NULL DEFAULT 'dosi';

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('dm', 'player')),
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  module_id TEXT NOT NULL REFERENCES modules(id),
  dm_user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_campaigns_dm ON campaigns(dm_user_id);

-- One reusable code per campaign (v1 invite model — simplest option per spec §12).
CREATE TABLE campaign_invites (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  code TEXT NOT NULL UNIQUE,
  expires_at INTEGER,
  used_by_user_id TEXT REFERENCES users(id),
  used_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_invites_campaign ON campaign_invites(campaign_id);

-- "reveals" becomes the static definition; per-campaign progress moves out
-- to campaign_reveal_state so two campaigns running the same module don't
-- share a reveal toggle. The `revealed` column is dropped in migration 0003,
-- after 0002 backfills it into campaign_reveal_state for the legacy campaign.
ALTER TABLE reveals RENAME TO reveal_defs;

CREATE TABLE campaign_reveal_state (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  reveal_def_id INTEGER NOT NULL REFERENCES reveal_defs(id),
  revealed INTEGER NOT NULL DEFAULT 0,
  revealed_at INTEGER,
  PRIMARY KEY (campaign_id, reveal_def_id)
);
