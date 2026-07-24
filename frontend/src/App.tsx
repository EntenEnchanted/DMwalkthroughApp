import { useState } from "react";
import { PopupProvider } from "./PopupContext";
import { SearchView } from "./components/SearchView";
import { ChatView } from "./components/ChatView";

type Tab = "search" | "chat";

function App() {
  const [tab, setTab] = useState<Tab>("search");

  return (
    <PopupProvider>
      <div className="app">
        <div className="tab-bar">
          <button className={tab === "search" ? "active" : ""} onClick={() => setTab("search")}>
            Search
          </button>
          <button className={tab === "chat" ? "active" : ""} onClick={() => setTab("chat")}>
            Chat
          </button>
        </div>

        {tab === "search" ? (
          <div className="app-content">
            <SearchView />
          </div>
        ) : (
          <ChatView />
        )}
      </div>
    </PopupProvider>
  );
}

export default App;
