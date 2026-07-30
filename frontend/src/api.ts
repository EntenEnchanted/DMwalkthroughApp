import type {
  AuthUser,
  Campaign,
  Character,
  CharacterSummary,
  CreatureSummary,
  MyCharacterSummary,
  Module,
  NarrativeReference,
  SearchResult,
  SectionDetail,
} from "./types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${API_URL}${path}`, { ...options, credentials: "include" });
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return res;
}

function apiPost(path: string, body: unknown): Promise<Response> {
  return apiFetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function apiPatch(path: string, body: unknown): Promise<Response> {
  return apiFetch(path, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function apiDelete(path: string): Promise<Response> {
  return apiFetch(path, { method: "DELETE" });
}

// --- Auth ---

export async function login(email: string, password: string): Promise<AuthUser> {
  return (await apiPost("/api/auth/login", { email, password })).json();
}

export async function logout(): Promise<void> {
  await apiPost("/api/auth/logout", {});
}

export async function getMe(): Promise<AuthUser | null> {
  try {
    return await (await apiFetch("/api/auth/me")).json();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}

export async function redeemInvite(
  code: string,
  email: string,
  password: string,
  characterName: string
): Promise<{ campaign_id: string; character_id: string; user: AuthUser }> {
  return (
    await apiPost("/api/auth/redeem-invite", { code, email, password, character_name: characterName })
  ).json();
}

// --- Campaigns ---

export async function listModules(): Promise<Module[]> {
  const data = (await (await apiFetch("/api/modules")).json()) as { modules: Module[] };
  return data.modules;
}

export async function listCampaigns(): Promise<Campaign[]> {
  const data = (await (await apiFetch("/api/campaigns")).json()) as { campaigns: Campaign[] };
  return data.campaigns;
}

export async function createCampaign(name: string, moduleId: string): Promise<Campaign> {
  return (await apiPost("/api/campaigns", { name, module_id: moduleId })).json();
}

export async function getOrCreateInvite(campaignId: string): Promise<string> {
  const data = (await (await apiPost(`/api/campaigns/${encodeURIComponent(campaignId)}/invite`, {})).json()) as {
    code: string;
  };
  return data.code;
}

// --- Campaign-scoped adventure content (unchanged behavior, now campaign-scoped) ---

export async function search(campaignId: string, query: string): Promise<SearchResult[]> {
  const res = await apiFetch(`/api/campaigns/${encodeURIComponent(campaignId)}/search?q=${encodeURIComponent(query)}`);
  const data = (await res.json()) as { results: SearchResult[] };
  return data.results;
}

export async function getCampaignOutline(campaignId: string): Promise<SectionDetail[]> {
  const res = await apiFetch(`/api/campaigns/${encodeURIComponent(campaignId)}/outline`);
  const data = (await res.json()) as { sections: SectionDetail[] };
  return data.sections;
}

export async function getCreatures(campaignId: string): Promise<CreatureSummary[]> {
  const res = await apiFetch(`/api/campaigns/${encodeURIComponent(campaignId)}/creatures`);
  const data = (await res.json()) as { creatures: CreatureSummary[] };
  return data.creatures;
}

export async function getSection(campaignId: string, id: string): Promise<SectionDetail> {
  const res = await apiFetch(`/api/campaigns/${encodeURIComponent(campaignId)}/sections/${encodeURIComponent(id)}`);
  return res.json();
}

export async function getNarrativeReferences(campaignId: string, id: string): Promise<NarrativeReference[]> {
  const res = await apiFetch(
    `/api/campaigns/${encodeURIComponent(campaignId)}/sections/${encodeURIComponent(id)}/narrative-references`
  );
  const data = (await res.json()) as { references: NarrativeReference[] };
  return data.references;
}

export async function toggleReveal(campaignId: string, revealId: number, revealed: boolean): Promise<void> {
  await apiPost(`/api/campaigns/${encodeURIComponent(campaignId)}/reveals/${revealId}/toggle`, { revealed });
}

// --- Characters ---

export async function listCharacters(campaignId: string): Promise<CharacterSummary[]> {
  const res = await apiFetch(`/api/campaigns/${encodeURIComponent(campaignId)}/characters`);
  const data = (await res.json()) as { characters: CharacterSummary[] };
  return data.characters;
}

export async function listMyCharacters(): Promise<MyCharacterSummary[]> {
  const res = await apiFetch("/api/me/characters");
  const data = (await res.json()) as { characters: MyCharacterSummary[] };
  return data.characters;
}

export async function getCharacter(characterId: string): Promise<Character> {
  const res = await apiFetch(`/api/characters/${encodeURIComponent(characterId)}`);
  return res.json();
}

export async function updateCharacter(characterId: string, patch: Partial<Character>): Promise<void> {
  await apiPatch(`/api/characters/${encodeURIComponent(characterId)}`, patch);
}

export async function addCharacterItem(
  characterId: string,
  item: { name: string; quantity: number; weight: number; equipped: boolean; notes: string }
): Promise<string> {
  const data = (await (
    await apiPost(`/api/characters/${encodeURIComponent(characterId)}/items`, item)
  ).json()) as { id: string };
  return data.id;
}

export async function updateCharacterItem(
  characterId: string,
  itemId: string,
  patch: Partial<{ name: string; quantity: number; weight: number; equipped: boolean; notes: string }>
): Promise<void> {
  await apiPatch(`/api/characters/${encodeURIComponent(characterId)}/items/${encodeURIComponent(itemId)}`, patch);
}

export async function deleteCharacterItem(characterId: string, itemId: string): Promise<void> {
  await apiDelete(`/api/characters/${encodeURIComponent(characterId)}/items/${encodeURIComponent(itemId)}`);
}

export async function* streamChat(campaignId: string, message: string): AsyncGenerator<string> {
  const res = await fetch(`${API_URL}/api/campaigns/${encodeURIComponent(campaignId)}/chat`, {
    method: "POST",
    credentials: "include",
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
