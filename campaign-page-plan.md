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

## 0. Codebase context

This work sits on top of the app as it runs in production: auth and
multi-campaign support, character sheets, an SRD library, battle maps with
tokens and fog of war, a numbered migration chain, and ingestion generalised to a
`module_id` (Lost Mine of Phandelver is registered as a second module in 0008).

That code originally lived on `claude/dnd-webapp-changes-y71v7g` while `main` sat
13 commits behind it, which is how this branch came to be cut from a stale base.
`main` was fast-forwarded to it during this session, so `main` is now the correct
base for future branches — check it is current before branching.

Two consequences for this plan:

- Schema changes are **migrations**, not edits to `worker/schema.sql`.
- Anything stateful is **per-campaign**, following the `reveal_defs` /
  `campaign_reveal_state` split. New content tables are static definitions keyed
  off `section_id` (and inherit module scoping from `sections.module_id`); only
  DM progress is campaign-scoped.

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

**A live bug this plan must not trip over.** Migration 0001 split `reveals` into
`reveal_defs` (static) plus `campaign_reveal_state (campaign_id, reveal_def_id,
revealed, revealed_at)` so two campaigns on the same module don't share toggles.
But `upsertSection` still does:

```sql
DELETE FROM reveal_defs WHERE section_id = ?;   -- then re-INSERT
```

The re-inserted rows get **new autoincrement ids**, so every
`campaign_reveal_state` row is left pointing at a deleted `reveal_def_id`.
Per-campaign progress silently orphans and every reveal reads as un-revealed.
The migration preserved state carefully; the ingest path throws it away. This
matters directly because Phase 3 is a full re-ingest — it must land with a
stable key first.

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
| (new) DM technique | `technique[]` — how to *perform* the scene, not facts about it | `technique` |

**Technique is not a prompt and not background.** *"Cast as much doubt as you
can"* and *"don't track exactly where everyone is standing"* are advice about
how you run the table — they tell you nothing about the world and ask nothing of
the players. Mixing them into green was a large part of why the directive
highlight felt inaccurate. Given its own block (purple), green narrows to things
you actually say to the players.

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

-- Checks EXTEND reveal_defs in place rather than becoming a new table, so the
-- existing campaign_reveal_state rows (and the DM's progress) survive.
ALTER TABLE reveal_defs ADD COLUMN ordinal INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reveal_defs ADD COLUMN context TEXT NOT NULL DEFAULT '';
ALTER TABLE reveal_defs ADD COLUMN skills TEXT NOT NULL DEFAULT '[]';  -- JSON array
ALTER TABLE reveal_defs ADD COLUMN kind TEXT NOT NULL DEFAULT 'info';
ALTER TABLE reveal_defs ADD COLUMN cost TEXT NOT NULL DEFAULT '';
ALTER TABLE reveal_defs ADD COLUMN fail_text TEXT NOT NULL DEFAULT '';
ALTER TABLE reveal_defs ADD COLUMN passive INTEGER NOT NULL DEFAULT 0;
-- trigger_dc becomes nullable for no-roll routes; trigger_skill is superseded
-- by skills[] and backfilled into it.

-- The stable key that stops re-ingest from orphaning campaign_reveal_state.
CREATE UNIQUE INDEX idx_reveal_defs_stable ON reveal_defs(section_id, ordinal);

CREATE TABLE features (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id TEXT NOT NULL REFERENCES sections(id),
  ordinal INTEGER NOT NULL,
  name TEXT NOT NULL,             -- "Sanctuary of Bahamut"
  text TEXT NOT NULL
);

CREATE TABLE technique (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id TEXT NOT NULL REFERENCES sections(id),
  ordinal INTEGER NOT NULL,
  name TEXT NOT NULL,             -- "Cast as much doubt as you can"
  text TEXT NOT NULL
);
```

All of the above ships as **migration `0011_campaign_blocks.sql`** — the repo has
a numbered migration chain (0001–0010) and `worker/schema.sql` is no longer the
source of truth.

`reveal_defs.context` separates *what the character is doing* from *what it costs* —
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
├─ How to run    technique — DM craft advice (purple)
├─ Background    lore
└─ Creatures     chips → stat block popup
```

### Colour

With content split into blocks, structure carries most of the meaning and colour
becomes a quiet accent rather than the primary signal. **Tint the block's label
and left border, not the body text** — the loud inline highlighting existed
because everything was one undifferentiated paragraph, and that's no longer true.

| Block | Hue | Existing token |
|---|---|---|
| Read aloud (book) | blue | `--accent` |
| Scene (authored) | blue, dashed border to mark non-canonical | `--accent` |
| Ask / Do | green | `--directive` |
| Conditionals | yellow | `--conditional-*` |
| Checks | amber | `--lock` |
| Technique | **purple** *(new — `--technique`)* | — |
| Features | neutral + rule icon | `--border` |
| Background | neutral | — |

The three conditional kinds share the yellow hue and are separated by label and
icon rather than three more colours — otherwise the page becomes a rainbow and
colour stops meaning anything.

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
| `blocks/TechniqueBlock.tsx` | DM craft advice, purple |
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
  with X", "see appendix A"), which is dropped, and DM craft advice, which now
  goes to `technique`.
- **Technique** is advice about how to *perform* the scene — pacing, what to
  emphasise, what to keep ambiguous, what not to bother tracking. The test: it
  tells you nothing about the world and asks nothing of the players. Source text
  usually signals it with second-person address to the DM ("you don't need to…",
  "rely on your sense of…", "cast as much doubt as you can").
- **Features** are standing mechanical rules that apply while the party is in
  the area, with no trigger and no roll to discover — A5's saving-throw bonus,
  B1's tide depths.
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

## 6. Status

All six phases are built and deployed, for both modules. Production runs this
branch's code, deployed directly with `wrangler` — see the handover note at the
end for how that relates to `main`.

| Phase | State |
|---|---|
| 0 — fixture | done — `ingest/fixtures/phase0-sections.json` |
| 1 — schema + worker | done — migration `0011`, applied to production D1 |
| 2 — layout | done — two-pane, blocks, prep/run mode, density chips |
| 3 — classify pass | done — DoSI's 130 sections classified and loaded |
| 4 — scene pass | done — DoSI 29 rooms, LMoP 75 rooms |
| 5 — polish | done — `SectionBody`, party level (migration `0012`) |
| 6 — LMoP migration | done — classification, scene pass, creatures |

### What is in production

```
dosi   156 total = 130 narrative + 20 creatures + 6 items
       82 read-alouds (53 book + 29 authored)   63 checks
       127 conditionals   44 technique   20 features
lmop   333 total = 287 narrative + 33 creatures + 13 items
       163 read-alouds (88 book + 75 authored)  114 checks
       282 conditionals   90 technique   54 features
       237 creature references across 142 sections
```

DoSI produced 18 party-level variants and LMoP 2, which is the per-module
convention hints (§8) working rather than a defect: LMoP has no level-scaling
sidebar and its hint says so.

### Outstanding

1. **LMoP's unique NPCs use the closest standard block.** Glasstaff, Nezznar the
   Black Spider and Hamun Kost deviate from the SRD blocks they were seeded with,
   and Sildar's `Veteran` entry never auto-links because the text names him
   rather than his stat block. This wants a review pass against the book.
2. **`bench.ts` measures against two sections.** It is a yardstick for
   catching drift, not a corpus. The remaining fixture disagreements (§10) are
   boundary judgements rather than errors, and tuning them away on a two-section
   sample would be over-fitting.
3. **Legacy `dmText.tsx` can now go.** It renders inline `<cond>` / `[[directive]]`
   markup for sections with no blocks. Both live modules are fully migrated, so
   nothing reaches that path any more — but the fallback in §8 should stay until
   someone confirms no future module needs it.

### Running the pipeline again

```bash
npm run dump   -- lmop [--scene-targets]  # rebuild a loadable file from D1
npm run scene  -- <file.json> [--resume]  # authored atmosphere for locations
npm run bench                             # classify just the fixture sections
npm run verify -- <file.json>             # score against the fixture
npm run creatures -- lmop ../lmop-creatures-seed.json <dump.json>
npm run load   -- <file.json>             # into D1 + Vectorize, batched
npm run remigrate -- <dump.json> lmop     # re-classify from stored text
```

`dump` is the entry point for everything after the first ingestion. `ingest/output/`
is not committed and LMoP's source markdown was never in the repo, so once a pass
is loaded the database holds the only copy of the classification. It reads the
block tables directly — no API, no reclassification — and because loading
**replaces every block table for a section**, it verifies the reconstruction
round-trips against the stored derived text before writing a file at all. A dump
that would lose content fails the run instead.

`dump`, `creatures` and `load` need no Anthropic access at all — `dump` uses
`CLOUDFLARE_API_TOKEN` via wrangler, the other two only `ADMIN_TOKEN`. Only
`scene`, `bench` and `remigrate` call the API. For those, either set
`ANTHROPIC_API_KEY`, or re-add the temporary worker-side `/admin/classify` proxy
(in git history) which uses the Worker's own secret — add it, run the pass,
remove it, rotate `ADMIN_TOKEN`.

`frontend/preview.html` renders the real Campaign components against the fixture
with no API, deploy or ingest run — `npm run dev`, then `/preview.html`.

### Authored sections that aren't in the book

`dosi-pregen-sections.json` is hand-written content in the loader's shape, and
loads like any other classified file:

```bash
npm run load -- ../dosi-pregen-sections.json
```

It holds the six sections covering the Starter Set's five pregenerated
characters — a backstory and a reason for being aboard the ship for each sheet,
which the book leaves to the table. The book's markdown is deliberately not
touched: authored prose added there would come back through a re-ingest tagged
`source='book'`, and the whole point of that flag is that it can be trusted. So
these live outside it, every read-aloud is `source='authored'`, and the
overview section says in its own text that it is not the book's.

Their ids (`0-hill-dwarf-cleric` and so on) are what `run.ts` would mint for
headings of those names in chapter 0, so a future re-ingest that does pick the
content up updates these rows rather than duplicating them. Their `order` values
sit in a reserved 300000 band, following the creature (100000) and item (200000)
convention, since the parsed chapter-0 orders 0–18 are contiguous and no
sequential slot exists to insert into. The outline groups by chapter name rather
than by contiguous runs, so they render at the end of "Running the Adventure".

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
background reads fine without them and the duplication is just noise. New
classifier output no longer emits inline markup at all.

> **Correction.** An earlier version of this finding said dropping the markup
> removes `dmText.tsx` outright. It can't — LMoP's 300 live sections still carry
> inline-marked `dm_only_text` and no blocks. `dmText.tsx` stays as the legacy
> rendering path until every module is migrated. See §8.

**Both fixture sections have zero prompts — and that exposed an eighth block.**
Neither section has anything the DM asks the players to do. B2's three pieces of
running advice (*"cast as much doubt as you can"*, *"you don't need to track
exactly where everyone is standing"*, *"the interesting part is identifying the
danger"*) were initially parked in background, but they're not background either
— they're DM craft. They became `technique[]`, rendered purple. Green now means
only "something you say to the players," which is what makes it trustworthy.

Expect `prompts[]` to be empty for most locations and concentrated in encounters
and NPC introductions; expect `technique[]` to cluster in combat-bearing rooms
and the front-matter DM guidance chapter.

## 8. Multiple modules

Two modules are live: `dosi` (156 sections) and `lmop` (333). Any future
adventure is a third. This section is about what the block model means for all
of them.

> The rest of §8 was written while LMoP was still unmigrated and is kept in the
> past tense it was written in — it explains *why* the migration took the shape
> it did. Both modules now carry blocks throughout; the legacy path below is
> live code but nothing currently reaches it.

### The schema is module-agnostic, permanently

Migration 0011 never mentions a module. Blocks key off `section_id`; scoping
comes from `sections.module_id`, which `loadBlocks` filters on. So every module —
LMoP today, anything added later — gets the block tables for free, and **no
per-module schema work is ever needed.** Per-campaign progress is likewise
already correct: `campaign_reveal_state` is keyed `(campaign_id, reveal_def_id)`,
so two campaigns running LMoP have independent reveal state, and the stable
ordinal key from Phase 1 protects it across re-ingests.

### But blocks only exist where a classification pass has run

LMoP's 300 sections have legacy `dm_only_text` carrying inline `<cond>` and
`[[directive]]` markup, and zero blocks. **A blocks-only Campaign page would
render an LMoP campaign as empty.**

So Phase 2 needs a legacy path, not just a block path:

```
section has blocks  → render the block layout
section has none    → render dm_only_text through renderDmText(), as today
```

This is a hard requirement, not a nicety — it's what lets DoSI migrate first
while LMoP keeps working untouched. It also means `dmText.tsx` survives until
every module is migrated.

### Migrating an existing module doesn't need its source file

**LMoP's source markdown is not in this repo** — it was ingested via `--source=`
pointing at an uncommitted file, and the remote-ingestion scaffolding was
deliberately removed afterwards (`d21152b`). Only DoSI's markdown is committed.

That rules out re-running the original pipeline for LMoP, but not the migration:
the content is already in D1. A **re-classify-from-stored-text pass** reads a
section's `read_aloud_text`, `dm_only_text` and existing `reveal_defs` rows,
splits them into blocks, and writes them back. No source file required.

This is the better long-term shape anyway — it makes block migration a property
of the database rather than of whoever still has the original markdown, and it
works identically for any module added in future.

### Per-module cost is independent

Each module migrates on its own schedule; there's no flag day. LMoP's 287
narrative sections are roughly 2.2× the DoSI pass, so a sensible order is DoSI
first (its source is here, it's the smaller run, and the fixture yardstick
covers it), then LMoP from stored text once the classifier output is trusted.

### The classifier prompt must not encode DoSI's conventions

This is the sharpest risk. The current prompt hardcodes DoSI's `>>` boxed-quote
delimiter, and the plan's `variant` definition leans on
`***2nd-Level Characters.***` — a DoSI-only sidebar that appears 8 times there
and, being a 1st–2nd-level adventure, has no equivalent in LMoP's 1st–5th-level
structure.

Categories must therefore be defined **semantically**, with source conventions
supplied as a per-module hint rather than baked into the system prompt. Expect
`variant` to be sparse or empty for LMoP; that's correct behaviour, not a
failure — blocks are optional and absent ones simply don't render.

### Party-level resolution is per-campaign

The prep strip resolving level variants needs the party's level. DoSI spans 1–2,
LMoP spans 1–5, so this belongs on the **campaign** record, not as a global
app setting.

## 9. Two defects the later passes uncovered

Both were silent, both were in the load path, and neither was visible from the
app — worth recording because the shape recurs.

**Every narrative section was embedded on its heading alone.** Block-model
sections deliberately send `read_aloud_text` and `dm_only_text` empty so the
worker owns how they are composed from blocks (§5). But `handleLoadSections`
computed `embeddingText()` from the *raw request payload* rather than from what
`upsertSection` had just derived and stored — so it saw two empty strings, and
every narrative section in both modules went into Vectorize as its heading and
nothing else. Search and chat had been retrieving on titles. Creature and item
sections were unaffected, since those branches send real text. Fixed by embedding
the derived text; the vectors themselves only recovered when both modules were
reloaded, because a fix here is inert until a section is loaded again.

**The classifier disagreed with itself.** `classify.ts` never set a temperature,
so extraction ran at the API default of 1.0. Five runs over the same two fixture
sections scored anywhere from 12/24 to 23/24, and one returned nothing at all for
a 3,400-character room. The handover's "technique is under-detected" was one
sample from that spread rather than a systematic bias, and three prompt edits
aimed at it changed the output by not one field once temperature was pinned. The
first pass is now greedy and the result is stable; retries sample at 0.6, because
a greedy retry returns the identical response and would have turned the existing
corruption guard into a loop that burns attempts and changes nothing.

The general lesson for this pipeline: **measure before tuning.** A single
observed run is not a defect, and a prompt is not the first thing to suspect.

## 10. Fixture disagreements that are not bugs

At temperature 0 the classifier stably scores 20/24 against the Phase 0 fixture.
The four disagreements are boundary judgements, deliberately left alone:

- **B2 technique 4 vs 3, triggers 2 vs 4.** Two of B2's triggers sit inside its
  *Running the Combat* paragraph — "when a character moves away from an active
  violet fungus, have another stir" reads as much like advice on keeping a fight
  moving as like a rule to watch for. The classifier calls them technique; the
  fixture calls them triggers. Its 4-way split of the advice is defensible on its
  own terms, and arguably finer than the fixture's 3.
- **A5 checks 2 vs 3.** It misses "asking any resident of Dragon's Rest", the
  no-roll social route.

These four are the entire gap, and closing them means tuning the prompt against
two hand-authored sections — which is how you get a classifier that scores well
on the fixture and worse on the other 415 sections.

## 11. Risks

- **Re-ingest overwrites everything.** Phase 3 replaces all classified content.
  Fixture-first exists to settle the target shape before that happens.
- **Classifier accuracy on the three-way conditional split** is the main
  unknown. The trigger/branch distinction is subtle in places. Mitigation:
  verify against the fixture and spot-check chapter by chapter rather than
  running all four at once.
- **Generated scene text is taste-dependent.** There's no in-app editing today,
  so the only correction loop is re-running the pass. If that proves annoying,
  a lightweight admin edit endpoint is the follow-up.
