/** POST /api/tools/dns — A/AAAA (and CNAME/MX/TXT/NS when available) lookup. */
import { lookup, resolve4, resolve6, resolveCname, resolveMx, resolveNs, resolveTxt } from "node:dns/promises";
import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/server/auth";
import { badRequest, handle, readJson } from "@/server/http";
import { extractHost } from "@/server/tools/target";

const safe = <T,>(p: Promise<T>) => p.catch(() => null);

export const POST = handle(async (req: NextRequest) => {
  await requireUser(req);
  const host = extractHost((await readJson<{ host: string }>(req)).host);
  const t = performance.now();
  const [a, aaaa, cname, mx, ns, txt] = await Promise.all([safe(resolve4(host)), safe(resolve6(host)), safe(resolveCname(host)), safe(resolveMx(host)), safe(resolveNs(host)), safe(resolveTxt(host))]);
  let v4 = a ?? [], v6 = aaaa ?? [];
  if (!v4.length && !v6.length) {
    // Fall back to the OS resolver (hosts file, mDNS) for names like `localhost`.
    const sys = await safe(lookup(host, { all: true }));
    v4 = (sys ?? []).filter((x) => x.family === 4).map((x) => x.address);
    v6 = (sys ?? []).filter((x) => x.family === 6).map((x) => x.address);
  }
  if (!v4.length && !v6.length && !cname?.length) throw badRequest(`Could not resolve ${host}`);
  return NextResponse.json({
    host, a: [...new Set(v4)], aaaa: [...new Set(v6)], cname: cname ?? [], mx: (mx ?? []).map((m) => `${m.priority} ${m.exchange}`), ns: ns ?? [],
    txt: (txt ?? []).map((x) => x.join("")), time_ms: Math.round((performance.now() - t) * 100) / 100,
  });
});
