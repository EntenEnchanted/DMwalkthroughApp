import type { Env } from "../types.js";
import { toggleReveal } from "../db.js";
import { requireCampaignDm } from "./campaigns.js";

export async function handleToggleReveal(campaignId: string, id: string, request: Request, env: Env): Promise<Response> {
  const result = await requireCampaignDm(request, env, campaignId);
  if ("error" in result) return result.error;

  const body = (await request.json()) as { revealed: boolean };
  await toggleReveal(env, campaignId, Number(id), body.revealed);
  return Response.json({ ok: true });
}
