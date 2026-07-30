import { useState } from "react";
import type { SectionDetail } from "../types";
import { toggleReveal } from "../api";
import { usePopup } from "../PopupContext";
import { renderDmText } from "../dmText";
import { useCampaignId } from "../CampaignContext";

export function SectionCard({ section }: { section: SectionDetail }) {
  const campaignId = useCampaignId();
  const [reveals, setReveals] = useState(section.reveals);
  const { openSection } = usePopup();

  async function handleToggle(revealId: number, next: boolean) {
    setReveals((prev) => prev.map((r) => (r.id === revealId ? { ...r, revealed: next } : r)));
    await toggleReveal(campaignId, revealId, next);
  }

  return (
    <div className="section-card">
      <div className="section-card-header">
        <span className="section-card-title">
          <span className="type-badge">{section.type}</span>
          {section.heading}
        </span>
        <span className="section-card-meta">{section.chapter}</span>
      </div>

      {section.read_aloud_text && (
        <div className="tier-block read-aloud">
          <span className="tier-label">Read aloud</span>
          {section.read_aloud_text}
        </div>
      )}

      {section.dm_only_text && (
        <div className="tier-block dm-only">
          <span className="tier-label">DM only</span>
          {renderDmText(section.dm_only_text)}
        </div>
      )}

      {reveals.map((r) => (
        <div key={r.id} className={`reveal ${r.revealed ? "revealed" : "locked"}`}>
          <div className="reveal-text">
            <span className="reveal-trigger">
              DC {r.trigger_dc} {r.trigger_skill}
            </span>
            {r.revealed ? r.text : "Locked until the check succeeds."}
          </div>
          <button className="reveal-toggle" onClick={() => handleToggle(r.id, !r.revealed)}>
            {r.revealed ? "Revealed" : "Reveal"}
          </button>
        </div>
      ))}

      {section.references.length > 0 && (
        <div className="ref-chip-row">
          {section.references.map((ref) => (
            <button key={ref.id} className="ref-chip" onClick={() => openSection(ref.id)}>
              {ref.heading}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
