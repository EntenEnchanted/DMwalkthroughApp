import type { Env, IngestSection, Reveal, SectionDetail, SectionRow, SectionType } from "./types.js";

export async function upsertSection(env: Env, section: IngestSection): Promise<void> {
  const db = env.DB;
  await db
    .prepare(
      `INSERT INTO sections (id, chapter, heading, heading_path, "order", type, dm_only_text, read_aloud_text)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         chapter=excluded.chapter, heading=excluded.heading, heading_path=excluded.heading_path,
         "order"=excluded."order", type=excluded.type, dm_only_text=excluded.dm_only_text,
         read_aloud_text=excluded.read_aloud_text`
    )
    .bind(
      section.id,
      section.chapter,
      section.heading,
      JSON.stringify(section.heading_path),
      section.order,
      section.type,
      section.dm_only_text,
      section.read_aloud_text
    )
    .run();

  await db.prepare(`DELETE FROM reveals WHERE section_id = ?`).bind(section.id).run();
  for (const r of section.reveals) {
    await db
      .prepare(`INSERT INTO reveals (section_id, trigger_skill, trigger_dc, text, revealed) VALUES (?, ?, ?, ?, 0)`)
      .bind(section.id, r.trigger_skill, r.trigger_dc, r.text)
      .run();
  }

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

export async function getSectionsByIds(env: Env, ids: string[]): Promise<SectionRow[]> {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  const { results } = await env.DB.prepare(`SELECT * FROM sections WHERE id IN (${placeholders})`)
    .bind(...ids)
    .all<SectionRow>();
  return results;
}

export async function getSectionDetail(env: Env, id: string): Promise<SectionDetail | null> {
  const section = await env.DB.prepare(`SELECT * FROM sections WHERE id = ?`).bind(id).first<SectionRow>();
  if (!section) return null;

  const { results: reveals } = await env.DB.prepare(
    `SELECT id, trigger_skill, trigger_dc, text, revealed FROM reveals WHERE section_id = ?`
  )
    .bind(id)
    .all<{ id: number; trigger_skill: string; trigger_dc: number; text: string; revealed: number }>();

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
    reveals: reveals.map((r) => ({ ...r, revealed: Boolean(r.revealed) })),
    stat_block: statBlockRow ? JSON.parse(statBlockRow.stat_block_json) : null,
    references,
  };
}

export async function getCampaignSections(env: Env): Promise<SectionDetail[]> {
  const { results: sections } = await env.DB.prepare(
    `SELECT * FROM sections WHERE type != 'creature' AND type != 'item' ORDER BY "order" ASC`
  ).all<SectionRow>();
  if (sections.length === 0) return [];

  const { results: allReveals } = await env.DB.prepare(
    `SELECT r.id, r.section_id, r.trigger_skill, r.trigger_dc, r.text, r.revealed FROM reveals r
     JOIN sections s ON s.id = r.section_id
     WHERE s.type != 'creature' AND s.type != 'item'`
  ).all<{ id: number; section_id: string; trigger_skill: string; trigger_dc: number; text: string; revealed: number }>();

  const { results: allReferences } = await env.DB.prepare(
    `SELECT sr.source_section_id, ref.id, ref.heading, ref.type FROM section_references sr
     JOIN sections src ON src.id = sr.source_section_id
     JOIN sections ref ON ref.id = sr.referenced_section_id
     WHERE src.type != 'creature' AND src.type != 'item'`
  ).all<{ source_section_id: string; id: string; heading: string; type: SectionType }>();

  const revealsBySection = new Map<string, Reveal[]>();
  for (const r of allReveals) {
    const list = revealsBySection.get(r.section_id) ?? [];
    list.push({ id: r.id, trigger_skill: r.trigger_skill, trigger_dc: r.trigger_dc, text: r.text, revealed: Boolean(r.revealed) });
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
  }));
}

export async function getNarrativeReferencesTo(env: Env, creatureSectionId: string) {
  const { results } = await env.DB.prepare(
    `SELECT s.id, s.heading, s.chapter, s.dm_only_text, s.read_aloud_text FROM section_references sr
     JOIN sections s ON s.id = sr.source_section_id
     WHERE sr.referenced_section_id = ?`
  )
    .bind(creatureSectionId)
    .all<{ id: string; heading: string; chapter: string; dm_only_text: string; read_aloud_text: string }>();
  return results;
}

export async function toggleReveal(env: Env, revealId: number, revealed: boolean): Promise<void> {
  await env.DB.prepare(`UPDATE reveals SET revealed = ? WHERE id = ?`)
    .bind(revealed ? 1 : 0, revealId)
    .run();
}
