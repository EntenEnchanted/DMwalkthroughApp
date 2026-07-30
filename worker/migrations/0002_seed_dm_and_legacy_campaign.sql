-- Migration number: 0002 	 2026-07-30T01:36:03.539Z
-- Provisions Garrett's DM account and a "legacy" campaign that carries
-- forward the pre-auth single-adventure state, so bookmarked reveal
-- progress from before campaigns existed isn't lost.
--
-- Password hash generated once via PBKDF2-SHA256/200000 iterations (see
-- worker/src/auth.ts for the verification code that must match these
-- params). The plaintext password was shared with Garrett out of band and
-- is not stored anywhere in this repo.

INSERT INTO users (id, email, password_hash, password_salt, role, created_at)
VALUES (
  'user-garrett-dm',
  'therealgarrettwells@gmail.com',
  '029feee420b65721af2e862e0be0108f744711bde3b132cd6e66128621897d1e',
  '85e382e11cb4a5d4304315fab3c48d1c',
  'dm',
  1785375388981
);

INSERT INTO campaigns (id, name, module_id, dm_user_id, status, created_at)
VALUES ('legacy-dosi', 'Dragons of Stormwreck Isle', 'dosi', 'user-garrett-dm', 'active', 1785375388981);

-- Carry forward whatever reveals were already toggled on before campaigns existed.
INSERT INTO campaign_reveal_state (campaign_id, reveal_def_id, revealed, revealed_at)
SELECT 'legacy-dosi', id, revealed, CASE WHEN revealed = 1 THEN 1785375388981 END
FROM reveal_defs
WHERE revealed = 1;
