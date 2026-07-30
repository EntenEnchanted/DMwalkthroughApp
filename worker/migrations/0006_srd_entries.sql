-- Migration number: 0006 	 2026-07-30T02:46:27.982Z
-- Phase 2: the SRD/PHB reference library. Not campaign-scoped and
-- visible to both roles — this is reference content, not adventure
-- content, so none of the tiering/access rules elsewhere apply.

CREATE TABLE srd_entries (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('class', 'race', 'spell', 'equipment', 'feat', 'condition', 'rule')),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  data_json TEXT NOT NULL,
  source TEXT NOT NULL
);
CREATE INDEX idx_srd_category ON srd_entries(category);
CREATE INDEX idx_srd_name ON srd_entries(name);
