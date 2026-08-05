-- Migration number: 0011 	 2026-08-05T02:10:00.000Z
-- Campaign page block model.
--
-- Splits what used to live in sections.dm_only_text (plus its inline <cond> and
-- [[directive]] markup) into typed content blocks, and gives reveal_defs a
-- stable (section_id, ordinal) key.
--
-- Everything here is additive. reveal_defs is NOT rebuilt: dropping and
-- recreating it would put campaign_reveal_state.reveal_def_id through a foreign
-- key it references, on a database with live campaign progress in it. New
-- columns are added alongside the legacy ones instead, so existing readers
-- (chat, search, the stat block popup) keep working untouched.

ALTER TABLE sections ADD COLUMN background_text TEXT NOT NULL DEFAULT '';

-- Read-alouds. A section can have several that fire at different moments, and
-- `source` separates the book's own boxed text from authored scene-setting so
-- the two can never be confused for each other in the UI.
CREATE TABLE read_alouds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id TEXT NOT NULL REFERENCES sections(id),
  ordinal INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('book', 'authored')),
  cue TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_read_alouds_stable ON read_alouds(section_id, ordinal);

-- Things the DM asks the players to do. Strictly player-facing.
CREATE TABLE prompts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id TEXT NOT NULL REFERENCES sections(id),
  ordinal INTEGER NOT NULL,
  text TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_prompts_stable ON prompts(section_id, ordinal);

-- DM craft advice: how to perform the scene. Tells you nothing about the world
-- and asks nothing of the players.
CREATE TABLE technique (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id TEXT NOT NULL REFERENCES sections(id),
  ordinal INTEGER NOT NULL,
  name TEXT NOT NULL,
  text TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_technique_stable ON technique(section_id, ordinal);

-- Things that change what the DM does, split by when you use them:
--   trigger — fires from something the party does in this scene
--   branch  — depends on state carried in from before this scene
--   variant — depends on fixed party configuration, resolved at prep time
CREATE TABLE conditionals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id TEXT NOT NULL REFERENCES sections(id),
  ordinal INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('trigger', 'branch', 'variant')),
  condition TEXT NOT NULL,
  effect TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_conditionals_stable ON conditionals(section_id, ordinal);

-- Standing mechanical rules for an area: no trigger, no roll to discover.
CREATE TABLE features (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id TEXT NOT NULL REFERENCES sections(id),
  ordinal INTEGER NOT NULL,
  name TEXT NOT NULL,
  text TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_features_stable ON features(section_id, ordinal);

-- Skill checks extend reveal_defs in place so campaign_reveal_state, and with it
-- every DM's revealed progress, survives.
--
-- `dc` is a new nullable column rather than a relaxation of trigger_dc, which is
-- NOT NULL and can't be altered in SQLite without a rebuild. A NULL dc means the
-- information needs no roll at all (asking an NPC, casting detect magic, simply
-- examining something). trigger_skill and trigger_dc are retained as legacy
-- columns for existing readers.
ALTER TABLE reveal_defs ADD COLUMN ordinal INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reveal_defs ADD COLUMN context TEXT NOT NULL DEFAULT '';
ALTER TABLE reveal_defs ADD COLUMN skills TEXT NOT NULL DEFAULT '[]';
ALTER TABLE reveal_defs ADD COLUMN dc INTEGER;
ALTER TABLE reveal_defs ADD COLUMN passive INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reveal_defs ADD COLUMN kind TEXT NOT NULL DEFAULT 'info';
ALTER TABLE reveal_defs ADD COLUMN cost TEXT NOT NULL DEFAULT '';
ALTER TABLE reveal_defs ADD COLUMN fail_text TEXT NOT NULL DEFAULT '';

-- Backfill the new columns from the legacy ones.
UPDATE reveal_defs SET dc = trigger_dc WHERE dc IS NULL;
UPDATE reveal_defs SET skills = json_array(trigger_skill) WHERE skills = '[]' AND trigger_skill <> '';

-- Ordinals must be assigned before the unique index exists, since every row
-- currently defaults to 0.
UPDATE reveal_defs
SET ordinal = t.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY section_id ORDER BY id) - 1 AS rn
  FROM reveal_defs
) AS t
WHERE reveal_defs.id = t.id;

CREATE UNIQUE INDEX idx_reveal_defs_stable ON reveal_defs(section_id, ordinal);
