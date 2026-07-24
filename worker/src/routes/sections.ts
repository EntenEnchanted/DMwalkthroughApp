import type { Env } from "../types.js";
import { getSectionDetail, getNarrativeReferencesTo } from "../db.js";

export async function handleGetSection(id: string, env: Env): Promise<Response> {
  const detail = await getSectionDetail(env, id);
  if (!detail) return new Response("Not found", { status: 404 });
  return Response.json(detail);
}

export async function handleGetNarrativeReferences(id: string, env: Env): Promise<Response> {
  const refs = await getNarrativeReferencesTo(env, id);
  return Response.json({ references: refs });
}
