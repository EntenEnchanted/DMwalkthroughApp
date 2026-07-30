import type { Env } from "../types.js";
import { getSessionUser, type AuthUser } from "../auth.js";

export interface CharacterRow {
  id: string;
  campaign_id: string;
  player_user_id: string;
  name: string;
  class: string;
  level: number;
  race: string;
  background: string;
  xp: number;
  current_hp: number;
  max_hp: number;
  ac: number;
  speed: number;
  ability_scores_json: string;
  currency_json: string;
  features_json: string;
  notes: string;
  created_at: number;
}

interface CharacterItemRow {
  id: string;
  character_id: string;
  name: string;
  quantity: number;
  weight: number;
  equipped: number;
  notes: string;
  srd_equipment_slug: string | null;
}

// Maps the client-facing field name (parsed shape, e.g. `ability_scores`)
// to its DB column (raw JSON text, e.g. `ability_scores_json`).
const EDITABLE_FIELDS: Record<string, string> = {
  name: "name",
  class: "class",
  level: "level",
  race: "race",
  background: "background",
  xp: "xp",
  current_hp: "current_hp",
  max_hp: "max_hp",
  ac: "ac",
  speed: "speed",
  ability_scores: "ability_scores_json",
  currency: "currency_json",
  features: "features_json",
  notes: "notes",
};
const JSON_FIELDS = new Set(["ability_scores", "currency", "features"]);

function serializeCharacter(c: CharacterRow) {
  return {
    id: c.id,
    campaign_id: c.campaign_id,
    player_user_id: c.player_user_id,
    name: c.name,
    class: c.class,
    level: c.level,
    race: c.race,
    background: c.background,
    xp: c.xp,
    current_hp: c.current_hp,
    max_hp: c.max_hp,
    ac: c.ac,
    speed: c.speed,
    ability_scores: JSON.parse(c.ability_scores_json),
    currency: JSON.parse(c.currency_json),
    features: JSON.parse(c.features_json),
    notes: c.notes,
  };
}

function serializeItem(i: CharacterItemRow) {
  return {
    id: i.id,
    name: i.name,
    quantity: i.quantity,
    weight: i.weight,
    equipped: Boolean(i.equipped),
    notes: i.notes,
    srd_equipment_slug: i.srd_equipment_slug,
  };
}

async function requireCharacterAccess(
  request: Request,
  env: Env,
  characterId: string
): Promise<{ user: AuthUser; character: CharacterRow } | { error: Response }> {
  const user = await getSessionUser(request, env);
  if (!user) return { error: new Response("Unauthorized", { status: 401 }) };

  const character = await env.DB.prepare(`SELECT * FROM characters WHERE id = ?`)
    .bind(characterId)
    .first<CharacterRow>();
  if (!character) return { error: new Response("Not found", { status: 404 }) };

  if (user.role === "player") {
    if (character.player_user_id !== user.id) return { error: new Response("Forbidden", { status: 403 }) };
  } else {
    const campaign = await env.DB.prepare(`SELECT dm_user_id FROM campaigns WHERE id = ?`)
      .bind(character.campaign_id)
      .first<{ dm_user_id: string }>();
    if (!campaign || campaign.dm_user_id !== user.id) return { error: new Response("Forbidden", { status: 403 }) };
  }

  return { user, character };
}

// DM roster: every character in a campaign they own.
export async function handleListCharacters(campaignId: string, request: Request, env: Env): Promise<Response> {
  const user = await getSessionUser(request, env);
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (user.role !== "dm") return new Response("Forbidden", { status: 403 });

  const campaign = await env.DB.prepare(`SELECT dm_user_id FROM campaigns WHERE id = ?`)
    .bind(campaignId)
    .first<{ dm_user_id: string }>();
  if (!campaign || campaign.dm_user_id !== user.id) return new Response("Forbidden", { status: 403 });

  const { results } = await env.DB.prepare(
    `SELECT id, name, class, level, race, current_hp, max_hp FROM characters WHERE campaign_id = ? ORDER BY name ASC`
  )
    .bind(campaignId)
    .all<Pick<CharacterRow, "id" | "name" | "class" | "level" | "race" | "current_hp" | "max_hp">>();

  return Response.json({ characters: results });
}

// A player's own characters across every campaign they've joined.
export async function handleListMyCharacters(request: Request, env: Env): Promise<Response> {
  const user = await getSessionUser(request, env);
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (user.role !== "player") return new Response("Forbidden", { status: 403 });

  const { results } = await env.DB.prepare(
    `SELECT c.id, c.name, c.campaign_id, camp.name as campaign_name
     FROM characters c JOIN campaigns camp ON camp.id = c.campaign_id
     WHERE c.player_user_id = ? ORDER BY c.created_at ASC`
  )
    .bind(user.id)
    .all<{ id: string; name: string; campaign_id: string; campaign_name: string }>();

  return Response.json({ characters: results });
}

export async function handleGetCharacter(characterId: string, request: Request, env: Env): Promise<Response> {
  const result = await requireCharacterAccess(request, env, characterId);
  if ("error" in result) return result.error;

  const { results: items } = await env.DB.prepare(`SELECT * FROM character_items WHERE character_id = ? ORDER BY name ASC`)
    .bind(characterId)
    .all<CharacterItemRow>();

  return Response.json({ ...serializeCharacter(result.character), items: items.map(serializeItem) });
}

export async function handleUpdateCharacter(characterId: string, request: Request, env: Env): Promise<Response> {
  const result = await requireCharacterAccess(request, env, characterId);
  if ("error" in result) return result.error;

  const body = (await request.json()) as Record<string, unknown>;
  const updates: string[] = [];
  const values: unknown[] = [];

  for (const [field, column] of Object.entries(EDITABLE_FIELDS)) {
    if (!(field in body)) continue;
    const raw = body[field];
    const value = JSON_FIELDS.has(field) ? JSON.stringify(raw) : raw;
    updates.push(`${column} = ?`);
    values.push(value);
  }

  if (updates.length === 0) return Response.json({ ok: true });

  await env.DB.prepare(`UPDATE characters SET ${updates.join(", ")} WHERE id = ?`)
    .bind(...values, characterId)
    .run();

  return Response.json({ ok: true });
}

export async function handleAddItem(characterId: string, request: Request, env: Env): Promise<Response> {
  const result = await requireCharacterAccess(request, env, characterId);
  if ("error" in result) return result.error;

  const { name, quantity, weight, equipped, notes } = (await request.json()) as {
    name?: string;
    quantity?: number;
    weight?: number;
    equipped?: boolean;
    notes?: string;
  };
  if (!name?.trim()) return new Response("Missing item name", { status: 400 });

  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO character_items (id, character_id, name, quantity, weight, equipped, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, characterId, name.trim(), quantity ?? 1, weight ?? 0, equipped ? 1 : 0, notes ?? "")
    .run();

  return Response.json({ id });
}

export async function handleUpdateItem(
  characterId: string,
  itemId: string,
  request: Request,
  env: Env
): Promise<Response> {
  const result = await requireCharacterAccess(request, env, characterId);
  if ("error" in result) return result.error;

  const body = (await request.json()) as {
    name?: string;
    quantity?: number;
    weight?: number;
    equipped?: boolean;
    notes?: string;
  };
  const updates: string[] = [];
  const values: unknown[] = [];

  if (body.name !== undefined) {
    updates.push("name = ?");
    values.push(body.name);
  }
  if (body.quantity !== undefined) {
    updates.push("quantity = ?");
    values.push(body.quantity);
  }
  if (body.weight !== undefined) {
    updates.push("weight = ?");
    values.push(body.weight);
  }
  if (body.equipped !== undefined) {
    updates.push("equipped = ?");
    values.push(body.equipped ? 1 : 0);
  }
  if (body.notes !== undefined) {
    updates.push("notes = ?");
    values.push(body.notes);
  }
  if (updates.length === 0) return Response.json({ ok: true });

  await env.DB.prepare(`UPDATE character_items SET ${updates.join(", ")} WHERE id = ? AND character_id = ?`)
    .bind(...values, itemId, characterId)
    .run();

  return Response.json({ ok: true });
}

export async function handleDeleteItem(characterId: string, itemId: string, request: Request, env: Env): Promise<Response> {
  const result = await requireCharacterAccess(request, env, characterId);
  if ("error" in result) return result.error;

  await env.DB.prepare(`DELETE FROM character_items WHERE id = ? AND character_id = ?`).bind(itemId, characterId).run();
  return Response.json({ ok: true });
}

// Called from invite redemption — creates the player's character for a
// campaign the first time they join it; idempotent on repeat redemptions.
export async function getOrCreateCharacter(
  env: Env,
  campaignId: string,
  playerUserId: string,
  name: string
): Promise<string> {
  const existing = await env.DB.prepare(`SELECT id FROM characters WHERE campaign_id = ? AND player_user_id = ?`)
    .bind(campaignId, playerUserId)
    .first<{ id: string }>();
  if (existing) return existing.id;

  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO characters (id, campaign_id, player_user_id, name, created_at) VALUES (?, ?, ?, ?, ?)`
  )
    .bind(id, campaignId, playerUserId, name.trim() || "New Character", Date.now())
    .run();
  return id;
}
