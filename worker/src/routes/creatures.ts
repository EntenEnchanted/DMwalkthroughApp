import type { Env } from "../types.js";
import { getCreatureSections } from "../db.js";

export async function handleGetCreatures(env: Env): Promise<Response> {
  const creatures = await getCreatureSections(env);
  return Response.json({ creatures });
}
