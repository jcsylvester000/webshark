/** GET /api/queries/projects?workspaceId=&status=active|archived|all&q=&tag=&stage=&sort=saved|name|created&recent=N — summaries, no state. */
import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/server/auth";
import { listProjects } from "@/server/cqrs/queries";
import { handle, badRequest } from "@/server/http";
import { isUuid } from "@/server/validate";

export const GET = handle(async (req: NextRequest) => {
  const u = await requireUser(req);
  const q = req.nextUrl.searchParams;
  const workspaceId = q.get("workspaceId") ?? undefined;
  if (workspaceId && !isUuid(workspaceId)) throw badRequest("workspaceId must be a valid id");
  const recent = q.get("recent") ? Math.min(Math.max(Number(q.get("recent")) || 10, 1), 100) : undefined;
  return NextResponse.json(await listProjects(u.id, {
    workspaceId, status: q.get("status") ?? "active", recent,
    q: q.get("q")?.slice(0, 100), tag: q.get("tag")?.slice(0, 32), stage: q.get("stage") ?? undefined, sort: q.get("sort") ?? undefined,
  }));
});
