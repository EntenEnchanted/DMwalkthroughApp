/**
 * Authored scene-setting for location sections.
 *
 * The book gives one boxed description per room; this adds a short sensory layer
 * a DM can read on top of it, so the atmosphere is prepared rather than
 * improvised at the table.
 *
 * SAFETY: this text is read ALOUD TO PLAYERS. The generator is therefore given
 * only the book's own read-aloud text — never background_text, which holds
 * secrets, NPC motives and check-gated information. Feeding background would
 * make leaking it possible; withholding it makes leaking structurally
 * impossible. A post-generation check flags any proper noun that did not appear
 * in the source passage.
 *
 *   npm run scene -- output/dosi-chapter-all.json
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";

const MODEL = "claude-sonnet-5";

const SYSTEM_PROMPT = `You write short atmospheric passages for a D&D adventure, to be read aloud to \
players when they enter a room. You are given the adventure's own description of the room. Your job \
is to add a sensory layer the players can feel, not to restate or replace what they were already told.

Rules, in order of importance:

1. INVENT NOTHING. No object, creature, exit, sound-source, smell-source or event that is not already \
implied by the passage you are given. If the passage does not mention water, there is no water. You \
are describing the same room in more sensory detail, not adding to it.

2. Do not tell players what they feel, think, notice or decide. "The knot in your shoulders loosens" \
and "you sense danger" are forbidden. Describe the room; let the players react to it.

3. Reach past sight. The book already covers what things look like. Prioritise sound, smell, \
temperature, air movement, humidity, and how surfaces feel underfoot or underhand.

4. Second person, present tense, matching the register of the passage you were given. Plain and \
concrete. No purple prose, no similes stacked on similes, no rhetorical questions.

5. Two to four sentences. Shorter is better than padded.

6. Do not name any creature, NPC or item that the passage does not already name. If figures are \
present in the passage, refer to them exactly as vaguely as the passage does — if it says they are \
"working", do not invent what they are working with.

7. ANYTHING DEPICTED IS NOT ALIVE. Carved, sculpted, painted, woven or engraved figures — animals on \
a statue, faces in a mural, beasts on a tapestry — do not move, breathe, rustle, shift or make sound. \
Describe them as the worked stone, paint or cloth they are.

8. Say nothing about the characters themselves — not their bodies, senses, equipment, light sources, \
or how they are moving. No fins, no torches, no armour, no footsteps described as theirs. If the room \
is underwater or dark, describe the water or the darkness, never how the party copes with it.

Write only the passage itself, with no preamble, heading or quotation marks.`;

interface ReadAloud {
  ordinal: number;
  source: "book" | "authored";
  cue: string;
  text: string;
}

interface Section {
  id: string;
  heading: string;
  chapter: string;
  type: string;
  read_alouds?: ReadAloud[];
}

function proxyConfig(): { url: string; token: string } | null {
  const url = process.env.CLASSIFY_PROXY_URL;
  const token = process.env.WORKER_ADMIN_TOKEN;
  return url && token ? { url, token } : null;
}

const MAX_ATTEMPTS = 4;

async function generate(section: Section, bookText: string): Promise<string> {
  const payload = {
    model: MODEL,
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user" as const,
        content: `Adventure: ${section.chapter}\nRoom: ${section.heading}\n\nThe adventure's description of this room:\n${bookText}`,
      },
    ],
  };

  const proxy = proxyConfig();

  // Overload and rate limiting are routine across a run this long, and losing the
  // whole pass to one of them is not.
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(proxy ? proxy.url : "https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: proxy
        ? { "content-type": "application/json", "X-Admin-Token": proxy.token }
        : {
            "content-type": "application/json",
            "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
            "anthropic-version": "2023-06-01",
          },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const json = (await res.json()) as { content: { type: string; text?: string }[] };
      return (json.content.find((c) => c.type === "text")?.text ?? "").trim();
    }
    const body = (await res.text()).slice(0, 200);
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt === MAX_ATTEMPTS) throw new Error(`${res.status}: ${body}`);
    await new Promise((r) => setTimeout(r, 2000 * 2 ** (attempt - 1)));
  }
}

const STOPWORDS = new Set([
  "The", "A", "An", "You", "Your", "It", "Its", "This", "That", "These", "Those", "There", "Here",
  "Above", "Below", "Beyond", "Beneath", "Inside", "Outside", "Somewhere", "Nothing", "Everything",
  "Water", "Air", "Stone", "Light", "Dark", "Sound", "Smell", "But", "And", "Then", "When", "Where",
  "What", "Two", "Three", "Four", "Five", "Six", "Seven", "One", "At", "In", "On", "From", "To", "Of",
  "Past", "Under", "Over", "Across", "Along", "Against", "Between", "Behind", "Before", "After",
]);

/** Proper nouns in the generated text that never appeared in the source passage. */
function leakedNames(scene: string, bookText: string): string[] {
  const source = bookText.toLowerCase();
  const candidates = scene.match(/(?<![.!?]\s)(?<!^)\b[A-Z][a-z]{2,}\b/gm) ?? [];
  return [...new Set(candidates)].filter((w) => !STOPWORDS.has(w) && !source.includes(w.toLowerCase()));
}

async function main() {
  const args = process.argv.slice(2);
  const path = args.find((a) => !a.startsWith("--"));
  const resume = args.includes("--resume");
  if (!path) {
    console.error("usage: npm run scene -- <classifier-output.json> [--resume]");
    process.exit(1);
  }

  const sections = JSON.parse(readFileSync(path, "utf-8")) as Section[];
  // Only rooms the book actually describes. Chapter intros and overviews get
  // typed `location` too, and inventing atmosphere for those makes no sense.
  let targets = sections.filter(
    (s) => s.type === "location" && (s.read_alouds ?? []).some((r) => r.source === "book")
  );

  // Regenerating is the only way to correct prose you don't like, so a rerun
  // rewrites every room by default. --resume is for picking a failed pass back
  // up, and skips rooms that already carry authored text.
  if (resume) {
    const total = targets.length;
    targets = targets.filter((s) => !(s.read_alouds ?? []).some((r) => r.source === "authored"));
    console.log(`Resuming: ${total - targets.length} already done, ${targets.length} to go.`);
  }

  console.log(`Generating scene text for ${targets.length} rooms...`);
  let flagged = 0;

  for (const section of targets) {
    // Only the FIRST book passage. Scene text is arrival atmosphere, and later
    // passages fire on events the party has not witnessed yet — feeding them in
    // let B2's violet fungus appear in the room's first description, spoiling
    // the encounter whose whole tension is not knowing which fungus is alive.
    const book = (section.read_alouds ?? []).filter((r) => r.source === "book");
    const bookText = book[0]?.text ?? "";
    process.stdout.write(`  ${section.heading} ... `);

    const scene = await generate(section, bookText);
    const leaks = leakedNames(scene, bookText);
    if (leaks.length) {
      flagged++;
      console.log(`⚠ possible invented names: ${leaks.join(", ")}`);
    } else {
      console.log(`${scene.split(/\s+/).length} words`);
    }

    // Replace any previous authored entry so the pass is re-runnable.
    const kept = (section.read_alouds ?? []).filter((r) => r.source !== "authored");
    section.read_alouds = [
      ...kept,
      {
        ordinal: kept.length,
        source: "authored" as const,
        cue: "Optional atmosphere — layer in on arrival, after the first boxed text",
        text: scene,
      },
    ].map((r, i): ReadAloud => ({ ...r, ordinal: i }));

    // Checkpoint per room. A pass this long that only wrote at the end threw
    // away every passage before the failure whenever one call went wrong.
    writeFileSync(path, JSON.stringify(sections, null, 2));
  }

  writeFileSync(path, JSON.stringify(sections, null, 2));
  console.log(`\nWrote ${targets.length} scene passages into ${path}`);
  if (flagged) console.log(`${flagged} flagged for review — check these before loading.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
