import { useState } from "react";
import type { SectionDetail } from "../types";
import { toggleReveal } from "../api";
import { usePopup } from "../PopupContext";
import { SectionBody } from "./SectionBody";
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

      <SectionBody section={section} reveals={reveals} runMode={false} onToggle={handleToggle} />

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
