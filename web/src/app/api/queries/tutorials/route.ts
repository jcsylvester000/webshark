/** GET /api/queries/tutorials — the signed-in user's tutorial progress. */
import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/server/auth";
import { listTutorialProgress } from "@/server/cqrs/queries";
import { handle } from "@/server/http";

export const GET = handle(async (req: NextRequest) => {
  const u = await requireUser(req);
  return NextResponse.json(await listTutorialProgress(u.id));
});
