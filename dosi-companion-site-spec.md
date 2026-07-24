# Dragons of Stormwreck Isle — DM Companion Site
### Handoff Spec for Claude Code

## 1. Overview

A standalone, DM-only web app for running *Dragons of Stormwreck Isle*. Three core capabilities during live play:

1. **Semantic search** — find relevant adventure text fast, even without exact keywords.
2. **Grounded chat** — ask free-form questions, get answers sourced from the adventure text.
3. **Information-tier separation** — the pivotal requirement: content is classified into what's DM-only, what should be read aloud to players, and what's locked behind a skill check.

Source content: a single ~1,370-line markdown file (already in hand) containing DM guidance, all 4 chapters, magic items, and monster stat blocks, plus a companion `dosi-creatures-seed.json` with full structured stat blocks for all 20 creatures (transcribed from the book's stat block appendix, since the markdown export only listed creature names without their numbers).

## 2. Goals

- Fast, reliable lookup at the table on phone/tablet or laptop, mid-session.
- Chat answers are grounded in the adventure text — no hallucinated rules or plot details.
- **Never let the DM accidentally reveal information the players haven't earned.** Every piece of content is visibly tagged by tier, and conditional information stays hidden/flagged until the DM marks it revealed.
- Minimal surface area beyond this: ship search + chat + tiering well rather than a broad toolset.

## 3. Non-Goals (v1)

- No player-facing view — DM only (the tiers exist to protect the DM from over-sharing, not to build a player-facing filtered view).
- No auth/login — single user, no accounts.
- No session tools (initiative tracker, dice roller, general notes) — out of scope for v1.
- No in-app editing of the underlying adventure text — static, loaded once. (The *revealed* flags are runtime state, see below — that's not editing content, just tracking session progress.)
- Image rendering — nice-to-have, not required for v1.

## 4. Content Model — The Three Tiers

This is the core design problem: the source markdown does **not** cleanly separate these today. Boxed quote text (`>`) is read-aloud. Everything else is prose, and conditional reveals are woven inline as sentences like *"A character who succeeds on a DC 15 Intelligence (History) check recognizes..."* — not tagged or separated at all.

So ingestion isn't just chunking — it's **extraction and classification**. For each logical section (room, encounter, NPC, stat block), the ingestion pipeline must produce:

- **`read_aloud`**: text meant to be read to players verbatim (source: blockquote sections, or explicit "read this text" cues in the prose).
- **`dm_only`**: background, motivations, secrets, running notes — the default tier for anything not explicitly read-aloud or a flagged reveal.
- **`reveals[]`**: conditional-reveal items extracted from the prose, each with:
  - `trigger`: skill/ability + DC (e.g. "DC 15 Intelligence (History)")
  - `text`: what the players learn on success
  - `revealed`: boolean, defaults false — DM toggles this on during play

### Classification approach (per your input: automatic first, then reviewed)
1. During ingestion, send each parsed section through the Anthropic API with a prompt instructing it to extract and tag `read_aloud`, `dm_only`, and `reveals[]` (with trigger + text) as structured JSON.
2. Store the LLM's output in D1 (see schema below) rather than raw undifferentiated text.
3. Before treating ingestion as final, you review the tagged output (a simple review view, or just the raw JSON) and correct any mis-tagged sections. This is a one-time pass per section, not a recurring task.

## 5. Architecture

**Stack:** Cloudflare-first, consistent with other projects.

| Layer | Choice | Purpose |
|---|---|---|
| Hosting | Cloudflare Pages | Static frontend |
| Compute | Cloudflare Workers | API layer (search, chat, reveal toggling) |
| Vector store | Cloudflare Vectorize | Semantic search over adventure sections |
| Embeddings | Cloudflare Workers AI | Generate embeddings for sections + queries |
| Classification (ingestion only) | Anthropic API (Claude) | One-time extraction of read_aloud/dm_only/reveals from raw prose |
| Chat model | Anthropic API (Claude) | Answer generation, grounded via retrieved sections, tier-aware |
| Structured data | Cloudflare D1 | Store tagged section content + reveal state |

## 6. Data Model (D1)

```
sections
  id, chapter, heading, order, type (location|encounter|creature|item), dm_only_text, read_aloud_text

creature_stats
  section_id, stat_block_json   -- full structured stat block (see dosi-creatures-seed.json for shape)

reveals
  id, section_id, trigger_skill, trigger_dc, text, revealed (bool, default false)

section_references
  id, source_section_id, referenced_section_id   -- e.g. a room mentioning "three zombies" links to the Zombie creature section
```

Vectorize stores one embedding per `section.id` (embed the combined dm_only + read_aloud text for retrieval matching); reveal text can optionally be embedded too so a query can surface a hidden reveal (still shown as locked/unrevealed unless already marked revealed).

## 7. Data Pipeline (one-time ingestion, per section)

1. Parse the markdown into logical sections by heading/subheading structure (room, encounter, stat block, etc.).
2. For each section, call the Anthropic API to extract `read_aloud_text`, `dm_only_text`, and `reveals[]` as structured JSON.
3. Store the result in D1 (`sections`, `reveals` tables above).
4. Generate an embedding per section via Workers AI; store in Vectorize keyed by `section.id`.
5. Review pass: you check the tagged output and correct misclassifications before the data is treated as final for play.

This is a build-time/setup script — not part of the live request path.

## 8. Core Features (P0)

### Search
- Query → embed → Vectorize similarity search → fetch section from D1 by ID → display results **clearly labeled by tier**: Read-Aloud text always visible, DM-Only text visible (you're the only user) but visually distinct, and Reveals shown as locked (trigger only) until marked revealed, then showing the text.
- Each reveal has a toggle to mark it revealed; toggled state persists in D1 (`reveals.revealed`).

### Chat
- Query → embed → Vectorize search for top-N relevant sections → assemble matched sections (including their tier-tagged sub-parts) as context → call Anthropic API with a system prompt instructing it to:
  - Answer only from the provided context.
  - **Explicitly label each part of its answer by tier** — e.g., "Read aloud: ...", "DM only: ...", "If they succeed on DC 15 Intelligence (History): ...".
  - Never present a reveal's text as freely known — always frame it behind its trigger condition unless the retrieved data shows it's already been marked revealed.

### Quick Stat Block Lookup
A frequent in-the-moment need: a creature shows up and you need its stats *without* losing your place in the room/encounter you're currently viewing. (There are no separate roleplay-only NPCs in this adventure — every named character, including Tarak, Varnoth, Runara, and Sinensa, has a full combat stat block, so one `creature` type covers all of them.)

- Each `section` gets a `type` (`location`, `encounter`, `creature`, `item`).
- During the ingestion LLM pass, creature name mentions inside other sections' text (e.g., a room's `dm_only_text` mentioning "three zombies") are detected and turned into references to that creature's section.
- In the UI, these show as clickable inline links. Clicking one opens the stat block in a **popup/overlay**, not a page navigation — the underlying room/encounter view stays exactly as it was underneath. Closing the popup returns you to where you were.
- For named/story-significant creatures (Runara, Tarak, Varnoth, Sinensa), the popup can include a second tab aggregating any narrative content that references them elsewhere (auto-collected via `section_references`, so it's populated automatically rather than duplicated by hand) — hidden if there's nothing to show.
- Anything not pre-linked is still reachable the normal way: search or chat surfaces it, and `type: creature` results render as the same popup rather than a full page.

**Full stat block data is ready as seed data** — all 20 creatures in the campaign (`dosi-creatures-seed.json`, provided alongside this spec) are transcribed into structured JSON with AC, HP, speed, ability scores/saves, skills, resistances/immunities, senses, languages, traits, actions, and bonus actions. This can be loaded directly into D1 rather than re-extracted from the source markdown or re-transcribed from the book.

## 9. Nice-to-Have (P1, post-v1)

- Inline images for maps/splash art.
- Bookmark/favorite frequently-referenced sections.
- A "session view" filtering to only unrevealed reveals relevant to the party's current location.

## 10. Non-Functional Requirements

- Responsive layout — usable one-handed on a phone at the table and on a laptop.
- No login friction — bookmarked URL, open and go.
- Reasonable latency on chat (streaming preferred).

## 11. Open Questions (resolve before/during build)

- **Section granularity**: one section per room/encounter/stat block is the working assumption — confirm this doesn't over- or under-split content with genuinely mixed tiers (e.g., a room with several independent reveals).
- **Review UX for ingestion**: starting lightweight — a plain JSON/text review of the LLM's tagging output, no dedicated admin UI. Revisit if this proves too unwieldy in practice.
- **Frontend framework**: no stated preference yet — flag for decision at build start.
- **Anthropic API key management**: stored as a Worker secret, standard practice.

## 12. Suggested Build Phasing

1. **Ingestion + classification script**: parse markdown → sections → LLM tagging (read_aloud/dm_only/reveals) → D1 + Vectorize populated. Review and correct tagging.
2. **Search API + minimal UI**: query in, tier-labeled results out, reveal toggles working. Validates the full retrieval + tiering pipeline.
3. **Chat API + UI**: layer tier-aware grounded chat on top of the same retrieval.
4. **Polish pass**: responsive layout, citation display, loading states.
