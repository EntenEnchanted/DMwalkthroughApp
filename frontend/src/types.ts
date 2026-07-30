export type SectionType = "location" | "encounter" | "creature" | "item" | "reference";

export interface AuthUser {
  id: string;
  email: string;
  role: "dm" | "player";
}

export interface Module {
  id: string;
  slug: string;
  name: string;
  description: string;
}

export interface Campaign {
  id: string;
  name: string;
  module_id: string;
  module_name: string;
  status: string;
  created_at: number;
}

export interface Reveal {
  id: number;
  trigger_skill: string;
  trigger_dc: number;
  text: string;
  revealed: boolean;
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
  stat_block: CreatureStatBlock | null;
  references: { id: string; heading: string; type: SectionType }[];
}

export interface SearchResult extends SectionDetail {
  score: number;
}

export interface CreatureStatBlock {
  name: string;
  source: string;
  size: string;
  type: string;
  alignment: string;
  ac: number;
  hp_avg: number;
  hp_formula: string;
  speed: Record<string, number>;
  cr: string;
  xp: number;
  pb: number;
  abilities: Record<string, { score: number; mod: number; save: number }>;
  skills: Record<string, number>;
  vulnerabilities?: string[];
  resistances?: string[];
  immunities?: string[];
  senses: string;
  languages: string;
  traits: { name: string; text: string }[];
  actions: { name: string; text: string }[];
  bonus_actions?: { name: string; text: string }[];
}

export interface CreatureSummary {
  id: string;
  heading: string;
  chapter: string;
}

export interface NarrativeReference {
  id: string;
  heading: string;
  chapter: string;
  dm_only_text: string;
  read_aloud_text: string;
}
