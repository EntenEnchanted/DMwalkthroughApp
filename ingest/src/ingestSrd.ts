import { writeFileSync } from "node:fs";

const API_BASE = "https://www.dnd5eapi.co/api/2014";
const SOURCE = "SRD 5.1";
const OUT_PATH = "../worker/seed-srd.sql";

// dnd5eapi.co's `rules` endpoint only has 6 broad category pages; the
// `rule-sections` endpoint underneath them is the actual browsable content
// (33 focused entries, e.g. "The Order of Combat"), so that's what maps to
// the spec's `rule` category. 2024/SRD 5.2 isn't fully populated on this
// API yet (spells/equipment 404), so this pulls SRD 5.1 only for now.
const CATEGORY_ENDPOINTS: Record<string, string> = {
  class: "classes",
  race: "races",
  spell: "spells",
  equipment: "equipment",
  feat: "feats",
  condition: "conditions",
  rule: "rule-sections",
};

interface ListEntry {
  index: string;
  name: string;
  url: string;
}

function sqlEscape(value: string): string {
  return value.replace(/'/g, "''");
}

async function fetchJson(path: string): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit);
    results.push(...(await Promise.all(batch.map(fn))));
  }
  return results;
}

async function ingestCategory(category: string, endpoint: string): Promise<string[]> {
  const list = (await fetchJson(`/${endpoint}`)) as { results: ListEntry[] };
  console.log(`${category}: ${list.results.length} entries`);

  const rows = await mapWithConcurrency(list.results, 10, async (entry) => {
    const detail = await fetchJson(`/${endpoint}/${entry.index}`);
    const slug = `${category}-${entry.index}`;
    const dataJson = JSON.stringify(detail);
    return `INSERT INTO srd_entries (id, category, name, slug, data_json, source) VALUES ('${sqlEscape(
      slug
    )}', '${category}', '${sqlEscape(entry.name)}', '${sqlEscape(slug)}', '${sqlEscape(dataJson)}', '${SOURCE}');`;
  });

  return rows;
}

async function main() {
  const allRows: string[] = ["DELETE FROM srd_entries;"];
  for (const [category, endpoint] of Object.entries(CATEGORY_ENDPOINTS)) {
    allRows.push(...(await ingestCategory(category, endpoint)));
  }

  writeFileSync(OUT_PATH, allRows.join("\n") + "\n");
  console.log(`\nWrote ${allRows.length - 1} rows to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
