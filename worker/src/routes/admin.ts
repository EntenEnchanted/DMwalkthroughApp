import type { Env, IngestSection } from "../types.js";
import { upsertSection, embeddingText } from "../db.js";
import { embed } from "../embeddings.js";

const BATCH_SIZE = 20;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// One-off retrofit: tags [[directive]] markers into already-ingested dm_only_text.
// Remove this along with its route once the retag has been run.
const RETAG_MODEL = "claude-sonnet-5";
const RETAG_SYSTEM_PROMPT = `You are given a block of DM-only text from a D&D 5e adventure companion app. \
Wrap any sentence that directs the DM to do something or prompt the players to act — e.g. "encourage the \
players to...", "ask the players for...", "have a player make a check", "continue with the X section" — in \
[[directive]]...[[/directive]] markers.

CRITICAL: Do not change, add, remove, or reword any part of the text. Only insert the marker strings \
[[directive]] and [[/directive]] around existing sentences, exactly as given. Return the full text \
unchanged except for these inserted markers.`;

async function tagDirectives(env: Env, text: string): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: RETAG_MODEL,
        max_tokens: 2048,
        system: RETAG_SYSTEM_PROMPT,
        messages: [{ role: "user", content: text }],
        tools: [
          {
            name: "tag_directives",
            description: "Record the text with directive markers inserted.",
            input_schema: {
              type: "object",
              properties: { tagged_text: { type: "string" } },
              required: ["tagged_text"],
            },
          },
        ],
        tool_choice: { type: "tool", name: "tag_directives" },
      }),
    });
    if (!response.ok) continue;

    const data = (await response.json()) as { content: { type: string; input?: { tagged_text?: string } }[] };
    const toolUse = data.content.find((c) => c.type === "tool_use");
    const tagged = toolUse?.input?.tagged_text;
    if (typeof tagged !== "string") continue;

    const stripped = tagged.replaceAll("[[directive]]", "").replaceAll("[[/directive]]", "");
    if (stripped === text) return tagged;
  }
  return null;
}

export async function handleRetagDirectives(request: Request, env: Env): Promise<Response> {
  const token = request.headers.get("X-Admin-Token");
  if (!token || !env.RETAG_ADMIN_TOKEN || token !== env.RETAG_ADMIN_TOKEN) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Each fetch() call counts against the per-invocation subrequest limit, so callers
  // must pass a small `ids` batch (e.g. 12-15) rather than processing everything at once.
  const raw = await request.text();
  const body = raw ? (JSON.parse(raw) as { ids?: string[] }) : {};

  let results: { id: string; dm_only_text: string }[];
  if (body.ids && body.ids.length > 0) {
    const placeholders = body.ids.map(() => "?").join(",");
    const { results: rows } = await env.DB.prepare(`SELECT id, dm_only_text FROM sections WHERE id IN (${placeholders})`)
      .bind(...body.ids)
      .all<{ id: string; dm_only_text: string }>();
    results = rows;
  } else {
    const { results: rows } = await env.DB.prepare(
      `SELECT id, dm_only_text FROM sections WHERE type NOT IN ('creature', 'item') AND dm_only_text != '' LIMIT 12`
    ).all<{ id: string; dm_only_text: string }>();
    results = rows;
  }

  const CONCURRENCY = 4;
  const summary: { id: string; status: string }[] = [];

  for (let i = 0; i < results.length; i += CONCURRENCY) {
    const batch = results.slice(i, i + CONCURRENCY);
    const outcomes = await Promise.all(
      batch.map(async (row) => {
        try {
          const tagged = await tagDirectives(env, row.dm_only_text);
          if (tagged === null) return { id: row.id, status: "skipped-validation-failed" };
          if (tagged === row.dm_only_text) return { id: row.id, status: "unchanged" };
          await env.DB.prepare(`UPDATE sections SET dm_only_text = ? WHERE id = ?`).bind(tagged, row.id).run();
          return { id: row.id, status: "updated" };
        } catch (err) {
          return { id: row.id, status: `error: ${(err as Error).message}` };
        }
      })
    );
    summary.push(...outcomes);
  }

  return Response.json({ total: results.length, summary });
}

export async function handleLoadSections(request: Request, env: Env): Promise<Response> {
  const token = request.headers.get("X-Admin-Token");
  if (!token || token !== env.ADMIN_TOKEN) {
    return new Response("Unauthorized", { status: 401 });
  }

  const sections = (await request.json()) as IngestSection[];
  let loaded = 0;

  for (const batch of chunk(sections, BATCH_SIZE)) {
    for (const section of batch) {
      await upsertSection(env, section);
    }
    const vectors = await embed(
      env,
      batch.map((s) => embeddingText(s))
    );
    await env.VECTORIZE.upsert(
      batch.map((s, i) => ({
        id: s.id,
        values: vectors[i],
        metadata: { type: s.type, chapter: s.chapter },
      }))
    );
    loaded += batch.length;
  }

  return Response.json({ loaded });
}
