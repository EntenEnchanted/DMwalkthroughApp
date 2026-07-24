import type { Env } from "../types.js";
import { embedOne } from "../embeddings.js";
import { getSectionDetail } from "../db.js";

const TOP_N = 6;
const MODEL = "claude-sonnet-5";

const SYSTEM_PROMPT = `You are a Dungeon Master's companion for running the D&D 5e adventure "Dragons of \
Stormwreck Isle". Answer the DM's question using ONLY the context sections provided below — never invent \
rules, plot details, or stats not present in the context.

Every part of your answer must be explicitly labeled by tier:
- "Read aloud:" for text meant to be read verbatim to players.
- "DM only:" for background, secrets, and running notes.
- "If they succeed on [DC X Ability (Skill)]:" for conditional reveals — always frame these behind their \
trigger condition. Only present a reveal's text as freely known if the context marks it as already revealed.

If the context doesn't contain the answer, say so plainly instead of guessing.`;

function formatContext(sections: Awaited<ReturnType<typeof getSectionDetail>>[]): string {
  return sections
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .map((s) => {
      const parts = [`[${s.heading} — ${s.type}, ${s.chapter}]`];
      if (s.read_aloud_text) parts.push(`Read-aloud text: ${s.read_aloud_text}`);
      if (s.dm_only_text) parts.push(`DM-only text: ${s.dm_only_text}`);
      for (const r of s.reveals) {
        parts.push(
          r.revealed
            ? `Reveal (ALREADY REVEALED to players) — trigger DC ${r.trigger_dc} ${r.trigger_skill}: ${r.text}`
            : `Reveal (NOT yet revealed) — trigger DC ${r.trigger_dc} ${r.trigger_skill}: ${r.text}`
        );
      }
      if (s.stat_block) parts.push(`Stat block: ${JSON.stringify(s.stat_block)}`);
      return parts.join("\n");
    })
    .join("\n\n");
}

export async function handleChat(request: Request, env: Env): Promise<Response> {
  const { message } = (await request.json()) as { message: string };
  if (!message?.trim()) return new Response("Missing message", { status: 400 });

  const vector = await embedOne(env, message);
  const matches = await env.VECTORIZE.query(vector, { topK: TOP_N });
  const details = await Promise.all(matches.matches.map((m) => getSectionDetail(env, m.id)));
  const context = formatContext(details);

  const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      stream: true,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Context sections:\n\n${context}\n\nDM's question: ${message}`,
        },
      ],
    }),
  });

  if (!anthropicResponse.ok || !anthropicResponse.body) {
    const text = await anthropicResponse.text();
    return new Response(`Chat model error: ${text}`, { status: 502 });
  }

  return new Response(anthropicResponse.body, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
    },
  });
}
