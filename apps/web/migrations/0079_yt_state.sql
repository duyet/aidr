-- YouTube credential state, moved out of Workers KV (the free tier's daily
-- limits and its cost). A handful of rows: the rotated refresh token, the
-- cached access token, the token status, and the single-use sign-in nonces.
-- expires_at is epoch milliseconds; NULL never expires. Readers ignore an
-- expired row and every write deletes the expired ones (worker/yt-state.ts).
CREATE TABLE IF NOT EXISTS yt_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  expires_at INTEGER
);
