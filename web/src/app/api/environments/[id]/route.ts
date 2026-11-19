/** GET / PUT / DELETE /api/environments/{id} — owner-scoped canvas document. */
import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/server/auth";
import { sql } from "@/server/db";
import { handle, notFound, readJson } from "@/server/http";
import { checkCanvas, isUuid } from "@/server/validate";

type Ctx = RouteContext<"/api/environments/[id]">;

export const GET = handle(async (req: NextRequest, ctx: Ctx) => {
  const u = await requireUser(req);
  const { id } = await ctx.params;
  if (!isUuid(id)) throw notFound();
  const [row] = await sql`SELECT id, name, description, template, canvas, created_at, updated_at FROM environments WHERE id = ${id} AND owner_id = ${u.id}`;
  if (!row) throw notFound();
  return NextResponse.json(row);
});

export const PUT = handle(async (req: NextRequest, ctx: Ctx) => {
  const u = await requireUser(req);
  const { id } = await ctx.params;
  if (!isUuid(id)) throw notFound();
  const b = await readJson<{ name?: string; description?: string; template?: string; canvas?: unknown }>(req);
  if (b.canvas !== undefined) checkCanvas(b.canvas);
  const [row] = await sql`UPDATE environments SET
      name = COALESCE(${b.name?.trim() || null}, name), description = COALESCE(${b.description ?? null}, description),
      template = COALESCE(${b.template ?? null}, template),
      canvas = COALESCE(${b.canvas === undefined ? null : sql.json(b.canvas as never)}, canvas), updated_at = now()
    WHERE id = ${id} AND owner_id = ${u.id}
    RETURNING id, name, description, template, canvas, created_at, updated_at`;
  if (!row) throw notFound();
  return NextResponse.json(row);
});

export const DELETE = handle(async (req: NextRequest, ctx: Ctx) => {
  const u = await requireUser(req);
  const { id } = await ctx.params;
  if (!isUuid(id)) throw notFound();
  const r = await sql`DELETE FROM environments WHERE id = ${id} AND owner_id = ${u.id}`;
  if (!r.count) throw notFound();
  return NextResponse.json({ ok: true });
});
