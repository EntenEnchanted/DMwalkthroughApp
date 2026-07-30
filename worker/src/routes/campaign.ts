import type { Env } from "../types.js";
import { getCampaignSections } from "../db.js";
import { requireCampaignDm } from "./campaigns.js";

export async function handleGetCampaignOutline(campaignId: string, request: Request, env: Env): Promise<Response> {
  const result = await requireCampaignDm(request, env, campaignId);
  if ("error" in result) return result.error;

  const sections = await getCampaignSections(env, campaignId, result.campaign.module_id);
  return Response.json({ sections });
}
