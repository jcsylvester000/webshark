/** GET /api/queries/projects/{id} — full saved snapshot; called only when a project is opened. */
import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/server/auth";
import { getProject } from "@/server/cqrs/queries";
import { handle, notFound } from "@/server/http";
import { isUuid } from "@/server/validate";

export const GET = handle(async (req: NextRequest, ctx: RouteContext<"/api/queries/projects/[id]">) => {
  const u = await requireUser(req);
  const { id } = await ctx.params;
  if (!isUuid(id)) throw notFound();
  return NextResponse.json(await getProject(u.id, id));
});
