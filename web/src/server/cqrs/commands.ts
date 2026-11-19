/**
 * COMMAND side (CQRS). The only code that writes workspaces, projects and batch runs.
 * Each command validates its payload, enforces ownership, and returns a small result
 * (ids/versions), never a read model. Dispatched by POST /api/commands/{name}.
 */
import "server-only";
import { sql } from "../db";
import { badRequest, conflict, notFound } from "../http";
import { isUuid } from "../validate";

type Payload = Record<string, unknown>;
type Handler = (ownerId: string, p: Payload) => Promise<Record<string, unknown>>;

const str = (p: Payload, k: string, { max = 120, required = true } = {}) => {
  const v = typeof p[k] === "string" ? (p[k] as string).trim() : "";
  if (required && !v) throw badRequest(`${k} is required`);
  if (v.length > max) throw badRequest(`${k} is longer than ${max} characters`);
  return v;
};
const uuid = (p: Payload, k: string) => {
  const v = p[k];
  if (typeof v !== "string" || !isUuid(v)) throw badRequest(`${k} must be a valid id`);
  return v;
};
const MAX_STATE = 8 * 1024 * 1024;

function checkState(state: unknown) {
  if (!state || typeof state !== "object" || Array.isArray(state)) throw badRequest("state must be an object");
  const size = JSON.stringify(state).length;
  if (size > MAX_STATE) throw badRequest(`Project is too large to save (${(size / 1048576).toFixed(1)} MB; limit 8 MB)`);
}

async function ownsWorkspace(ownerId: string, id: string) {
  const [w] = await sql`SELECT id FROM workspaces WHERE id = ${id} AND owner_id = ${ownerId}`;
  if (!w) throw notFound();
}

const uniqueName = (e: unknown) => (e as { code?: string }).code === "23505";

export const commands: Record<string, Handler> = {
  "workspace.create": async (owner, p) => {
    const name = str(p, "name");
    try {
      const [w] = await sql`INSERT INTO workspaces (owner_id, name, description, color)
        VALUES (${owner}, ${name}, ${str(p, "description", { max: 500, required: false })}, ${str(p, "color", { max: 16, required: false }) || "#2ee6c5"}) RETURNING id`;
      return { id: w.id };
    } catch (e) { if (uniqueName(e)) throw conflict("You already have a workspace with that name"); throw e; }
  },
  "workspace.update": async (owner, p) => {
    const id = uuid(p, "id");
    try {
      const r = await sql`UPDATE workspaces SET name = COALESCE(${str(p, "name", { required: false }) || null}, name),
          description = COALESCE(${typeof p.description === "string" ? p.description.slice(0, 500) : null}, description),
          color = COALESCE(${str(p, "color", { max: 16, required: false }) || null}, color), updated_at = now()
        WHERE id = ${id} AND owner_id = ${owner}`;
      if (!r.count) throw notFound();
      return { id };
    } catch (e) { if (uniqueName(e)) throw conflict("You already have a workspace with that name"); throw e; }
  },
  "workspace.delete": async (owner, p) => {
    const id = uuid(p, "id");
    const r = await sql`DELETE FROM workspaces WHERE id = ${id} AND owner_id = ${owner}`;
    if (!r.count) throw notFound();
    return { id };
  },
  "project.create": async (owner, p) => {
    const workspaceId = uuid(p, "workspaceId");
    await ownsWorkspace(owner, workspaceId);
    const state = p.state ?? { version: 1 };
    checkState(state);
    const [row] = await sql`INSERT INTO projects (workspace_id, owner_id, name, description, template, state, state_version)
      VALUES (${workspaceId}, ${owner}, ${str(p, "name")}, ${str(p, "description", { max: 1000, required: false })},
              ${str(p, "template", { max: 60, required: false }) || null}, ${sql.json(state as never)}, 1)
      RETURNING id, state_version, saved_at`;
    return { id: row.id, version: row.state_version, savedAt: row.saved_at };
  },
  /** "Save project": persists the whole working snapshot, guarded by optimistic concurrency. */
  "project.save": async (owner, p) => {
    const id = uuid(p, "id");
    checkState(p.state);
    const expected = Number(p.expectedVersion);
    const force = p.force === true;
    const name = str(p, "name", { required: false }) || null;
    const description = typeof p.description === "string" ? p.description.slice(0, 1000) : null;
    const [row] = await sql`UPDATE projects SET state = ${sql.json(p.state as never)}, state_version = state_version + 1, saved_at = now(),
        name = COALESCE(${name}, name), description = COALESCE(${description}, description)
      WHERE id = ${id} AND owner_id = ${owner} AND (${force} OR state_version = ${Number.isFinite(expected) ? expected : -1})
      RETURNING state_version, saved_at`;
    if (row) return { id, version: row.state_version, savedAt: row.saved_at };
    const [cur] = await sql`SELECT state_version FROM projects WHERE id = ${id} AND owner_id = ${owner}`;
    if (!cur) throw notFound();
    throw conflict(`This project was saved somewhere else (now version ${cur.state_version}, you loaded ${expected}). Reload it, or save again to overwrite.`);
  },
  "project.rename": async (owner, p) => {
    const id = uuid(p, "id");
    const r = await sql`UPDATE projects SET name = ${str(p, "name")} WHERE id = ${id} AND owner_id = ${owner}`;
    if (!r.count) throw notFound();
    return { id };
  },
  "project.setStatus": async (owner, p) => {
    const id = uuid(p, "id");
    const status = p.status === "archived" ? "archived" : p.status === "active" ? "active" : null;
    if (!status) throw badRequest("status must be active or archived");
    const r = await sql`UPDATE projects SET status = ${status} WHERE id = ${id} AND owner_id = ${owner}`;
    if (!r.count) throw notFound();
    return { id, status };
  },
  "project.move": async (owner, p) => {
    const id = uuid(p, "id");
    const workspaceId = uuid(p, "workspaceId");
    await ownsWorkspace(owner, workspaceId);
    const r = await sql`UPDATE projects SET workspace_id = ${workspaceId} WHERE id = ${id} AND owner_id = ${owner}`;
    if (!r.count) throw notFound();
    return { id, workspaceId };
  },
  "project.delete": async (owner, p) => {
    const id = uuid(p, "id");
    const r = await sql`DELETE FROM projects WHERE id = ${id} AND owner_id = ${owner}`;
    if (!r.count) throw notFound();
    return { id };
  },
  /** "Save run": stores one batch test run and its step results. */
  "batch.saveRun": async (owner, p) => {
    const projectId = uuid(p, "projectId");
    const [proj] = await sql`SELECT id FROM projects WHERE id = ${projectId} AND owner_id = ${owner}`;
    if (!proj) throw notFound();
    const results = p.results;
    if (!Array.isArray(results) || !results.length) throw badRequest("results must be a non-empty array");
    if (results.length > 1000) throw badRequest("A run can hold at most 1000 step results");
    if (JSON.stringify(results).length > 2 * 1024 * 1024) throw badRequest("Run results are larger than 2 MB");
    const count = (s: string) => results.filter((r) => (r as { status?: string }).status === s).length;
    const started = new Date(String(p.startedAt)), finished = new Date(String(p.finishedAt));
    if (Number.isNaN(started.getTime()) || Number.isNaN(finished.getTime())) throw badRequest("startedAt/finishedAt must be ISO dates");
    const [row] = await sql`INSERT INTO batch_runs (project_id, owner_id, scenario_name, started_at, finished_at, total, passed, failed, errored, duration_ms, results)
      VALUES (${projectId}, ${owner}, ${str(p, "scenarioName")}, ${started}, ${finished}, ${results.length}, ${count("pass")}, ${count("fail")}, ${count("error")},
              ${Math.max(0, finished.getTime() - started.getTime())}, ${sql.json(results as never)}) RETURNING id`;
    return { id: row.id };
  },
  "batch.deleteRun": async (owner, p) => {
    const id = uuid(p, "id");
    const r = await sql`DELETE FROM batch_runs WHERE id = ${id} AND owner_id = ${owner}`;
    if (!r.count) throw notFound();
    return { id };
  },
};
