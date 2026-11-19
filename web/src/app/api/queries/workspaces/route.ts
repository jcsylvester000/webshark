/** GET /api/queries/workspaces — workspace summaries with project counts (read model). */
import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/server/auth";
import { listWorkspaces } from "@/server/cqrs/queries";
import { handle } from "@/server/http";

export const GET = handle(async (req: NextRequest) => NextResponse.json(await listWorkspaces((await requireUser(req)).id)));
