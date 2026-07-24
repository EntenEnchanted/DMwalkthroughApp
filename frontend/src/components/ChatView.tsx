import { useRef, useState } from "react";
import { streamChat } from "../api";

interface Message {
  role: "user" | "assistant";
  text: string;
}

export function ChatView() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  function scrollToBottom() {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    });
  }

  async function send() {
    const question = input.trim();
    if (!question || streaming) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: question }, { role: "assistant", text: "" }]);
    setStreaming(true);
    scrollToBottom();

    try {
      for await (const chunk of streamChat(question)) {
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", text: next[next.length - 1].text + chunk };
          return next;
        });
        scrollToBottom();
      }
    } catch (err) {
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: "assistant", text: `Error: ${(err as Error).message}` };
        return next;
      });
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className="chat-view">
      <div className="chat-messages" ref={scrollRef}>
        {messages.length === 0 && <div className="empty-state">Ask anything about the adventure.</div>}
        {messages.map((m, i) => (
          <div key={i} className={`chat-bubble ${m.role}`}>
            {m.text || (streaming && i === messages.length - 1 ? "…" : "")}
          </div>
        ))}
      </div>
      <div className="chat-input-bar">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask a question…"
        />
        <button onClick={send} disabled={streaming}>
          Send
        </button>
      </div>
    </div>
  );
}
