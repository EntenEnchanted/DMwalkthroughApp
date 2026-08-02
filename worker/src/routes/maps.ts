import type { Env } from "../types.js";
import { getSessionUser, type AuthUser } from "../auth.js";

interface MapRow {
  id: string;
  campaign_id: string;
  name: string;
  image_url: string;
  grid_size_px: number;
  width_px: number;
  height_px: number;
}

interface TokenRow {
  id: string;
  map_id: string;
  character_id: string | null;
  creature_section_id: string | null;
  label: string;
  x: number;
  y: number;
  size: number;
  image_url: string | null;
  color: string;
  current_hp: number | null;
  max_hp: number | null;
}

async function requireCampaignMember(
  request: Request,
  env: Env,
  campaignId: string
): Promise<{ user: AuthUser; characterId: string | null } | { error: Response }> {
  const user = await getSessionUser(request, env);
  if (!user) return { error: new Response("Unauthorized", { status: 401 }) };

  if (user.role === "dm") {
    const campaign = await env.DB.prepare(`SELECT dm_user_id FROM campaigns WHERE id = ?`)
      .bind(campaignId)
      .first<{ dm_user_id: string }>();
    if (!campaign || campaign.dm_user_id !== user.id) return { error: new Response("Forbidden", { status: 403 }) };
    return { user, characterId: null };
  }

  const character = await env.DB.prepare(`SELECT id FROM characters WHERE campaign_id = ? AND player_user_id = ?`)
    .bind(campaignId, user.id)
    .first<{ id: string }>();
  if (!character) return { error: new Response("Forbidden", { status: 403 }) };

  return { user, characterId: character.id };
}

// A character_id supplied for a token must actually belong to the campaign
// the map is in — otherwise a token could be wired to a character from a
// different campaign, handing that character's player write access (via
// handleUpdateToken) to a campaign they were never invited to.
async function characterBelongsToCampaign(env: Env, characterId: string, campaignId: string): Promise<boolean> {
  const character = await env.DB.prepare(`SELECT id FROM characters WHERE id = ? AND campaign_id = ?`)
    .bind(characterId, campaignId)
    .first();
  return Boolean(character);
}

async function requireCampaignDm(
  request: Request,
  env: Env,
  campaignId: string
): Promise<{ user: AuthUser } | { error: Response }> {
  const user = await getSessionUser(request, env);
  if (!user) return { error: new Response("Unauthorized", { status: 401 }) };
  if (user.role !== "dm") return { error: new Response("Forbidden", { status: 403 }) };

  const campaign = await env.DB.prepare(`SELECT dm_user_id FROM campaigns WHERE id = ?`)
    .bind(campaignId)
    .first<{ dm_user_id: string }>();
  if (!campaign || campaign.dm_user_id !== user.id) return { error: new Response("Forbidden", { status: 403 }) };

  return { user };
}

export async function handleCreateMap(campaignId: string, request: Request, env: Env): Promise<Response> {
  const result = await requireCampaignDm(request, env, campaignId);
  if ("error" in result) return result.error;

  const { name, image_url, grid_size_px, width_px, height_px } = (await request.json()) as {
    name?: string;
    image_url?: string;
    grid_size_px?: number;
    width_px?: number;
    height_px?: number;
  };
  if (!name?.trim() || !image_url?.trim() || !width_px || !height_px) {
    return new Response("Missing name, image_url, width_px, or height_px", { status: 400 });
  }

  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO maps (id, campaign_id, name, image_url, grid_size_px, width_px, height_px, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, campaignId, name.trim(), image_url.trim(), grid_size_px ?? 50, width_px, height_px, Date.now())
    .run();

  await env.DB.prepare(`INSERT INTO fog_state (map_id, revealed_cells_json) VALUES (?, '[]')`).bind(id).run();
  await env.DB.prepare(`UPDATE campaigns SET active_map_id = ? WHERE id = ?`).bind(id, campaignId).run();

  return Response.json({ id });
}

export async function handleListMaps(campaignId: string, request: Request, env: Env): Promise<Response> {
  const result = await requireCampaignDm(request, env, campaignId);
  if ("error" in result) return result.error;

  const { results } = await env.DB.prepare(
    `SELECT id, name, created_at FROM maps WHERE campaign_id = ? ORDER BY created_at DESC`
  )
    .bind(campaignId)
    .all();
  return Response.json({ maps: results });
}

export async function handleSetActiveMap(campaignId: string, request: Request, env: Env): Promise<Response> {
  const result = await requireCampaignDm(request, env, campaignId);
  if ("error" in result) return result.error;

  const { map_id } = (await request.json()) as { map_id?: string };
  if (!map_id) return new Response("Missing map_id", { status: 400 });

  const map = await env.DB.prepare(`SELECT id FROM maps WHERE id = ? AND campaign_id = ?`)
    .bind(map_id, campaignId)
    .first();
  if (!map) return new Response("Not found", { status: 404 });

  await env.DB.prepare(`UPDATE campaigns SET active_map_id = ? WHERE id = ?`).bind(map_id, campaignId).run();
  return Response.json({ ok: true });
}

export async function handleGetActiveMap(campaignId: string, request: Request, env: Env): Promise<Response> {
  const result = await requireCampaignMember(request, env, campaignId);
  if ("error" in result) return result.error;
  const { user, characterId } = result;

  const campaign = await env.DB.prepare(`SELECT active_map_id FROM campaigns WHERE id = ?`)
    .bind(campaignId)
    .first<{ active_map_id: string | null }>();
  if (!campaign?.active_map_id) return Response.json({ map: null });

  const map = await env.DB.prepare(`SELECT * FROM maps WHERE id = ?`).bind(campaign.active_map_id).first<MapRow>();
  if (!map) return Response.json({ map: null });

  const { results: tokens } = await env.DB.prepare(`SELECT * FROM tokens WHERE map_id = ?`)
    .bind(map.id)
    .all<TokenRow>();

  const fog = await env.DB.prepare(`SELECT revealed_cells_json FROM fog_state WHERE map_id = ?`)
    .bind(map.id)
    .first<{ revealed_cells_json: string }>();
  const revealedCells: string[] = JSON.parse(fog?.revealed_cells_json ?? "[]");
  const revealedSet = new Set(revealedCells);

  // The DM sees every token unconditionally. A player only ever sees their
  // own character's token plus tokens standing on a currently-revealed
  // cell — fog-of-war has to be enforced here, not just by an opaque div
  // client-side, or any campaign member could read hidden monster
  // positions/HP straight from the API response.
  const visibleTokens =
    user.role === "dm"
      ? tokens
      : tokens.filter((t) => t.character_id === characterId || revealedSet.has(`${t.x},${t.y}`));

  return Response.json({
    map: {
      id: map.id,
      name: map.name,
      image_url: map.image_url,
      grid_size_px: map.grid_size_px,
      width_px: map.width_px,
      height_px: map.height_px,
    },
    tokens: visibleTokens.map((t) => ({ ...t, character_id: t.character_id ?? undefined })),
    revealed_cells: revealedCells,
  });
}

export async function handleAddToken(campaignId: string, request: Request, env: Env): Promise<Response> {
  const result = await requireCampaignDm(request, env, campaignId);
  if ("error" in result) return result.error;

  const body = (await request.json()) as {
    map_id?: string;
    character_id?: string;
    creature_section_id?: string;
    label?: string;
    x?: number;
    y?: number;
    size?: number;
    image_url?: string;
    color?: string;
    current_hp?: number;
    max_hp?: number;
  };
  if (!body.map_id || !body.label?.trim()) return new Response("Missing map_id or label", { status: 400 });

  const map = await env.DB.prepare(`SELECT id FROM maps WHERE id = ? AND campaign_id = ?`)
    .bind(body.map_id, campaignId)
    .first();
  if (!map) return new Response("Not found", { status: 404 });

  if (body.character_id && !(await characterBelongsToCampaign(env, body.character_id, campaignId))) {
    return new Response("character_id does not belong to this campaign", { status: 400 });
  }

  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO tokens (id, map_id, character_id, creature_section_id, label, x, y, size, image_url, color, current_hp, max_hp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      body.map_id,
      body.character_id ?? null,
      body.creature_section_id ?? null,
      body.label.trim(),
      body.x ?? 0,
      body.y ?? 0,
      body.size ?? 1,
      body.image_url ?? null,
      body.color ?? "#3b82f6",
      body.current_hp ?? null,
      body.max_hp ?? null
    )
    .run();

  return Response.json({ id });
}

export async function handleUpdateToken(tokenId: string, request: Request, env: Env): Promise<Response> {
  const user = await getSessionUser(request, env);
  if (!user) return new Response("Unauthorized", { status: 401 });

  const token = await env.DB.prepare(`SELECT * FROM tokens WHERE id = ?`).bind(tokenId).first<TokenRow>();
  if (!token) return new Response("Not found", { status: 404 });

  const map = await env.DB.prepare(`SELECT campaign_id FROM maps WHERE id = ?`)
    .bind(token.map_id)
    .first<{ campaign_id: string }>();
  if (!map) return new Response("Not found", { status: 404 });

  const body = (await request.json()) as Partial<TokenRow>;

  if (user.role === "dm") {
    const campaign = await env.DB.prepare(`SELECT dm_user_id FROM campaigns WHERE id = ?`)
      .bind(map.campaign_id)
      .first<{ dm_user_id: string }>();
    if (!campaign || campaign.dm_user_id !== user.id) return new Response("Forbidden", { status: 403 });

    const updates: string[] = [];
    const values: unknown[] = [];
    for (const field of ["label", "x", "y", "size", "image_url", "color", "current_hp", "max_hp"] as const) {
      if (field in body) {
        updates.push(`${field} = ?`);
        values.push(body[field]);
      }
    }
    if (updates.length > 0) {
      await env.DB.prepare(`UPDATE tokens SET ${updates.join(", ")} WHERE id = ?`)
        .bind(...values, tokenId)
        .run();
    }
    return Response.json({ ok: true });
  }

  // Players may only move their own character's token — x/y only. The
  // character must also actually belong to this token's campaign (defense
  // in depth against a token ever being wired to a foreign character).
  if (!token.character_id) return new Response("Forbidden", { status: 403 });
  const character = await env.DB.prepare(`SELECT player_user_id, campaign_id FROM characters WHERE id = ?`)
    .bind(token.character_id)
    .first<{ player_user_id: string; campaign_id: string }>();
  if (!character || character.player_user_id !== user.id || character.campaign_id !== map.campaign_id) {
    return new Response("Forbidden", { status: 403 });
  }

  if (body.x === undefined && body.y === undefined) return Response.json({ ok: true });
  await env.DB.prepare(`UPDATE tokens SET x = ?, y = ? WHERE id = ?`)
    .bind(body.x ?? token.x, body.y ?? token.y, tokenId)
    .run();
  return Response.json({ ok: true });
}

export async function handleDeleteToken(tokenId: string, request: Request, env: Env): Promise<Response> {
  const user = await getSessionUser(request, env);
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (user.role !== "dm") return new Response("Forbidden", { status: 403 });

  const token = await env.DB.prepare(
    `SELECT t.id, m.campaign_id FROM tokens t JOIN maps m ON m.id = t.map_id WHERE t.id = ?`
  )
    .bind(tokenId)
    .first<{ id: string; campaign_id: string }>();
  if (!token) return new Response("Not found", { status: 404 });

  const campaign = await env.DB.prepare(`SELECT dm_user_id FROM campaigns WHERE id = ?`)
    .bind(token.campaign_id)
    .first<{ dm_user_id: string }>();
  if (!campaign || campaign.dm_user_id !== user.id) return new Response("Forbidden", { status: 403 });

  await env.DB.prepare(`DELETE FROM tokens WHERE id = ?`).bind(tokenId).run();
  return Response.json({ ok: true });
}

export async function handleToggleFogCell(mapId: string, request: Request, env: Env): Promise<Response> {
  const user = await getSessionUser(request, env);
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (user.role !== "dm") return new Response("Forbidden", { status: 403 });

  const map = await env.DB.prepare(`SELECT campaign_id FROM maps WHERE id = ?`)
    .bind(mapId)
    .first<{ campaign_id: string }>();
  if (!map) return new Response("Not found", { status: 404 });

  const campaign = await env.DB.prepare(`SELECT dm_user_id FROM campaigns WHERE id = ?`)
    .bind(map.campaign_id)
    .first<{ dm_user_id: string }>();
  if (!campaign || campaign.dm_user_id !== user.id) return new Response("Forbidden", { status: 403 });

  const { cell, revealed } = (await request.json()) as { cell?: string; revealed?: boolean };
  if (!cell) return new Response("Missing cell", { status: 400 });

  const fog = await env.DB.prepare(`SELECT revealed_cells_json FROM fog_state WHERE map_id = ?`)
    .bind(mapId)
    .first<{ revealed_cells_json: string }>();
  const cells: string[] = JSON.parse(fog?.revealed_cells_json ?? "[]");
  const next = revealed ? Array.from(new Set([...cells, cell])) : cells.filter((c) => c !== cell);

  await env.DB.prepare(
    `INSERT INTO fog_state (map_id, revealed_cells_json) VALUES (?, ?)
     ON CONFLICT(map_id) DO UPDATE SET revealed_cells_json=excluded.revealed_cells_json`
  )
    .bind(mapId, JSON.stringify(next))
    .run();

  return Response.json({ ok: true, revealed_cells: next });
}

const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function handleUploadMapImage(campaignId: string, request: Request, env: Env): Promise<Response> {
  const result = await requireCampaignDm(request, env, campaignId);
  if ("error" in result) return result.error;

  const contentType = request.headers.get("Content-Type") ?? "";
  const ext = ALLOWED_IMAGE_TYPES[contentType];
  if (!ext) return new Response("Unsupported image type (use PNG, JPEG, WebP, or GIF)", { status: 400 });
  if (!request.body) return new Response("Missing image body", { status: 400 });

  const key = `${campaignId}/${crypto.randomUUID()}.${ext}`;
  await env.MAP_IMAGES.put(key, request.body, { httpMetadata: { contentType } });

  return Response.json({ key });
}

// Public/unauthenticated: map backgrounds aren't tiered DM-only content,
// and keys are random UUIDs (unguessable), so this is a plain CDN-style
// GET rather than requiring session plumbing for image loads.
export async function handleGetMapImage(key: string, env: Env): Promise<Response> {
  const object = await env.MAP_IMAGES.get(key);
  if (!object) return new Response("Not found", { status: 404 });

  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
