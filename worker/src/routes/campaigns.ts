import type { Env } from "../types.js";
import { getSessionUser, type AuthUser } from "../auth.js";

export interface CampaignRow {
  id: string;
  module_id: string;
  dm_user_id: string;
  /** null when the DM has not set it; the UI then shows every level variant. */
  party_level: number | null;
}

export async function requireCampaignDm(
  request: Request,
  env: Env,
  campaignId: string
): Promise<{ user: AuthUser; campaign: CampaignRow } | { error: Response }> {
  const user = await getSessionUser(request, env);
  if (!user) return { error: new Response("Unauthorized", { status: 401 }) };
  if (user.role !== "dm") return { error: new Response("Forbidden", { status: 403 }) };

  const campaign = await env.DB.prepare(`SELECT id, module_id, dm_user_id, party_level FROM campaigns WHERE id = ?`)
    .bind(campaignId)
    .first<CampaignRow>();
  if (!campaign || campaign.dm_user_id !== user.id) return { error: new Response("Forbidden", { status: 403 }) };

  return { user, campaign };
}

export async function handleListModules(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(`SELECT id, slug, name, description FROM modules ORDER BY name`).all();
  return Response.json({ modules: results });
}

export async function handleListCampaigns(request: Request, env: Env): Promise<Response> {
  const user = await getSessionUser(request, env);
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (user.role !== "dm") return new Response("Forbidden", { status: 403 });

  const { results } = await env.DB.prepare(
    `SELECT c.id, c.name, c.module_id, m.name as module_name, c.status, c.created_at, c.party_level
     FROM campaigns c JOIN modules m ON m.id = c.module_id
     WHERE c.dm_user_id = ? ORDER BY c.created_at DESC`
  )
    .bind(user.id)
    .all();
  return Response.json({ campaigns: results });
}

export async function handleCreateCampaign(request: Request, env: Env): Promise<Response> {
  const user = await getSessionUser(request, env);
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (user.role !== "dm") return new Response("Forbidden", { status: 403 });

  const { name, module_id } = (await request.json()) as { name?: string; module_id?: string };
  if (!name?.trim() || !module_id?.trim()) return new Response("Missing name or module_id", { status: 400 });

  const module = await env.DB.prepare(`SELECT id FROM modules WHERE id = ?`).bind(module_id).first();
  if (!module) return new Response("Unknown module", { status: 400 });

  const id = crypto.randomUUID();
  const createdAt = Date.now();
  await env.DB.prepare(
    `INSERT INTO campaigns (id, name, module_id, dm_user_id, status, created_at) VALUES (?, ?, ?, ?, 'active', ?)`
  )
    .bind(id, name.trim(), module_id, user.id, createdAt)
    .run();

  return Response.json({ id, name: name.trim(), module_id, status: "active", created_at: createdAt });
}


/** Sets the party's level, which the Campaign page uses to resolve level variants. */
export async function handleSetPartyLevel(campaignId: string, request: Request, env: Env): Promise<Response> {
  const result = await requireCampaignDm(request, env, campaignId);
  if ("error" in result) return result.error;

  const { party_level: level } = (await request.json()) as { party_level: unknown };
  if (level !== null && (typeof level !== "number" || !Number.isInteger(level) || level < 1 || level > 20)) {
    return Response.json({ error: "party_level must be an integer 1-20, or null to clear it" }, { status: 400 });
  }

  await env.DB.prepare(`UPDATE campaigns SET party_level = ? WHERE id = ?`).bind(level, campaignId).run();
  return Response.json({ party_level: level });
}
