import type {
  Conditional,
  Env,
  Feature,
  IngestSection,
  Prompt,
  ReadAloud,
  Reveal,
  SectionBlocks,
  SectionDetail,
  SectionRow,
  SectionType,
  Technique,
} from "./types.js";

/**
 * sections.read_aloud_text and dm_only_text are kept as derived columns. Chat,
 * search, the stat block popup and the Vectorize embeddings all still read them,
 * so composing them from the blocks keeps those paths working unchanged while
 * the Campaign page reads the structured tables.
 *
 * A section ingested before the block model has no blocks; its existing text is
 * passed through untouched.
 */
function derivedReadAloudText(section: IngestSection): string {
  if (!section.read_alouds?.length) return section.read_aloud_text;
  return section.read_alouds.map((r) => r.text).join("\n\n");
}

function derivedDmOnlyText(section: IngestSection): string {
  const hasBlocks =
    section.background_text !== undefined ||
    section.prompts?.length ||
    section.technique?.length ||
    section.conditionals?.length ||
    section.features?.length;
  if (!hasBlocks) return section.dm_only_text;

  const parts: string[] = [];
  if (section.background_text) parts.push(section.background_text);
  for (const f of section.features ?? []) parts.push(`${f.name}. ${f.text}`);
  for (const c of section.conditionals ?? []) parts.push(`If ${c.condition}: ${c.effect}`);
  for (const p of section.prompts ?? []) parts.push(p.text);
  for (const t of section.technique ?? []) parts.push(`${t.name}. ${t.text}`);
  return parts.join("\n\n");
}

/** Block tables hold no per-campaign state, so replacing them wholesale is safe. */
async function upsertBlocks(db: D1Database, section: IngestSection): Promise<void> {
  const replace = async (table: string, columns: string[], rows: unknown[][]) => {
    await db.prepare(`DELETE FROM ${table} WHERE section_id = ?`).bind(section.id).run();
    const placeholders = ["?", ...columns.map(() => "?")].join(", ");
    for (const row of rows) {
      await db
        .prepare(`INSERT INTO ${table} (section_id, ${columns.join(", ")}) VALUES (${placeholders})`)
        .bind(section.id, ...row)
        .run();
    }
  };

  await replace(
    "read_alouds",
    ["ordinal", "source", "cue", "text"],
    (section.read_alouds ?? []).map((r, i) => [i, r.source, r.cue ?? "", r.text])
  );
  await replace(
    "prompts",
    ["ordinal", "text"],
    (section.prompts ?? []).map((p, i) => [i, p.text])
  );
  await replace(
    "technique",
    ["ordinal", "name", "text"],
    (section.technique ?? []).map((t, i) => [i, t.name, t.text])
  );
  await replace(
    "conditionals",
    ["ordinal", "kind", "condition", "effect"],
    (section.conditionals ?? []).map((c, i) => [i, c.kind, c.condition, c.effect])
  );
  await replace(
    "features",
    ["ordinal", "name", "text"],
    (section.features ?? []).map((f, i) => [i, f.name, f.text])
  );
}

function emptyBlocks(background = ""): SectionBlocks {
  return {
    read_alouds: [],
    background_text: background,
    prompts: [],
    technique: [],
    conditionals: [],
    features: [],
  };
}

/**
 * Loads every block table for the sections matched by `where`, which is applied
 * against the block table aliased `b` and its section aliased `s`. Returns one
 * entry per section that has at least one block row; callers fall back to
 * `emptyBlocks()` for sections that predate the block model.
 */
async function loadBlocks(env: Env, where: string, binds: unknown[]): Promise<Map<string, SectionBlocks>> {
  const query = <T>(table: string, columns: string) =>
    env.DB.prepare(
      `SELECT b.section_id, ${columns} FROM ${table} b
       JOIN sections s ON s.id = b.section_id
       WHERE ${where} ORDER BY b.section_id, b.ordinal`
    )
      .bind(...binds)
      .all<T & { section_id: string }>();

  const [readAlouds, prompts, technique, conditionals, features] = await Promise.all([
    query<ReadAloud>("read_alouds", "b.ordinal, b.source, b.cue, b.text"),
    query<Prompt>("prompts", "b.ordinal, b.text"),
    query<Technique>("technique", "b.ordinal, b.name, b.text"),
    query<Conditional>("conditionals", "b.ordinal, b.kind, b.condition, b.effect"),
    query<Feature>("features", "b.ordinal, b.name, b.text"),
  ]);

  const blocks = new Map<string, SectionBlocks>();
  const bucket = (sectionId: string) => {
    let entry = blocks.get(sectionId);
    if (!entry) {
      entry = emptyBlocks();
      blocks.set(sectionId, entry);
    }
    return entry;
  };

  for (const r of readAlouds.results) bucket(r.section_id).read_alouds.push(r);
  for (const r of prompts.results) bucket(r.section_id).prompts.push(r);
  for (const r of technique.results) bucket(r.section_id).technique.push(r);
  for (const r of conditionals.results) bucket(r.section_id).conditionals.push(r);
  for (const r of features.results) bucket(r.section_id).features.push(r);
  return blocks;
}

function revealFromRow(r: {
  id: number;
  trigger_skill: string;
  trigger_dc: number;
  text: string;
  revealed: number;
  ordinal?: number;
  context?: string;
  skills?: string;
  dc?: number | null;
  passive?: number;
  kind?: string;
  cost?: string;
  fail_text?: string;
}): Reveal {
  return {
    id: r.id,
    trigger_skill: r.trigger_skill,
    trigger_dc: r.trigger_dc,
    text: r.text,
    revealed: Boolean(r.revealed),
    ordinal: r.ordinal ?? 0,
    context: r.context ?? "",
    skills: r.skills ? (JSON.parse(r.skills) as string[]) : [],
    dc: r.dc ?? null,
    passive: Boolean(r.passive),
    kind: (r.kind ?? "info") as Reveal["kind"],
    cost: r.cost ?? "",
    fail_text: r.fail_text ?? "",
  };
}

const REVEAL_COLUMNS = `rd.id, rd.section_id, rd.trigger_skill, rd.trigger_dc, rd.text,
  rd.ordinal, rd.context, rd.skills, rd.dc, rd.passive, rd.kind, rd.cost, rd.fail_text`;

export async function upsertSection(env: Env, section: IngestSection): Promise<void> {
  const db = env.DB;
  await db
    .prepare(
      `INSERT INTO sections (id, module_id, chapter, heading, heading_path, "order", type, dm_only_text, read_aloud_text, background_text)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         module_id=excluded.module_id, chapter=excluded.chapter, heading=excluded.heading,
         heading_path=excluded.heading_path, "order"=excluded."order", type=excluded.type,
         dm_only_text=excluded.dm_only_text, read_aloud_text=excluded.read_aloud_text,
         background_text=excluded.background_text`
    )
    .bind(
      section.id,
      section.module_id,
      section.chapter,
      section.heading,
      JSON.stringify(section.heading_path),
      section.order,
      section.type,
      derivedDmOnlyText(section),
      derivedReadAloudText(section),
      section.background_text ?? ""
    )
    .run();

  // Reveal defs are upserted on their stable (section_id, ordinal) key rather than
  // deleted and re-inserted. Re-inserting handed every row a new autoincrement id,
  // which left campaign_reveal_state pointing at rows that no longer existed and
  // silently reset every DM's revealed progress on each re-ingest.
  for (let i = 0; i < section.reveals.length; i++) {
    const r = section.reveals[i];
    const skills = r.skills ?? (r.trigger_skill ? [r.trigger_skill] : []);
    const dc = r.dc === undefined ? r.trigger_dc ?? null : r.dc;
    await db
      .prepare(
        `INSERT INTO reveal_defs
           (section_id, ordinal, trigger_skill, trigger_dc, dc, skills, context, kind, cost, text, fail_text, passive)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(section_id, ordinal) DO UPDATE SET
           trigger_skill=excluded.trigger_skill, trigger_dc=excluded.trigger_dc, dc=excluded.dc,
           skills=excluded.skills, context=excluded.context, kind=excluded.kind, cost=excluded.cost,
           text=excluded.text, fail_text=excluded.fail_text, passive=excluded.passive`
      )
      .bind(
        section.id,
        i,
        skills[0] ?? "",
        dc ?? 0, // legacy NOT NULL column; `dc` carries the real, nullable value
        dc,
        JSON.stringify(skills),
        r.context ?? "",
        r.kind ?? "info",
        r.cost ?? "",
        r.text,
        r.fail_text ?? "",
        r.passive ? 1 : 0
      )
      .run();
  }

  // Only rows past the new end are surplus. Drop their campaign state first, so
  // re-ingesting a section that lost a reveal doesn't leave orphans behind either.
  await db
    .prepare(
      `DELETE FROM campaign_reveal_state WHERE reveal_def_id IN
         (SELECT id FROM reveal_defs WHERE section_id = ? AND ordinal >= ?)`
    )
    .bind(section.id, section.reveals.length)
    .run();
  await db
    .prepare(`DELETE FROM reveal_defs WHERE section_id = ? AND ordinal >= ?`)
    .bind(section.id, section.reveals.length)
    .run();

  // Content blocks carry no per-campaign state, so a straight replace is fine.
  await upsertBlocks(db, section);

  await db.prepare(`DELETE FROM section_references WHERE source_section_id = ?`).bind(section.id).run();
  for (const refId of section.references) {
    await db
      .prepare(`INSERT INTO section_references (source_section_id, referenced_section_id) VALUES (?, ?)`)
      .bind(section.id, refId)
      .run();
  }

  if (section.stat_block) {
    await db
      .prepare(
        `INSERT INTO creature_stats (section_id, stat_block_json) VALUES (?, ?)
         ON CONFLICT(section_id) DO UPDATE SET stat_block_json=excluded.stat_block_json`
      )
      .bind(section.id, JSON.stringify(section.stat_block))
      .run();
  }
}

export function embeddingText(section: Pick<IngestSection, "dm_only_text" | "read_aloud_text" | "heading">): string {
  return [section.heading, section.read_aloud_text, section.dm_only_text].filter(Boolean).join("\n\n");
}

export async function getSectionDetail(
  env: Env,
  campaignId: string,
  moduleId: string,
  id: string
): Promise<SectionDetail | null> {
  const section = await env.DB.prepare(`SELECT * FROM sections WHERE id = ? AND module_id = ?`)
    .bind(id, moduleId)
    .first<SectionRow>();
  if (!section) return null;

  const { results: reveals } = await env.DB.prepare(
    `SELECT ${REVEAL_COLUMNS}, COALESCE(crs.revealed, 0) as revealed
     FROM reveal_defs rd
     LEFT JOIN campaign_reveal_state crs ON crs.reveal_def_id = rd.id AND crs.campaign_id = ?
     WHERE rd.section_id = ?
     ORDER BY rd.ordinal`
  )
    .bind(campaignId, id)
    .all<Parameters<typeof revealFromRow>[0]>();

  const blocks = (await loadBlocks(env, `b.section_id = ?`, [id])).get(id) ?? emptyBlocks();

  const statBlockRow = await env.DB.prepare(`SELECT stat_block_json FROM creature_stats WHERE section_id = ?`)
    .bind(id)
    .first<{ stat_block_json: string }>();

  const { results: references } = await env.DB.prepare(
    `SELECT s.id, s.heading, s.type FROM section_references sr
     JOIN sections s ON s.id = sr.referenced_section_id
     WHERE sr.source_section_id = ?`
  )
    .bind(id)
    .all<{ id: string; heading: string; type: SectionType }>();

  return {
    id: section.id,
    chapter: section.chapter,
    heading: section.heading,
    heading_path: JSON.parse(section.heading_path),
    type: section.type,
    read_aloud_text: section.read_aloud_text,
    dm_only_text: section.dm_only_text,
    reveals: reveals.map(revealFromRow),
    stat_block: statBlockRow ? JSON.parse(statBlockRow.stat_block_json) : null,
    references,
    ...blocks,
    background_text: section.background_text ?? "",
  };
}

export async function getCampaignSections(env: Env, campaignId: string, moduleId: string): Promise<SectionDetail[]> {
  const { results: sections } = await env.DB.prepare(
    `SELECT * FROM sections WHERE module_id = ? AND type != 'creature' AND type != 'item' ORDER BY "order" ASC`
  )
    .bind(moduleId)
    .all<SectionRow>();
  if (sections.length === 0) return [];

  const { results: allReveals } = await env.DB.prepare(
    `SELECT ${REVEAL_COLUMNS}, COALESCE(crs.revealed, 0) as revealed
     FROM reveal_defs rd
     JOIN sections s ON s.id = rd.section_id
     LEFT JOIN campaign_reveal_state crs ON crs.reveal_def_id = rd.id AND crs.campaign_id = ?
     WHERE s.module_id = ? AND s.type != 'creature' AND s.type != 'item'
     ORDER BY rd.section_id, rd.ordinal`
  )
    .bind(campaignId, moduleId)
    .all<Parameters<typeof revealFromRow>[0] & { section_id: string }>();

  const blocksBySection = await loadBlocks(
    env,
    `s.module_id = ? AND s.type != 'creature' AND s.type != 'item'`,
    [moduleId]
  );

  const { results: allReferences } = await env.DB.prepare(
    `SELECT sr.source_section_id, ref.id, ref.heading, ref.type FROM section_references sr
     JOIN sections src ON src.id = sr.source_section_id
     JOIN sections ref ON ref.id = sr.referenced_section_id
     WHERE src.module_id = ? AND src.type != 'creature' AND src.type != 'item'`
  )
    .bind(moduleId)
    .all<{ source_section_id: string; id: string; heading: string; type: SectionType }>();

  const revealsBySection = new Map<string, Reveal[]>();
  for (const r of allReveals) {
    const list = revealsBySection.get(r.section_id) ?? [];
    list.push(revealFromRow(r));
    revealsBySection.set(r.section_id, list);
  }

  const referencesBySection = new Map<string, { id: string; heading: string; type: SectionType }[]>();
  for (const r of allReferences) {
    const list = referencesBySection.get(r.source_section_id) ?? [];
    list.push({ id: r.id, heading: r.heading, type: r.type });
    referencesBySection.set(r.source_section_id, list);
  }

  return sections.map((section) => ({
    id: section.id,
    chapter: section.chapter,
    heading: section.heading,
    heading_path: JSON.parse(section.heading_path),
    type: section.type,
    read_aloud_text: section.read_aloud_text,
    dm_only_text: section.dm_only_text,
    reveals: revealsBySection.get(section.id) ?? [],
    stat_block: null,
    references: referencesBySection.get(section.id) ?? [],
    ...(blocksBySection.get(section.id) ?? emptyBlocks()),
    // background_text is a column on sections, not a block table.
    background_text: section.background_text ?? "",
  }));
}

export async function getCreatureSections(
  env: Env,
  moduleId: string
): Promise<{ id: string; heading: string; chapter: string }[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, heading, chapter FROM sections WHERE type = 'creature' AND module_id = ? ORDER BY heading ASC`
  )
    .bind(moduleId)
    .all<{ id: string; heading: string; chapter: string }>();
  return results;
}

export async function getNarrativeReferencesTo(env: Env, moduleId: string, creatureSectionId: string) {
  const { results } = await env.DB.prepare(
    `SELECT s.id, s.heading, s.chapter, s.dm_only_text, s.read_aloud_text FROM section_references sr
     JOIN sections s ON s.id = sr.source_section_id
     WHERE sr.referenced_section_id = ? AND s.module_id = ?`
  )
    .bind(creatureSectionId, moduleId)
    .all<{ id: string; heading: string; chapter: string; dm_only_text: string; read_aloud_text: string }>();
  return results;
}

export async function toggleReveal(
  env: Env,
  campaignId: string,
  revealDefId: number,
  revealed: boolean
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO campaign_reveal_state (campaign_id, reveal_def_id, revealed, revealed_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(campaign_id, reveal_def_id) DO UPDATE SET revealed=excluded.revealed, revealed_at=excluded.revealed_at`
  )
    .bind(campaignId, revealDefId, revealed ? 1 : 0, revealed ? Date.now() : null)
    .run();
}
