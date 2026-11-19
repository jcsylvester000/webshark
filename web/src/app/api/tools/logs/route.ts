/** GET /api/tools/logs — the caller's last 200 tool runs (audit trail). */
import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/server/auth";
import { sql } from "@/server/db";
import { handle } from "@/server/http";

export const GET = handle(async (req: NextRequest) => {
  const u = await requireUser(req);
  return NextResponse.json(await sql`SELECT id, kind, target, summary, created_at FROM scan_logs WHERE user_id = ${u.id} ORDER BY created_at DESC LIMIT 200`);
});
