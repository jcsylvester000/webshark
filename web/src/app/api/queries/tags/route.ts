/** GET /api/queries/tags — tags in use on active projects, with counts. */
import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/server/auth";
import { listTags } from "@/server/cqrs/queries";
import { handle } from "@/server/http";

export const GET = handle(async (req: NextRequest) => {
  const u = await requireUser(req);
  return NextResponse.json(await listTags(u.id));
});
