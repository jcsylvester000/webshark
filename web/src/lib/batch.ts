/**
 * Batch testing engine. A scenario is an ordered list of steps (DNS, ping, port scan, HTTP,
 * audit), each with expectations. Steps run in the browser by calling the stateless tool
 * endpoints, so every request stays inside serverless time limits. Results stay in memory
 * until the user clicks "Save run" (command `batch.saveRun`).
 */
import { api, errMsg } from "./api";
import { scanPorts } from "./scan";
import type { AuditReport, HttpRequestSpec, HttpResponse, PingResponse } from "./types";

export type StepType = "dns" | "ping" | "portscan" | "http" | "audit";
export type Step = {
  id: string; name: string; type: StepType; target: string; enabled: boolean;
  port?: number; count?: number;
  ports?: string;
  method?: string; headers?: string; body?: string; bearer?: string; followRedirects?: boolean;
  expectResolves?: boolean; containsIp?: string;
  expectReachable?: boolean; maxMs?: number;
  expectOpen?: string; expectClosed?: string;
  expectStatus?: string; bodyContains?: string; headerPresent?: string;
  minScore?: number; noHigh?: boolean;
};
export type Scenario = { id: string; name: string; description: string; steps: Step[]; stopOnFail: boolean; concurrency: number };
export type Check = { label: string; ok: boolean; actual: string };
export type StepStatus = "pass" | "fail" | "error" | "skipped";
export type StepResult = { stepId: string; name: string; type: StepType; target: string; status: StepStatus; startedAt: string; durationMs: number; summary: string; checks: Check[]; error?: string };
export type BatchRun = { scenarioId: string; scenarioName: string; startedAt: string; finishedAt: string; results: StepResult[] };

export const uid = () => Math.random().toString(36).slice(2, 10);
export const STEP_LABEL: Record<StepType, string> = { dns: "DNS lookup", ping: "TCP ping", portscan: "Port scan", http: "HTTP request", audit: "Web audit" };

const portList = (s?: string) => (s ?? "").split(",").map((x) => Number(x.trim())).filter((n) => n > 0 && n < 65536);
function statusMatches(status: number, spec: string): boolean {
  return spec.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean).some((p) => (/^\dxx$/.test(p) ? Math.floor(status / 100) === Number(p[0]) : Number(p) === status));
}

async function runStep(step: Step, authorized: boolean): Promise<Omit<StepResult, "stepId" | "name" | "type" | "target" | "startedAt" | "durationMs">> {
  const checks: Check[] = [];
  let summary = "";
  switch (step.type) {
    case "dns": {
      try {
        const r = await api<{ a: string[]; aaaa: string[]; cname: string[] }>("/tools/dns", { method: "POST", json: { host: step.target } });
        const addrs = [...r.a, ...r.aaaa];
        summary = addrs.join(", ") || r.cname.join(", ");
        if (step.expectResolves !== false) checks.push({ label: "resolves", ok: addrs.length > 0, actual: `${addrs.length} address(es)` });
        if (step.containsIp) checks.push({ label: `includes ${step.containsIp}`, ok: addrs.includes(step.containsIp), actual: summary || "none" });
      } catch (e) {
        if (step.expectResolves === false) { checks.push({ label: "does not resolve", ok: true, actual: errMsg(e) }); summary = "not resolvable"; }
        else throw e;
      }
      break;
    }
    case "ping": {
      const r = await api<PingResponse>("/tools/ping", { method: "POST", json: { host: step.target, port: step.port ?? 443, count: step.count ?? 3 } });
      const reachable = r.received > 0;
      summary = `${r.received}/${r.sent} replies via TCP ${r.port}${r.avg_ms != null ? `, avg ${r.avg_ms} ms` : ""}`;
      checks.push({ label: step.expectReachable === false ? "unreachable" : "reachable", ok: step.expectReachable === false ? !reachable : reachable, actual: reachable ? "reachable" : "no reply" });
      if (step.maxMs && reachable) checks.push({ label: `avg ≤ ${step.maxMs} ms`, ok: (r.avg_ms ?? Infinity) <= step.maxMs, actual: `${r.avg_ms} ms` });
      break;
    }
    case "portscan": {
      if (!authorized) throw new Error("Port scans need the authorization confirmation");
      const r = await scanPorts(step.target, step.ports || "common");
      const open = new Set(r.open.map((p) => p.port));
      summary = `${r.scanned} scanned on ${r.address}; open: ${[...open].join(", ") || "none"}`;
      for (const p of portList(step.expectOpen)) checks.push({ label: `${p} open`, ok: open.has(p), actual: open.has(p) ? "open" : r.results.find((x) => x.port === p)?.state ?? "not scanned" });
      for (const p of portList(step.expectClosed)) checks.push({ label: `${p} closed`, ok: !open.has(p), actual: open.has(p) ? "open" : "closed/filtered" });
      break;
    }
    case "http": {
      const headers = (step.headers ?? "").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const i = l.indexOf(":"); return { key: l.slice(0, i).trim(), value: l.slice(i + 1).trim(), enabled: i > 0 }; });
      const body = step.body?.trim() ?? "";
      const spec: HttpRequestSpec = {
        method: step.method || "GET", url: step.target.includes("://") ? step.target : `https://${step.target}`, headers, params: [],
        auth: step.bearer ? { type: "bearer", token: step.bearer } : { type: "none" },
        body: body ? { mode: body.startsWith("{") || body.startsWith("[") ? "json" : "text", raw: body, fields: [] } : { mode: "none", raw: "", fields: [] },
        timeout_ms: 8000, follow_redirects: step.followRedirects !== false,
      };
      const r = await api<HttpResponse>("/tools/http", { method: "POST", json: spec });
      summary = `${r.status} ${r.status_text} in ${r.time_ms} ms (${r.size_bytes} B)`;
      checks.push({ label: `status ${step.expectStatus || "2xx"}`, ok: statusMatches(r.status, step.expectStatus || "2xx"), actual: String(r.status) });
      if (step.maxMs) checks.push({ label: `≤ ${step.maxMs} ms`, ok: r.time_ms <= step.maxMs, actual: `${r.time_ms} ms` });
      if (step.bodyContains) checks.push({ label: `body contains "${step.bodyContains}"`, ok: r.body.includes(step.bodyContains), actual: r.body.includes(step.bodyContains) ? "found" : "not found" });
      if (step.headerPresent) {
        const h = r.headers.find((x) => x.key.toLowerCase() === step.headerPresent!.toLowerCase());
        checks.push({ label: `header ${step.headerPresent}`, ok: !!h, actual: h?.value.slice(0, 80) ?? "missing" });
      }
      break;
    }
    case "audit": {
      if (!authorized) throw new Error("Audits need the authorization confirmation");
      const r = await api<AuditReport>("/tools/audit", { method: "POST", json: { url: step.target, authorized: true } });
      const high = r.findings.filter((f) => f.severity === "high");
      summary = `score ${r.score}/100, ${r.findings.filter((f) => !["pass", "info"].includes(f.severity)).length} issue(s)`;
      checks.push({ label: `score ≥ ${step.minScore ?? 70}`, ok: r.score >= (step.minScore ?? 70), actual: String(r.score) });
      if (step.noHigh !== false) checks.push({ label: "no high findings", ok: high.length === 0, actual: high.map((h) => h.title).join("; ") || "none" });
      break;
    }
  }
  return { status: checks.every((c) => c.ok) ? "pass" : "fail", summary, checks };
}

export async function runScenario(s: Scenario, opts: { authorized: boolean; onResult: (r: StepResult) => void; signal?: AbortSignal }): Promise<BatchRun> {
  const startedAt = new Date().toISOString();
  const steps = s.steps.filter((x) => x.enabled && x.target.trim());
  const results: StepResult[] = new Array(steps.length);
  let stop = false;
  let next = 0;
  async function worker() {
    while (next < steps.length) {
      const i = next++;
      const step = steps[i];
      const base = { stepId: step.id, name: step.name || STEP_LABEL[step.type], type: step.type, target: step.target, startedAt: new Date().toISOString() };
      if (stop || opts.signal?.aborted) {
        results[i] = { ...base, status: "skipped", durationMs: 0, summary: opts.signal?.aborted ? "cancelled" : "skipped after a failure", checks: [] };
      } else {
        const t = performance.now();
        try { results[i] = { ...base, ...(await runStep(step, opts.authorized)), durationMs: Math.round(performance.now() - t) }; }
        catch (e) { results[i] = { ...base, status: "error", durationMs: Math.round(performance.now() - t), summary: errMsg(e), checks: [], error: errMsg(e) }; }
        if (s.stopOnFail && results[i].status !== "pass") stop = true;
      }
      opts.onResult(results[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(s.concurrency || 1, 1), 4, steps.length || 1) }, worker));
  return { scenarioId: s.id, scenarioName: s.name, startedAt, finishedAt: new Date().toISOString(), results };
}

const st = (type: StepType, name: string, target: string, extra: Partial<Step> = {}): Step => ({ id: uid(), name, type, target, enabled: true, ...extra });

export const SCENARIO_TEMPLATES: { id: string; name: string; description: string; build: (target: string) => Step[] }[] = [
  {
    id: "website", name: "Website health & security", description: "DNS, HTTPS response, HTTP→HTTPS redirect, TCP reachability, exposed ports, header audit.",
    build: (t) => [
      st("dns", "Domain resolves", t),
      st("http", "HTTPS home page returns 2xx", `https://${t}/`, { expectStatus: "2xx", maxMs: 3000 }),
      st("http", "HTTP redirects to HTTPS", `http://${t}/`, { expectStatus: "301,302,307,308", followRedirects: false }),
      st("ping", "TCP 443 reachable", t, { port: 443, count: 3, maxMs: 500 }),
      st("portscan", "Web ports open", t, { ports: "80,443", expectOpen: "443" }),
      st("portscan", "Admin/database ports closed", t, { ports: "21,22,23,3306,3389,5432,6379,9200,27017", expectClosed: "21,23,3306,3389,5432,6379,9200,27017" }),
      st("audit", "Security headers audit", `https://${t}`, { minScore: 70, noHigh: true }),
    ],
  },
  {
    id: "api", name: "API smoke test", description: "Health endpoint, response time, JSON content type, auth rejection.",
    build: (t) => {
      const base = t.includes("://") ? t.replace(/\/$/, "") : `https://${t}`;
      return [
        st("http", "Health endpoint 200", `${base}/health`, { expectStatus: "200", maxMs: 1500 }),
        st("http", "Root responds", `${base}/`, { expectStatus: "2xx,3xx,4xx" }),
        st("http", "JSON content type", `${base}/health`, { headerPresent: "content-type" }),
        st("http", "Rejects bad token", `${base}/`, { bearer: "invalid-token", expectStatus: "401,403" }),
      ];
    },
  },
  {
    id: "exposure", name: "Exposure check", description: "Databases, caches, remote desktop, Docker API and file sharing must not be reachable.",
    build: (t) => [
      st("portscan", "Databases closed", t, { ports: "1433,1521,3306,5432,27017,9042", expectClosed: "1433,1521,3306,5432,27017,9042" }),
      st("portscan", "Caches/search closed", t, { ports: "6379,11211,9200", expectClosed: "6379,11211,9200" }),
      st("portscan", "Remote access closed", t, { ports: "23,3389,5900,2375", expectClosed: "23,3389,5900,2375" }),
      st("portscan", "File sharing closed", t, { ports: "135,139,445,2049", expectClosed: "135,139,445,2049" }),
    ],
  },
];
