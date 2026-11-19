/** GET /api/queries/projects/{id}/versions */
import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/server/auth";
import { getProject, listVersions } from "@/server/cqrs/queries";
import { handle, notFound } from "@/server/http";
import { isUuid } from "@/server/validate";

export const GET = handle(async (req: NextRequest, ctx: RouteContext<"/api/queries/projects/[id]/versions">) => {
  const u = await requireUser(req);
  const { id } = await ctx.params;
  if (!isUuid(id)) throw notFound();
  await getProject(u.id, id); // 404 unless the caller owns the project
  return NextResponse.json(await listVersions(u.id, id));
});
