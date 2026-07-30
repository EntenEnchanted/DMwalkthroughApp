import type { Env } from "../types.js";
import { embedOne } from "../embeddings.js";
import { getSectionDetail } from "../db.js";
import { requireCampaignDm } from "./campaigns.js";

const TOP_K = 8;

export async function handleSearch(campaignId: string, request: Request, env: Env): Promise<Response> {
  const result = await requireCampaignDm(request, env, campaignId);
  if ("error" in result) return result.error;

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  if (!q) return Response.json({ results: [] });

  const vector = await embedOne(env, q);
  const matches = await env.VECTORIZE.query(vector, { topK: TOP_K });

  const results = [];
  for (const match of matches.matches) {
    const detail = await getSectionDetail(env, campaignId, result.campaign.module_id, match.id);
    if (detail) results.push({ score: match.score, ...detail });
  }

  return Response.json({ results });
}
