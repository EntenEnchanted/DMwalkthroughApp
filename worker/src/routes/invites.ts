import type { Env } from "../types.js";
import { requireCampaignDm } from "./campaigns.js";
import { createSession, hashPassword, sessionCookieHeader, verifyPassword } from "../auth.js";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no ambiguous chars (0/O, 1/I/L)

function generateInviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes)
    .map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length])
    .join("");
}

// One reusable code per campaign (decision: simpler than one code per player slot).
export async function handleGetOrCreateInvite(campaignId: string, request: Request, env: Env): Promise<Response> {
  const result = await requireCampaignDm(request, env, campaignId);
  if ("error" in result) return result.error;

  const existing = await env.DB.prepare(`SELECT code FROM campaign_invites WHERE campaign_id = ? LIMIT 1`)
    .bind(campaignId)
    .first<{ code: string }>();
  if (existing) return Response.json({ code: existing.code });

  const code = generateInviteCode();
  await env.DB.prepare(
    `INSERT INTO campaign_invites (id, campaign_id, code, created_at) VALUES (?, ?, ?, ?)`
  )
    .bind(crypto.randomUUID(), campaignId, code, Date.now())
    .run();

  return Response.json({ code });
}

// Logs in an existing player or registers a new one, then hands back which
// campaign the code belongs to. Creating the player's character record
// happens in Phase 1 once the `characters` table exists.
export async function handleRedeemInvite(request: Request, env: Env): Promise<Response> {
  const { code, email, password } = (await request.json()) as { code?: string; email?: string; password?: string };
  if (!code?.trim() || !email?.trim() || !password) {
    return new Response("Missing code, email, or password", { status: 400 });
  }

  const invite = await env.DB.prepare(`SELECT campaign_id FROM campaign_invites WHERE code = ?`)
    .bind(code.trim().toUpperCase())
    .first<{ campaign_id: string }>();
  if (!invite) return new Response("Invalid invite code", { status: 404 });

  const normalizedEmail = email.toLowerCase().trim();
  const existing = await env.DB.prepare(`SELECT id, role, password_hash, password_salt FROM users WHERE email = ?`)
    .bind(normalizedEmail)
    .first<{ id: string; role: string; password_hash: string; password_salt: string }>();

  let userId: string;
  if (existing) {
    if (existing.role !== "player") return new Response("An account with this email already exists", { status: 409 });
    if (!(await verifyPassword(password, existing.password_hash, existing.password_salt))) {
      return new Response("Incorrect password for existing account", { status: 401 });
    }
    userId = existing.id;
  } else {
    const { hash, salt } = await hashPassword(password);
    userId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, password_salt, role, created_at) VALUES (?, ?, ?, ?, 'player', ?)`
    )
      .bind(userId, normalizedEmail, hash, salt, Date.now())
      .run();
  }

  const token = await createSession(env, userId);
  return new Response(
    JSON.stringify({ campaign_id: invite.campaign_id, user: { id: userId, email: normalizedEmail, role: "player" } }),
    { headers: { "content-type": "application/json", "Set-Cookie": sessionCookieHeader(token) } }
  );
}
