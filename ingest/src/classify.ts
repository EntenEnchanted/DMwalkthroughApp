import Anthropic from "@anthropic-ai/sdk";
import type { ParsedSection, ClassifiedSection, SectionType } from "./types.js";

const MODEL = "claude-sonnet-5";

const SECTION_TYPES: SectionType[] = ["location", "encounter", "creature", "item", "reference"];

const SYSTEM_PROMPT = `You are helping ingest a D&D 5e adventure book into a DM-only companion app. \
For each section of text you're given, classify it and split it into tiers:

- read_aloud_text: text meant to be read to players verbatim. Source material marks this with ">>" \
boxed-quote delimiters, or explicit cues like "Read this text" / "Read or paraphrase". Preserve the \
text closely; strip only the ">>" delimiters themselves. Empty string if none.
- dm_only_text: everything else — background, motivations, secrets, running notes, rules explanations. \
This is the default tier for prose that isn't read-aloud and isn't a conditional reveal. Within this text, \
wrap any sentence that directs the DM to do something or prompt the players to act — e.g. "encourage the \
players to...", "ask the players for...", "have a player make a check", "continue with the X section" — in \
[[directive]]...[[/directive]] markers, so the app can highlight it separately from background/reference \
information. Only wrap actual instructions, not the surrounding context or plain lore.
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

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

const CORRUPTION_MARKERS = ["</dm_only_text>", "</read_aloud_text>", "<parameter"];
const MAX_ATTEMPTS = 3;

function looksCorrupted(text: string): boolean {
  if (CORRUPTION_MARKERS.some((marker) => text.includes(marker))) return true;
  const opens = (text.match(/\[\[directive\]\]/g) ?? []).length;
  const closes = (text.match(/\[\[\/directive\]\]/g) ?? []).length;
  return opens !== closes;
}

async function classifyOnce(
  section: ParsedSection,
  creatureNames: string[]
): Promise<{
  type: SectionType;
  read_aloud_text: string;
  dm_only_text: string;
  reveals: { trigger_skill: string; trigger_dc: number; text: string }[];
  creature_references: string[];
}> {
  const system = SYSTEM_PROMPT.replace("{{CREATURE_NAMES}}", creatureNames.join(", "));
  const headingPath = [...section.headingPath, section.title].join(" > ");

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 4096,
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
        description: "Record the tiered classification of this adventure section.",
        input_schema: {
          type: "object",
          properties: {
            type: { type: "string", enum: SECTION_TYPES },
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
  });

  const toolUse = response.content.find((c) => c.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error(`No tool_use response for section: ${headingPath}`);
  }
  return toolUse.input as {
    type: SectionType;
    read_aloud_text: string;
    dm_only_text: string;
    reveals: { trigger_skill: string; trigger_dc: number; text: string }[];
    creature_references: string[];
  };
}

export async function classifySection(
  section: ParsedSection,
  creatureNames: string[]
): Promise<ClassifiedSection> {
  let result = await classifyOnce(section, creatureNames);
  let attempts = 1;

  while (
    (looksCorrupted(result.dm_only_text ?? "") || looksCorrupted(result.read_aloud_text ?? "")) &&
    attempts < MAX_ATTEMPTS
  ) {
    result = await classifyOnce(section, creatureNames);
    attempts++;
  }

  // creature/item sections are generated separately from the seed data, never by this classifier
  const type: SectionType = result.type === "creature" || result.type === "item" ? "encounter" : result.type;

  return {
    ...section,
    type,
    read_aloud_text: result.read_aloud_text ?? "",
    dm_only_text: result.dm_only_text ?? "",
    reveals: result.reveals ?? [],
    creature_references: (result.creature_references ?? []).filter((n) => creatureNames.includes(n)),
  };
}
