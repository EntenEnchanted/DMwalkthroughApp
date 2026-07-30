import type { Env, IngestSection, Reveal, SectionDetail, SectionRow, SectionType } from "./types.js";

export async function upsertSection(env: Env, section: IngestSection): Promise<void> {
  const db = env.DB;
  await db
    .prepare(
      `INSERT INTO sections (id, module_id, chapter, heading, heading_path, "order", type, dm_only_text, read_aloud_text)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         module_id=excluded.module_id, chapter=excluded.chapter, heading=excluded.heading,
         heading_path=excluded.heading_path, "order"=excluded."order", type=excluded.type,
         dm_only_text=excluded.dm_only_text, read_aloud_text=excluded.read_aloud_text`
    )
    .bind(
      section.id,
      section.module_id,
      section.chapter,
      section.heading,
      JSON.stringify(section.heading_path),
      section.order,
      section.type,
      section.dm_only_text,
      section.read_aloud_text
    )
    .run();

  await db.prepare(`DELETE FROM reveal_defs WHERE section_id = ?`).bind(section.id).run();
  for (const r of section.reveals) {
    await db
      .prepare(`INSERT INTO reveal_defs (section_id, trigger_skill, trigger_dc, text) VALUES (?, ?, ?, ?)`)
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
    `SELECT rd.id, rd.trigger_skill, rd.trigger_dc, rd.text, COALESCE(crs.revealed, 0) as revealed
     FROM reveal_defs rd
     LEFT JOIN campaign_reveal_state crs ON crs.reveal_def_id = rd.id AND crs.campaign_id = ?
     WHERE rd.section_id = ?`
  )
    .bind(campaignId, id)
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

export async function getCampaignSections(env: Env, campaignId: string, moduleId: string): Promise<SectionDetail[]> {
  const { results: sections } = await env.DB.prepare(
    `SELECT * FROM sections WHERE module_id = ? AND type != 'creature' AND type != 'item' ORDER BY "order" ASC`
  )
    .bind(moduleId)
    .all<SectionRow>();
  if (sections.length === 0) return [];

  const { results: allReveals } = await env.DB.prepare(
    `SELECT rd.id, rd.section_id, rd.trigger_skill, rd.trigger_dc, rd.text, COALESCE(crs.revealed, 0) as revealed
     FROM reveal_defs rd
     JOIN sections s ON s.id = rd.section_id
     LEFT JOIN campaign_reveal_state crs ON crs.reveal_def_id = rd.id AND crs.campaign_id = ?
     WHERE s.module_id = ? AND s.type != 'creature' AND s.type != 'item'`
  )
    .bind(campaignId, moduleId)
    .all<{ id: number; section_id: string; trigger_skill: string; trigger_dc: number; text: string; revealed: number }>();

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
