-- Migration number: 0009 	 2026-08-02T00:00:00.000Z
-- Lets an existing DM generate a reusable invite code that gates
-- self-service DM account creation (mirrors campaign_invites, but for
-- registering new DM users rather than joining a campaign as a player).
-- Ungated DM signup would let anyone who finds the site create an account
-- that can run up Anthropic/R2/D1 usage, so registration always requires
-- a code an existing DM chose to hand out.

CREATE TABLE dm_invites (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  created_by_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
