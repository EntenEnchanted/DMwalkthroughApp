/**
 * Scores a classifier run against the hand-authored Phase 0 fixture.
 *
 * The fixture is the yardstick: two sections split by hand before the classifier
 * was written, so agreement with it is evidence the prompt is doing what was
 * intended — and disagreement points at exactly which category is drifting.
 *
 *   npm run verify -- output/dosi-chapter-all.json
 */
import { readFileSync } from "node:fs";

interface Counted {
  id: string;
  type: string;
  bookReadAlouds: number;
  prompts: number;
  technique: number;
  triggers: number;
  branches: number;
  variants: number;
  checks: number;
  noRollChecks: number;
  multiSkillChecks: number;
  features: number;
  references: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function count(s: any): Counted {
  const conditionals = s.conditionals ?? [];
  const checks = s.checks ?? s.reveals ?? [];
  return {
    id: s.id,
    type: s.type,
    bookReadAlouds: (s.read_alouds ?? []).filter((r: any) => r.source !== "authored").length,
    prompts: (s.prompts ?? []).length,
    technique: (s.technique ?? []).length,
    triggers: conditionals.filter((c: any) => c.kind === "trigger").length,
    branches: conditionals.filter((c: any) => c.kind === "branch").length,
    variants: conditionals.filter((c: any) => c.kind === "variant").length,
    checks: checks.length,
    noRollChecks: checks.filter((c: any) => c.dc === null || c.dc === undefined).length,
    multiSkillChecks: checks.filter((c: any) => (c.skills ?? []).length > 1).length,
    features: (s.features ?? []).length,
    references: (s.references ?? []).length,
  };
}

const FIELDS: (keyof Counted)[] = [
  "type",
  "bookReadAlouds",
  "prompts",
  "technique",
  "triggers",
  "branches",
  "variants",
  "checks",
  "noRollChecks",
  "multiSkillChecks",
  "features",
  "references",
];

function main() {
  const outputPath = process.argv[2];
  if (!outputPath) {
    console.error("usage: npm run verify -- <classifier-output.json>");
    process.exit(1);
  }

  const fixture = JSON.parse(readFileSync("fixtures/phase0-sections.json", "utf-8")) as any[];
  const output = JSON.parse(readFileSync(outputPath, "utf-8")) as any[];
  const byId = new Map(output.map((s) => [s.id, s]));

  let matches = 0;
  let total = 0;
  let missing = 0;

  for (const expected of fixture) {
    const actual = byId.get(expected.id);
    console.log(`\n${expected.id}`);
    if (!actual) {
      console.log("  NOT FOUND in classifier output");
      missing++;
      continue;
    }
    const e = count(expected);
    const a = count(actual);
    for (const field of FIELDS) {
      total++;
      const ok = e[field] === a[field];
      if (ok) matches++;
      const mark = ok ? "  ok " : "  →  ";
      console.log(`${mark}${String(field).padEnd(17)} expected ${String(e[field]).padEnd(10)} got ${a[field]}`);
    }
  }

  console.log(`\n${matches}/${total} fields agree with the fixture` + (missing ? `, ${missing} section(s) missing` : ""));

  // Corpus-wide sanity signal: categories that should be sparse, and the ones
  // most likely to be over-fired if the prompt drifts.
  const all = output.filter((s) => s.type !== "creature" && s.type !== "item").map(count);
  const sum = (f: keyof Counted) => all.reduce((n, c) => n + (c[f] as number), 0);
  console.log(`\nAcross ${all.length} narrative sections:`);
  console.log(`  read-alouds ${sum("bookReadAlouds")} · checks ${sum("checks")} (${sum("noRollChecks")} no-roll, ${sum("multiSkillChecks")} multi-skill)`);
  console.log(`  prompts ${sum("prompts")} · technique ${sum("technique")} · features ${sum("features")}`);
  console.log(`  conditionals: ${sum("triggers")} trigger · ${sum("branches")} branch · ${sum("variants")} variant`);
  console.log(`  sections with no blocks at all: ${all.filter((c) => !c.bookReadAlouds && !c.checks && !c.prompts && !c.technique && !c.features && !c.triggers && !c.branches && !c.variants).length}`);
}

main();
