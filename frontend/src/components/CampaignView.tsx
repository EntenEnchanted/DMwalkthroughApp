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
  const [openChapter, setOpenChapter] = useState<string | null>(null);
  const [openSectionId, setOpenSectionId] = useState<string | null>(null);

  useEffect(() => {
    getCampaign().then((sections) => setChapters(groupByChapter(sections)));
  }, []);

  if (!chapters) return <div className="empty-state">Loading campaign…</div>;

  return (
    <div>
      {chapters.map((c) => {
        const isOpen = openChapter === c.chapter;
        return (
          <div key={c.chapter} className="chapter-group">
            <button
              className={`chapter-header ${isOpen ? "active" : ""}`}
              onClick={() => setOpenChapter(isOpen ? null : c.chapter)}
            >
              <span>{c.chapter}</span>
              <span className="chapter-caret">{isOpen ? "−" : "+"}</span>
            </button>
            {isOpen && (
              <div className="chapter-outline">
                {c.sections.map((s) => {
                  const depth = s.heading_path.length;
                  const sectionOpen = openSectionId === s.id;
                  return (
                    <div key={s.id}>
                      <button
                        className={`outline-row ${sectionOpen ? "active" : ""}`}
                        style={{ paddingLeft: 12 + depth * 16 }}
                        onClick={() => setOpenSectionId(sectionOpen ? null : s.id)}
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
