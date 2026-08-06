/**
 * Dumps a module's sections back out of D1 in the shape the loader consumes.
 *
 * The scene, verify and load steps all operate on a classified-sections file,
 * but `ingest/output/` is not committed and LMoP's source markdown was never in
 * the repo — so after a pass has been loaded, the only surviving copy of the
 * classification is the database. Re-running `remigrate` to get a file back
 * would re-classify every section through the API, cost a full pass, and
 * overwrite good output with a second opinion. This reads the block tables
 * directly instead: no API, no re-classification, no drift.
 *
 * The output is byte-for-byte loadable, which is the property that matters —
 * `upsertSection` REPLACES every block table for a section, so anything missing
 * from the dump is deleted on load. `--check` (on by default) guards that: it
 * recomputes the derived text from the dumped blocks and compares it to what the
 * worker last stored, so a reconstruction that lost a block fails loudly here
 * rather than silently at load time.
 *
 *   npm run dump -- lmop                   # whole module
 *   npm run dump -- lmop --scene-targets   # only rooms the scene pass will touch
 *
 * Reads through `wrangler d1 execute --remote`, so it needs CLOUDFLARE_API_TOKEN
 * rather than any of the ingest API credentials.
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { Conditional, NamedBlock, Prompt, ReadAloud, Reveal } from "./types.js";

/** D1 caps response size, so every read is paged. */
const PAGE = 40;

/** Absolute so the dump works whether npm resolves the script from the root or ingest/. */
const WRANGLER_CONFIG = resolve(dirname(fileURLToPath(import.meta.url)), "../../worker/wrangler.toml");

interface SectionRow {
  id: string;
  chapter: string;
  heading: string;
  heading_path: string;
  order: number;
  type: string;
  background_text: string;
  dm_only_text: string;
  read_aloud_text: string;
}

function query<T>(sql: string): T[] {
  const out = execFileSync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      "dosi-db",
      "--remote",
      "--json",
      "--config",
      WRANGLER_CONFIG,
      "--command",
      sql,
    ],
    { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }
  );
  // wrangler prefixes human-readable banners before the JSON payload.
  const start = out.indexOf("[");
  if (start === -1) throw new Error(`no JSON in wrangler output: ${out.slice(0, 300)}`);
  const parsed = JSON.parse(out.slice(start)) as { results: T[]; success: boolean }[];
  return parsed[0]?.results ?? [];
}

/** Runs `sql` with LIMIT/OFFSET appended until a short page comes back. */
function queryAll<T>(sql: string): T[] {
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = query<T>(`${sql} LIMIT ${PAGE} OFFSET ${offset}`);
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

/** Groups child rows by section_id, preserving the ordinal ordering of the query. */
function groupBySection<T extends { section_id: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const list = map.get(row.section_id);
    if (list) list.push(row);
    else map.set(row.section_id, [row]);
  }
  return map;
}

/**
 * Mirrors the worker's derivation exactly (worker/src/db.ts). Duplicated rather
 * than imported because the worker is a separate build with its own types, and
 * the whole point here is to check the two agree — a shared helper would make
 * the check vacuous.
 */
function derivedReadAloudText(readAlouds: ReadAloud[]): string {
  return readAlouds.map((r) => r.text).join("\n\n");
}

function derivedDmOnlyText(s: {
  background_text: string;
  features: NamedBlock[];
  conditionals: Conditional[];
  prompts: Prompt[];
  technique: NamedBlock[];
}): string {
  const parts: string[] = [];
  if (s.background_text) parts.push(s.background_text);
  for (const f of s.features) parts.push(`${f.name}. ${f.text}`);
  for (const c of s.conditionals) parts.push(`If ${c.condition}: ${c.effect}`);
  for (const p of s.prompts) parts.push(p.text);
  for (const t of s.technique) parts.push(`${t.name}. ${t.text}`);
  return parts.join("\n\n");
}

async function main() {
  const args = process.argv.slice(2);
  const moduleId = args.find((a) => !a.startsWith("--"));
  const sceneTargets = args.includes("--scene-targets");
  const skipCheck = args.includes("--no-check");

  if (!moduleId) {
    console.error("usage: npm run dump -- <module_id> [--scene-targets] [--no-check]");
    process.exit(1);
  }
  // Inlined into SQL because `wrangler d1 execute --command` takes no bind params.
  if (!/^[a-z0-9_-]+$/i.test(moduleId)) {
    console.error(`invalid module id: ${moduleId}`);
    process.exit(1);
  }

  // The scene pass targets exactly this set: location sections the book actually
  // describes. Restricting the dump keeps the reload to the sections that change.
  const filter = sceneTargets
    ? `AND s.type = 'location' AND EXISTS (
         SELECT 1 FROM read_alouds r WHERE r.section_id = s.id AND r.source = 'book')`
    : "";

  console.log(`Dumping ${moduleId}${sceneTargets ? " (scene targets)" : ""}...`);

  const sections = queryAll<SectionRow>(
    `SELECT s.id, s.chapter, s.heading, s.heading_path, s."order", s.type,
            s.background_text, s.dm_only_text, s.read_aloud_text
     FROM sections s
     WHERE s.module_id = '${moduleId}' ${filter}
     ORDER BY s."order"`
  );
  if (!sections.length) {
    console.error(`no sections matched module '${moduleId}'`);
    process.exit(1);
  }
  const ids = new Set(sections.map((s) => s.id));
  console.log(`  ${sections.length} sections`);

  // Child rows are fetched for the whole module and filtered locally: one paged
  // read per table regardless of how many sections matched.
  const childFilter = `JOIN sections s ON s.id = b.section_id WHERE s.module_id = '${moduleId}'`;
  const readAlouds = groupBySection(
    queryAll<{ section_id: string } & ReadAloud>(
      `SELECT b.section_id, b.ordinal, b.source, b.cue, b.text FROM read_alouds b
       ${childFilter} ORDER BY b.section_id, b.ordinal`
    )
  );
  const prompts = groupBySection(
    queryAll<{ section_id: string } & Prompt>(
      `SELECT b.section_id, b.ordinal, b.text FROM prompts b
       ${childFilter} ORDER BY b.section_id, b.ordinal`
    )
  );
  const conditionals = groupBySection(
    queryAll<{ section_id: string } & Conditional>(
      `SELECT b.section_id, b.ordinal, b.kind, b.condition, b.effect FROM conditionals b
       ${childFilter} ORDER BY b.section_id, b.ordinal`
    )
  );
  const technique = groupBySection(
    queryAll<{ section_id: string } & NamedBlock>(
      `SELECT b.section_id, b.ordinal, b.name, b.text FROM technique b
       ${childFilter} ORDER BY b.section_id, b.ordinal`
    )
  );
  const features = groupBySection(
    queryAll<{ section_id: string } & NamedBlock>(
      `SELECT b.section_id, b.ordinal, b.name, b.text FROM features b
       ${childFilter} ORDER BY b.section_id, b.ordinal`
    )
  );
  const reveals = groupBySection(
    queryAll<{
      section_id: string;
      ordinal: number;
      context: string;
      skills: string;
      dc: number | null;
      passive: number;
      kind: string;
      cost: string;
      text: string;
      fail_text: string;
      trigger_skill: string;
      trigger_dc: number;
    }>(
      `SELECT b.section_id, b.ordinal, b.context, b.skills, b.dc, b.passive, b.kind,
              b.cost, b.text, b.fail_text, b.trigger_skill, b.trigger_dc
       FROM reveal_defs b ${childFilter} ORDER BY b.section_id, b.ordinal`
    )
  );
  const references = groupBySection(
    queryAll<{ section_id: string; referenced_section_id: string }>(
      `SELECT b.source_section_id AS section_id, b.referenced_section_id
       FROM section_references b
       JOIN sections s ON s.id = b.source_section_id WHERE s.module_id = '${moduleId}'
       ORDER BY b.source_section_id`
    )
  );

  const pick = <T>(map: Map<string, T[]>, id: string): T[] => (ids.has(id) ? map.get(id) ?? [] : []);

  const output = sections.map((s) => {
    const sectionReadAlouds = pick(readAlouds, s.id).map(
      ({ ordinal, source, cue, text }): ReadAloud => ({ ordinal, source, cue, text })
    );
    const sectionPrompts = pick(prompts, s.id).map(({ ordinal, text }): Prompt => ({ ordinal, text }));
    const sectionConditionals = pick(conditionals, s.id).map(
      ({ ordinal, kind, condition, effect }): Conditional => ({ ordinal, kind, condition, effect })
    );
    const sectionTechnique = pick(technique, s.id).map(
      ({ ordinal, name, text }): NamedBlock => ({ ordinal, name, text })
    );
    const sectionFeatures = pick(features, s.id).map(
      ({ ordinal, name, text }): NamedBlock => ({ ordinal, name, text })
    );
    const sectionReveals = pick(reveals, s.id).map(
      (r): Reveal => ({
        ordinal: r.ordinal,
        context: r.context,
        skills: JSON.parse(r.skills || "[]") as string[],
        dc: r.dc,
        passive: Boolean(r.passive),
        kind: r.kind as Reveal["kind"],
        cost: r.cost,
        text: r.text,
        fail_text: r.fail_text,
        trigger_skill: r.trigger_skill,
        trigger_dc: r.trigger_dc,
      })
    );

    return {
      id: s.id,
      module_id: moduleId,
      chapter: s.chapter,
      heading: s.heading,
      heading_path: JSON.parse(s.heading_path || "[]") as string[],
      order: s.order,
      type: s.type,
      // Derived server-side from the blocks, exactly as run.ts and remigrate.ts send them.
      read_aloud_text: "",
      dm_only_text: "",
      reveals: sectionReveals,
      references: pick(references, s.id).map((r) => r.referenced_section_id),
      read_alouds: sectionReadAlouds,
      background_text: s.background_text,
      prompts: sectionPrompts,
      technique: sectionTechnique,
      conditionals: sectionConditionals,
      features: sectionFeatures,
    };
  });

  if (!skipCheck) {
    // Reloading this file replaces every block table for every section in it, so
    // prove the reconstruction round-trips before anything is written back.
    const mismatched: string[] = [];
    for (let i = 0; i < output.length; i++) {
      const dumped = output[i];
      const stored = sections[i];
      const readAloudOk =
        derivedReadAloudText(dumped.read_alouds) === stored.read_aloud_text ||
        (!dumped.read_alouds.length && !stored.read_aloud_text);
      const dmOnlyOk = derivedDmOnlyText(dumped) === stored.dm_only_text;
      if (!readAloudOk || !dmOnlyOk) {
        mismatched.push(`${dumped.id} (${!readAloudOk ? "read_aloud" : ""}${!dmOnlyOk ? " dm_only" : ""})`);
      }
    }
    if (mismatched.length) {
      console.error(
        `\n${mismatched.length}/${output.length} sections do not round-trip — DO NOT LOAD THIS FILE.`
      );
      mismatched.slice(0, 20).forEach((m) => console.error(`  ${m}`));
      process.exit(1);
    }
    console.log(`  round-trip check passed for all ${output.length} sections`);
  }

  const counts = output.reduce(
    (acc, s) => ({
      read_alouds: acc.read_alouds + s.read_alouds.length,
      checks: acc.checks + s.reveals.length,
      conditionals: acc.conditionals + s.conditionals.length,
      prompts: acc.prompts + s.prompts.length,
      technique: acc.technique + s.technique.length,
      features: acc.features + s.features.length,
    }),
    { read_alouds: 0, checks: 0, conditionals: 0, prompts: 0, technique: 0, features: 0 }
  );

  mkdirSync("./output", { recursive: true });
  const outPath = `./output/${moduleId}-dump${sceneTargets ? "-scene-targets" : ""}.json`;
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\nWrote ${output.length} sections to ${outPath}`);
  console.log(
    `  ${counts.read_alouds} read-alouds, ${counts.checks} checks, ${counts.conditionals} conditionals, ` +
      `${counts.prompts} prompts, ${counts.technique} technique, ${counts.features} features`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
