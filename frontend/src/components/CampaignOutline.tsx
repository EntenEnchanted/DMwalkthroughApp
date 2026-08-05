import type { SectionDetail } from "../types";
import { sectionCounts } from "../sectionCounts";

export interface Chapter {
  chapter: string;
  sections: SectionDetail[];
}

/**
 * Density chips let the outline say how heavy a section is before you open it —
 * which room has three checks and a branch, and which is two lines of lore.
 * Hues match the blocks they stand for.
 */
function DensityChips({ section }: { section: SectionDetail }) {
  const c = sectionCounts(section);
  const chips: { tone: string; n: number; title: string }[] = [
    { tone: "read-aloud", n: c.readAlouds, title: "read-aloud passages" },
    { tone: "prompt", n: c.prompts, title: "things to ask the players" },
    { tone: "cond-trigger", n: c.triggers + c.branches + c.variants, title: "conditionals" },
    { tone: "check", n: c.checks, title: "skill checks" },
  ].filter((chip) => chip.n > 0);

  if (chips.length === 0) return null;
  return (
    <span className="density-chips">
      {chips.map((chip) => (
        <span key={chip.tone} className={`density-chip chip-${chip.tone}`} title={`${chip.n} ${chip.title}`}>
          {chip.n}
        </span>
      ))}
    </span>
  );
}

export function CampaignOutline({
  chapters,
  selectedId,
  closedChapters,
  onToggleChapter,
  onSelect,
}: {
  chapters: Chapter[];
  selectedId: string | null;
  closedChapters: Set<string>;
  onToggleChapter: (chapter: string) => void;
  onSelect: (id: string) => void;
}) {
  return (
    <nav className="campaign-outline">
      {chapters.map((c) => {
        const isOpen = !closedChapters.has(c.chapter);
        return (
          <div key={c.chapter} className="chapter-group">
            <button
              className={`chapter-header ${isOpen ? "active" : ""}`}
              onClick={() => onToggleChapter(c.chapter)}
              aria-expanded={isOpen}
            >
              <span>{c.chapter}</span>
              <span className="chapter-caret">{isOpen ? "−" : "+"}</span>
            </button>
            {isOpen && (
              <div className="chapter-outline">
                {c.sections.map((s) => {
                  // heading_path includes the chapter itself, so the chapter's own
                  // direct children sit at depth 0.
                  const depth = Math.max(0, s.heading_path.length - 1);
                  return (
                    <button
                      key={s.id}
                      className={`outline-row ${selectedId === s.id ? "selected" : ""}`}
                      style={{ paddingLeft: 12 + depth * 14 }}
                      onClick={() => onSelect(s.id)}
                      aria-current={selectedId === s.id ? "true" : undefined}
                    >
                      <span className="outline-heading">{s.heading}</span>
                      <DensityChips section={s} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
