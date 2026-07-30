import { useEffect, useState } from "react";
import { AuthProvider, useAuth } from "./AuthContext";
import { CampaignProvider } from "./CampaignContext";
import { PopupProvider } from "./PopupContext";
import { CampaignView } from "./components/CampaignView";
import { SearchView } from "./components/SearchView";
import { ChatView } from "./components/ChatView";
import { BestiaryView } from "./components/BestiaryView";
import { RosterView } from "./components/RosterView";
import { LoginView } from "./components/LoginView";
import { CampaignPickerView } from "./components/CampaignPickerView";
import { PlayerHomeView } from "./components/PlayerHomeView";
import { HandbookView } from "./components/HandbookView";

type Tab = "campaign" | "search" | "bestiary" | "roster" | "handbook" | "chat";
type Theme = "dark" | "light";

const ACTIVE_CAMPAIGN_KEY = "activeCampaignId";

function App() {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem("theme") as Theme) || "dark");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  return (
    <AuthProvider>
      <div className="app">
        <AppBody theme={theme} onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")} />
      </div>
    </AuthProvider>
  );
}

function AppBody({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const { user, loading } = useAuth();
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(() =>
    localStorage.getItem(ACTIVE_CAMPAIGN_KEY)
  );

  function selectCampaign(id: string) {
    localStorage.setItem(ACTIVE_CAMPAIGN_KEY, id);
    setActiveCampaignId(id);
  }

  function switchCampaign() {
    localStorage.removeItem(ACTIVE_CAMPAIGN_KEY);
    setActiveCampaignId(null);
  }

  if (loading) return <div className="empty-state">Loading…</div>;
  if (!user) return <LoginView onJoined={selectCampaign} />;
  if (user.role === "player") return <PlayerHomeView />;
  if (!activeCampaignId) return <CampaignPickerView onSelect={selectCampaign} />;

  return (
    <CampaignProvider campaignId={activeCampaignId}>
      <DmCampaignApp theme={theme} onToggleTheme={onToggleTheme} onSwitchCampaign={switchCampaign} />
    </CampaignProvider>
  );
}

function DmCampaignApp({
  theme,
  onToggleTheme,
  onSwitchCampaign,
}: {
  theme: Theme;
  onToggleTheme: () => void;
  onSwitchCampaign: () => void;
}) {
  const [tab, setTab] = useState<Tab>("campaign");

  return (
    <PopupProvider>
      <div className="tab-bar">
        <button className={tab === "campaign" ? "active" : ""} onClick={() => setTab("campaign")}>
          Campaign
        </button>
        <button className={tab === "search" ? "active" : ""} onClick={() => setTab("search")}>
          Search
        </button>
        <button className={tab === "bestiary" ? "active" : ""} onClick={() => setTab("bestiary")}>
          Bestiary
        </button>
        <button className={tab === "roster" ? "active" : ""} onClick={() => setTab("roster")}>
          Roster
        </button>
        <button className={tab === "handbook" ? "active" : ""} onClick={() => setTab("handbook")}>
          Handbook
        </button>
        <button className={tab === "chat" ? "active" : ""} onClick={() => setTab("chat")}>
          Chat
        </button>
        <button className="link-button" onClick={onSwitchCampaign} title="Switch campaign">
          Switch
        </button>
        <button
          className="theme-toggle"
          onClick={onToggleTheme}
          aria-label="Toggle light/dark mode"
          title="Toggle light/dark mode"
        >
          {theme === "dark" ? "☀︎" : "☾"}
        </button>
      </div>

      {tab === "campaign" && (
        <div className="app-content">
          <CampaignView />
        </div>
      )}
      {tab === "search" && (
        <div className="app-content">
          <SearchView />
        </div>
      )}
      {tab === "bestiary" && (
        <div className="app-content">
          <BestiaryView />
        </div>
      )}
      {tab === "roster" && (
        <div className="app-content">
          <RosterView />
        </div>
      )}
      {tab === "handbook" && (
        <div className="app-content">
          <HandbookView />
        </div>
      )}
      {tab === "chat" && <ChatView />}
    </PopupProvider>
  );
}

export default App;
