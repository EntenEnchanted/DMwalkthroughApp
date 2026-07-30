import { useState, type FormEvent } from "react";
import { useAuth } from "../AuthContext";
import { redeemInvite } from "../api";

export function LoginView({ onJoined }: { onJoined: (campaignId: string) => void }) {
  const [mode, setMode] = useState<"login" | "join">("login");

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1 className="auth-title">D&amp;D Companion</h1>
        <div className="auth-tabs">
          <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>
            DM Login
          </button>
          <button className={mode === "join" ? "active" : ""} onClick={() => setMode("join")}>
            Join with invite code
          </button>
        </div>
        {mode === "login" ? <DmLoginForm /> : <JoinForm onJoined={onJoined} />}
      </div>
    </div>
  );
}

function DmLoginForm() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
    } catch {
      setError("Invalid email or password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      {error && <div className="auth-error">{error}</div>}
      <button type="submit" disabled={submitting}>
        {submitting ? "Logging in…" : "Log in"}
      </button>
    </form>
  );
}

function JoinForm({ onJoined }: { onJoined: (campaignId: string) => void }) {
  const { setUser } = useAuth();
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await redeemInvite(code, email, password);
      setUser(result.user);
      onJoined(result.campaign_id);
    } catch {
      setError("That invite code, email, or password didn't work.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <input
        placeholder="Invite code"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        autoCapitalize="characters"
        required
      />
      <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input
        type="password"
        placeholder="Choose a password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      {error && <div className="auth-error">{error}</div>}
      <button type="submit" disabled={submitting}>
        {submitting ? "Joining…" : "Join campaign"}
      </button>
    </form>
  );
}
