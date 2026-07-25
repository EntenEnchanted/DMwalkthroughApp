import { useEffect, useState } from "react";
import { getCampaign } from "../api";
import type { SectionDetail } from "../types";
import { SectionCard } from "./SectionCard";

interface Chapter {
  chapter: string;
  sections: SectionDetail[];
}

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

export function CampaignView() {
  const [chapters, setChapters] = useState<Chapter[] | null>(null);
  const [closedChapters, setClosedChapters] = useState<Set<string>>(new Set());
  const [closedSections, setClosedSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    getCampaign().then((sections) => setChapters(groupByChapter(sections)));
  }, []);

  function toggleChapter(chapter: string) {
    setClosedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(chapter)) next.delete(chapter);
      else next.add(chapter);
      return next;
    });
  }

  function toggleSection(id: string) {
    setClosedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (!chapters) return <div className="empty-state">Loading campaign…</div>;

  return (
    <div>
      {chapters.map((c) => {
        const isOpen = !closedChapters.has(c.chapter);
        return (
          <div key={c.chapter} className="chapter-group">
            <button
              className={`chapter-header ${isOpen ? "active" : ""}`}
              onClick={() => toggleChapter(c.chapter)}
            >
              <span>{c.chapter}</span>
              <span className="chapter-caret">{isOpen ? "−" : "+"}</span>
            </button>
            {isOpen && (
              <div className="chapter-outline">
                {c.sections.map((s) => {
                  const depth = s.heading_path.length;
                  const sectionOpen = !closedSections.has(s.id);
                  return (
                    <div key={s.id}>
                      <button
                        className={`outline-row ${sectionOpen ? "active" : ""}`}
                        style={{ paddingLeft: 12 + depth * 16 }}
                        onClick={() => toggleSection(s.id)}
                      >
                        <span className="type-badge">{s.type}</span>
                        {s.heading}
                      </button>
                      {sectionOpen && <SectionCard section={s} />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
