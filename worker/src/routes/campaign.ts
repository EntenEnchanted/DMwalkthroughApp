import type { Env } from "../types.js";
import { getCampaignSections } from "../db.js";

export async function handleGetCampaign(env: Env): Promise<Response> {
  const sections = await getCampaignSections(env);
  return Response.json({ sections });
}
