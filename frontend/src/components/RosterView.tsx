import { useEffect, useState } from "react";
import { listCharacters } from "../api";
import type { CharacterSummary } from "../types";
import { useCampaignId } from "../CampaignContext";
import { CharacterSheetView } from "./CharacterSheetView";

export function RosterView() {
  const campaignId = useCampaignId();
  const [characters, setCharacters] = useState<CharacterSummary[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedId(null);
    listCharacters(campaignId).then(setCharacters);
  }, [campaignId]);

  if (selectedId) {
    return (
      <div>
        <button className="link-button" onClick={() => setSelectedId(null)}>
          ← Back to roster
        </button>
        <CharacterSheetView characterId={selectedId} />
      </div>
    );
  }

  if (!characters) return <div className="empty-state">Loading roster…</div>;
  if (characters.length === 0) return <div className="empty-state">No players have joined yet.</div>;

  return (
    <div className="roster-list">
      {characters.map((c) => (
        <button key={c.id} className="roster-row" onClick={() => setSelectedId(c.id)}>
          <span className="roster-name">{c.name}</span>
          <span className="section-card-meta">
            {c.race} {c.class} · Lvl {c.level} · HP {c.current_hp}/{c.max_hp}
          </span>
        </button>
      ))}
    </div>
  );
}
