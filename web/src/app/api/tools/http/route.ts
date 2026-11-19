/** POST /api/tools/http — execute a Postman-style request server-side (no browser CORS limits). */
import { NextResponse, type NextRequest } from "next/server";
import type { HttpRequestSpec } from "@/lib/types";
import { logScan, requireUser } from "@/server/auth";
import { config } from "@/server/config";
import { handle, readJson } from "@/server/http";
import { execute } from "@/server/tools/httpClient";

export const POST = handle(async (req: NextRequest) => {
  const u = await requireUser(req);
  const spec = await readJson<HttpRequestSpec>(req);
  const out = await execute(spec, config.allowPrivateTargets, config.toolBudgetMs);
  await logScan(u.id, "http", spec.url, { method: spec.method, status: out.status, ms: out.time_ms });
  return NextResponse.json(out);
});
