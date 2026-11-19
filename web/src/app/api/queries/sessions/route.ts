/** GET /api/queries/sessions — active sign-in sessions (current one flagged). */
import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/server/auth";
import { listSessions } from "@/server/cqrs/queries";
import { handle } from "@/server/http";

export const GET = handle(async (req: NextRequest) => {
  const u = await requireUser(req);
  return NextResponse.json(await listSessions(u.id, u.sessionHash));
});
