import { useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { listMyCharacters } from "../api";
import type { MyCharacterSummary } from "../types";
import { CharacterSheetView } from "./CharacterSheetView";

export function PlayerHomeView() {
  const { logout } = useAuth();
  const [characters, setCharacters] = useState<MyCharacterSummary[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    listMyCharacters().then((chars) => {
      setCharacters(chars);
      if (chars.length === 1) setSelectedId(chars[0].id);
    });
  }, []);

  if (!characters) return <div className="empty-state">Loading…</div>;

  if (characters.length === 0) {
    return (
      <div className="picker-screen">
        <div className="picker-header">
          <h1>No characters yet</h1>
          <button className="link-button" onClick={() => logout()}>
            Log out
          </button>
        </div>
        <div className="empty-state">Ask your DM for an invite code to join a campaign.</div>
      </div>
    );
  }

  const selected = characters.find((c) => c.id === selectedId);

  return (
    <div className="picker-screen">
      <div className="picker-header">
        <h1>{selected ? selected.name : "Your Characters"}</h1>
        <div>
          {characters.length > 1 && selected && (
            <button className="link-button" onClick={() => setSelectedId(null)}>
              Switch character
            </button>
          )}
          <button className="link-button" onClick={() => logout()}>
            Log out
          </button>
        </div>
      </div>

      {!selected && (
        <div className="campaign-list">
          {characters.map((c) => (
            <button key={c.id} className="campaign-card-main campaign-card" onClick={() => setSelectedId(c.id)}>
              <span className="campaign-card-name">{c.name}</span>
              <span className="section-card-meta">{c.campaign_name}</span>
            </button>
          ))}
        </div>
      )}

      {selected && <CharacterSheetView characterId={selected.id} />}
    </div>
  );
}
