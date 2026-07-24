import { useState } from "react";
import { PopupProvider } from "./PopupContext";
import { CampaignView } from "./components/CampaignView";
import { SearchView } from "./components/SearchView";
import { ChatView } from "./components/ChatView";

type Tab = "campaign" | "search" | "chat";

function App() {
  const [tab, setTab] = useState<Tab>("campaign");

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
          <button className={tab === "chat" ? "active" : ""} onClick={() => setTab("chat")}>
            Chat
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
        {tab === "chat" && <ChatView />}
      </div>
    </PopupProvider>
  );
}

export default App;
