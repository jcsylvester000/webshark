/**
 * COMMAND side (CQRS). The only code that writes workspaces, projects and batch runs.
 * Each command validates its payload, enforces ownership, and returns a small result
 * (ids/versions), never a read model. Dispatched by POST /api/commands/{name}.
 */
import "server-only";
import { sql } from "../db";
import { badRequest, conflict, notFound } from "../http";
import { isUuid } from "../validate";

import { accountCommands } from "./commands-account";
import { shareCommands } from "./commands-share";
import { tutorialCommands } from "./commands-tutorials";
import type { Handler as CtxHandler, Payload } from "./types";

type Handler = (ownerId: string, p: Payload) => Promise<Record<string, unknown>>;
const STAGES = ["none", "production", "staging", "development", "lab", "learning"];
const KEEP_VERSIONS = 10;

function tagsOf(v: unknown): string[] {
  const raw = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [];
  const out = [...new Set(raw.map((t) => String(t).trim().toLowerCase().replace(/\s+/g, "-").slice(0, 32)).filter(Boolean))];
  if (out.length > 12) throw badRequest("A project can have at most 12 tags");
  return out;
}

async function recordVersion(tx: typeof sql, projectId: string, version: number, state: unknown, note: string) {
  await tx`INSERT INTO project_versions (project_id, version, state, note, saved_at)
           VALUES (${projectId}, ${version}, ${tx.json(state as never)}, ${note}, now()) ON CONFLICT (project_id, version) DO NOTHING`;
  await tx`DELETE FROM project_versions WHERE project_id = ${projectId} AND version <= ${version - KEEP_VERSIONS}`;
}

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

const projectCommands: Record<string, Handler> = {
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
    const stage = STAGES.includes(String(p.stage)) ? String(p.stage) : "none";
    const row = await sql.begin(async (tx) => {
      const [r] = await tx`INSERT INTO projects (workspace_id, owner_id, name, description, template, state, state_version, tags, stage, last_note)
        VALUES (${workspaceId}, ${owner}, ${str(p, "name")}, ${str(p, "description", { max: 1000, required: false })},
                ${str(p, "template", { max: 60, required: false }) || null}, ${tx.json(state as never)}, 1, ${tagsOf(p.tags)}, ${stage}, 'Project created')
        RETURNING id, state_version, saved_at`;
      await recordVersion(tx as unknown as typeof sql, r.id, 1, state, "Project created");
      return r;
    });
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
    const note = str(p, "note", { max: 200, required: false });
    const row = await sql.begin(async (tx) => {
      // Keep the outgoing version in history too (covers projects saved before history existed).
      await tx`INSERT INTO project_versions (project_id, version, state, note, saved_at)
               SELECT id, state_version, state, last_note, saved_at FROM projects WHERE id = ${id} AND owner_id = ${owner}
               ON CONFLICT (project_id, version) DO NOTHING`;
      const [r] = await tx`UPDATE projects SET state = ${tx.json(p.state as never)}, state_version = state_version + 1, saved_at = now(),
          name = COALESCE(${name}, name), description = COALESCE(${description}, description), last_note = ${note}
        WHERE id = ${id} AND owner_id = ${owner} AND (${force} OR state_version = ${Number.isFinite(expected) ? expected : -1})
        RETURNING state_version, saved_at`;
      if (r) await recordVersion(tx as unknown as typeof sql, id, r.state_version, p.state, note);
      return r;
    });
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
  /** Organization metadata (name, description, tags, stage, pin): saved from the details dialog. */
  "project.updateDetails": async (owner, p) => {
    const id = uuid(p, "id");
    const stage = p.stage === undefined ? null : STAGES.includes(String(p.stage)) ? String(p.stage) : null;
    if (p.stage !== undefined && stage === null) throw badRequest(`stage must be one of: ${STAGES.join(", ")}`);
    const r = await sql`UPDATE projects SET
        name = COALESCE(${p.name === undefined ? null : str(p, "name")}, name),
        description = COALESCE(${typeof p.description === "string" ? p.description.slice(0, 1000) : null}, description),
        tags = COALESCE(${p.tags === undefined ? null : tagsOf(p.tags)}, tags),
        stage = COALESCE(${stage}, stage),
        pinned = COALESCE(${typeof p.pinned === "boolean" ? p.pinned : null}, pinned)
      WHERE id = ${id} AND owner_id = ${owner}`;
    if (!r.count) throw notFound();
    return { id };
  },
  "project.duplicate": async (owner, p) => {
    const id = uuid(p, "id");
    const [src] = await sql`SELECT workspace_id, name, description, template, state, tags, stage FROM projects WHERE id = ${id} AND owner_id = ${owner}`;
    if (!src) throw notFound();
    const name = (str(p, "name", { required: false }) || `${src.name} (copy)`).slice(0, 120);
    const row = await sql.begin(async (tx) => {
      const [r] = await tx`INSERT INTO projects (workspace_id, owner_id, name, description, template, state, state_version, tags, stage, last_note)
        VALUES (${src.workspace_id}, ${owner}, ${name}, ${src.description}, ${src.template}, ${tx.json(src.state)}, 1, ${src.tags}, ${src.stage}, ${`Duplicated from "${src.name}"`}) RETURNING id`;
      await recordVersion(tx as unknown as typeof sql, r.id, 1, src.state, `Duplicated from "${src.name}"`);
      return r;
    });
    return { id: row.id };
  },
  "project.restoreVersion": async (owner, p) => {
    const id = uuid(p, "id");
    const version = Number(p.version);
    const [v] = await sql`SELECT v.state FROM project_versions v JOIN projects pr ON pr.id = v.project_id
                          WHERE v.project_id = ${id} AND pr.owner_id = ${owner} AND v.version = ${version}`;
    if (!v) throw notFound();
    const note = `Restored version ${version}`;
    const row = await sql.begin(async (tx) => {
      const [r] = await tx`UPDATE projects SET state = ${tx.json(v.state)}, state_version = state_version + 1, saved_at = now(), last_note = ${note}
                           WHERE id = ${id} AND owner_id = ${owner} RETURNING state_version, saved_at`;
      await recordVersion(tx as unknown as typeof sql, id, r.state_version, v.state, note);
      return r;
    });
    return { id, version: row.state_version, savedAt: row.saved_at };
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

const byOwner = (h: Handler): CtxHandler => (ctx, p) => h(ctx.userId, p);

/** Every command the bus can dispatch. */
export const commands: Record<string, CtxHandler> = {
  ...Object.fromEntries(Object.entries(projectCommands).map(([k, h]) => [k, byOwner(h)])),
  ...accountCommands,
  ...shareCommands,
  ...tutorialCommands,
};
