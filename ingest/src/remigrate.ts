/**
 * Migrates an already-ingested module to the block model, reading from the text
 * stored in D1 rather than the original source markdown.
 *
 * LMoP was ingested from a source file that was never committed, so the original
 * pipeline cannot be re-run for it. The content is in the database, though, which
 * makes this the more durable shape anyway: block migration becomes a property of
 * the data rather than of whoever still holds the markdown.
 *
 *   npm run remigrate -- <dumped-sections.json> <module_id>
 */
import "dotenv/config";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { classifySection } from "./classify.js";
import type { Reveal } from "./types.js";

interface StoredSection {
  id: string;
  chapter: string;
  heading: string;
  heading_path: string[];
  order: number;
  type: string;
  dm_only_text: string;
  read_aloud_text: string;
  reveals: { trigger_skill: string; trigger_dc: number; text: string }[];
}

/** Legacy inline markup from the pre-block classifier — keep the text, drop the tags. */
function stripLegacyMarkup(text: string): string {
  return text
    .replace(/<\/?cond>/g, "")
    .replace(/\[\[\/?directive\]\]/g, "")
    .trim();
}

/**
 * Rebuilds something the classifier can read from the already-split fields.
 * The bracketed labels are structural hints; the prompt is told not to echo them.
 */
function reconstruct(section: StoredSection): string {
  const parts: string[] = [];
  if (section.read_aloud_text.trim()) {
    parts.push(`[Read-aloud passage, as printed in the adventure]\n${section.read_aloud_text.trim()}`);
  }
  if (section.dm_only_text.trim()) {
    parts.push(`[DM-facing text]\n${stripLegacyMarkup(section.dm_only_text)}`);
  }
  if (section.reveals.length) {
    const lines = section.reveals
      .map((r) => `- DC ${r.trigger_dc} ${r.trigger_skill}: ${r.text}`)
      .join("\n");
    parts.push(`[Information the adventure gates behind ability checks]\n${lines}`);
  }
  return parts.join("\n\n");
}

async function main() {
  const [sourcePath, moduleId] = process.argv.slice(2);
  if (!sourcePath || !moduleId) {
    console.error("usage: npm run remigrate -- <dumped-sections.json> <module_id>");
    process.exit(1);
  }

  const sections = JSON.parse(readFileSync(sourcePath, "utf-8")) as StoredSection[];
  mkdirSync("./output", { recursive: true });
  const outPath = `./output/${moduleId}-remigrated.json`;

  // Resume from whatever a previous run got through. A single malformed tool
  // response used to abort the whole pass and discard every section before it.
  let output: Record<string, unknown>[] = [];
  try {
    output = JSON.parse(readFileSync(outPath, "utf-8")) as Record<string, unknown>[];
  } catch {
    /* no checkpoint yet */
  }
  const done = new Set(output.map((s) => s.id as string));
  const todo = sections.filter((s) => !done.has(s.id));
  if (done.size) console.log(`Resuming: ${done.size} already done, ${todo.length} to go.`);
  console.log(`Re-classifying ${todo.length} ${moduleId} sections from stored text...`);
  let revealsBefore = 0;
  let checksAfter = 0;
  const lostReveals: string[] = [];

  for (const section of todo) {
    process.stdout.write(`  ${section.heading.slice(0, 44).padEnd(44)} `);
    const result = await classifySection(
      {
        order: section.order,
        level: section.heading_path.length,
        title: section.heading,
        chapter: section.chapter,
        headingPath: section.heading_path,
        rawText: reconstruct(section),
      },
      // LMoP has no creature stat blocks loaded, so there is nothing to link to.
      [],
      `${moduleId}-stored`
    );

    revealsBefore += section.reveals.length;
    checksAfter += result.reveals.length;
    if (result.reveals.length < section.reveals.length) lostReveals.push(section.id);

    console.log(
      `${result.read_alouds.length} ra, ${result.reveals.length} ck, ${result.conditionals.length} cond, ` +
        `${result.prompts.length} pr, ${result.technique.length} tq, ${result.features.length} ft`
    );

    // No category is a valid outcome for a heading-only stub, but this section
    // had real text — so if the classifier returned nothing at all, keep the
    // original prose as background rather than silently dropping it.
    const producedNothing =
      !result.read_alouds.length &&
      !result.reveals.length &&
      !result.conditionals.length &&
      !result.prompts.length &&
      !result.technique.length &&
      !result.features.length &&
      !result.background_text.trim();
    // A section that comes back far shorter than it went in has been summarised
    // rather than split — usually an enumerated list collapsed to a sentence.
    // Keep the extracted blocks, but restore the full prose as background.
    const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
    const sourceWords = words(stripLegacyMarkup(section.dm_only_text)) + words(section.read_aloud_text);
    const producedWords =
      words(result.background_text) +
      result.read_alouds.reduce((n, x) => n + words(x.text), 0) +
      result.conditionals.reduce((n, x) => n + words(`${x.condition} ${x.effect}`), 0) +
      result.technique.reduce((n, x) => n + words(x.text), 0) +
      result.features.reduce((n, x) => n + words(x.text), 0) +
      result.reveals.reduce((n, x) => n + words(x.text), 0);
    const summarised = sourceWords > 60 && producedWords < sourceWords * 0.6;
    if (summarised) console.log(`      (restored full prose — output was ${producedWords}/${sourceWords} words)`);

    const background =
      producedNothing || summarised ? stripLegacyMarkup(section.dm_only_text) : result.background_text;

    output.push({
      id: section.id,
      module_id: moduleId,
      chapter: section.chapter,
      heading: section.heading,
      heading_path: section.heading_path,
      order: section.order,
      // The existing types were reviewed during the original ingestion; keep them
      // rather than letting a second opinion churn them.
      type: section.type,
      read_aloud_text: "",
      dm_only_text: "",
      reveals: result.reveals as Reveal[],
      references: [] as string[],
      read_alouds: result.read_alouds,
      background_text: background,
      prompts: result.prompts,
      technique: result.technique,
      conditionals: result.conditionals,
      features: result.features,
    });
    writeFileSync(outPath, JSON.stringify(output, null, 2));
  }

  writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\nWrote ${output.length} sections to ${outPath}`);
  console.log(`checks: ${revealsBefore} before -> ${checksAfter} after`);
  if (lostReveals.length) {
    console.log(`${lostReveals.length} section(s) came back with fewer checks than they had reveals:`);
    lostReveals.forEach((id) => console.log(`  ${id}`));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
