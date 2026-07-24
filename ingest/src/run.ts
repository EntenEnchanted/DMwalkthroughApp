import "dotenv/config";
import { writeFileSync, mkdirSync } from "node:fs";
import { parseMarkdown, extractItemNames, chapterNumber } from "./parseMarkdown.js";
import { classifySection } from "./classify.js";
import { buildCreatureSections } from "./buildCreatureSections.js";
import { buildItemSections } from "./buildItemSections.js";
import { slugify } from "./slugify.js";
import type { SectionType, Reveal } from "./types.js";

const MD_PATH = "../Dragons of Stormwreck Isle.md";
const SEED_PATH = "../dosi-creatures-seed.json";
const OUTPUT_DIR = "./output";

export interface FinalSection {
  id: string;
  chapter: string;
  heading: string;
  heading_path: string[];
  order: number;
  type: SectionType;
  read_aloud_text: string;
  dm_only_text: string;
  reveals: Reveal[];
  references: string[]; // ids of referenced creature sections
  stat_block?: unknown;
}

function parseArgs() {
  const arg = process.argv.find((a) => a.startsWith("--chapter="));
  const chapterFilter = arg ? arg.split("=")[1] : "all";
  const creaturesOnly = process.argv.includes("--creatures-only");
  return { chapterFilter, creaturesOnly };
}

async function loadIntoWorker(output: unknown[]) {
  const workerUrl = process.env.WORKER_ADMIN_URL;
  const adminToken = process.env.WORKER_ADMIN_TOKEN;
  if (workerUrl && adminToken) {
    console.log(`\nLoading ${output.length} sections into ${workerUrl} ...`);
    const res = await fetch(`${workerUrl}/admin/load-sections`, {
      method: "POST",
      headers: { "content-type": "application/json", "X-Admin-Token": adminToken },
      body: JSON.stringify(output),
    });
    console.log(`Load response: ${res.status} ${await res.text()}`);
  } else {
    console.log("\n(Set WORKER_ADMIN_URL and WORKER_ADMIN_TOKEN in ingest/.env to auto-load into D1/Vectorize.)");
  }
}

async function main() {
  const { chapterFilter, creaturesOnly } = parseArgs();
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const creatureSections = buildCreatureSections(SEED_PATH).map((c, i) => ({
    id: slugify("creature", c.title),
    chapter: c.chapter,
    heading: c.title,
    heading_path: c.headingPath,
    order: 100000 + i,
    type: c.type,
    read_aloud_text: c.read_aloud_text,
    dm_only_text: c.dm_only_text,
    reveals: [] as Reveal[],
    references: [] as string[],
    stat_block: c.stat_block,
  }));
  const creatureNames = creatureSections.map((c) => c.stat_block ? (c.stat_block as { name: string }).name : "");

  const allParsed = parseMarkdown(MD_PATH);

  if (creaturesOnly) {
    const itemNames = extractItemNames(allParsed, MD_PATH);
    const itemSections = buildItemSections(itemNames).map((it, i) => ({
      id: slugify("item", it.title),
      chapter: it.chapter,
      heading: it.title,
      heading_path: it.headingPath,
      order: 200000 + i,
      type: it.type,
      read_aloud_text: it.read_aloud_text,
      dm_only_text: it.dm_only_text,
      reveals: [] as Reveal[],
      references: [] as string[],
    }));
    const output = [...creatureSections, ...itemSections];
    writeFileSync(`${OUTPUT_DIR}/creatures-items.json`, JSON.stringify(output, null, 2));
    await loadIntoWorker(output);
    return;
  }

  const parsed =
    chapterFilter === "all" ? allParsed : allParsed.filter((s) => String(chapterNumber(s.chapter)) === chapterFilter);

  console.log(`Classifying ${parsed.length} sections (chapter filter: ${chapterFilter})...`);

  const classified: FinalSection[] = [];
  for (const section of parsed) {
    process.stdout.write(`  [${section.order}] ${section.title} ... `);
    const result = await classifySection(section, creatureNames);
    console.log(`${result.type}, ${result.reveals.length} reveal(s), refs: [${result.creature_references.join(", ")}]`);

    const refs = result.creature_references
      .map((name) => creatureSections.find((c) => (c.stat_block as { name: string }).name === name)?.id)
      .filter((x): x is string => Boolean(x));

    classified.push({
      id: slugify(String(chapterNumber(section.chapter)), section.title),
      chapter: section.chapter,
      heading: section.title,
      heading_path: section.headingPath,
      order: section.order,
      type: result.type,
      read_aloud_text: result.read_aloud_text,
      dm_only_text: result.dm_only_text,
      reveals: result.reveals,
      references: refs,
    });
  }

  const output: FinalSection[] = [...classified];
  if (chapterFilter === "all") {
    output.push(...creatureSections);
    const itemNames = extractItemNames(allParsed, MD_PATH);
    const itemSections = buildItemSections(itemNames).map((it, i) => ({
      id: slugify("item", it.title),
      chapter: it.chapter,
      heading: it.title,
      heading_path: it.headingPath,
      order: 200000 + i,
      type: it.type,
      read_aloud_text: it.read_aloud_text,
      dm_only_text: it.dm_only_text,
      reveals: [] as Reveal[],
      references: [] as string[],
    }));
    output.push(...itemSections);
  }

  const outPath = `${OUTPUT_DIR}/chapter-${chapterFilter}.json`;
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\nWrote ${output.length} sections to ${outPath}`);

  await loadIntoWorker(output);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
