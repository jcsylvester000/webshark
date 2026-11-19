/**
 * Public, read-only share links. A visitor holding the link (and password, if set) can view the
 * project's last SAVED snapshot: diagram, inventory, notes and saved test runs (optional).
 * API requests, variables, tokens and scanner settings are never exposed.
 */
import "server-only";
import { createHash } from "node:crypto";
import { hashToken, verifyPassword } from "./auth";
import { sql } from "./db";
import { AppError, notFound } from "./http";

export type ShareRow = { id: string; project_id: string; label: string; password_hash: string | null; include_notes: boolean; include_runs: boolean; include_api_docs: boolean; expires_at: Date | null; revoked_at: Date | null; failed_attempts: number; locked_until: Date | null };

export const unlockCookie = (shareId: string) => `sly_share_${shareId.replace(/-/g, "")}`;
export const unlockValue = (s: ShareRow) => createHash("sha256").update(`${s.id}:${s.password_hash}`).digest("hex");

export async function findShare(token: string): Promise<ShareRow> {
  if (!/^[a-f0-9]{20,64}$/.test(token)) throw notFound();
  const [s] = await sql<ShareRow[]>`SELECT id, project_id, label, password_hash, include_notes, include_runs, include_api_docs, expires_at, revoked_at, failed_attempts, locked_until
                                    FROM share_links WHERE token_hash = ${hashToken(token)}`;
  if (!s) throw notFound();
  if (s.revoked_at) throw new AppError(410, "revoked", "This link has been turned off by its owner.");
  if (s.expires_at && s.expires_at < new Date()) throw new AppError(410, "expired", "This link has expired. Ask the owner for a new one.");
  return s;
}

export async function tryUnlock(s: ShareRow, password: string): Promise<boolean> {
  if (!s.password_hash) return true;
  if (s.locked_until && s.locked_until > new Date()) throw new AppError(429, "locked", "Too many wrong passwords. Try again in 15 minutes.");
  if (await verifyPassword(password, s.password_hash)) {
    await sql`UPDATE share_links SET failed_attempts = 0, locked_until = NULL WHERE id = ${s.id}`;
    return true;
  }
  await sql`UPDATE share_links SET failed_attempts = CASE WHEN failed_attempts + 1 >= 10 THEN 0 ELSE failed_attempts + 1 END,
            locked_until = CASE WHEN failed_attempts + 1 >= 10 THEN now() + interval '15 minutes' ELSE locked_until END WHERE id = ${s.id}`;
  return false;
}

export async function shareContent(s: ShareRow) {
  const [p] = await sql`SELECT p.name, p.description, p.tags, p.stage, p.saved_at, p.state_version, p.state->'canvas' AS canvas,
                               CASE WHEN ${s.include_notes} THEN p.state->>'notes' ELSE NULL END AS notes,
                               CASE WHEN ${s.include_api_docs} THEN p.state->'docs'->'api'->'spec' ELSE NULL END AS api_spec, u.display_name, u.username
                        FROM projects p JOIN users u ON u.id = p.owner_id WHERE p.id = ${s.project_id}`;
  if (!p) throw notFound();
  const runs = s.include_runs
    ? await sql`SELECT id, scenario_name, started_at, finished_at, total, passed, failed, errored, duration_ms, results
                FROM batch_runs WHERE project_id = ${s.project_id} ORDER BY created_at DESC LIMIT 20`
    : [];
  await sql`UPDATE share_links SET view_count = view_count + 1, last_viewed_at = now() WHERE id = ${s.id}`;
  return {
    label: s.label, project: { name: p.name, description: p.description, tags: p.tags, stage: p.stage, savedAt: p.saved_at, version: p.state_version, owner: p.display_name ?? p.username },
    canvas: p.canvas ?? { nodes: [], edges: [] }, notes: p.notes, apiSpec: p.api_spec ?? null, runs,
  };
}
