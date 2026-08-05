export type SectionType = "location" | "encounter" | "creature" | "item" | "reference";

export interface ParsedSection {
  order: number;
  level: number;
  title: string;
  chapter: string;
  headingPath: string[];
  rawText: string;
}

export type CheckKind = "info" | "discovery" | "social" | "consequence";
export type ConditionalKind = "trigger" | "branch" | "variant";

export interface Reveal {
  ordinal: number;
  context: string;
  skills: string[];
  /** null means the information needs no roll at all. */
  dc: number | null;
  passive: boolean;
  kind: CheckKind;
  cost: string;
  text: string;
  fail_text: string;
  /** Legacy columns, still read by chat, search and the stat block popup. */
  trigger_skill: string;
  trigger_dc: number;
}

export interface ReadAloud {
  ordinal: number;
  source: "book" | "authored";
  cue: string;
  text: string;
}

export interface Prompt {
  ordinal: number;
  text: string;
}

export interface NamedBlock {
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

/** Raw tool output, before ordinals are assigned. */
export interface ClassifiedBlocks {
  type: SectionType;
  read_alouds: { cue: string; text: string }[];
  background_text: string;
  prompts: { text: string }[];
  technique: { name: string; text: string }[];
  conditionals: { kind: ConditionalKind; condition: string; effect: string }[];
  checks: {
    context: string;
    skills: string[];
    dc?: number;
    passive?: boolean;
    kind: CheckKind;
    cost?: string;
    success_text: string;
    fail_text?: string;
  }[];
  features: { name: string; text: string }[];
  creature_references: string[];
}

export interface ClassifiedSection extends ParsedSection {
  type: SectionType;
  read_alouds: ReadAloud[];
  background_text: string;
  prompts: Prompt[];
  technique: NamedBlock[];
  conditionals: Conditional[];
  features: NamedBlock[];
  reveals: Reveal[];
  creature_references: string[];
}

export interface SectionReference {
  source_section_order: number;
  referenced_creature_name: string;
}
