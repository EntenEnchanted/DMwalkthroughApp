import type { Env } from "../types.js";
import {
  clearSessionCookieHeader,
  createSession,
  deleteSessionByToken,
  getSessionToken,
  getSessionUser,
  sessionCookieHeader,
  verifyPassword,
} from "../auth.js";

export async function handleLogin(request: Request, env: Env): Promise<Response> {
  const { email, password } = (await request.json()) as { email?: string; password?: string };
  if (!email?.trim() || !password) return new Response("Missing email or password", { status: 400 });

  const user = await env.DB.prepare(`SELECT id, email, role, password_hash, password_salt FROM users WHERE email = ?`)
    .bind(email.toLowerCase().trim())
    .first<{ id: string; email: string; role: string; password_hash: string; password_salt: string }>();

  if (!user || !(await verifyPassword(password, user.password_hash, user.password_salt))) {
    return new Response("Invalid email or password", { status: 401 });
  }

  const token = await createSession(env, user.id);
  return new Response(JSON.stringify({ id: user.id, email: user.email, role: user.role }), {
    headers: { "content-type": "application/json", "Set-Cookie": sessionCookieHeader(token) },
  });
}

export async function handleLogout(request: Request, env: Env): Promise<Response> {
  const token = getSessionToken(request);
  if (token) await deleteSessionByToken(env, token);
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json", "Set-Cookie": clearSessionCookieHeader() },
  });
}

export async function handleMe(request: Request, env: Env): Promise<Response> {
  const user = await getSessionUser(request, env);
  if (!user) return new Response("Unauthorized", { status: 401 });
  return Response.json(user);
}
