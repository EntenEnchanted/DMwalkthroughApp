import type { Env } from "../types.js";
import { getSessionUser } from "../auth.js";

interface SrdEntryRow {
  id: string;
  category: string;
  name: string;
  slug: string;
  data_json: string;
  source: string;
}

// Reference content, not adventure content — visible to both roles, no
// campaign scoping. D1 LIKE is plenty for name/category lookups (spec
// §6.6); escalate to FTS5 only if that search quality turns out to be bad.
export async function handleListSrd(request: Request, env: Env): Promise<Response> {
  const user = await getSessionUser(request, env);
  if (!user) return new Response("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const category = url.searchParams.get("category");
  const q = url.searchParams.get("q")?.trim();

  const conditions: string[] = [];
  const params: string[] = [];
  if (category) {
    conditions.push("category = ?");
    params.push(category);
  }
  if (q) {
    conditions.push("name LIKE ?");
    params.push(`%${q}%`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { results } = await env.DB.prepare(
    `SELECT id, category, name, slug FROM srd_entries ${where} ORDER BY name ASC`
  )
    .bind(...params)
    .all<Pick<SrdEntryRow, "id" | "category" | "name" | "slug">>();

  return Response.json({ entries: results });
}

export async function handleGetSrdEntry(slug: string, request: Request, env: Env): Promise<Response> {
  const user = await getSessionUser(request, env);
  if (!user) return new Response("Unauthorized", { status: 401 });

  const row = await env.DB.prepare(`SELECT category, name, slug, data_json, source FROM srd_entries WHERE slug = ?`)
    .bind(slug)
    .first<Pick<SrdEntryRow, "category" | "name" | "slug" | "data_json" | "source">>();
  if (!row) return new Response("Not found", { status: 404 });

  return Response.json({
    category: row.category,
    name: row.name,
    slug: row.slug,
    source: row.source,
    data: JSON.parse(row.data_json),
  });
}
