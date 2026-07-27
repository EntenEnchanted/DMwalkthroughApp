import type { Env, IngestSection } from "../types.js";
import { upsertSection, embeddingText } from "../db.js";
import { embed } from "../embeddings.js";

const BATCH_SIZE = 20;

const CLASSIFY_MODEL = "claude-sonnet-5";

const CLASSIFY_SECTION_TYPES = ["location", "encounter", "creature", "item", "reference"];

const CLASSIFY_SYSTEM_PROMPT = `You are helping ingest a D&D 5e adventure book into a DM-only companion app. \
For each section of text you're given, classify it and split it into tiers:

- read_aloud_text: text meant to be read to players verbatim. Source material marks this with ">>" \
boxed-quote delimiters, or explicit cues like "Read this text" / "Read or paraphrase". Preserve the \
text closely; strip only the ">>" delimiters themselves. Empty string if none.
- dm_only_text: everything else — background, motivations, secrets, running notes, rules explanations. \
This is the default tier for prose that isn't read-aloud and isn't a conditional reveal. Within this text, \
wrap any sentence or clause whose guidance branches on what the party has already done — a prior fight's \
outcome, a choice they made, an NPC they have or haven't met, an item they do or don't have — in \
<cond></cond> tags, e.g. "<cond>If the characters defeated the zombies at the beach, she thanks them for \
their service to the cloister.</cond> Even if they did not fight the zombies, she welcomes them anyway." \
This flags branch-dependent DM notes so they stand out from fixed background; it is NOT for the \
skill-check reveals below (those are extracted separately, never wrapped inline), and NOT for text that's \
merely about the adventure's plot in general — only for clauses conditioned on the party's own prior \
actions or state.
- reveals: conditional-reveal items woven into the prose as sentences like "A character who succeeds on \
a DC 15 Intelligence (History) check learns...". Extract each as {trigger_skill, trigger_dc, text}, where \
text is what the players learn on success. Remove the reveal sentence from dm_only_text once extracted \
(don't duplicate it in both places).
- type: one of location | encounter | creature | item | reference.
  - location: a physical place/room on a map (has things to search/examine).
  - encounter: a scripted event, quest, NPC introduction, or combat setup not tied to a single room.
  - reference: generic rules explanation or front-matter guidance for the DM, not adventure content itself.
  - (creature and item sections are generated separately from other sources — you won't need to produce those types, but the enum is listed for completeness.)
- creature_references: any of the following known creature names that are mentioned or clearly implied \
in this section's text (e.g. "three zombies" implies "Zombie"). Only use exact names from this list, \
output the canonical name from the list, and only include names actually referenced in THIS section's text:
{{CREATURE_NAMES}}

Be conservative: don't invent reveals or references that aren't clearly there.`;

const CLASSIFY_CORRUPTION_MARKERS = ["</dm_only_text>", "</read_aloud_text>", "<parameter"];
const CLASSIFY_MAX_ATTEMPTS = 3;

function classifyLooksCorrupted(text: string): boolean {
  return CLASSIFY_CORRUPTION_MARKERS.some((marker) => text.includes(marker));
}

interface ClassifyRequestBody {
  chapter: string;
  headingPath: string[];
  title: string;
  rawText: string;
  creatureNames: string[];
}

interface ClassifyResult {
  type: string;
  read_aloud_text: string;
  dm_only_text: string;
  reveals: { trigger_skill: string; trigger_dc: number; text: string }[];
  creature_references: string[];
}

async function classifySectionOnce(body: ClassifyRequestBody, env: Env): Promise<ClassifyResult> {
  const system = CLASSIFY_SYSTEM_PROMPT.replace("{{CREATURE_NAMES}}", body.creatureNames.join(", "));
  const headingPath = [...body.headingPath, body.title].join(" > ");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLASSIFY_MODEL,
      max_tokens: 4096,
      system,
      messages: [
        {
          role: "user",
          content: `Chapter: ${body.chapter}\nHeading path: ${headingPath}\n\nSection text:\n${body.rawText}`,
        },
      ],
      tools: [
        {
          name: "classify_section",
          description: "Record the tiered classification of this adventure section.",
          input_schema: {
            type: "object",
            properties: {
              type: { type: "string", enum: CLASSIFY_SECTION_TYPES },
              read_aloud_text: { type: "string" },
              dm_only_text: { type: "string" },
              reveals: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    trigger_skill: { type: "string" },
                    trigger_dc: { type: "number" },
                    text: { type: "string" },
                  },
                  required: ["trigger_skill", "trigger_dc", "text"],
                },
              },
              creature_references: { type: "array", items: { type: "string" } },
            },
            required: ["type", "read_aloud_text", "dm_only_text", "reveals", "creature_references"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "classify_section" },
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic error ${response.status}: ${await response.text()}`);
  }

  const data = (await response.json()) as {
    content: { type: string; input?: unknown }[];
  };
  const toolUse = data.content.find((c) => c.type === "tool_use");
  if (!toolUse) throw new Error(`No tool_use response for section: ${headingPath}`);
  return toolUse.input as ClassifyResult;
}

export async function handleClassifySection(request: Request, env: Env): Promise<Response> {
  const token = request.headers.get("X-Admin-Token");
  if (!token || token !== env.ADMIN_TOKEN) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = (await request.json()) as ClassifyRequestBody;

  let result = await classifySectionOnce(body, env);
  let attempts = 1;
  while (
    (classifyLooksCorrupted(result.dm_only_text ?? "") || classifyLooksCorrupted(result.read_aloud_text ?? "")) &&
    attempts < CLASSIFY_MAX_ATTEMPTS
  ) {
    result = await classifySectionOnce(body, env);
    attempts++;
  }

  return Response.json(result);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function handleLoadSections(request: Request, env: Env): Promise<Response> {
  const token = request.headers.get("X-Admin-Token");
  if (!token || token !== env.ADMIN_TOKEN) {
    return new Response("Unauthorized", { status: 401 });
  }

  const sections = (await request.json()) as IngestSection[];
  let loaded = 0;

  for (const batch of chunk(sections, BATCH_SIZE)) {
    for (const section of batch) {
      await upsertSection(env, section);
    }
    const vectors = await embed(
      env,
      batch.map((s) => embeddingText(s))
    );
    await env.VECTORIZE.upsert(
      batch.map((s, i) => ({
        id: s.id,
        values: vectors[i],
        metadata: { type: s.type, chapter: s.chapter },
      }))
    );
    loaded += batch.length;
  }

  return Response.json({ loaded });
}
