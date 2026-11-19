/** PUT / DELETE /api/requests/{id} */
import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/server/auth";
import { sql } from "@/server/db";
import { handle, notFound, readJson } from "@/server/http";
import { isUuid } from "@/server/validate";

type Ctx = RouteContext<"/api/requests/[id]">;

export const PUT = handle(async (req: NextRequest, ctx: Ctx) => {
  const u = await requireUser(req);
  const { id } = await ctx.params;
  if (!isUuid(id)) throw notFound();
  const b = await readJson<{ collection?: string; name?: string; request?: unknown }>(req);
  const [row] = await sql`UPDATE saved_requests SET collection = COALESCE(${b.collection ?? null}, collection),
      name = COALESCE(${b.name ?? null}, name), request = COALESCE(${b.request ? sql.json(b.request as never) : null}, request), updated_at = now()
    WHERE id = ${id} AND owner_id = ${u.id} RETURNING id, collection, name, request, updated_at`;
  if (!row) throw notFound();
  return NextResponse.json(row);
});

export const DELETE = handle(async (req: NextRequest, ctx: Ctx) => {
  const u = await requireUser(req);
  const { id } = await ctx.params;
  if (!isUuid(id)) throw notFound();
  const r = await sql`DELETE FROM saved_requests WHERE id = ${id} AND owner_id = ${u.id}`;
  if (!r.count) throw notFound();
  return NextResponse.json({ ok: true });
});
