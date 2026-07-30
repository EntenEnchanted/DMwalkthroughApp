import { useEffect, useState } from "react";
import { getSrdEntry, listSrd } from "../api";
import type { SrdCategory, SrdEntryDetail, SrdEntrySummary } from "../types";

const CATEGORIES: { value: SrdCategory | ""; label: string }[] = [
  { value: "", label: "All" },
  { value: "class", label: "Classes" },
  { value: "race", label: "Races" },
  { value: "spell", label: "Spells" },
  { value: "equipment", label: "Equipment" },
  { value: "feat", label: "Feats" },
  { value: "condition", label: "Conditions" },
  { value: "rule", label: "Rules" },
];

export function HandbookView() {
  const [category, setCategory] = useState<SrdCategory | "">("");
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<SrdEntrySummary[] | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  useEffect(() => {
    listSrd({ category: category || undefined, q: query || undefined }).then(setEntries);
  }, [category, query]);

  if (selectedSlug) {
    return (
      <div>
        <button className="link-button" onClick={() => setSelectedSlug(null)}>
          ← Back to Handbook
        </button>
        <SrdDetail slug={selectedSlug} />
      </div>
    );
  }

  return (
    <div>
      <input
        className="search-input"
        placeholder="Search the handbook…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="handbook-categories">
        {CATEGORIES.map((c) => (
          <button
            key={c.value}
            className={category === c.value ? "active" : ""}
            onClick={() => setCategory(c.value)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {!entries && <div className="empty-state">Loading…</div>}
      {entries?.length === 0 && <div className="empty-state">No matches.</div>}

      <div className="handbook-list">
        {entries?.map((e) => (
          <button key={e.id} className="roster-row" onClick={() => setSelectedSlug(e.slug)}>
            <span className="roster-name">{e.name}</span>
            <span className="section-card-meta">{e.category}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SrdDetail({ slug }: { slug: string }) {
  const [entry, setEntry] = useState<SrdEntryDetail | null>(null);

  useEffect(() => {
    setEntry(null);
    getSrdEntry(slug).then(setEntry);
  }, [slug]);

  if (!entry) return <div className="empty-state">Loading…</div>;

  const facts = extractKeyFacts(entry.data);
  const desc = extractDesc(entry.data);

  return (
    <div className="sheet">
      <div className="section-card-header">
        <span className="section-card-title">{entry.name}</span>
        <span className="section-card-meta">{entry.source}</span>
      </div>

      {facts.length > 0 && (
        <div className="handbook-facts">
          {facts.map(([label, value]) => (
            <div className="handbook-fact" key={label}>
              <span className="tier-label">{label}</span>
              {value}
            </div>
          ))}
        </div>
      )}

      {desc.map((p, i) => (
        <p className="stat-line" key={i}>
          {p}
        </p>
      ))}

      <details className="handbook-raw">
        <summary>Full data</summary>
        <pre>{JSON.stringify(entry.data, null, 2)}</pre>
      </details>
    </div>
  );
}

function extractDesc(data: Record<string, unknown>): string[] {
  const desc = data.desc;
  if (Array.isArray(desc)) return desc as string[];
  if (typeof desc === "string") return [desc];
  return [];
}

function named(value: unknown): string | null {
  if (value && typeof value === "object" && "name" in value) return String((value as { name: unknown }).name);
  return null;
}

function extractKeyFacts(data: Record<string, unknown>): [string, string][] {
  const facts: [string, string][] = [];
  const push = (label: string, value: unknown) => {
    if (value === undefined || value === null || value === "") return;
    facts.push([label, String(value)]);
  };

  push("Hit Die", data.hit_die && `d${data.hit_die}`);
  push("Speed", typeof data.speed === "number" ? `${data.speed} ft.` : named(data.speed));
  push("Size", data.size);
  if (Array.isArray(data.ability_bonuses)) {
    const bonuses = (data.ability_bonuses as { ability_score: { name: string }; bonus: number }[])
      .map((b) => `${b.ability_score.name} +${b.bonus}`)
      .join(", ");
    if (bonuses) push("Ability Bonuses", bonuses);
  }
  if (Array.isArray(data.languages)) {
    const langs = (data.languages as { name: string }[]).map((l) => l.name).join(", ");
    if (langs) push("Languages", langs);
  }

  push("Level", typeof data.level === "number" ? (data.level === 0 ? "Cantrip" : data.level) : undefined);
  push("School", named(data.school));
  push("Casting Time", data.casting_time);
  push("Range", data.range);
  push("Duration", data.duration);
  if (Array.isArray(data.components)) push("Components", (data.components as string[]).join(", "));
  push("Concentration", data.concentration === true ? "Yes" : undefined);
  push("Ritual", data.ritual === true ? "Yes" : undefined);

  if (data.cost && typeof data.cost === "object") {
    const c = data.cost as { quantity: number; unit: string };
    push("Cost", `${c.quantity} ${c.unit}`);
  }
  push("Weight", typeof data.weight === "number" ? `${data.weight} lb.` : undefined);
  if (data.damage && typeof data.damage === "object") {
    const d = data.damage as { damage_dice?: string; damage_type?: { name: string } };
    if (d.damage_dice) push("Damage", `${d.damage_dice} ${d.damage_type?.name ?? ""}`.trim());
  }
  if (data.armor_class && typeof data.armor_class === "object") {
    const ac = data.armor_class as { base: number; dex_bonus?: boolean };
    push("Armor Class", `${ac.base}${ac.dex_bonus ? " + Dex modifier" : ""}`);
  }
  push("Equipment Category", named(data.equipment_category));

  return facts;
}
