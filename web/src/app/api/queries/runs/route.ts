/** GET /api/queries/runs?projectId= — saved batch run summaries (no step results). */
import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/server/auth";
import { listRuns } from "@/server/cqrs/queries";
import { badRequest, handle } from "@/server/http";
import { isUuid } from "@/server/validate";

export const GET = handle(async (req: NextRequest) => {
  const u = await requireUser(req);
  const pid = req.nextUrl.searchParams.get("projectId") ?? undefined;
  if (pid && !isUuid(pid)) throw badRequest("projectId must be a valid id");
  return NextResponse.json(await listRuns(u.id, pid));
});
