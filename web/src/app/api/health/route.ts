/** GET /api/health — liveness + database check. */
import { NextResponse } from "next/server";
import { sql } from "@/server/db";

export async function GET() {
  try {
    await sql`SELECT 1`;
    return NextResponse.json({ status: "ok", service: "slyshark", database: "ok" });
  } catch {
    return NextResponse.json({ status: "degraded", service: "slyshark", database: "unreachable" }, { status: 503 });
  }
}
