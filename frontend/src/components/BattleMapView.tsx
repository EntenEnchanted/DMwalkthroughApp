import { useEffect, useRef, useState, type MouseEvent } from "react";
import { addToken, createMap, deleteToken, getActiveMap, toggleFogCell, updateToken } from "../api";
import type { ActiveMapState, MapToken } from "../types";
import { useAuth } from "../AuthContext";

const POLL_MS = 2500;

export function BattleMapView({ campaignId, myCharacterId }: { campaignId: string; myCharacterId?: string }) {
  const { user } = useAuth();
  const isDm = user?.role === "dm";
  const [state, setState] = useState<ActiveMapState | null>(null);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [fogMode, setFogMode] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    function poll() {
      getActiveMap(campaignId).then((next) => {
        if (!cancelled) setState(next);
      });
    }
    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [campaignId]);

  function canMove(token: MapToken): boolean {
    return isDm || token.character_id === myCharacterId;
  }

  async function handleContainerClick(e: MouseEvent<HTMLDivElement>) {
    if (!state?.map || !containerRef.current) return;
    const { map } = state;
    const rect = containerRef.current.getBoundingClientRect();
    const cellX = Math.floor(((e.clientX - rect.left) / rect.width) * (map.width_px / map.grid_size_px));
    const cellY = Math.floor(((e.clientY - rect.top) / rect.height) * (map.height_px / map.grid_size_px));

    if (isDm && fogMode) {
      const cell = `${cellX},${cellY}`;
      const revealed = !state.revealed_cells.includes(cell);
      const revealedCells = await toggleFogCell(map.id, cell, revealed);
      setState((prev) => (prev ? { ...prev, revealed_cells: revealedCells } : prev));
      return;
    }

    if (selectedTokenId) {
      const token = state.tokens.find((t) => t.id === selectedTokenId);
      if (token && canMove(token)) {
        setState((prev) =>
          prev
            ? { ...prev, tokens: prev.tokens.map((t) => (t.id === token.id ? { ...t, x: cellX, y: cellY } : t)) }
            : prev
        );
        await updateToken(token.id, { x: cellX, y: cellY });
      }
      setSelectedTokenId(null);
    }
  }

  function handleTokenClick(e: MouseEvent, token: MapToken) {
    e.stopPropagation();
    if (fogMode) return;
    if (!canMove(token)) return;
    setSelectedTokenId((prev) => (prev === token.id ? null : token.id));
  }

  async function handleDeleteSelected() {
    if (!selectedTokenId) return;
    setState((prev) => (prev ? { ...prev, tokens: prev.tokens.filter((t) => t.id !== selectedTokenId) } : prev));
    await deleteToken(selectedTokenId);
    setSelectedTokenId(null);
  }

  if (!state) return <div className="empty-state">Loading map…</div>;

  if (!state.map) {
    return isDm ? (
      <CreateMapForm
        campaignId={campaignId}
        onCreated={() => getActiveMap(campaignId).then(setState)}
      />
    ) : (
      <div className="empty-state">The DM hasn't started a battle map yet.</div>
    );
  }

  const { map } = state;
  const cols = Math.max(1, Math.round(map.width_px / map.grid_size_px));
  const rows = Math.max(1, Math.round(map.height_px / map.grid_size_px));

  return (
    <div>
      {isDm && (
        <div className="map-toolbar">
          <button className={fogMode ? "active" : ""} onClick={() => setFogMode((v) => !v)}>
            {fogMode ? "Painting fog…" : "Paint fog"}
          </button>
          {selectedTokenId && (
            <button className="link-button" onClick={handleDeleteSelected}>
              Remove selected token
            </button>
          )}
          <AddTokenForm campaignId={campaignId} mapId={map.id} onAdded={(token) => setState((prev) => (prev ? { ...prev, tokens: [...prev.tokens, token] } : prev))} />
        </div>
      )}

      <div
        className="map-canvas"
        ref={containerRef}
        style={{ aspectRatio: `${map.width_px} / ${map.height_px}` }}
        onClick={handleContainerClick}
      >
        <img src={map.image_url} alt={map.name} className="map-image" />
        <div
          className="map-grid-lines"
          style={{ backgroundSize: `${100 / cols}% ${100 / rows}%` }}
        />
        {state.tokens.map((token) => (
          <div
            key={token.id}
            className={`map-token ${selectedTokenId === token.id ? "selected" : ""} ${canMove(token) ? "" : "locked"}`}
            style={{
              left: `${(token.x / cols) * 100}%`,
              top: `${(token.y / rows) * 100}%`,
              width: `${(token.size / cols) * 100}%`,
              height: `${(token.size / rows) * 100}%`,
              background: token.color,
              // A player's own token always shows through fog (they know
              // where they're standing); other tokens hide under it like
              // the map art does. DM always sees everything.
              zIndex: isDm ? 3 : token.character_id === myCharacterId ? 5 : 2,
            }}
            onClick={(e) => handleTokenClick(e, token)}
            title={token.label}
          >
            <span className="map-token-label">{token.label}</span>
          </div>
        ))}
        {Array.from({ length: cols * rows }).map((_, i) => {
          const cx = i % cols;
          const cy = Math.floor(i / cols);
          const revealed = state.revealed_cells.includes(`${cx},${cy}`);
          if (revealed) return null;
          return (
            <div
              key={`fog-${cx}-${cy}`}
              className={isDm ? "map-fog map-fog-dm" : "map-fog"}
              style={{
                left: `${(cx / cols) * 100}%`,
                top: `${(cy / rows) * 100}%`,
                width: `${(1 / cols) * 100}%`,
                height: `${(1 / rows) * 100}%`,
                zIndex: isDm ? 1 : 4,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function CreateMapForm({ campaignId, onCreated }: { campaignId: string; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [widthPx, setWidthPx] = useState(1000);
  const [heightPx, setHeightPx] = useState(700);
  const [gridSizePx, setGridSizePx] = useState(50);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!name.trim() || !imageUrl.trim()) return;
    setSubmitting(true);
    try {
      await createMap(campaignId, { name: name.trim(), image_url: imageUrl.trim(), grid_size_px: gridSizePx, width_px: widthPx, height_px: heightPx });
      onCreated();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="new-campaign-form">
      <h2>Start a battle map</h2>
      <input placeholder="Map name" value={name} onChange={(e) => setName(e.target.value)} />
      <input placeholder="Image URL" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
      <div className="sheet-row">
        <label className="sheet-field">
          <span>Width (px)</span>
          <input type="number" value={widthPx} onChange={(e) => setWidthPx(Number(e.target.value))} />
        </label>
        <label className="sheet-field">
          <span>Height (px)</span>
          <input type="number" value={heightPx} onChange={(e) => setHeightPx(Number(e.target.value))} />
        </label>
        <label className="sheet-field">
          <span>Grid size (px)</span>
          <input type="number" value={gridSizePx} onChange={(e) => setGridSizePx(Number(e.target.value))} />
        </label>
      </div>
      <button disabled={submitting} onClick={handleSubmit}>
        {submitting ? "Creating…" : "Create map"}
      </button>
    </div>
  );
}

function AddTokenForm({
  campaignId,
  mapId,
  onAdded,
}: {
  campaignId: string;
  mapId: string;
  onAdded: (token: MapToken) => void;
}) {
  const [label, setLabel] = useState("");
  const [color, setColor] = useState("#3b82f6");

  async function handleAdd() {
    if (!label.trim()) return;
    const { id } = await addToken(campaignId, { map_id: mapId, label: label.trim(), color, x: 0, y: 0 });
    onAdded({ id, map_id: mapId, creature_section_id: null, label: label.trim(), x: 0, y: 0, size: 1, image_url: null, color, current_hp: null, max_hp: null });
    setLabel("");
  }

  return (
    <>
      <input
        className="item-name"
        placeholder="New token label…"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleAdd()}
      />
      <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
      <button className="link-button" onClick={handleAdd}>
        Add token
      </button>
    </>
  );
}
