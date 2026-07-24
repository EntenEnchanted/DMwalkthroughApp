DROP TABLE IF EXISTS section_references;
DROP TABLE IF EXISTS reveals;
DROP TABLE IF EXISTS creature_stats;
DROP TABLE IF EXISTS sections;

CREATE TABLE sections (
  id TEXT PRIMARY KEY,
  chapter TEXT NOT NULL,
  heading TEXT NOT NULL,
  heading_path TEXT NOT NULL, -- JSON array
  "order" INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('location', 'encounter', 'creature', 'item', 'reference')),
  dm_only_text TEXT NOT NULL DEFAULT '',
  read_aloud_text TEXT NOT NULL DEFAULT ''
);

CREATE TABLE creature_stats (
  section_id TEXT PRIMARY KEY REFERENCES sections(id),
  stat_block_json TEXT NOT NULL
);

CREATE TABLE reveals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id TEXT NOT NULL REFERENCES sections(id),
  trigger_skill TEXT NOT NULL,
  trigger_dc INTEGER NOT NULL,
  text TEXT NOT NULL,
  revealed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE section_references (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_section_id TEXT NOT NULL REFERENCES sections(id),
  referenced_section_id TEXT NOT NULL REFERENCES sections(id)
);

CREATE INDEX idx_reveals_section ON reveals(section_id);
CREATE INDEX idx_refs_source ON section_references(source_section_id);
CREATE INDEX idx_refs_referenced ON section_references(referenced_section_id);
CREATE INDEX idx_sections_type ON sections(type);
