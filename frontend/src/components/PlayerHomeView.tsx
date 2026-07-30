import { useAuth } from "../AuthContext";

export function PlayerHomeView() {
  const { user, logout } = useAuth();

  return (
    <div className="picker-screen">
      <div className="picker-header">
        <h1>Welcome, {user?.email}</h1>
        <button className="link-button" onClick={() => logout()}>
          Log out
        </button>
      </div>
      <div className="empty-state">
        You're in! Your character sheet is coming soon — check back after the DM sets it up.
      </div>
    </div>
  );
}
