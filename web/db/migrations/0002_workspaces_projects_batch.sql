-- Slyshark 0002: workspaces, projects (saved snapshots), batch test runs.
-- CQRS: tables below are the WRITE model (changed only by explicit commands such as
-- "Save project" or "Save run"); the *_summaries views are the READ model used by list queries,
-- so lists never load project state.

CREATE TABLE IF NOT EXISTS workspaces (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    color       TEXT NOT NULL DEFAULT '#2ee6c5',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (owner_id, name)
);

CREATE TABLE IF NOT EXISTS projects (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    owner_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    template      TEXT,
    status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    -- Full working snapshot (canvas, API requests, scanner, console, batch scenarios, results).
    state         JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Optimistic concurrency: every save must name the version it was loaded from.
    state_version INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    saved_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS projects_workspace_idx ON projects(workspace_id, status, saved_at DESC);
CREATE INDEX IF NOT EXISTS projects_owner_idx ON projects(owner_id, saved_at DESC);

CREATE TABLE IF NOT EXISTS batch_runs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    owner_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scenario_name TEXT NOT NULL,
    started_at    TIMESTAMPTZ NOT NULL,
    finished_at   TIMESTAMPTZ NOT NULL,
    total         INTEGER NOT NULL,
    passed        INTEGER NOT NULL,
    failed        INTEGER NOT NULL,
    errored       INTEGER NOT NULL,
    duration_ms   INTEGER NOT NULL,
    results       JSONB NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS batch_runs_project_idx ON batch_runs(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS batch_runs_owner_idx ON batch_runs(owner_id, created_at DESC);

-- READ MODEL ------------------------------------------------------------------
CREATE OR REPLACE VIEW project_summaries AS
SELECT p.id, p.workspace_id, p.owner_id, p.name, p.description, p.template, p.status, p.state_version,
       jsonb_array_length(COALESCE(p.state->'canvas'->'nodes', '[]'::jsonb)) AS node_count,
       jsonb_array_length(COALESCE(p.state->'batch'->'scenarios', '[]'::jsonb)) AS scenario_count,
       (SELECT count(*) FROM batch_runs r WHERE r.project_id = p.id)::int AS run_count,
       p.created_at, p.saved_at
FROM projects p;

CREATE OR REPLACE VIEW workspace_summaries AS
SELECT w.id, w.owner_id, w.name, w.description, w.color, w.created_at, w.updated_at,
       count(p.id) FILTER (WHERE p.status = 'active')::int   AS active_projects,
       count(p.id) FILTER (WHERE p.status = 'archived')::int AS archived_projects,
       max(p.saved_at) AS last_saved_at
FROM workspaces w LEFT JOIN projects p ON p.workspace_id = w.id
GROUP BY w.id;

CREATE OR REPLACE VIEW batch_run_summaries AS
SELECT r.id, r.project_id, r.owner_id, p.name AS project_name, r.scenario_name, r.started_at, r.finished_at,
       r.total, r.passed, r.failed, r.errored, r.duration_ms, r.created_at
FROM batch_runs r JOIN projects p ON p.id = r.project_id;

-- DATA MIGRATION: v0.1/v0.2 environments become projects in a "My Workspace" workspace.
INSERT INTO workspaces (owner_id, name, description)
SELECT DISTINCT e.owner_id, 'My Workspace', 'Created from your earlier environments'
FROM environments e
ON CONFLICT (owner_id, name) DO NOTHING;

INSERT INTO projects (workspace_id, owner_id, name, description, template, state, state_version, created_at, saved_at)
SELECT w.id, e.owner_id, e.name, e.description, e.template,
       jsonb_build_object('version', 1, 'canvas', e.canvas), 1, e.created_at, e.updated_at
FROM environments e
JOIN workspaces w ON w.owner_id = e.owner_id AND w.name = 'My Workspace'
WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.owner_id = e.owner_id AND p.name = e.name AND p.created_at = e.created_at);

-- Legacy tables (environments, saved_requests, scan_logs, user_settings) are kept read-only for
-- history and are no longer written by the app.
