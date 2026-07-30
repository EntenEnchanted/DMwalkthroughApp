-- Migration number: 0004 	 2026-07-30T01:54:27.672Z
-- 0002's password hash used 200,000 PBKDF2 iterations, computed and tested
-- against local wrangler dev. The deployed edge Workers runtime caps
-- crypto.subtle PBKDF2 at 100,000 iterations and rejects anything higher
-- at login time — this recomputes the same password's hash at 100,000
-- iterations (worker/src/auth.ts's PBKDF2_ITERATIONS constant now matches).
UPDATE users
SET password_hash = '5bfda9b1c196b5443bfd4896b6ddb5d00be2fde1904a2139c7cfe784fc8a1a23',
    password_salt = '922791b684bdd1c63380cc7a865a51a3'
WHERE id = 'user-garrett-dm';
