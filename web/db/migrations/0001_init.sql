-- Slyshark initial schema (Neon Postgres).
-- Write model: users, sessions, environments, saved_requests, scan_logs.
-- Read model: environment_summaries view (lightweight list queries).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username      TEXT NOT NULL UNIQUE,
    email         TEXT NOT NULL UNIQUE,
    display_name  TEXT,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'member',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at TIMESTAMPTZ
);

-- Only a SHA-256 hash of the session token is stored, never the token itself.
CREATE TABLE IF NOT EXISTS sessions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL UNIQUE,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

-- An environment is one canvas: nodes + edges + viewport, stored as JSONB.
CREATE TABLE IF NOT EXISTS environments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    template    TEXT,
    canvas      JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[]}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS environments_owner_idx ON environments(owner_id, updated_at DESC);

-- Postman-style saved requests (collections are a simple text label for now).
CREATE TABLE IF NOT EXISTS saved_requests (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    collection  TEXT NOT NULL DEFAULT 'Default',
    name        TEXT NOT NULL,
    request     JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS saved_requests_owner_idx ON saved_requests(owner_id, collection);

-- Audit trail of every network action (ping, scan, audit, http) for accountability.
CREATE TABLE IF NOT EXISTS scan_logs (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL,
    target      TEXT NOT NULL,
    summary     JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scan_logs_user_idx ON scan_logs(user_id, created_at DESC);

-- Per-user key/value configuration (theme, default ports, etc.).
CREATE TABLE IF NOT EXISTS user_settings (
    user_id     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    settings    JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE VIEW environment_summaries AS
SELECT e.id, e.owner_id, e.name, e.description, e.template,
       jsonb_array_length(COALESCE(e.canvas->'nodes', '[]'::jsonb)) AS node_count,
       jsonb_array_length(COALESCE(e.canvas->'edges', '[]'::jsonb)) AS edge_count,
       e.created_at, e.updated_at
FROM environments e;
