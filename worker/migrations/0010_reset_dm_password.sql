-- Migration number: 0010 	 2026-08-02T00:00:00.000Z
-- Resets Garrett's DM password (the original from migration 0002 was
-- never recorded anywhere retrievable, only its hash). New password
-- hash generated via PBKDF2-SHA256/100000 iterations, same as 0004. The
-- plaintext password was shared with Garrett out of band and is not
-- stored anywhere in this repo.

UPDATE users
SET password_hash = '3183d9677114a99a8f4aa765d76eb10fe83e705b593d3483c7772028d8f2cc05',
    password_salt = 'ffe45bc4b0c66f66882165de2498a1e7'
WHERE id = 'user-garrett-dm';
