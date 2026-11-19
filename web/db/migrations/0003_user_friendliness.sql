-- Slyshark 0003: profile preferences, project organization (tags, stage, pin), save history,
-- and password-protected share links.

ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'none';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS last_note TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS projects_tags_idx ON projects USING GIN (tags);

-- Previous snapshots, written only as part of an explicit "Save project" (last 10 kept).
CREATE TABLE IF NOT EXISTS project_versions (
    id          BIGSERIAL PRIMARY KEY,
    project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    version     INTEGER NOT NULL,
    state       JSONB NOT NULL,
    note        TEXT NOT NULL DEFAULT '',
    saved_at    TIMESTAMPTZ NOT NULL,
    UNIQUE (project_id, version)
);

-- Read-only share links. Only a SHA-256 of the token is stored; passwords are scrypt-hashed.
CREATE TABLE IF NOT EXISTS share_links (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash      TEXT NOT NULL UNIQUE,
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label           TEXT NOT NULL DEFAULT '',
    password_hash   TEXT,
    include_notes   BOOLEAN NOT NULL DEFAULT true,
    include_runs    BOOLEAN NOT NULL DEFAULT true,
    expires_at      TIMESTAMPTZ,
    revoked_at      TIMESTAMPTZ,
    view_count      INTEGER NOT NULL DEFAULT 0,
    last_viewed_at  TIMESTAMPTZ,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS share_links_project_idx ON share_links(project_id);

-- READ MODEL: project summaries now expose organization fields.
DROP VIEW IF EXISTS project_summaries;
CREATE VIEW project_summaries AS
SELECT p.id, p.workspace_id, p.owner_id, p.name, p.description, p.template, p.status, p.state_version,
       jsonb_array_length(COALESCE(p.state->'canvas'->'nodes', '[]'::jsonb)) AS node_count,
       jsonb_array_length(COALESCE(p.state->'batch'->'scenarios', '[]'::jsonb)) AS scenario_count,
       (SELECT count(*) FROM batch_runs r WHERE r.project_id = p.id)::int AS run_count,
       (SELECT count(*) FROM share_links s WHERE s.project_id = p.id AND s.revoked_at IS NULL
          AND (s.expires_at IS NULL OR s.expires_at > now()))::int AS share_count,
       p.tags, p.stage, p.pinned, p.last_note, p.created_at, p.saved_at
FROM projects p;
