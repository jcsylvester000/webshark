/** POST /api/tools/ping — TCP-connect ping (ICMP is not available on serverless hosts). */
import { NextResponse, type NextRequest } from "next/server";
import { logScan, requireUser } from "@/server/auth";
import { config } from "@/server/config";
import { handle, readJson } from "@/server/http";
import { summarize, tcpPing } from "@/server/tools/ping";
import { extractHost, resolveTarget } from "@/server/tools/target";

export const POST = handle(async (req: NextRequest) => {
  const u = await requireUser(req);
  const b = await readJson<{ host: string; port?: number; count?: number }>(req);
  const host = extractHost(b.host);
  const [ip] = await resolveTarget(host, config.allowPrivateTargets);
  const port = Number(b.port) > 0 && Number(b.port) < 65536 ? Number(b.port) : 443;
  const timeout = 1500;
  const maxCount = Math.max(1, Math.floor(config.toolBudgetMs / (timeout + 250)) - 1);
  const count = Math.min(Math.max(Number(b.count) || 4, 1), 10, maxCount);
  const result = summarize(host, ip, port, await tcpPing(ip, port, count, timeout));
  await logScan(u.id, "ping", host, { port, received: result.received, sent: result.sent });
  return NextResponse.json(result);
});
