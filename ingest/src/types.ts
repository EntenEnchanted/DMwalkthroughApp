export type SectionType = "location" | "encounter" | "creature" | "item" | "reference";

export interface ParsedSection {
  order: number;
  level: number;
  title: string;
  chapter: string;
  headingPath: string[];
  rawText: string;
}

export interface Reveal {
  trigger_skill: string;
  trigger_dc: number;
  text: string;
}

export interface ClassifiedSection extends ParsedSection {
  type: SectionType;
  read_aloud_text: string;
  dm_only_text: string;
  reveals: Reveal[];
  creature_references: string[];
}

export interface SectionReference {
  source_section_order: number;
  referenced_creature_name: string;
}
