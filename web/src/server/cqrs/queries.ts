/**
 * QUERY side (CQRS). Read-only functions over the read model (`*_summaries` views).
 * List queries never select `projects.state`; the full snapshot is loaded only by
 * `getProject`, when the user opens (activates) that project.
 */
import "server-only";
import { sql } from "../db";
import { notFound } from "../http";

export async function listWorkspaces(ownerId: string) {
  return sql`SELECT id, name, description, color, active_projects, archived_projects, last_saved_at, created_at, updated_at
             FROM workspace_summaries WHERE owner_id = ${ownerId} ORDER BY lower(name)`;
}

const SORTS: Record<string, string> = { saved: "ps.saved_at DESC", name: "lower(ps.name) ASC", created: "ps.created_at DESC" };

export async function listProjects(ownerId: string, opts: { workspaceId?: string; status?: string; recent?: number; q?: string; tag?: string; stage?: string; sort?: string }) {
  const ws = opts.workspaceId ?? null;
  const status = opts.status && opts.status !== "all" ? opts.status : null;
  const limit = opts.recent ?? 500;
  const q = opts.q?.trim() ? `%${opts.q.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%` : null;
  const tag = opts.tag?.trim().toLowerCase() || null;
  const stage = opts.stage && opts.stage !== "all" ? opts.stage : null;
  const order = sql.unsafe(SORTS[opts.sort ?? "saved"] ?? SORTS.saved);
  return sql`SELECT ps.id, ps.workspace_id, w.name AS workspace_name, w.color AS workspace_color, ps.name, ps.description, ps.template, ps.status,
                    ps.state_version, ps.node_count, ps.scenario_count, ps.run_count, ps.share_count, ps.tags, ps.stage, ps.pinned, ps.last_note,
                    ps.created_at, ps.saved_at
             FROM project_summaries ps JOIN workspaces w ON w.id = ps.workspace_id
             WHERE ps.owner_id = ${ownerId}
               AND (${ws}::uuid IS NULL OR ps.workspace_id = ${ws}::uuid)
               AND (${status}::text IS NULL OR ps.status = ${status}::text)
               AND (${stage}::text IS NULL OR ps.stage = ${stage}::text)
               AND (${tag}::text IS NULL OR ${tag}::text = ANY(ps.tags))
               AND (${q}::text IS NULL OR ps.name ILIKE ${q} OR ps.description ILIKE ${q} OR array_to_string(ps.tags, ' ') ILIKE ${q})
             ORDER BY ps.pinned DESC, ${order} LIMIT ${limit}`;
}

export async function listTags(ownerId: string) {
  return sql`SELECT t AS tag, count(*)::int AS count FROM projects, unnest(tags) t WHERE owner_id = ${ownerId} AND status = 'active' GROUP BY t ORDER BY count DESC, t LIMIT 100`;
}

export async function getProfile(userId: string) {
  const [u] = await sql`SELECT id, username, email, display_name, role, created_at, last_login_at, preferences,
                          (SELECT count(*) FROM workspaces WHERE owner_id = users.id)::int AS workspace_count,
                          (SELECT count(*) FROM projects WHERE owner_id = users.id)::int AS project_count,
                          (SELECT count(*) FROM batch_runs WHERE owner_id = users.id)::int AS run_count,
                          (SELECT count(*) FROM share_links WHERE owner_id = users.id)::int AS share_count,
                          (SELECT count(*) FROM projects WHERE owner_id = users.id AND jsonb_array_length(COALESCE(state->'canvas'->'nodes','[]'::jsonb)) > 0)::int AS mapped_projects
                        FROM users WHERE id = ${userId}`;
  if (!u) throw notFound();
  return u;
}

export async function listSessions(userId: string, currentHash: string) {
  return sql`SELECT id, user_agent, created_at, expires_at, (token_hash = ${currentHash}) AS current
             FROM sessions WHERE user_id = ${userId} AND expires_at > now() ORDER BY created_at DESC`;
}

export async function listVersions(ownerId: string, projectId: string) {
  // The current saved version is always listed, even for projects saved before history existed.
  return sql`SELECT version, note, saved_at, node_count FROM (
               SELECT v.version, v.note, v.saved_at, jsonb_array_length(COALESCE(v.state->'canvas'->'nodes','[]'::jsonb)) AS node_count
               FROM project_versions v JOIN projects p ON p.id = v.project_id WHERE v.project_id = ${projectId} AND p.owner_id = ${ownerId}
               UNION ALL
               SELECT p.state_version, p.last_note, p.saved_at, jsonb_array_length(COALESCE(p.state->'canvas'->'nodes','[]'::jsonb))
               FROM projects p WHERE p.id = ${projectId} AND p.owner_id = ${ownerId}
                 AND NOT EXISTS (SELECT 1 FROM project_versions v WHERE v.project_id = p.id AND v.version = p.state_version)
             ) t ORDER BY version DESC`;
}

export async function listShares(ownerId: string, projectId: string) {
  return sql`SELECT id, label, (password_hash IS NOT NULL) AS has_password, include_notes, include_runs, expires_at, revoked_at,
                    view_count, last_viewed_at, created_at,
                    (revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())) AS active
             FROM share_links WHERE project_id = ${projectId} AND owner_id = ${ownerId} ORDER BY created_at DESC`;
}

export async function getProject(ownerId: string, id: string) {
  const [row] = await sql`SELECT p.id, p.workspace_id, w.name AS workspace_name, p.name, p.description, p.template, p.status,
                                 p.state, p.state_version, p.tags, p.stage, p.pinned, p.last_note, p.created_at, p.saved_at
                          FROM projects p JOIN workspaces w ON w.id = p.workspace_id
                          WHERE p.id = ${id} AND p.owner_id = ${ownerId}`;
  if (!row) throw notFound();
  return row;
}

export async function listRuns(ownerId: string, projectId?: string) {
  const pid = projectId ?? null;
  return sql`SELECT id, project_id, project_name, scenario_name, started_at, finished_at, total, passed, failed, errored, duration_ms, created_at
             FROM batch_run_summaries WHERE owner_id = ${ownerId} AND (${pid}::uuid IS NULL OR project_id = ${pid}::uuid)
             ORDER BY created_at DESC LIMIT 200`;
}

export async function getRun(ownerId: string, id: string) {
  const [row] = await sql`SELECT r.id, r.project_id, p.name AS project_name, r.scenario_name, r.started_at, r.finished_at,
                                 r.total, r.passed, r.failed, r.errored, r.duration_ms, r.results, r.created_at
                          FROM batch_runs r JOIN projects p ON p.id = r.project_id WHERE r.id = ${id} AND r.owner_id = ${ownerId}`;
  if (!row) throw notFound();
  return row;
}
