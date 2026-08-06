import type { Env, IngestSection } from "../types.js";
import { upsertSection, embeddingText, derivedTexts } from "../db.js";
import { embed } from "../embeddings.js";

const BATCH_SIZE = 20;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
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
    // Embed the same text upsertSection just stored, not the raw payload. Block-model
    // sections arrive with read_aloud_text/dm_only_text empty because the worker owns
    // how they are composed, so embedding the payload embedded the heading and nothing
    // else — which is what every narrative section in both modules had been getting.
    const vectors = await embed(
      env,
      batch.map((s) => embeddingText({ ...s, ...derivedTexts(s) }))
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
