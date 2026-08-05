/**
 * Design harness for the Campaign page. Renders the real components against the
 * Phase 0 fixture so the layout can be iterated on without a live API, a
 * deploy, or an ingest run. Not part of the app bundle — served at
 * /preview.html by the dev server.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CampaignProvider } from "./CampaignContext";
import { PopupProvider } from "./PopupContext";
import { CampaignOutline } from "./components/CampaignOutline";
import { SectionDetailView } from "./components/SectionDetailView";
import type { SectionDetail } from "./types";
import fixture from "../../ingest/fixtures/phase0-sections.json";
import "./index.css";

interface FixtureSection {
  id: string;
  chapter: string;
  heading: string;
  heading_path: string[];
  type: string;
  read_alouds: { ordinal: number; source: string; cue: string; text: string }[];
  background_text: string;
  prompts: { ordinal: number; text: string }[];
  technique: { ordinal: number; name: string; text: string }[];
  conditionals: { ordinal: number; kind: string; condition: string; effect: string }[];
  checks: {
    ordinal: number; context: string; skills: string[]; dc: number | null;
    passive: boolean; kind: string; cost: string; success_text: string; fail_text: string;
  }[];
  features: { ordinal: number; name: string; text: string }[];
  references: string[];
}

let nextRevealId = 1;

/** Maps a fixture record onto the API's SectionDetail shape. */
function toSection(f: FixtureSection): SectionDetail {
  return {
    id: f.id,
    chapter: f.chapter,
    heading: f.heading,
    heading_path: f.heading_path,
    type: f.type as SectionDetail["type"],
    read_aloud_text: f.read_alouds.map((r) => r.text).join("\n\n"),
    dm_only_text: f.background_text,
    background_text: f.background_text,
    read_alouds: f.read_alouds as SectionDetail["read_alouds"],
    prompts: f.prompts,
    technique: f.technique,
    conditionals: f.conditionals as SectionDetail["conditionals"],
    features: f.features,
    reveals: f.checks.map((c) => ({
      id: nextRevealId++,
      trigger_skill: c.skills[0] ?? "",
      trigger_dc: c.dc ?? 0,
      text: c.success_text,
      revealed: false,
      ordinal: c.ordinal,
      context: c.context,
      skills: c.skills,
      dc: c.dc,
      passive: c.passive,
      kind: c.kind as SectionDetail["reveals"][number]["kind"],
      cost: c.cost,
      fail_text: c.fail_text,
    })),
    stat_block: null,
    references: f.references.map((id) => ({
      id,
      heading: id.replace(/^creature-/, "").replace(/-/g, " "),
      type: "creature" as const,
    })),
  };
}

/**
 * Stands in for a module that hasn't been through the block classifier — the
 * state all 300 LMoP sections are in today. Proves the legacy fallback renders.
 */
const legacySection: SectionDetail = {
  id: "lmop-legacy-example",
  chapter: "Chapter 1: Goblin Arrows",
  heading: "Cragmaw Hideout (un-migrated example)",
  heading_path: ["Chapter 1: Goblin Arrows", "Cragmaw Hideout"],
  type: "location",
  read_aloud_text:
    "The cave mouth is a dark, jagged opening in the hillside. A shallow stream flows out of it, and the ground around is churned with the tracks of many small feet.",
  dm_only_text:
    "Two goblins stand guard behind a thicket of briars. <cond>If the characters freed Sildar earlier, he warns them about the sentries before they get close.</cond> The goblins are watching the trail. [[directive]]Ask the players how they want to approach the cave mouth.[[/directive]]",
  background_text: "",
  read_alouds: [],
  prompts: [],
  technique: [],
  conditionals: [],
  features: [],
  reveals: [
    {
      id: 900, trigger_skill: "Wisdom (Perception)", trigger_dc: 15,
      text: "Spots the goblin sentries hiding in the briars before they attack.",
      revealed: false, ordinal: 0, context: "Watching the thicket",
      skills: ["Wisdom (Perception)"], dc: 15, passive: false, kind: "info",
      cost: "", fail_text: "",
    },
  ],
  stat_block: null,
  references: [],
};

const sections = [...(fixture as FixtureSection[]).map(toSection), legacySection];
const chapters = [...new Set(sections.map((s) => s.chapter))].map((chapter) => ({
  chapter,
  sections: sections.filter((s) => s.chapter === chapter),
}));

function Preview({ runMode, selectedIndex }: { runMode: boolean; selectedIndex: number }) {
  const selected = sections[selectedIndex];
  return (
    <div className="app">
      <div className="app-content">
        <div className="campaign-layout has-selection" data-mode={runMode ? "run" : "prep"}>
          <aside className="outline-pane">
            <div className="mode-switch">
              <button className={runMode ? "" : "active"}>Prep</button>
              <button className={runMode ? "active" : ""}>Run</button>
            </div>
            <CampaignOutline
              chapters={chapters}
              selectedId={selected.id}
              closedChapters={new Set()}
              onToggleChapter={() => {}}
              onSelect={() => {}}
            />
          </aside>
          <main className="detail-pane">
            <SectionDetailView section={selected} runMode={runMode} />
          </main>
        </div>
      </div>
    </div>
  );
}

const params = new URLSearchParams(location.search);
document.documentElement.setAttribute("data-theme", params.get("theme") ?? "dark");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PopupProvider>
      <CampaignProvider campaignId="preview">
        <Preview
          runMode={params.get("mode") === "run"}
          selectedIndex={Number(params.get("section") ?? 0)}
        />
      </CampaignProvider>
    </PopupProvider>
  </StrictMode>
);
