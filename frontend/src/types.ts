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

export interface AbilityScores {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
}

export interface Currency {
  cp: number;
  sp: number;
  ep: number;
  gp: number;
  pp: number;
}

export interface CharacterItem {
  id: string;
  name: string;
  quantity: number;
  weight: number;
  equipped: boolean;
  notes: string;
  srd_equipment_slug: string | null;
}

export interface Character {
  id: string;
  campaign_id: string;
  player_user_id: string;
  name: string;
  class: string;
  level: number;
  race: string;
  background: string;
  xp: number;
  current_hp: number;
  max_hp: number;
  ac: number;
  speed: number;
  ability_scores: AbilityScores;
  currency: Currency;
  features: string[];
  notes: string;
  items: CharacterItem[];
}

export interface CharacterSummary {
  id: string;
  name: string;
  class: string;
  level: number;
  race: string;
  current_hp: number;
  max_hp: number;
}

export interface MyCharacterSummary {
  id: string;
  name: string;
  campaign_id: string;
  campaign_name: string;
}

export type SrdCategory = "class" | "race" | "spell" | "equipment" | "feat" | "condition" | "rule";

export interface SrdEntrySummary {
  id: string;
  category: SrdCategory;
  name: string;
  slug: string;
}

export interface SrdEntryDetail {
  category: SrdCategory;
  name: string;
  slug: string;
  source: string;
  // Raw upstream shape from the SRD dataset — varies by category, so this
  // stays loosely typed and is rendered defensively (see HandbookView).
  data: Record<string, unknown>;
}

export interface BattleMap {
  id: string;
  name: string;
  image_url: string;
  grid_size_px: number;
  width_px: number;
  height_px: number;
}

export interface MapSummary {
  id: string;
  name: string;
  created_at: number;
}

export interface MapToken {
  id: string;
  map_id: string;
  character_id?: string;
  creature_section_id: string | null;
  label: string;
  x: number;
  y: number;
  size: number;
  image_url: string | null;
  color: string;
  current_hp: number | null;
  max_hp: number | null;
}

export interface ActiveMapState {
  map: BattleMap | null;
  tokens: MapToken[];
  revealed_cells: string[];
}
