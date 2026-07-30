import { useEffect, useState, type FormEvent } from "react";
import { createCampaign, getOrCreateInvite, listCampaigns, listModules } from "../api";
import type { Campaign, Module } from "../types";
import { useAuth } from "../AuthContext";

export function CampaignPickerView({ onSelect }: { onSelect: (campaignId: string) => void }) {
  const { logout } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [creating, setCreating] = useState(false);
  const [inviteCodes, setInviteCodes] = useState<Record<string, string>>({});

  useEffect(() => {
    listCampaigns().then(setCampaigns);
    listModules().then(setModules);
  }, []);

  async function handleCreate(name: string, moduleId: string) {
    setCreating(true);
    try {
      const campaign = await createCampaign(name, moduleId);
      const module = modules.find((m) => m.id === moduleId);
      setCampaigns((prev) => [{ ...campaign, module_name: module?.name ?? moduleId }, ...(prev ?? [])]);
    } finally {
      setCreating(false);
    }
  }

  async function handleShowInvite(campaignId: string) {
    const code = await getOrCreateInvite(campaignId);
    setInviteCodes((prev) => ({ ...prev, [campaignId]: code }));
  }

  return (
    <div className="picker-screen">
      <div className="picker-header">
        <h1>Your Campaigns</h1>
        <button className="link-button" onClick={() => logout()}>
          Log out
        </button>
      </div>

      {campaigns === null && <div className="empty-state">Loading campaigns…</div>}
      {campaigns?.length === 0 && <div className="empty-state">No campaigns yet — create one below.</div>}

      <div className="campaign-list">
        {campaigns?.map((c) => (
          <div key={c.id} className="campaign-card">
            <button className="campaign-card-main" onClick={() => onSelect(c.id)}>
              <span className="campaign-card-name">{c.name}</span>
              <span className="section-card-meta">{c.module_name}</span>
            </button>
            {inviteCodes[c.id] ? (
              <span className="invite-code">{inviteCodes[c.id]}</span>
            ) : (
              <button className="link-button" onClick={() => handleShowInvite(c.id)}>
                Get invite code
              </button>
            )}
          </div>
        ))}
      </div>

      <NewCampaignForm modules={modules} creating={creating} onCreate={handleCreate} />
    </div>
  );
}

function NewCampaignForm({
  modules,
  creating,
  onCreate,
}: {
  modules: Module[];
  creating: boolean;
  onCreate: (name: string, moduleId: string) => void;
}) {
  const [name, setName] = useState("");
  const [moduleId, setModuleId] = useState("");

  useEffect(() => {
    if (!moduleId && modules.length > 0) setModuleId(modules[0].id);
  }, [modules, moduleId]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !moduleId) return;
    onCreate(name.trim(), moduleId);
    setName("");
  }

  return (
    <form className="new-campaign-form" onSubmit={handleSubmit}>
      <h2>Start a new campaign</h2>
      <input placeholder="Campaign name" value={name} onChange={(e) => setName(e.target.value)} required />
      <select value={moduleId} onChange={(e) => setModuleId(e.target.value)}>
        {modules.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <button type="submit" disabled={creating || !moduleId}>
        {creating ? "Creating…" : "Create campaign"}
      </button>
    </form>
  );
}
