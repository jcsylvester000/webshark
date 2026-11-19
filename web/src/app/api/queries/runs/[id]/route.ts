/** GET /api/queries/runs/{id} — one saved batch run with all step results. */
import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/server/auth";
import { getRun } from "@/server/cqrs/queries";
import { handle, notFound } from "@/server/http";
import { isUuid } from "@/server/validate";

export const GET = handle(async (req: NextRequest, ctx: RouteContext<"/api/queries/runs/[id]">) => {
  const u = await requireUser(req);
  const { id } = await ctx.params;
  if (!isUuid(id)) throw notFound();
  return NextResponse.json(await getRun(u.id, id));
});
