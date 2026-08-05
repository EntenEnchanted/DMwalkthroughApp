import Anthropic from "@anthropic-ai/sdk";
import type { ClassifiedBlocks, ClassifiedSection, ParsedSection, SectionType } from "./types.js";

const MODEL = "claude-sonnet-5";

const SECTION_TYPES: SectionType[] = ["location", "encounter", "creature", "item", "reference"];
const CHECK_KINDS = ["info", "discovery", "social", "consequence"];
const CONDITIONAL_KINDS = ["trigger", "branch", "variant"];

/**
 * Per-module source conventions.
 *
 * Categories are defined semantically in the system prompt so they hold for any
 * adventure. Anything specific to how one book is typeset belongs here instead —
 * baking `>>` or "2nd-Level Characters" into the prompt itself would make the
 * classifier silently worse on every other module.
 */
const MODULE_CONVENTIONS: Record<string, string> = {
  dosi: `This module's markdown marks read-aloud text with ">>" delimiters at the start and end of \
the block; strip the delimiters themselves. It also uses bold run-in headers of the form \
"***Treasure.***" or "***Running the Combat.***" to open a sub-topic. One of these recurs: \
"***2nd-Level Characters.***" introduces an adjustment applied when the party is 2nd level rather \
than 1st — that is a party-configuration variant.`,
  "lmop-stored": `The text you are given has already been partially split by an earlier ingestion \
pass, and the parts are marked with bracketed labels such as "[Read-aloud passage, as printed in the \
adventure]", "[DM-facing text]" and "[Information the adventure gates behind ability checks]". Treat \
those labels as structure only — never echo a label into your output. Trust the read-aloud label, but \
do NOT assume the DM-facing part is homogeneous: it still contains sentences belonging to the more \
specific categories, and the check-gated lines still need a context and an outcome teasing apart. This \
module has no recurring level-scaling sidebar, so expect few or no party-configuration variants.`,
  lmop: `This module's read-aloud text is set off as indented or quoted blocks. It uses bold run-in \
headers to open a sub-topic. It has no single recurring level-scaling sidebar, so expect few or no \
party-configuration variants — do not invent them.`,
};

const DEFAULT_CONVENTIONS = `Read-aloud text is usually set off from the surrounding prose as a \
quoted or indented block, or introduced by an explicit cue such as "read this text" or "read or \
paraphrase". Bold run-in headers may open a sub-topic.`;

const SYSTEM_PROMPT = `You are ingesting a D&D 5e adventure into a DM's companion app. The DM reads \
a section of this app while preparing and while running the table, so your job is to split each \
section into the distinct things a DM needs, rather than leaving one undifferentiated block of prose.

Split the section into these categories. Most sections use only some of them — leaving a category \
empty is correct and expected. Never invent content to fill one, and never put the same sentence in \
two categories.

- read_alouds: passages meant to be read to the players more or less verbatim. A section can have \
several that fire at different moments (a room description on entry, plus a second passage when \
something happens). Emit one entry per passage, each with a short "cue" saying when it is read — \
e.g. "On first entering the cavern", "When the trap is triggered". Preserve the wording closely.

- background_text: information about the world that the DM needs but does not perform — who lives \
here, what happened before, what things are, why they matter. This is the default for prose that is \
not one of the more specific categories below. Plain paragraphs, no markup.

- prompts: things the DM should ask the players, or get the players to do. STRICTLY player-facing: \
"ask the players how they want to approach", "have each character describe what they do first". \
Do NOT put here: instructions to the DM about running the scene (those are technique), or \
navigation like "continue with the next section" / "see appendix A" (drop those entirely). Most \
location sections have no prompts at all — that is normal.

- technique: advice about how the DM should PERFORM the scene — pacing, what to emphasise, what to \
keep ambiguous, what not to bother tracking, how to make something land. The test: it tells you \
nothing about the game world and asks nothing of the players. In the source this usually addresses \
the DM directly ("you don't need to...", "rely on your sense of...", "cast as much doubt as you \
can"). Give each a short imperative name plus the advice.

- conditionals: things that change what the DM does. Split each into a "condition" and an "effect", \
and classify by WHEN the DM uses it:
  - "trigger": fires from something the party does in this scene — moving somewhere, touching \
something, making noise, attacking. The DM watches for these during play.
  - "branch": depends on state carried in from BEFORE this scene — a previous fight's outcome, an \
NPC already met, an item already held. The DM tracks these across sessions.
  - "variant": depends on fixed party configuration known before play begins — party level, size, \
or a class being present. The DM resolves these once while preparing.

- checks: things the players can learn or achieve by doing something, whether or not dice are \
involved. For each: "context" is the action that prompts it ("Examining the statue", "Searching the \
chamber"); "skills" is every ability/skill that works, as separate array entries (a check offering \
"Intelligence (Nature) or Wisdom (Survival)" has TWO entries); "dc" is the difficulty — OMIT dc \
entirely when no roll is needed at all, such as asking an NPC who simply knows, or casting a spell \
that simply reveals something; "cost" is any time or resources spent ("15 minutes"), separate from \
the action itself; "success_text" is what they learn or get; "fail_text" only if failure has a \
stated consequence. "kind" is info (learning something), discovery (finding an object or treasure), \
social (persuading, deceiving, intimidating), or consequence (failure causes something to happen).

- features: standing rules that apply the whole time the party is in this area, with no trigger and \
no roll to discover — an ambient magical effect, terrain that changes movement, water depth that \
varies with tides. Give each a short name. These are rules the DM must remember to APPLY, which is \
why they are not background.

- type: one of ${SECTION_TYPES.join(" | ")}.
  - location: a physical place or room, typically keyed to a map.
  - encounter: a scripted event, quest, NPC introduction, or combat not tied to one room.
  - reference: rules explanation or DM guidance, not adventure content itself.
  - (creature and item sections come from other sources; you will not need to produce those types.)

- creature_references: any of these known creature names mentioned or clearly implied in THIS \
section's text (e.g. "three zombies" implies "Zombie"). Use only exact names from this list:
{{CREATURE_NAMES}}

Source conventions for this particular module:
{{MODULE_CONVENTIONS}}

Be conservative. Do not invent checks, conditionals or references that are not clearly present, and \
do not stretch a sentence into a category it does not really belong to.`;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

/**
 * When CLASSIFY_PROXY_URL and WORKER_ADMIN_TOKEN are set, requests go through
 * the worker's temporary /admin/classify endpoint, which holds the Anthropic key
 * as a Cloudflare secret. Otherwise a local ANTHROPIC_API_KEY is used directly.
 */
function proxyConfig(): { url: string; token: string } | null {
  const url = process.env.CLASSIFY_PROXY_URL;
  const token = process.env.WORKER_ADMIN_TOKEN;
  return url && token ? { url, token } : null;
}

interface MessagesRequest {
  model: string;
  max_tokens: number;
  system: string;
  messages: { role: "user"; content: string }[];
  tools: unknown[];
  tool_choice: unknown;
}

async function sendMessages(payload: MessagesRequest): Promise<{ content: unknown[] }> {
  const proxy = proxyConfig();
  if (!proxy) {
    return (await getClient().messages.create(payload as never)) as unknown as { content: unknown[] };
  }
  const res = await fetch(proxy.url, {
    method: "POST",
    headers: { "content-type": "application/json", "X-Admin-Token": proxy.token },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`classify proxy ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as { content: unknown[] };
}

/** Truncated tool-call artifacts leaking into the text fields. */
const CORRUPTION_MARKERS = ["</background_text>", "</read_aloud_text>", "</dm_only_text>", "<parameter"];
const MAX_ATTEMPTS = 3;

function looksCorrupted(text: string): boolean {
  return CORRUPTION_MARKERS.some((marker) => text.includes(marker));
}

/** Last-resort safety net: hard-truncate at the first marker rather than ever saving mangled output. */
function sanitize(text: string): string {
  let cut = -1;
  for (const marker of CORRUPTION_MARKERS) {
    const i = text.indexOf(marker);
    if (i !== -1 && (cut === -1 || i < cut)) cut = i;
  }
  return cut === -1 ? text : text.slice(0, cut).trimEnd();
}

const TOOL_SCHEMA = {
  type: "object" as const,
  properties: {
    type: { type: "string", enum: SECTION_TYPES },
    read_alouds: {
      type: "array",
      items: {
        type: "object",
        properties: { cue: { type: "string" }, text: { type: "string" } },
        required: ["cue", "text"],
      },
    },
    background_text: { type: "string" },
    prompts: {
      type: "array",
      items: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
      },
    },
    technique: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, text: { type: "string" } },
        required: ["name", "text"],
      },
    },
    conditionals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: CONDITIONAL_KINDS },
          condition: { type: "string" },
          effect: { type: "string" },
        },
        required: ["kind", "condition", "effect"],
      },
    },
    checks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          context: { type: "string" },
          skills: { type: "array", items: { type: "string" } },
          // Deliberately optional: omitted means no roll is needed at all.
          dc: { type: "integer" },
          passive: { type: "boolean" },
          kind: { type: "string", enum: CHECK_KINDS },
          cost: { type: "string" },
          success_text: { type: "string" },
          fail_text: { type: "string" },
        },
        required: ["context", "skills", "kind", "success_text"],
      },
    },
    features: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, text: { type: "string" } },
        required: ["name", "text"],
      },
    },
    creature_references: { type: "array", items: { type: "string" } },
  },
  required: [
    "type",
    "read_alouds",
    "background_text",
    "prompts",
    "technique",
    "conditionals",
    "checks",
    "features",
    "creature_references",
  ],
};

async function classifyOnce(
  section: ParsedSection,
  creatureNames: string[],
  moduleId: string
): Promise<ClassifiedBlocks> {
  const system = SYSTEM_PROMPT.replace("{{CREATURE_NAMES}}", creatureNames.join(", ")).replace(
    "{{MODULE_CONVENTIONS}}",
    MODULE_CONVENTIONS[moduleId] ?? DEFAULT_CONVENTIONS
  );
  const headingPath = [...section.headingPath, section.title].join(" > ");

  const response = await sendMessages({
    model: MODEL,
    max_tokens: 8192,
    system,
    messages: [
      {
        role: "user",
        content: `Chapter: ${section.chapter}\nHeading path: ${headingPath}\n\nSection text:\n${section.rawText}`,
      },
    ],
    tools: [
      {
        name: "classify_section",
        description: "Record the split classification of this adventure section.",
        input_schema: TOOL_SCHEMA,
      },
    ],
    tool_choice: { type: "tool", name: "classify_section" },
  });

  const toolUse = (response.content as { type: string; input?: unknown }[]).find((c) => c.type === "tool_use");
  if (!toolUse?.input) {
    throw new Error(`No tool_use response for section: ${headingPath}`);
  }
  return toolUse.input as ClassifiedBlocks;
}

export async function classifySection(
  section: ParsedSection,
  creatureNames: string[],
  moduleId = "dosi"
): Promise<ClassifiedSection> {
  let result = await classifyOnce(section, creatureNames, moduleId);
  let attempts = 1;

  while (
    (looksCorrupted(result.background_text ?? "") ||
      (result.read_alouds ?? []).some((r) => looksCorrupted(r.text ?? ""))) &&
    attempts < MAX_ATTEMPTS
  ) {
    result = await classifyOnce(section, creatureNames, moduleId);
    attempts++;
  }

  // creature/item sections are generated separately from the seed data, never by this classifier
  const type: SectionType = result.type === "creature" || result.type === "item" ? "encounter" : result.type;

  const readAlouds = (result.read_alouds ?? []).map((r, i) => ({
    ordinal: i,
    source: "book" as const,
    cue: r.cue ?? "",
    text: sanitize(r.text ?? ""),
  }));

  return {
    ...section,
    type,
    read_alouds: readAlouds,
    background_text: sanitize(result.background_text ?? ""),
    prompts: (result.prompts ?? []).map((p, i) => ({ ordinal: i, text: p.text })),
    technique: (result.technique ?? []).map((t, i) => ({ ordinal: i, name: t.name, text: t.text })),
    conditionals: (result.conditionals ?? []).map((c, i) => ({
      ordinal: i,
      kind: c.kind,
      condition: c.condition,
      effect: c.effect,
    })),
    features: (result.features ?? []).map((f, i) => ({ ordinal: i, name: f.name, text: f.text })),
    reveals: (result.checks ?? []).map((c, i) => ({
      ordinal: i,
      context: c.context ?? "",
      skills: c.skills ?? [],
      // Absent dc means no roll at all — preserved as null rather than coerced to 0.
      dc: typeof c.dc === "number" ? c.dc : null,
      passive: Boolean(c.passive),
      kind: c.kind ?? "info",
      cost: c.cost ?? "",
      text: c.success_text ?? "",
      fail_text: c.fail_text ?? "",
      // Legacy columns, still read by chat, search and the stat block popup.
      trigger_skill: (c.skills ?? [])[0] ?? "",
      trigger_dc: typeof c.dc === "number" ? c.dc : 0,
    })),
    creature_references: (result.creature_references ?? []).filter((n) => creatureNames.includes(n)),
  };
}
