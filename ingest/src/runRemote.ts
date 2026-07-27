import "dotenv/config";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { parseMarkdown, extractItemNames, chapterNumber } from "./parseMarkdown.js";
import { buildCreatureSections } from "./buildCreatureSections.js";
import { buildItemSections } from "./buildItemSections.js";
import { slugify } from "./slugify.js";
import type { SectionType, Reveal, ParsedSection } from "./types.js";

const MD_PATH = "../Dragons of Stormwreck Isle.md";
const SEED_PATH = "../dosi-creatures-seed.json";
const OUTPUT_DIR = "./output";
const CHECKPOINT_PATH = `${OUTPUT_DIR}/checkpoint.json`;
const LOAD_BATCH_SIZE = 10;

interface FinalSection {
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

const CORRUPTION_MARKERS = ["</dm_only_text>", "</read_aloud_text>", "<parameter"];
function looksCorrupted(text: string): boolean {
  return CORRUPTION_MARKERS.some((m) => text.includes(m));
}

interface RemoteClassifyResult {
  type: SectionType;
  read_aloud_text: string;
  dm_only_text: string;
  reveals: Reveal[];
  creature_references: string[];
}

async function classifyRemote(section: ParsedSection, creatureNames: string[]): Promise<RemoteClassifyResult> {
  const url = process.env.WORKER_ADMIN_URL;
  const token = process.env.WORKER_ADMIN_TOKEN;
  if (!url || !token) throw new Error("WORKER_ADMIN_URL / WORKER_ADMIN_TOKEN not set");

  let attempts = 0;
  let result: RemoteClassifyResult;
  do {
    const res = await fetch(`${url}/admin/classify`, {
      method: "POST",
      headers: { "content-type": "application/json", "X-Admin-Token": token },
      body: JSON.stringify({
        chapter: section.chapter,
        headingPath: section.headingPath,
        title: section.title,
        rawText: section.rawText,
        creatureNames,
      }),
    });
    if (!res.ok) throw new Error(`classify ${section.title}: ${res.status} ${await res.text()}`);
    result = (await res.json()) as RemoteClassifyResult;
    attempts++;
  } while (
    (looksCorrupted(result.dm_only_text ?? "") || looksCorrupted(result.read_aloud_text ?? "")) &&
    attempts < 3
  );

  const type: SectionType = result.type === "creature" || result.type === "item" ? "encounter" : result.type;
  return {
    type,
    read_aloud_text: result.read_aloud_text ?? "",
    dm_only_text: result.dm_only_text ?? "",
    reveals: result.reveals ?? [],
    creature_references: (result.creature_references ?? []).filter((n) => creatureNames.includes(n)),
  };
}

async function loadIntoWorker(output: unknown[]) {
  const workerUrl = process.env.WORKER_ADMIN_URL;
  const adminToken = process.env.WORKER_ADMIN_TOKEN;
  console.log(`\nLoading ${output.length} sections into ${workerUrl} ...`);
  const res = await fetch(`${workerUrl}/admin/load-sections`, {
    method: "POST",
    headers: { "content-type": "application/json", "X-Admin-Token": adminToken! },
    body: JSON.stringify(output),
  });
  console.log(`Load response: ${res.status} ${await res.text()}`);
}

async function main() {
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
  const creatureNames = creatureSections.map((c) => (c.stat_block ? (c.stat_block as { name: string }).name : ""));

  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : undefined;
  const allParsedFull = parseMarkdown(MD_PATH);
  const allParsed = limit ? allParsedFull.slice(0, limit) : allParsedFull;
  const skipLoad = process.argv.includes("--skip-load");
  const resume = process.argv.includes("--resume");

  const classified: FinalSection[] = [];
  const doneOrders = new Set<number>();
  let pendingLoad: FinalSection[] = [];

  if (resume && existsSync(CHECKPOINT_PATH)) {
    const prior = JSON.parse(readFileSync(CHECKPOINT_PATH, "utf-8")) as FinalSection[];
    classified.push(...prior);
    for (const s of prior) doneOrders.add(s.order);
    console.log(`Resuming: ${prior.length} sections already classified, skipping them.`);
  }

  const toClassify = allParsed.filter((s) => !doneOrders.has(s.order));
  console.log(`Classifying ${toClassify.length} sections (${doneOrders.size} already done)...`);

  for (const section of toClassify) {
    process.stdout.write(`  [${section.order}] ${section.title} ... `);
    const result = await classifyRemote(section, creatureNames);
    console.log(`${result.type}, ${result.reveals.length} reveal(s), refs: [${result.creature_references.join(", ")}]`);

    const refs = result.creature_references
      .map((name) => creatureSections.find((c) => (c.stat_block as { name: string }).name === name)?.id)
      .filter((x): x is string => Boolean(x));

    const finalSection: FinalSection = {
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
    };
    classified.push(finalSection);
    pendingLoad.push(finalSection);
    writeFileSync(CHECKPOINT_PATH, JSON.stringify(classified, null, 2));

    if (!skipLoad && pendingLoad.length >= LOAD_BATCH_SIZE) {
      await loadIntoWorker(pendingLoad);
      pendingLoad = [];
    }
  }

  if (!skipLoad && pendingLoad.length > 0) {
    await loadIntoWorker(pendingLoad);
    pendingLoad = [];
  }

  let output: FinalSection[] = [...classified];
  let extras: FinalSection[] = [];
  if (!limit) {
    const itemNames = extractItemNames(allParsedFull, MD_PATH);
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
    extras = [...creatureSections, ...itemSections];
    output = [...classified, ...extras];
  }

  const outPath = `${OUTPUT_DIR}/chapter-all-remote.json`;
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\nWrote ${output.length} sections to ${outPath}`);

  if (skipLoad) {
    console.log("--skip-load set, not loading into worker.");
    return;
  }
  // narrative sections were already loaded incrementally above; only creature/item sections remain
  if (extras.length > 0) await loadIntoWorker(extras);
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
