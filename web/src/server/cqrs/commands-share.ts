/** COMMANDS: read-only share links (optional password, expiry, revoke). */
import "server-only";
import { hashPassword, hashToken, newToken } from "../auth";
import { sql } from "../db";
import { badRequest, notFound } from "../http";
import { isUuid } from "../validate";
import type { Handler } from "./types";

export const shareCommands: Record<string, Handler> = {
  "share.create": async (ctx, p) => {
    const projectId = String(p.projectId ?? "");
    if (!isUuid(projectId)) throw badRequest("projectId must be a valid id");
    const [proj] = await sql`SELECT id FROM projects WHERE id = ${projectId} AND owner_id = ${ctx.userId}`;
    if (!proj) throw notFound();
    const password = typeof p.password === "string" ? p.password : "";
    if (password && password.length < 6) throw badRequest("Share passwords must be at least 6 characters");
    const days = p.expiresInDays === null || p.expiresInDays === undefined ? null : Number(p.expiresInDays);
    if (days !== null && ![1, 7, 30, 90].includes(days)) throw badRequest("expiresInDays must be 1, 7, 30, 90 or null");
    const token = newToken().slice(0, 40);
    const [row] = await sql`INSERT INTO share_links (token_hash, project_id, owner_id, label, password_hash, include_notes, include_runs, include_api_docs, expires_at)
      VALUES (${hashToken(token)}, ${projectId}, ${ctx.userId}, ${String(p.label ?? "").trim().slice(0, 80)}, ${password ? await hashPassword(password) : null},
              ${p.includeNotes !== false}, ${p.includeRuns !== false}, ${p.includeApiDocs !== false}, ${days === null ? null : sql`now() + make_interval(days => ${days})`})
      RETURNING id, expires_at`;
    // The raw token is returned once; only its hash is stored.
    return { id: row.id, token, path: `/share/${token}`, expiresAt: row.expires_at };
  },
  "share.revoke": async (ctx, p) => {
    const id = String(p.id ?? "");
    if (!isUuid(id)) throw badRequest("id must be a valid id");
    const r = await sql`UPDATE share_links SET revoked_at = now() WHERE id = ${id} AND owner_id = ${ctx.userId} AND revoked_at IS NULL`;
    if (!r.count) throw notFound();
    return { id };
  },
};
