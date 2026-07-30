-- Migration number: 0007 	 2026-07-30T03:13:34.898Z
-- Phase 4a: battle maps — grid, tokens, fog of war.
--
-- Deviation from spec §6.7: `image_url` instead of `image_r2_key`. R2 is
-- blocked in this environment (the Cloudflare API token here has no R2
-- permission — confirmed via `wrangler r2 bucket create/list`, both fail
-- with "Authentication error [code: 10000]"), so map backgrounds are a
-- plain URL for now, the same pattern the spec already uses for token
-- icons (`tokens.image_url`). Swap to R2-backed upload once R2 access is
-- sorted out — nothing else about this schema needs to change to do that.

CREATE TABLE maps (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  name TEXT NOT NULL,
  image_url TEXT NOT NULL,
  grid_size_px INTEGER NOT NULL DEFAULT 50,
  width_px INTEGER NOT NULL,
  height_px INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_maps_campaign ON maps(campaign_id);

CREATE TABLE tokens (
  id TEXT PRIMARY KEY,
  map_id TEXT NOT NULL,
  character_id TEXT,
  creature_section_id TEXT,
  label TEXT NOT NULL,
  x INTEGER NOT NULL DEFAULT 0,
  y INTEGER NOT NULL DEFAULT 0,
  size INTEGER NOT NULL DEFAULT 1,
  image_url TEXT,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  current_hp INTEGER,
  max_hp INTEGER
);
CREATE INDEX idx_tokens_map ON tokens(map_id);

CREATE TABLE fog_state (
  map_id TEXT PRIMARY KEY,
  revealed_cells_json TEXT NOT NULL DEFAULT '[]'
);

-- Which map players currently see for a campaign. No default/REFERENCES
-- combo (same ALTER TABLE limitation as sections.module_id in 0001).
ALTER TABLE campaigns ADD COLUMN active_map_id TEXT;
