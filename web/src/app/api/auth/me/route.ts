/** GET /api/auth/me — the signed-in user. */
import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/server/auth";
import { handle } from "@/server/http";
import { userJson } from "@/server/users";

export const GET = handle(async (req: NextRequest) => NextResponse.json(await userJson((await requireUser(req)).id)));
