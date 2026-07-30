import { useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { listMyCharacters } from "../api";
import type { MyCharacterSummary } from "../types";
import { CharacterSheetView } from "./CharacterSheetView";
import { HandbookView } from "./HandbookView";
import { BattleMapView } from "./BattleMapView";

type View = "sheet" | "handbook" | "map";

export function PlayerHomeView() {
  const { logout } = useAuth();
  const [view, setView] = useState<View>("sheet");
  const [characters, setCharacters] = useState<MyCharacterSummary[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    listMyCharacters().then((chars) => {
      setCharacters(chars);
      if (chars.length === 1) setSelectedId(chars[0].id);
    });
  }, []);

  if (!characters) return <div className="empty-state">Loading…</div>;

  const selected = characters.find((c) => c.id === selectedId);
  const titles: Record<View, string> = {
    sheet: selected ? selected.name : "Your Characters",
    handbook: "Handbook",
    map: "Battle Map",
  };

  return (
    <div className="picker-screen">
      <div className="picker-header">
        <h1>{titles[view]}</h1>
        <div>
          <button className={view === "sheet" ? "link-button active" : "link-button"} onClick={() => setView("sheet")}>
            My Character
          </button>
          {selected && (
            <button className={view === "map" ? "link-button active" : "link-button"} onClick={() => setView("map")}>
              Battle Map
            </button>
          )}
          <button
            className={view === "handbook" ? "link-button active" : "link-button"}
            onClick={() => setView("handbook")}
          >
            Handbook
          </button>
          {view === "sheet" && characters.length > 1 && selected && (
            <button className="link-button" onClick={() => setSelectedId(null)}>
              Switch character
            </button>
          )}
          <button className="link-button" onClick={() => logout()}>
            Log out
          </button>
        </div>
      </div>

      {view === "handbook" && <HandbookView />}

      {view === "map" && selected && <BattleMapView campaignId={selected.campaign_id} myCharacterId={selected.id} />}

      {view === "sheet" && characters.length === 0 && (
        <div className="empty-state">Ask your DM for an invite code to join a campaign.</div>
      )}

      {view === "sheet" && !selected && characters.length > 0 && (
        <div className="campaign-list">
          {characters.map((c) => (
            <button key={c.id} className="campaign-card-main campaign-card" onClick={() => setSelectedId(c.id)}>
              <span className="campaign-card-name">{c.name}</span>
              <span className="section-card-meta">{c.campaign_name}</span>
            </button>
          ))}
        </div>
      )}

      {view === "sheet" && selected && <CharacterSheetView characterId={selected.id} />}
    </div>
  );
}
