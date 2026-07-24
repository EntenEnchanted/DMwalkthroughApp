import type { NarrativeReference, SearchResult, SectionDetail } from "./types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

export async function search(query: string): Promise<SearchResult[]> {
  const res = await fetch(`${API_URL}/api/search?q=${encodeURIComponent(query)}`);
  const data = (await res.json()) as { results: SearchResult[] };
  return data.results;
}

export async function getSection(id: string): Promise<SectionDetail> {
  const res = await fetch(`${API_URL}/api/sections/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`Section not found: ${id}`);
  return res.json();
}

export async function getNarrativeReferences(id: string): Promise<NarrativeReference[]> {
  const res = await fetch(`${API_URL}/api/sections/${encodeURIComponent(id)}/narrative-references`);
  const data = (await res.json()) as { references: NarrativeReference[] };
  return data.references;
}

export async function toggleReveal(revealId: number, revealed: boolean): Promise<void> {
  await fetch(`${API_URL}/api/reveals/${revealId}/toggle`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ revealed }),
  });
}

export async function* streamChat(message: string): AsyncGenerator<string> {
  const res = await fetch(`${API_URL}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message }),
  });
  if (!res.ok || !res.body) {
    throw new Error(await res.text());
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice("data: ".length);
      if (payload === "[DONE]") return;
      try {
        const event = JSON.parse(payload);
        if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
          yield event.delta.text as string;
        }
      } catch {
        // ignore non-JSON keep-alive lines
      }
    }
  }
}
