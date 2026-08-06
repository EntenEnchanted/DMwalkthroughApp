/**
 * Wires a creature seed into a module that has no source markdown.
 *
 * Two things have to be true before a stat block chip appears on a section:
 * the creature sections must exist, and the narrative sections must reference
 * them. `run.ts --creatures-only` does the first, but it parses the module's
 * markdown to rebuild item sections at the same time — which LMoP does not have,
 * and whose items are already loaded. This does only the creature half.
 *
 * References are resolved by matching creature names against the section text
 * already in the database, rather than by re-running the classifier. A
 * re-classification pass would cost an API call per section and would overwrite
 * every block with a second opinion, to recover a field that is a plain string
 * match on text nobody is changing.
 *
 *   npm run dump     -- lmop
 *   npm run creatures -- lmop ../lmop-creatures-seed.json output/lmop-dump.json
 *   npm run load     -- output/lmop-creature-sections.json
 *   npm run load     -- output/lmop-linked.json
 */
import "dotenv/config";
import { writeFileSync, mkdirSync } from "node:fs";
import { readFileSync } from "node:fs";
import { buildCreatureSections } from "./buildCreatureSections.js";
import { slugify } from "./slugify.js";

/**
 * Stat blocks whose names are also ordinary English words. Matching these
 * loosely produced chips off "noble bearing", "a wizard-noble of old Phalorm"
 * and "characters move carefully or scout ahead" — a wrong chip costs the DM
 * more than a missing one, so these link only on a plural ("orc scouts",
 * "cultists"), which prose almost never uses adjectivally. The cost is losing
 * singular mentions that were genuine; that is the intended trade.
 */
const AMBIGUOUS = new Set([
  "Mage",
  "Noble",
  "Scout",
  "Commoner",
  "Spy",
  "Thug",
  "Acolyte",
  "Bandit",
  "Cultist",
  "Veteran",
  "Guard",
]);

/** Singular/plural and possessive, on a word boundary. Case-insensitive. */
function namePattern(name: string): RegExp {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const suffix = AMBIGUOUS.has(name) ? "(?:s|es)" : "(?:'s|s|es)?";
  return new RegExp(`\\b${escaped}${suffix}\\b`, "i");
}

interface DumpedSection {
  id: string;
  type: string;
  heading: string;
  dm_only_text?: string;
  background_text?: string;
  read_alouds?: { text: string }[];
  conditionals?: { condition: string; effect: string }[];
  technique?: { text: string }[];
  features?: { text: string }[];
  reveals?: { text: string; context: string }[];
  references: string[];
  [key: string]: unknown;
}

/**
 * Everything a DM would read on the section, which is the same surface the
 * classifier's creature_references was defined over. Authored scene text is
 * deliberately excluded: it never names a creature the book did not already
 * name, so it can only add noise.
 */
function sectionText(s: DumpedSection): string {
  return [
    s.dm_only_text ?? "",
    s.background_text ?? "",
    ...(s.read_alouds ?? []).map((r) => r.text),
    ...(s.conditionals ?? []).map((c) => `${c.condition} ${c.effect}`),
    ...(s.technique ?? []).map((t) => t.text),
    ...(s.features ?? []).map((f) => f.text),
    ...(s.reveals ?? []).map((r) => `${r.context} ${r.text}`),
  ].join("\n");
}

async function main() {
  const [moduleId, seedPath, dumpPath] = process.argv.slice(2);
  if (!moduleId || !seedPath) {
    console.error("usage: npm run creatures -- <module_id> <seed.json> [dumped-sections.json]");
    process.exit(1);
  }

  // dosi keeps its unprefixed id scheme; every other module is slug-prefixed.
  const id = (...parts: string[]) => (moduleId === "dosi" ? slugify(...parts) : slugify(moduleId, ...parts));

  const creatureSections = buildCreatureSections(seedPath).map((c, i) => ({
    id: id("creature", c.title),
    module_id: moduleId,
    chapter: c.chapter,
    heading: c.title,
    heading_path: c.headingPath,
    order: 100000 + i,
    type: c.type,
    read_aloud_text: c.read_aloud_text,
    dm_only_text: c.dm_only_text,
    reveals: [],
    references: [],
    stat_block: c.stat_block,
  }));

  mkdirSync("./output", { recursive: true });
  const creaturePath = `./output/${moduleId}-creature-sections.json`;
  writeFileSync(creaturePath, JSON.stringify(creatureSections, null, 2));
  console.log(`Wrote ${creatureSections.length} creature sections to ${creaturePath}`);

  if (!dumpPath) {
    console.log("No dump supplied — skipping reference linking.");
    return;
  }

  const sections = JSON.parse(readFileSync(dumpPath, "utf-8")) as DumpedSection[];
  const creatures = creatureSections.map((c) => ({
    id: c.id,
    name: (c.stat_block as { name: string }).name,
    pattern: namePattern((c.stat_block as { name: string }).name),
  }));

  let linked = 0;
  const hits = new Map<string, number>();
  for (const section of sections) {
    if (section.type === "creature" || section.type === "item") continue;
    const text = sectionText(section);
    const found = creatures.filter((c) => c.pattern.test(text));
    if (!found.length) continue;
    section.references = found.map((c) => c.id);
    linked++;
    for (const c of found) hits.set(c.name, (hits.get(c.name) ?? 0) + 1);
  }

  const outPath = `./output/${moduleId}-linked.json`;
  writeFileSync(outPath, JSON.stringify(sections, null, 2));
  console.log(`\nLinked ${linked}/${sections.length} sections to creatures — wrote ${outPath}`);
  const ranked = [...hits.entries()].sort((a, b) => b[1] - a[1]);
  console.log(ranked.map(([n, c]) => `${n} ${c}`).join(", "));
  const unused = creatures.filter((c) => !hits.has(c.name)).map((c) => c.name);
  if (unused.length) console.log(`\nNever referenced: ${unused.join(", ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
