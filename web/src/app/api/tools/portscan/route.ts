/**
 * POST /api/tools/portscan — TCP connect scan of one batch of ports.
 * The web app splits large scans into batches (see lib/scan.ts) so each request stays within
 * the serverless time limit.
 */
import { NextResponse, type NextRequest } from "next/server";
import { parsePorts } from "@/lib/ports";
import { requireUser } from "@/server/auth";
import { config } from "@/server/config";
import { badRequest, handle, readJson } from "@/server/http";
import { scan } from "@/server/tools/portscan";
import { extractHost, resolveTarget } from "@/server/tools/target";

export const POST = handle(async (req: NextRequest) => {
  await requireUser(req);
  const b = await readJson<{ target: string; ports?: string; timeout_ms?: number; banners?: boolean; authorized?: boolean; batch?: { index: number; total: number } }>(req);
  if (!b.authorized) throw badRequest("Confirm you own this target or have written permission to scan it");
  const host = extractHost(b.target);
  const [ip] = await resolveTarget(host, config.allowPrivateTargets);
  let ports: number[];
  try { ports = parsePorts(b.ports ?? "common"); } catch (e) { throw badRequest((e as Error).message); }
  if (ports.length > config.maxScanPortsPerRequest) throw badRequest(`Too many ports in one request (${ports.length}); the limit is ${config.maxScanPortsPerRequest}. The web app splits scans automatically.`);
  const timeout = Math.min(Math.max(Number(b.timeout_ms) || 900, 200), 3000);
  const t = Date.now();
  const results = await scan(ip, ports, timeout, 200, b.banners !== false);
  const open = results.filter((r) => r.state === "open");
  return NextResponse.json({
    target: host, address: ip, scanned: ports.length, open,
    closed_count: results.filter((r) => r.state === "closed").length, filtered_count: results.filter((r) => r.state === "filtered").length,
    duration_ms: Date.now() - t, results,
  });
});
