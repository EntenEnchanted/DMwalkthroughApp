import type { Env } from "./types.js";

// Cloudflare's production Workers runtime caps PBKDF2 at 100,000 iterations
// (local `wrangler dev` doesn't enforce this, so this only surfaces against
// the deployed edge — verify auth against --remote, not just local dev).
const PBKDF2_ITERATIONS = 100_000;
const HASH_BITS = 256;
const SALT_BYTES = 16;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface AuthUser {
  id: string;
  email: string;
  role: "dm" | "player";
}

function toHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

async function deriveHash(password: string, salt: Uint8Array): Promise<ArrayBuffer> {
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    HASH_BITS
  );
}

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await deriveHash(password, salt);
  return { hash: toHex(hash), salt: toHex(salt) };
}

export async function verifyPassword(password: string, hashHex: string, saltHex: string): Promise<boolean> {
  const derived = await deriveHash(password, fromHex(saltHex));
  return toHex(derived) === hashHex;
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return toHex(digest);
}

export function generateToken(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

export function sessionCookieHeader(token: string): string {
  return `session=${token}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${SESSION_TTL_MS / 1000}`;
}

export function clearSessionCookieHeader(): string {
  return `session=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0`;
}

export async function createSession(env: Env, userId: string): Promise<string> {
  const token = generateToken();
  const tokenHash = await sha256Hex(token);
  const now = Date.now();
  await env.DB.prepare(`INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), userId, tokenHash, now + SESSION_TTL_MS, now)
    .run();
  return token;
}

export async function deleteSessionByToken(env: Env, token: string): Promise<void> {
  const tokenHash = await sha256Hex(token);
  await env.DB.prepare(`DELETE FROM sessions WHERE token_hash = ?`).bind(tokenHash).run();
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

export function getSessionToken(request: Request): string | null {
  return readCookie(request, "session");
}

export async function getSessionUser(request: Request, env: Env): Promise<AuthUser | null> {
  const token = getSessionToken(request);
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.role FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`
  )
    .bind(tokenHash, Date.now())
    .first<AuthUser>();
  return row ?? null;
}
