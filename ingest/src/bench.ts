/**
 * Classifies only the sections the Phase 0 fixture covers, so prompt changes can
 * be scored without paying for a full pass.
 *
 * `npm run verify` needs a classifier output file to compare against the
 * fixture, and the only thing that produced one was a whole-chapter run — which
 * made "measure any change with verify" cost far more than the change itself,
 * and slow enough that the loop mostly did not happen. This classifies the two
 * fixture sections and nothing else.
 *
 *   npm run bench && npm run verify -- output/fixture-bench.json
 *
 * Only DoSI's markdown is committed, so the fixture — and this — are DoSI-only.
 * That is the same yardstick the prompt was tuned against originally; the point
 * is comparability across runs, not corpus coverage.
 */
import "dotenv/config";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { parseMarkdown, buildChapterIndex } from "./parseMarkdown.js";
import { classifySection } from "./classify.js";
import { buildCreatureSections } from "./buildCreatureSections.js";
import { slugify } from "./slugify.js";

const MD_PATH = "../Dragons of Stormwreck Isle.md";
const SEED_PATH = "../dosi-creatures-seed.json";

async function main() {
  const fixture = JSON.parse(readFileSync("fixtures/phase0-sections.json", "utf-8")) as { id: string }[];
  const wanted = new Set(fixture.map((s) => s.id));

  const parsed = parseMarkdown(MD_PATH);
  const chapterIndex = buildChapterIndex(parsed);
  const creatureSections = buildCreatureSections(SEED_PATH).map((c) => ({
    id: slugify("creature", c.title),
    name: c.stat_block ? (c.stat_block as { name: string }).name : "",
  }));
  const creatureNames = creatureSections.map((c) => c.name);

  // dosi's two-part id scheme, matching run.ts.
  const targets = parsed.filter((s) => wanted.has(slugify(String(chapterIndex(s.chapter)), s.title)));
  const found = new Set(targets.map((s) => slugify(String(chapterIndex(s.chapter)), s.title)));
  for (const id of wanted) {
    if (!found.has(id)) console.error(`  fixture section not found in the markdown: ${id}`);
  }

  const output = [];
  for (const section of targets) {
    const id = slugify(String(chapterIndex(section.chapter)), section.title);
    process.stdout.write(`  ${id} ... `);
    const result = await classifySection(section, creatureNames, "dosi");
    console.log(
      `${result.read_alouds.length} ra, ${result.reveals.length} ck, ${result.conditionals.length} cond, ` +
        `${result.prompts.length} pr, ${result.technique.length} tq, ${result.features.length} ft`
    );
    // The fixture records references as creature SECTION IDS, so resolve names
    // the same way run.ts does — otherwise the field scores 0 for the wrong reason.
    const references = result.creature_references
      .map((name) => creatureSections.find((c) => c.name === name)?.id)
      .filter((x): x is string => Boolean(x));
    output.push({ id, heading: section.title, ...result, references });
  }

  mkdirSync("./output", { recursive: true });
  writeFileSync("./output/fixture-bench.json", JSON.stringify(output, null, 2));
  console.log(`\nWrote ${output.length} sections to ./output/fixture-bench.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
