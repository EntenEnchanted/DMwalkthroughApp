import type { Env } from "../types.js";
import { createSession, hashPassword, sessionCookieHeader, getSessionUser } from "../auth.js";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no ambiguous chars (0/O, 1/I/L)

function generateInviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes)
    .map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length])
    .join("");
}

// One reusable code for the whole app (decision: DM signup is rare enough
// that a single shared code an existing DM hands out is simpler than
// per-invite codes, and mirrors the campaign_invites pattern).
export async function handleGetOrCreateDmInvite(request: Request, env: Env): Promise<Response> {
  const user = await getSessionUser(request, env);
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (user.role !== "dm") return new Response("Forbidden", { status: 403 });

  const existing = await env.DB.prepare(`SELECT code FROM dm_invites LIMIT 1`).first<{ code: string }>();
  if (existing) return Response.json({ code: existing.code });

  const code = generateInviteCode();
  await env.DB.prepare(`INSERT INTO dm_invites (id, code, created_by_user_id, created_at) VALUES (?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), code, user.id, Date.now())
    .run();

  return Response.json({ code });
}

// Registers a brand-new DM account, gated by the shared code above so
// random visitors can't self-provision DM accounts (which can create
// campaigns, ingest content, and use the chat feature — all billed usage).
export async function handleRegisterDm(request: Request, env: Env): Promise<Response> {
  const { code, email, password } = (await request.json()) as {
    code?: string;
    email?: string;
    password?: string;
  };
  if (!code?.trim() || !email?.trim() || !password) {
    return new Response("Missing code, email, or password", { status: 400 });
  }
  if (password.length < 8) return new Response("Password must be at least 8 characters", { status: 400 });

  const invite = await env.DB.prepare(`SELECT id FROM dm_invites WHERE code = ?`).bind(code.trim().toUpperCase()).first();
  if (!invite) return new Response("Invalid invite code", { status: 404 });

  const normalizedEmail = email.toLowerCase().trim();
  const existing = await env.DB.prepare(`SELECT id FROM users WHERE email = ?`).bind(normalizedEmail).first();
  if (existing) return new Response("An account with this email already exists", { status: 409 });

  const { hash, salt } = await hashPassword(password);
  const userId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, password_salt, role, created_at) VALUES (?, ?, ?, ?, 'dm', ?)`
  )
    .bind(userId, normalizedEmail, hash, salt, Date.now())
    .run();

  const token = await createSession(env, userId);
  return new Response(JSON.stringify({ id: userId, email: normalizedEmail, role: "dm" }), {
    headers: { "content-type": "application/json", "Set-Cookie": sessionCookieHeader(token) },
  });
}
