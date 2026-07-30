import { useState } from "react";
import { search } from "../api";
import type { SearchResult } from "../types";
import { SectionCard } from "./SectionCard";
import { useCampaignId } from "../CampaignContext";

export function SearchView() {
  const campaignId = useCampaignId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function runSearch(q: string) {
    setQuery(q);
    if (!q.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    try {
      const r = await search(campaignId, q);
      setResults(r);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <input
        className="search-input"
        placeholder="Search the adventure…"
        value={query}
        onChange={(e) => runSearch(e.target.value)}
        autoFocus
      />

      {loading && <div className="empty-state">Searching…</div>}
      {!loading && searched && results.length === 0 && <div className="empty-state">No matches.</div>}
      {!loading && !searched && <div className="empty-state">Search rooms, NPCs, creatures, and lore.</div>}

      {results.map((r) => (
        <SectionCard key={r.id} section={r} />
      ))}
    </div>
  );
}
