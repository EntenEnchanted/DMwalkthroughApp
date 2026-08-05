# Campaign Page — Restructure Plan

Goal: make the Campaign page simple enough to scan and complete enough to run a
session from, so prep is fast. Everything below serves six things a DM needs
per section:

1. Read-alouds — what gets read to the players verbatim
2. DM-only information — background specific to this section
3. Things to ask the players / get them to do
4. Things that change what the DM does
5. What players can learn from skill checks
6. Scene-setting read-alouds — immersive detail, authored ahead of time

## 1. Why the current structure can't carry them

**Three needs share one column.** DM-only info, directives, and conditionals all
live in `sections.dm_only_text` with inline `[[directive]]` and `<cond>` markup.
Inline highlights don't survive a glance — answering "what do I ask the players
here?" means reading the paragraph and hunting for green. Need 6 has nowhere to
live at all.

**`read_aloud_text` is one column, but rooms have several read-alouds.**
B2: Fungus Farm has the boxed room description *and* a second "Read this text:"
when the violet fungus animates. They currently concatenate into one blob with
no cue about when each fires.

**One yellow bucket is doing three jobs.** In B2 alone:

| Source text | Really is | When you use it |
|---|---|---|
| "If a character moves more than 5 feet into the chamber, six stirges emerge" | in-the-moment **trigger** | watching for it during the scene |
| "If the characters defeated the violet fungi, the myconids' attitude improves" | **branch** on party history | tracked across sessions |
| "***2nd-Level Characters.*** add two violet fungi" | party-state **variant** | resolved once at prep, then forgotten |

`***2nd-Level Characters.***` appears 8 times in the source and the classifier
prompt never mentions it, so it's tagged inconsistently at best.

**Green is over-scoped.** The prompt lists `"continue with the X section"` as a
directive. That's DM navigation, not a player-facing prompt. Green should mean
strictly "ask the players / have them do something."

**The reveals model is too narrow.** 40 DC mentions in the source; the schema
assumes all are "succeed → learn info":

- `DC 12 Intelligence (Nature) or Wisdom (Survival)` — one `trigger_skill`
  string, so the alternative gets jammed in
- that same check costs **15 minutes of searching** — nowhere to record it
- three `DC 14 Dexterity (Stealth)` checks where **failure** has consequences —
  no fail field

**Locked reveals are backwards for prep.** `"Locked until the check succeeds"`
protects you at the table but fights you while prepping, when you need to read
everything.

**Two bugs to fix in passing:**

- `upsertSection` deletes and re-inserts reveals, and `revealed` is keyed to an
  autoincrement id — **re-ingesting wipes revealed flags mid-campaign.**
- The worker at `dosi-dm-companion-worker.therealgarrettwells.workers.dev` 404s
  on `/api/campaign`, `/api/search`, and `/api/creatures`, and returns CORS
  headers that don't match this codebase. Worth confirming where the live app
  points before any deploy.

## 2. Content model

Typed blocks replace the one-blob-plus-markup approach. **Content is extracted
fully — nothing is duplicated between a block and the prose, and the inline
`<cond>` / `[[directive]]` markup goes away entirely** (see §7, Phase 0
findings). `background_text` becomes what's genuinely left over, which matches
need 2's "purely informational."

| Need | Block | Table |
|---|---|---|
| 1 Read-alouds | `read_alouds[]` — multiple, each with a "when" cue | `read_alouds` (`source='book'`) |
| 6 Scene-setting | `scene[]` — authored, marked non-canonical | `read_alouds` (`source='authored'`) |
| 2 DM-only info | `background` — prose left after extraction | `sections.background_text` |
| 3 Ask / do | `prompts[]` — extracted, reworded standalone | `prompts` |
| 4 Alters DM behaviour | `triggers[]` / `branches[]` / `variants[]` | `conditionals` (`kind`) |
| 5 Skill checks | `checks[]` | `checks` |
| (new) Standing rules | `features[]` — persistent mechanical properties of the area | `features` |

Scene text shares the `read_alouds` table with a `source` discriminator so both
render through one component with different styling, and each ingest pass
touches only its own rows.

### Schema

```sql
ALTER TABLE sections ADD COLUMN background_text TEXT NOT NULL DEFAULT '';
-- dm_only_text and read_aloud_text are KEPT as derived columns (see §5)

CREATE TABLE read_alouds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id TEXT NOT NULL REFERENCES sections(id),
  ordinal INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('book', 'authored')),
  cue TEXT NOT NULL DEFAULT '',   -- "on entering", "when the fungus animates"
  text TEXT NOT NULL
);

CREATE TABLE prompts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id TEXT NOT NULL REFERENCES sections(id),
  ordinal INTEGER NOT NULL,
  text TEXT NOT NULL
);

CREATE TABLE conditionals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id TEXT NOT NULL REFERENCES sections(id),
  ordinal INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('trigger', 'branch', 'variant')),
  condition TEXT NOT NULL,        -- "a character moves more than 5 feet in"
  effect TEXT NOT NULL            -- "six stirges emerge and attack"
);

CREATE TABLE checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id TEXT NOT NULL REFERENCES sections(id),
  ordinal INTEGER NOT NULL,
  context TEXT NOT NULL DEFAULT '', -- the action that prompts it: "Examining the statue"
  skills TEXT NOT NULL,           -- JSON: ["Intelligence (Nature)","Wisdom (Survival)"]
  dc INTEGER,                     -- nullable: no-roll, contested, or passive
  passive INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL CHECK (kind IN ('info','discovery','social','consequence')),
  cost TEXT NOT NULL DEFAULT '',  -- "15 minutes"
  success_text TEXT NOT NULL,
  fail_text TEXT NOT NULL DEFAULT '',
  revealed INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX idx_checks_stable ON checks(section_id, ordinal);

CREATE TABLE features (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id TEXT NOT NULL REFERENCES sections(id),
  ordinal INTEGER NOT NULL,
  name TEXT NOT NULL,             -- "Sanctuary of Bahamut"
  text TEXT NOT NULL
);
```

`checks.context` separates *what the character is doing* from *what it costs* —
"Examining the statue" vs. "15 minutes". The UI reads as
`Examining the statue — DC 10 Intelligence (Religion) → recognizes Bahamut`.
`dc` is nullable because several information routes need no roll at all.

Splitting `condition`/`effect` lets the UI render a scannable two-column
"If X → Y" list instead of a sentence to parse. For variants, `condition` is
"party is 2nd level" and `effect` is "add two violet fungi", which is what makes
the prep strip able to resolve them automatically.

**Reveal-state fix:** `checks` gets a unique `(section_id, ordinal)` key and
upserts on conflict without touching `revealed`. Re-ingesting no longer wipes
session state.

## 3. Layout

Master/detail: sticky outline tree left, one section in the right pane.
On phone the outline is the default view and tapping drills down full-screen
with a back button. Today expanding a section pushes everything down and you
lose your place.

Blocks render in play order — chronological to how a room actually runs:

```
┌─ prep strip ── 2 read-alouds · 3 checks · 1 branch · 2 prompts · 3 creatures
│  party is 2nd level → +2 violet fungi
├─ Scene         authored, clearly labelled as not-from-the-book
├─ Read aloud    canonical, each with its trigger cue
├─ Ask / Do      prompts
├─ If… then…     triggers
├─ Depends on    branches (prior sessions)
├─ Checks        table: context, skills, DC, cost, success, fail
├─ Always on     features — standing rules for the area
├─ Background    lore
└─ Creatures     chips → stat block popup
```

**Prep mode vs. Run mode** — one persisted toggle:

- *Prep*: everything expanded, all check text visible, scene text shown
- *Run*: background collapsed, checks locked by default, larger text

This is the piece that most directly serves fast prep without breaking table
use. The prep strip resolving the party-level variant up front means 2nd-level
scaling stops being something you discover mid-combat.

**Outline density chips** put the counts on the outline row itself, so the tree
tells you how heavy a room is before you open it.

### Components

| File | Role |
|---|---|
| `CampaignView.tsx` | two-pane shell, selection state, mode toggle |
| `CampaignOutline.tsx` | tree + density chips |
| `SectionDetail.tsx` | block ordering and collapse state |
| `blocks/SceneBlock.tsx` | authored scene text, canon-marked |
| `blocks/ReadAloudBlock.tsx` | book read-alouds with cues |
| `blocks/PromptsBlock.tsx` | ask / do checklist |
| `blocks/ConditionalsBlock.tsx` | triggers, branches, variants (one component, three modes) |
| `blocks/ChecksBlock.tsx` | check table + reveal toggles |
| `blocks/FeaturesBlock.tsx` | standing rules for the area |
| `blocks/BackgroundBlock.tsx` | plain prose — no inline markup |
| `PrepStrip.tsx` | counts + resolved variants |

`SectionCard.tsx` stays as-is — search results and the stat block popup keep
using it.

## 4. Ingest changes

### Pass 1 — classify (rewrite `ingest/src/classify.ts`)

New tool schema emits `read_alouds[]`, `background_text`, `prompts[]`,
`conditionals[]`, `checks[]`, `creature_references[]`.

Prompt changes:

- **Prompts** are strictly player-facing — "ask the players…", "have a character
  make…", "encourage them to…". Explicitly **exclude** DM navigation ("continue
  with X", "see appendix A") and DM-internal running advice ("rely on your sense
  of what's fun").
- **Conditionals** get the three-way definition with book examples:
  - `trigger` — fires from something the party does *in this scene* (movement,
    touching, attacking, noise)
  - `branch` — depends on state carried in from *before* this scene (a prior
    fight's outcome, an NPC met, an item held)
  - `variant` — depends on fixed party configuration known at prep time. The
    `***2nd-Level Characters.***` blocks are always this.
- **Checks** capture multi-skill alternatives as an array, time/resource cost
  separately, fail consequences, and the passive flag.
- **Read-alouds** emit one entry per boxed block *or* explicit "Read this text"
  cue, each with a short `cue` describing when it fires.

The existing corruption-retry and sanitize logic carries over unchanged.

### Pass 2 — scene generation (new `ingest/src/scene.ts`)

For each `type='location'` section, generate 2–4 sentences of sensory
scene-setting. Input: the section's book read-aloud, background, and chapter
context. Constraints:

- no new facts, no creatures or objects the room doesn't have
- no player-agency assumptions ("you feel afraid", "you decide to…")
- sensory register beyond sight — sound, smell, temperature, air movement
- second person present tense, matching the book's voice

Writes only `source='authored'` rows, so prose you don't like can be regenerated
without touching classification.

## 5. Not breaking search, chat, and the popup

`chat.ts`, `StatBlockPopup.tsx`, `SectionCard.tsx`, and `embeddingText()` all
read `dm_only_text` / `read_aloud_text` / `reveals`.

**Keep `sections.dm_only_text` and `sections.read_aloud_text` as derived
columns**, written by ingest as a concatenation of the new blocks. Embedding,
chat context, search results, and the stat block popup keep working untouched
and retrieval quality is unchanged. Only the Campaign page reads the new tables.
Migrating those consumers is optional later work, not a prerequisite.

`getCampaignSections` grows from 2 child-table joins to 5. The whole campaign
still ships in one response; if payload size becomes a problem, split into a
lightweight outline index plus lazy per-section fetch.

## 6. Phasing

**Phase 0 — fixture. _(done — `ingest/fixtures/phase0-sections.json`)_**
Hand-authored B2: Fungus Farm and A5: Temple of Bahamut in the new JSON shape.
No API spend, and the hand-authored version becomes the accuracy yardstick for
Phase 3. Findings in §7.

**Phase 1 — schema + worker.** New tables, migration, `getCampaignSections`
returns blocks, `/api/checks/:id/toggle` replaces the reveal toggle. Load the
fixture through `/admin/load-sections`.

**Phase 2 — layout.** Two-pane shell, block components, prep strip, prep/run
mode, density chips. Built against the fixture — this is the point to react to
the shape before paying for re-ingest.

**Phase 3 — classify pass.** Rewrite the prompt and tool schema, re-run over all
chapters (~120 sections), verify output against the Phase 0 fixture.

**Phase 4 — scene pass.** Separate script, locations only (~30 sections).

**Phase 5 — polish.** Party-level setting so variants resolve automatically,
density chip tuning, reconciling the search view with the new blocks.

## 7. Phase 0 findings

Authoring the two fixture sections by hand changed three decisions.

**A seventh block: `features[]`.** A5's protective magic — *"a non-evil creature
who makes a saving throw within the temple can roll a d4 and add it"* — is a
standing rule that applies for as long as the party is in the room. It isn't a
check (nothing is rolled to discover it), isn't a conditional (nothing triggers
it), and isn't "purely informational" — it's a rule you have to remember to
apply. Buried in background prose it will be missed every time. B1's tide rules
are the same shape. B2 has none, which is the point: the block is optional and
sections that don't need it don't show it.

**`checks.context`, split from `cost`.** "A character who spends 15 minutes
searching this chamber and succeeds on a DC 12 check" has two separate parts —
the action ("searching the chamber") and the price ("15 minutes"). One field
couldn't hold both, and the action is what a DM scans for.

**`dc` must be nullable.** A5 alone has three information routes and only one is
a roll: the DC 10 Religion check, *asking any resident* (auto-succeeds, and is
the designed bypass for a failed check), and *casting detect magic*. B2's
blighted-fungi observation needs no roll either. Modelling these as no-DC checks
keeps them in the Checks block, which is where a DM looks for "what can they
learn here" — rather than scattering them into triggers.

**Full extraction beats keeping inline spans.** The original plan kept the
tagged sentence in the prose *and* extracted it. Writing it out, the leftover
background reads fine without them and the duplication is just noise. Dropping
the inline markup also removes `dmText.tsx` and the classifier's span-balance
retry logic entirely.

**Both fixture sections have zero prompts.** Neither has anything the DM asks
the players to do — B2's *"cast as much doubt as you can"* is DM technique, not
a player prompt, and under the tightened definition it stays in background. This
is direct evidence the current green highlight is over-firing. Worth expecting
`prompts[]` to be empty for most location sections and concentrated in
encounters and NPC introductions.

## 8. Risks

- **Re-ingest overwrites everything.** Phase 3 replaces all classified content.
  Fixture-first exists to settle the target shape before that happens.
- **Classifier accuracy on the three-way conditional split** is the main
  unknown. The trigger/branch distinction is subtle in places. Mitigation:
  verify against the fixture and spot-check chapter by chapter rather than
  running all four at once.
- **Generated scene text is taste-dependent.** There's no in-app editing today,
  so the only correction loop is re-running the pass. If that proves annoying,
  a lightweight admin edit endpoint is the follow-up.
