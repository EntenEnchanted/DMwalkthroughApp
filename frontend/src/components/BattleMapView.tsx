import { useEffect, useRef, useState, type ChangeEvent, type MouseEvent } from "react";
import {
  addToken,
  createMap,
  deleteToken,
  getActiveMap,
  listMaps,
  setActiveMap,
  toggleFogCell,
  updateToken,
  uploadMapImage,
} from "../api";
import type { ActiveMapState, MapSummary, MapToken } from "../types";
import { useAuth } from "../AuthContext";

const POLL_MS = 2500;

export function BattleMapView({ campaignId, myCharacterId }: { campaignId: string; myCharacterId?: string }) {
  const { user } = useAuth();
  const isDm = user?.role === "dm";
  const [state, setState] = useState<ActiveMapState | null>(null);
  const [mapList, setMapList] = useState<MapSummary[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [fogMode, setFogMode] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  function refreshMapList() {
    if (isDm) listMaps(campaignId).then(setMapList);
  }

  useEffect(() => {
    let cancelled = false;
    function poll() {
      getActiveMap(campaignId).then((next) => {
        if (!cancelled) setState(next);
      });
    }
    poll();
    refreshMapList();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, isDm]);

  async function handleSwitchMap(mapId: string) {
    setShowCreateForm(false);
    await setActiveMap(campaignId, mapId);
    getActiveMap(campaignId).then(setState);
  }

  function handleMapCreated() {
    setShowCreateForm(false);
    refreshMapList();
    getActiveMap(campaignId).then(setState);
  }

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

  if (isDm && (showCreateForm || !state.map)) {
    return (
      <div>
        {mapList.length > 0 && (
          <div className="map-toolbar">
            <MapSwitcher maps={mapList} activeId={state.map?.id ?? null} onSwitch={handleSwitchMap} />
            {state.map && (
              <button className="link-button" onClick={() => setShowCreateForm(false)}>
                Cancel
              </button>
            )}
          </div>
        )}
        <CreateMapForm campaignId={campaignId} onCreated={handleMapCreated} />
      </div>
    );
  }

  if (!state.map) {
    return <div className="empty-state">The DM hasn't started a battle map yet.</div>;
  }

  const { map } = state;
  const cols = Math.max(1, Math.round(map.width_px / map.grid_size_px));
  const rows = Math.max(1, Math.round(map.height_px / map.grid_size_px));

  return (
    <div>
      {isDm && (
        <div className="map-toolbar">
          <MapSwitcher maps={mapList} activeId={map.id} onSwitch={handleSwitchMap} />
          <button className="link-button" onClick={() => setShowCreateForm(true)}>
            + New map
          </button>
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

function MapSwitcher({
  maps,
  activeId,
  onSwitch,
}: {
  maps: MapSummary[];
  activeId: string | null;
  onSwitch: (mapId: string) => void;
}) {
  if (maps.length === 0) return null;
  return (
    <select
      className="map-switcher"
      value={activeId ?? ""}
      onChange={(e) => e.target.value && onSwitch(e.target.value)}
    >
      {!activeId && <option value="">Select a map…</option>}
      {maps.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
    </select>
  );
}

function CreateMapForm({ campaignId, onCreated }: { campaignId: string; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [widthPx, setWidthPx] = useState(1000);
  const [heightPx, setHeightPx] = useState(700);
  const [gridSizePx, setGridSizePx] = useState(50);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    if (!picked) return;
    setError(null);
    setFile(picked);

    const objectUrl = URL.createObjectURL(picked);
    setPreviewUrl(objectUrl);
    const img = new Image();
    img.onload = () => {
      setWidthPx(img.naturalWidth);
      setHeightPx(img.naturalHeight);
      URL.revokeObjectURL(objectUrl);
    };
    img.src = objectUrl;

    if (!name.trim()) setName(picked.name.replace(/\.[^.]+$/, ""));
  }

  async function handleSubmit() {
    if (!name.trim() || !file) return;
    setSubmitting(true);
    setError(null);
    try {
      const imageUrl = await uploadMapImage(campaignId, file);
      await createMap(campaignId, {
        name: name.trim(),
        image_url: imageUrl,
        grid_size_px: gridSizePx,
        width_px: widthPx,
        height_px: heightPx,
      });
      onCreated();
    } catch {
      setError("Upload failed. Make sure it's a PNG, JPEG, WebP, or GIF.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="new-campaign-form">
      <h2>Start a battle map</h2>
      <input placeholder="Map name" value={name} onChange={(e) => setName(e.target.value)} />
      <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleFileChange} />
      {previewUrl && <img src={previewUrl} alt="Map preview" className="map-upload-preview" />}
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
      {error && <div className="auth-error">{error}</div>}
      <button disabled={submitting || !file} onClick={handleSubmit}>
        {submitting ? "Uploading…" : "Create map"}
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
