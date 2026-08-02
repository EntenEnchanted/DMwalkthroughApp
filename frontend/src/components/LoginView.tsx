import { useState, type FormEvent } from "react";
import { useAuth } from "../AuthContext";
import { redeemInvite, registerDm } from "../api";

export function LoginView({ onJoined }: { onJoined: (campaignId: string) => void }) {
  const [mode, setMode] = useState<"login" | "join" | "dm-signup">("login");

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
        {mode === "login" ? <DmLoginForm /> : mode === "join" ? <JoinForm onJoined={onJoined} /> : <DmSignupForm />}
        {mode !== "dm-signup" && (
          <button className="link-button auth-secondary-link" onClick={() => setMode("dm-signup")}>
            Have a DM invite code? Create a DM account
          </button>
        )}
        {mode === "dm-signup" && (
          <button className="link-button auth-secondary-link" onClick={() => setMode("login")}>
            Back to login
          </button>
        )}
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
  const [characterName, setCharacterName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await redeemInvite(code, email, password, characterName);
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
      <input
        placeholder="Your character's name"
        value={characterName}
        onChange={(e) => setCharacterName(e.target.value)}
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

function DmSignupForm() {
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
      const user = await registerDm(code, email, password);
      setUser(user);
    } catch (err) {
      setError(
        err instanceof Error && err.message.includes("already exists")
          ? "An account with that email already exists."
          : "That invite code, email, or password didn't work."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <input
        placeholder="DM invite code"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        autoCapitalize="characters"
        required
      />
      <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input
        type="password"
        placeholder="Choose a password (min 8 characters)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        minLength={8}
        required
      />
      {error && <div className="auth-error">{error}</div>}
      <button type="submit" disabled={submitting}>
        {submitting ? "Creating account…" : "Create DM account"}
      </button>
    </form>
  );
}
