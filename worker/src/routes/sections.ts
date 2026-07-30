import type { Env } from "../types.js";
import { getSectionDetail, getNarrativeReferencesTo } from "../db.js";
import { requireCampaignDm } from "./campaigns.js";

export async function handleGetSection(campaignId: string, id: string, request: Request, env: Env): Promise<Response> {
  const result = await requireCampaignDm(request, env, campaignId);
  if ("error" in result) return result.error;

  const detail = await getSectionDetail(env, campaignId, result.campaign.module_id, id);
  if (!detail) return new Response("Not found", { status: 404 });
  return Response.json(detail);
}

export async function handleGetNarrativeReferences(
  campaignId: string,
  id: string,
  request: Request,
  env: Env
): Promise<Response> {
  const result = await requireCampaignDm(request, env, campaignId);
  if ("error" in result) return result.error;

  const refs = await getNarrativeReferencesTo(env, result.campaign.module_id, id);
  return Response.json({ references: refs });
}
