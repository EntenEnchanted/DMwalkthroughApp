export interface Env {
  DB: D1Database;
  VECTORIZE: VectorizeIndex;
  AI: Ai;
  ANTHROPIC_API_KEY: string;
  ADMIN_TOKEN: string;
  RETAG_ADMIN_TOKEN?: string;
}

export type SectionType = "location" | "encounter" | "creature" | "item" | "reference";

export interface Reveal {
  id?: number;
  trigger_skill: string;
  trigger_dc: number;
  text: string;
  revealed?: boolean;
}

export interface IngestSection {
  id: string;
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
}

export interface SectionDetail {
  id: string;
  chapter: string;
  heading: string;
  heading_path: string[];
  type: SectionType;
  read_aloud_text: string;
  dm_only_text: string;
  reveals: Reveal[];
  stat_block: unknown | null;
  references: { id: string; heading: string; type: SectionType }[];
}
