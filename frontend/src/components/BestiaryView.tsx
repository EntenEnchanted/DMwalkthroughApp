import { useEffect, useState } from "react";
import { getCreatures } from "../api";
import type { CreatureSummary } from "../types";
import { usePopup } from "../PopupContext";
import { useCampaignId } from "../CampaignContext";

export function BestiaryView() {
  const campaignId = useCampaignId();
  const [creatures, setCreatures] = useState<CreatureSummary[] | null>(null);
  const { openSection } = usePopup();

  useEffect(() => {
    getCreatures(campaignId).then(setCreatures);
  }, [campaignId]);

  if (!creatures) return <div className="empty-state">Loading bestiary…</div>;
  if (creatures.length === 0) return <div className="empty-state">No creatures yet.</div>;

  return (
    <div className="roster-list">
      {creatures.map((c) => (
        <button key={c.id} className="roster-row" onClick={() => openSection(c.id)}>
          <span className="roster-name">{c.heading}</span>
          <span className="section-card-meta">{c.chapter}</span>
        </button>
      ))}
    </div>
  );
}
