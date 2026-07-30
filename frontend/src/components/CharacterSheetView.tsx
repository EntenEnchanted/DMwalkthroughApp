import { useEffect, useState } from "react";
import {
  addCharacterItem,
  deleteCharacterItem,
  getCharacter,
  updateCharacter,
  updateCharacterItem,
} from "../api";
import type { AbilityScores, Character, Currency } from "../types";

const ABILITIES: (keyof AbilityScores)[] = ["str", "dex", "con", "int", "wis", "cha"];
const COINS: (keyof Currency)[] = ["cp", "sp", "ep", "gp", "pp"];

export function CharacterSheetView({ characterId }: { characterId: string }) {
  const [character, setCharacter] = useState<Character | null>(null);

  useEffect(() => {
    setCharacter(null);
    getCharacter(characterId).then(setCharacter);
  }, [characterId]);

  if (!character) return <div className="empty-state">Loading character…</div>;
  const c = character;

  function setLocal(patch: Partial<Character>) {
    setCharacter((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  function commit(patch: Partial<Character>) {
    updateCharacter(characterId, patch);
  }

  function textField(label: string, key: "name" | "class" | "race" | "background") {
    return (
      <label className="sheet-field">
        <span>{label}</span>
        <input
          value={c[key]}
          onChange={(e) => setLocal({ [key]: e.target.value } as Partial<Character>)}
          onBlur={(e) => commit({ [key]: e.target.value } as Partial<Character>)}
        />
      </label>
    );
  }

  function numberField(label: string, key: "level" | "xp" | "current_hp" | "max_hp" | "ac" | "speed") {
    return (
      <label className="sheet-field">
        <span>{label}</span>
        <input
          type="number"
          value={c[key]}
          onChange={(e) => setLocal({ [key]: Number(e.target.value) } as Partial<Character>)}
          onBlur={(e) => commit({ [key]: Number(e.target.value) } as Partial<Character>)}
        />
      </label>
    );
  }

  return (
    <div className="sheet">
      <div className="sheet-row">
        {textField("Name", "name")}
        {textField("Class", "class")}
        {numberField("Level", "level")}
      </div>
      <div className="sheet-row">
        {textField("Race", "race")}
        {textField("Background", "background")}
        {numberField("XP", "xp")}
      </div>
      <div className="sheet-row">
        {numberField("Current HP", "current_hp")}
        {numberField("Max HP", "max_hp")}
        {numberField("AC", "ac")}
        {numberField("Speed", "speed")}
      </div>

      <h3 className="sheet-heading">Ability Scores</h3>
      <div className="sheet-row">
        {ABILITIES.map((a) => (
          <label className="sheet-field ability-field" key={a}>
            <span>{a.toUpperCase()}</span>
            <input
              type="number"
              value={character.ability_scores[a]}
              onChange={(e) => setLocal({ ability_scores: { ...character.ability_scores, [a]: Number(e.target.value) } })}
              onBlur={(e) => commit({ ability_scores: { ...character.ability_scores, [a]: Number(e.target.value) } })}
            />
          </label>
        ))}
      </div>

      <h3 className="sheet-heading">Currency</h3>
      <div className="sheet-row">
        {COINS.map((c) => (
          <label className="sheet-field ability-field" key={c}>
            <span>{c.toUpperCase()}</span>
            <input
              type="number"
              value={character.currency[c]}
              onChange={(e) => setLocal({ currency: { ...character.currency, [c]: Number(e.target.value) } })}
              onBlur={(e) => commit({ currency: { ...character.currency, [c]: Number(e.target.value) } })}
            />
          </label>
        ))}
      </div>

      <h3 className="sheet-heading">Features & Traits</h3>
      <textarea
        className="sheet-textarea"
        rows={4}
        value={character.features.join("\n")}
        onChange={(e) => setLocal({ features: e.target.value.split("\n") })}
        onBlur={(e) => commit({ features: e.target.value.split("\n") })}
        placeholder="One feature per line…"
      />

      <h3 className="sheet-heading">Notes</h3>
      <textarea
        className="sheet-textarea"
        rows={4}
        value={character.notes}
        onChange={(e) => setLocal({ notes: e.target.value })}
        onBlur={(e) => commit({ notes: e.target.value })}
      />

      <h3 className="sheet-heading">Inventory</h3>
      <InventoryTable characterId={characterId} character={character} setCharacter={setCharacter} />
    </div>
  );
}

function InventoryTable({
  characterId,
  character,
  setCharacter,
}: {
  characterId: string;
  character: Character;
  setCharacter: (updater: (prev: Character | null) => Character | null) => void;
}) {
  const [newItemName, setNewItemName] = useState("");

  async function handleAdd() {
    if (!newItemName.trim()) return;
    const id = await addCharacterItem(characterId, {
      name: newItemName.trim(),
      quantity: 1,
      weight: 0,
      equipped: false,
      notes: "",
    });
    setCharacter((prev) =>
      prev
        ? {
            ...prev,
            items: [
              ...prev.items,
              { id, name: newItemName.trim(), quantity: 1, weight: 0, equipped: false, notes: "", srd_equipment_slug: null },
            ],
          }
        : prev
    );
    setNewItemName("");
  }

  function handleUpdate(itemId: string, patch: Partial<Character["items"][number]>) {
    setCharacter((prev) =>
      prev ? { ...prev, items: prev.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) } : prev
    );
    updateCharacterItem(characterId, itemId, patch);
  }

  async function handleDelete(itemId: string) {
    setCharacter((prev) => (prev ? { ...prev, items: prev.items.filter((i) => i.id !== itemId) } : prev));
    await deleteCharacterItem(characterId, itemId);
  }

  return (
    <div>
      {character.items.length === 0 && <div className="empty-state">No items yet.</div>}
      {character.items.map((item) => (
        <div className="item-row" key={item.id}>
          <input
            className="item-name"
            defaultValue={item.name}
            onBlur={(e) => handleUpdate(item.id, { name: e.target.value })}
          />
          <input
            className="item-qty"
            type="number"
            defaultValue={item.quantity}
            onBlur={(e) => handleUpdate(item.id, { quantity: Number(e.target.value) })}
          />
          <label className="item-equipped">
            <input
              type="checkbox"
              checked={item.equipped}
              onChange={(e) => handleUpdate(item.id, { equipped: e.target.checked })}
            />
            Equipped
          </label>
          <button className="link-button" onClick={() => handleDelete(item.id)}>
            Remove
          </button>
        </div>
      ))}
      <div className="item-row">
        <input
          className="item-name"
          placeholder="Add an item…"
          value={newItemName}
          onChange={(e) => setNewItemName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <button className="link-button" onClick={handleAdd}>
          Add
        </button>
      </div>
    </div>
  );
}
