import type { Env } from "../types.js";
import { toggleReveal } from "../db.js";

export async function handleToggleReveal(id: string, request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as { revealed: boolean };
  await toggleReveal(env, Number(id), body.revealed);
  return Response.json({ ok: true });
}
