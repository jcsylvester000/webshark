-- v0.9: throttle repeated sign-in / sign-up attempts (per account and per client address).
-- Keys are SHA-256 hashes ("u:<username>", "ip:<address>"), never raw usernames or IPs.
CREATE TABLE IF NOT EXISTS auth_attempts (
  id BIGSERIAL PRIMARY KEY,
  key_hash TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('login', 'register')),
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_attempts_key_time ON auth_attempts (key_hash, kind, attempted_at DESC);
