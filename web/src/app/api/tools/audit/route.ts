/** POST /api/tools/audit — web security misconfiguration audit. */
import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/server/auth";
import { config } from "@/server/config";
import { badRequest, handle, readJson } from "@/server/http";
import { runAudit } from "@/server/tools/audit";

export const POST = handle(async (req: NextRequest) => {
  await requireUser(req);
  const b = await readJson<{ url: string; check_files?: boolean; authorized?: boolean }>(req);
  if (!b.authorized) throw badRequest("Confirm you own this site or have written permission to test it");
  if (!b.url?.trim()) throw badRequest("URL is required");
  const report = await runAudit(b.url.trim(), config.allowPrivateTargets, b.check_files !== false, config.toolBudgetMs);
  return NextResponse.json(report);
});
