/** GET /api/queries/projects/{id}/shares */
import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/server/auth";
import { listShares } from "@/server/cqrs/queries";
import { handle, notFound } from "@/server/http";
import { isUuid } from "@/server/validate";

export const GET = handle(async (req: NextRequest, ctx: RouteContext<"/api/queries/projects/[id]/shares">) => {
  const u = await requireUser(req);
  const { id } = await ctx.params;
  if (!isUuid(id)) throw notFound();
  return NextResponse.json(await listShares(u.id, id));
});
