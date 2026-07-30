import type { Env } from "../types.js";
import { getCreatureSections } from "../db.js";
import { requireCampaignDm } from "./campaigns.js";

export async function handleGetCreatures(campaignId: string, request: Request, env: Env): Promise<Response> {
  const result = await requireCampaignDm(request, env, campaignId);
  if ("error" in result) return result.error;

  const creatures = await getCreatureSections(env, result.campaign.module_id);
  return Response.json({ creatures });
}
