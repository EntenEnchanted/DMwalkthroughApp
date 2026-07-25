import { useEffect, useState } from "react";
import { PopupProvider } from "./PopupContext";
import { CampaignView } from "./components/CampaignView";
import { SearchView } from "./components/SearchView";
import { ChatView } from "./components/ChatView";
import { RosterView } from "./components/RosterView";

type Tab = "campaign" | "search" | "roster" | "chat";
type Theme = "dark" | "light";

function App() {
  const [tab, setTab] = useState<Tab>("campaign");
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem("theme") as Theme) || "dark");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  return (
    <PopupProvider>
      <div className="app">
        <div className="tab-bar">
          <button className={tab === "campaign" ? "active" : ""} onClick={() => setTab("campaign")}>
            Campaign
          </button>
          <button className={tab === "search" ? "active" : ""} onClick={() => setTab("search")}>
            Search
          </button>
          <button className={tab === "roster" ? "active" : ""} onClick={() => setTab("roster")}>
            Roster
          </button>
          <button className={tab === "chat" ? "active" : ""} onClick={() => setTab("chat")}>
            Chat
          </button>
          <button
            className="theme-toggle"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
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
        {tab === "roster" && (
          <div className="app-content">
            <RosterView />
          </div>
        )}
        {tab === "chat" && <ChatView />}
      </div>
    </PopupProvider>
  );
}

export default App;
