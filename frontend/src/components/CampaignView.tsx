import { useEffect, useState } from "react";
import { getCampaignOutline, listCampaigns, setPartyLevel } from "../api";
import type { SectionDetail } from "../types";
import { useCampaignId } from "../CampaignContext";
import { CampaignOutline, type Chapter } from "./CampaignOutline";
import { SectionDetailView } from "./SectionDetailView";

type Mode = "prep" | "run";

function groupByChapter(sections: SectionDetail[]): Chapter[] {
  const chapters: Chapter[] = [];
  for (const s of sections) {
    let group = chapters.find((c) => c.chapter === s.chapter);
    if (!group) {
      group = { chapter: s.chapter, sections: [] };
      chapters.push(group);
    }
    group.sections.push(s);
  }
  return chapters;
}

/**
 * Master/detail: the outline stays put while one section fills the right pane.
 * Below 900px the two panes become a drill-down — outline until you pick a
 * section, then the section with a back button — so the same markup works
 * one-handed at the table and on a laptop. The swap is pure CSS; `has-selection`
 * is the only signal it needs.
 */
export function CampaignView() {
  const campaignId = useCampaignId();
  const [chapters, setChapters] = useState<Chapter[] | null>(null);
  const [closedChapters, setClosedChapters] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(() => (localStorage.getItem("campaignMode") as Mode) || "prep");
  // Party level lives on the campaign, not in local storage: two campaigns on the
  // same module can sit at different levels, and DoSI spans 1-2 where LMoP spans 1-5.
  const [partyLevel, setLevel] = useState<number | null>(null);

  useEffect(() => {
    getCampaignOutline(campaignId).then((sections) => setChapters(groupByChapter(sections)));
  }, [campaignId]);

  useEffect(() => {
    localStorage.setItem("campaignMode", mode);
  }, [mode]);

  useEffect(() => {
    listCampaigns().then((cs) => setLevel(cs.find((c) => c.id === campaignId)?.party_level ?? null));
  }, [campaignId]);

  function changeLevel(next: number | null) {
    setLevel(next);
    void setPartyLevel(campaignId, next);
  }

  function toggleChapter(chapter: string) {
    setClosedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(chapter)) next.delete(chapter);
      else next.add(chapter);
      return next;
    });
  }

  if (!chapters) return <div className="empty-state">Loading campaign…</div>;

  const selected = selectedId
    ? chapters.flatMap((c) => c.sections).find((s) => s.id === selectedId) ?? null
    : null;

  return (
    <div className={`campaign-layout ${selected ? "has-selection" : ""}`} data-mode={mode}>
      <aside className="outline-pane">
        <div className="mode-switch" role="group" aria-label="Reading mode">
          <button className={mode === "prep" ? "active" : ""} onClick={() => setMode("prep")}>
            Prep
          </button>
          <button className={mode === "run" ? "active" : ""} onClick={() => setMode("run")}>
            Run
          </button>
        </div>
        <label className="party-level">
          Party level
          <select
            value={partyLevel ?? ""}
            onChange={(e) => changeLevel(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Not set</option>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <CampaignOutline
          chapters={chapters}
          selectedId={selectedId}
          closedChapters={closedChapters}
          onToggleChapter={toggleChapter}
          onSelect={setSelectedId}
        />
      </aside>

      <main className="detail-pane">
        <button className="detail-back link-button" onClick={() => setSelectedId(null)}>
          ← Outline
        </button>
        {selected ? (
          <SectionDetailView
            key={selected.id}
            section={selected}
            runMode={mode === "run"}
            partyLevel={partyLevel}
          />
        ) : (
          <div className="empty-state">Pick a section from the outline.</div>
        )}
      </main>
    </div>
  );
}
