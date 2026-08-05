export interface Env {
  DB: D1Database;
  VECTORIZE: VectorizeIndex;
  AI: Ai;
  MAP_IMAGES: R2Bucket;
  ANTHROPIC_API_KEY: string;
  ADMIN_TOKEN: string;
}

export type SectionType = "location" | "encounter" | "creature" | "item" | "reference";

export interface Reveal {
  id?: number;
  /** @deprecated superseded by `skills`; retained for chat/search/popup readers. */
  trigger_skill: string;
  /** @deprecated superseded by `dc`; retained for chat/search/popup readers. */
  trigger_dc: number;
  text: string;
  revealed?: boolean;
  // Block-model fields (migration 0011).
  ordinal?: number;
  context?: string;
  skills?: string[];
  /** null means the information needs no roll at all. */
  dc?: number | null;
  passive?: boolean;
  kind?: CheckKind;
  cost?: string;
  fail_text?: string;
}

export type CheckKind = "info" | "discovery" | "social" | "consequence";
export type ConditionalKind = "trigger" | "branch" | "variant";
export type ReadAloudSource = "book" | "authored";

export interface ReadAloud {
  ordinal: number;
  source: ReadAloudSource;
  cue: string;
  text: string;
}

export interface Prompt {
  ordinal: number;
  text: string;
}

/** DM craft advice — how to perform the scene. */
export interface Technique {
  ordinal: number;
  name: string;
  text: string;
}

export interface Conditional {
  ordinal: number;
  kind: ConditionalKind;
  condition: string;
  effect: string;
}

/** A standing mechanical rule for an area: no trigger, no roll to discover. */
export interface Feature {
  ordinal: number;
  name: string;
  text: string;
}

/** The typed content blocks a section carries, beyond its prose. */
export interface SectionBlocks {
  read_alouds: ReadAloud[];
  background_text: string;
  prompts: Prompt[];
  technique: Technique[];
  conditionals: Conditional[];
  features: Feature[];
}

export interface IngestSection extends Partial<SectionBlocks> {
  id: string;
  module_id: string;
  chapter: string;
  heading: string;
  heading_path: string[];
  order: number;
  type: SectionType;
  read_aloud_text: string;
  dm_only_text: string;
  reveals: Reveal[];
  references: string[];
  stat_block?: unknown;
}

export interface SectionRow {
  id: string;
  chapter: string;
  heading: string;
  heading_path: string; // JSON string in DB
  order: number;
  type: SectionType;
  dm_only_text: string;
  read_aloud_text: string;
  background_text: string;
}

export interface SectionDetail extends SectionBlocks {
  id: string;
  chapter: string;
  heading: string;
  heading_path: string[];
  type: SectionType;
  /** Derived from read_alouds; kept so chat, search and the popup are unaffected. */
  read_aloud_text: string;
  /** Derived from the blocks; kept so chat, search and the popup are unaffected. */
  dm_only_text: string;
  reveals: Reveal[];
  stat_block: unknown | null;
  references: { id: string; heading: string; type: SectionType }[];
}
