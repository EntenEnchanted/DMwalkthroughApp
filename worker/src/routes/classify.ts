import type { Env } from "../types.js";

/**
 * TEMPORARY — remove once the DoSI block-model re-ingestion is complete.
 *
 * The ingestion script runs outside Cloudflare and has no Anthropic key of its
 * own; the key lives here as a Worker secret. This forwards a classification
 * request to the Anthropic API using it, gated behind ADMIN_TOKEN.
 *
 * This is the same short-lived scaffolding used for the LMoP ingestion (see git
 * history) and follows the same rule: add it, run the pass, delete it, rotate
 * ADMIN_TOKEN. It is deliberately narrow — a fixed model allowlist and a
 * max_tokens ceiling — so that while it exists it cannot be turned into a
 * general-purpose relay.
 */

const ALLOWED_MODELS = new Set(["claude-sonnet-5", "claude-opus-5", "claude-haiku-4-5-20251001"]);
const MAX_TOKENS_CEILING = 8192;

interface ClassifyRequest {
  model?: string;
  max_tokens?: number;
  system?: string;
  messages?: unknown;
  tools?: unknown;
  tool_choice?: unknown;
}

export async function handleClassify(request: Request, env: Env): Promise<Response> {
  const token = request.headers.get("X-Admin-Token");
  if (!token || token !== env.ADMIN_TOKEN) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = (await request.json()) as ClassifyRequest;

  if (!body.model || !ALLOWED_MODELS.has(body.model)) {
    return Response.json({ error: `model must be one of: ${[...ALLOWED_MODELS].join(", ")}` }, { status: 400 });
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json({ error: "messages is required" }, { status: 400 });
  }

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: body.model,
      max_tokens: Math.min(body.max_tokens ?? 4096, MAX_TOKENS_CEILING),
      system: body.system,
      messages: body.messages,
      tools: body.tools,
      tool_choice: body.tool_choice,
    }),
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  });
}
