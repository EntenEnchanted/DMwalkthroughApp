-- Migration number: 0005 	 2026-07-30T02:28:08.247Z
-- Phase 1: character sheets. One character per (campaign, player) is
-- created at invite-redemption time; ability scores/currency/features
-- stay JSON since they're edited as a whole, matching creature_stats'
-- existing pattern. Inventory is a real table since items are added and
-- removed incrementally rather than replaced wholesale.

CREATE TABLE characters (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  player_user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  class TEXT NOT NULL DEFAULT '',
  level INTEGER NOT NULL DEFAULT 1,
  race TEXT NOT NULL DEFAULT '',
  background TEXT NOT NULL DEFAULT '',
  xp INTEGER NOT NULL DEFAULT 0,
  current_hp INTEGER NOT NULL DEFAULT 0,
  max_hp INTEGER NOT NULL DEFAULT 0,
  ac INTEGER NOT NULL DEFAULT 10,
  speed INTEGER NOT NULL DEFAULT 30,
  ability_scores_json TEXT NOT NULL DEFAULT '{"str":10,"dex":10,"con":10,"int":10,"wis":10,"cha":10}',
  currency_json TEXT NOT NULL DEFAULT '{"cp":0,"sp":0,"ep":0,"gp":0,"pp":0}',
  features_json TEXT NOT NULL DEFAULT '[]',
  notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_characters_campaign ON characters(campaign_id);
CREATE INDEX idx_characters_player ON characters(player_user_id);
CREATE UNIQUE INDEX idx_characters_campaign_player ON characters(campaign_id, player_user_id);

CREATE TABLE character_items (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  weight REAL NOT NULL DEFAULT 0,
  equipped INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  srd_equipment_slug TEXT
);
CREATE INDEX idx_character_items_character ON character_items(character_id);
