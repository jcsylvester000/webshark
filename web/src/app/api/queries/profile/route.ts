/** GET /api/queries/profile — the signed-in user's profile, preferences and usage counts. */
import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/server/auth";
import { getProfile } from "@/server/cqrs/queries";
import { handle } from "@/server/http";

export const GET = handle(async (req: NextRequest) => {
  const u = await requireUser(req);
  return NextResponse.json(await getProfile(u.id));
});
