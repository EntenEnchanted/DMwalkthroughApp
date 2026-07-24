import { readFileSync } from "node:fs";

export interface CreatureStat {
  name: string;
  source: string;
  size: string;
  type: string;
  alignment: string;
  ac: number;
  init: number;
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

export interface CreatureSection {
  title: string;
  type: "creature";
  chapter: string;
  headingPath: string[];
  dm_only_text: string;
  read_aloud_text: "";
  reveals: [];
  creature_references: [];
  stat_block: CreatureStat;
}

function renderStatBlockText(c: CreatureStat): string {
  const speed = Object.entries(c.speed)
    .map(([k, v]) => `${k} ${v} ft.`)
    .join(", ");
  const abilities = Object.entries(c.abilities)
    .map(([k, v]) => `${k.toUpperCase()} ${v.score} (${v.mod >= 0 ? "+" : ""}${v.mod})`)
    .join(", ");
  const skills = Object.entries(c.skills)
    .map(([k, v]) => `${k} ${v >= 0 ? "+" : ""}${v}`)
    .join(", ");
  const lines = [
    `${c.name} — ${c.size} ${c.type}, ${c.alignment}.`,
    `AC ${c.ac}, HP ${c.hp_avg} (${c.hp_formula}), Speed ${speed}.`,
    `Abilities: ${abilities}.`,
    skills ? `Skills: ${skills}.` : "",
    c.vulnerabilities?.length ? `Vulnerabilities: ${c.vulnerabilities.join(", ")}.` : "",
    c.resistances?.length ? `Resistances: ${c.resistances.join(", ")}.` : "",
    c.immunities?.length ? `Immunities: ${c.immunities.join(", ")}.` : "",
    `Senses: ${c.senses}.`,
    `Languages: ${c.languages}.`,
    `Challenge: ${c.cr} (XP ${c.xp}, PB +${c.pb}).`,
    ...c.traits.map((t) => `${t.name}: ${t.text}`),
    ...c.actions.map((a) => `${a.name}: ${a.text}`),
    ...(c.bonus_actions ?? []).map((a) => `${a.name} (Bonus Action): ${a.text}`),
  ];
  return lines.filter(Boolean).join("\n");
}

export function buildCreatureSections(seedPath: string): CreatureSection[] {
  const creatures = JSON.parse(readFileSync(seedPath, "utf-8")) as CreatureStat[];
  return creatures.map((c) => ({
    title: c.name,
    type: "creature" as const,
    chapter: "Appendix B: Creatures",
    headingPath: ["Creature Descriptions"],
    dm_only_text: renderStatBlockText(c),
    read_aloud_text: "" as const,
    reveals: [] as const,
    creature_references: [] as const,
    stat_block: c,
  }));
}
