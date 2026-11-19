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

export async function listProjects(ownerId: string, opts: { workspaceId?: string; status?: string; recent?: number }) {
  const ws = opts.workspaceId ?? null;
  const status = opts.status && opts.status !== "all" ? opts.status : null;
  const limit = opts.recent ?? 500;
  return sql`SELECT ps.id, ps.workspace_id, w.name AS workspace_name, ps.name, ps.description, ps.template, ps.status,
                    ps.state_version, ps.node_count, ps.scenario_count, ps.run_count, ps.created_at, ps.saved_at
             FROM project_summaries ps JOIN workspaces w ON w.id = ps.workspace_id
             WHERE ps.owner_id = ${ownerId}
               AND (${ws}::uuid IS NULL OR ps.workspace_id = ${ws}::uuid)
               AND (${status}::text IS NULL OR ps.status = ${status}::text)
             ORDER BY ps.saved_at DESC LIMIT ${limit}`;
}

export async function getProject(ownerId: string, id: string) {
  const [row] = await sql`SELECT p.id, p.workspace_id, w.name AS workspace_name, p.name, p.description, p.template, p.status,
                                 p.state, p.state_version, p.created_at, p.saved_at
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
