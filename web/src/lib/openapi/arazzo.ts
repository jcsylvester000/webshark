/**
 * Arazzo 1.0 ↔ batch tests. Arazzo (OpenAPI Initiative) describes ordered API calls with success
 * criteria. HTTP steps that match an operation in the project's OpenAPI document become real Arazzo
 * steps (operationId + parameters + successCriteria). Steps Arazzo can't express (DNS, ping, port
 * scan, audit, unmatched URLs) are kept losslessly in an `x-slyshark-step` extension.
 */
import { uid, type Scenario, type Step } from "../batch";
import { fileSlug } from "../export";
import { serverUrl } from "./request";
import { allParams, effectiveSecurity, exampleFor, deref, ops } from "./spec";
import type { OpenApiDoc, OpRef } from "./types";

type Criterion = { condition: string; context?: string; type?: "simple" | "regex" };
type ArazzoStep = { stepId: string; description?: string; operationId?: string; parameters?: { name: string; in: string; value: unknown }[]; successCriteria?: Criterion[]; "x-slyshark-step"?: Step };
type Workflow = { workflowId: string; summary?: string; description?: string; steps: ArazzoStep[]; "x-slyshark"?: { stopOnFail: boolean; concurrency: number } };
export type ArazzoDoc = { arazzo: string; info: { title: string; version: string; summary?: string; description?: string }; sourceDescriptions: { name: string; url: string; type: "openapi" | "arazzo" }[]; workflows: Workflow[] };

const SOURCE = "api";
const slugId = (s: string, used: Set<string>) => { const base = s.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "step"; let id = base, n = 2; while (used.has(id)) id = `${base}-${n++}`; used.add(id); return id; };

/** Finds the documented operation for a concrete URL + method. */
export function matchOperation(doc: OpenApiDoc, method: string, url: string): { o: OpRef; pathValues: Record<string, string>; query: [string, string][] } | null {
  let u: URL; try { u = new URL(url.includes("://") ? url : `https://${url}`); } catch { return null; }
  const servers = (doc.servers ?? []).map((s) => serverUrl(s)).filter((s) => /^https?:\/\//.test(s));
  for (const o of ops(doc)) {
    if (o.method !== method.toLowerCase()) continue;
    for (const base of [...(o.op.servers ?? []).map(serverUrl), ...servers]) {
      let b: URL; try { b = new URL(base); } catch { continue; }
      if (b.origin !== u.origin) continue;
      const prefix = b.pathname.replace(/\/$/, "");
      if (!u.pathname.startsWith(prefix)) continue;
      const rest = u.pathname.slice(prefix.length) || "/";
      const names: string[] = [];
      const re = new RegExp(`^${o.path.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\\?\{([^}]+)\\?\}/g, (_m, n) => { names.push(n); return "([^/]+)"; })}/?$`);
      const m = re.exec(rest);
      if (m) return { o, pathValues: Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(m[i + 1])])), query: [...u.searchParams.entries()] };
    }
  }
  return null;
}

function criteria(expect?: string): Criterion[] {
  const parts = (expect ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (!parts.length) return [];
  if (parts.length === 1 && /^\d{3}$/.test(parts[0])) return [{ condition: `$statusCode == ${parts[0]}` }];
  const alt = parts.map((p) => (/^\dxx$/.test(p) ? `${p[0]}\\d\\d` : p.replace(/\D/g, ""))).filter(Boolean).join("|");
  return [{ context: "$statusCode", condition: `^(${alt})$`, type: "regex" }];
}
function expectFrom(c: Criterion[] | undefined): string {
  for (const x of c ?? []) {
    const eq = /^\$statusCode\s*==\s*(\d{3})$/.exec(x.condition.trim());
    if (eq) return eq[1];
    if (x.context === "$statusCode" && x.type === "regex") return x.condition.replace(/^\^\(?|\)?\$$/g, "").split("|").map((p) => p.replace(/^(\d)\\d\\d$/, "$1xx")).join(",");
  }
  return "2xx";
}

export function toArazzo(scenarios: Scenario[], doc: OpenApiDoc | null, title: string): { doc: ArazzoDoc; linked: number; extension: number } {
  let linked = 0, extension = 0;
  const wfIds = new Set<string>();
  const workflows = scenarios.map((sc): Workflow => {
    const used = new Set<string>();
    const steps = sc.steps.map((st): ArazzoStep => {
      const base: ArazzoStep = { stepId: slugId(st.name || st.type, used), description: st.name || undefined, "x-slyshark-step": st };
      const m = st.type === "http" && doc ? matchOperation(doc, st.method || "GET", st.target) : null;
      if (!m || !m.o.op.operationId) { extension++; return base; }
      linked++;
      const parameters = [...Object.entries(m.pathValues).map(([name, value]) => ({ name, in: "path", value })), ...m.query.map(([name, value]) => ({ name, in: "query", value }))];
      return { ...base, operationId: `$sourceDescriptions.${SOURCE}.${m.o.op.operationId}`, ...(parameters.length ? { parameters } : {}), successCriteria: criteria(st.expectStatus) };
    });
    return { workflowId: slugId(fileSlug(sc.name), wfIds), summary: sc.name, ...(sc.description ? { description: sc.description } : {}), steps, "x-slyshark": { stopOnFail: sc.stopOnFail, concurrency: sc.concurrency } };
  });
  return { doc: { arazzo: "1.0.1", info: { title: `${title} test workflows`, version: "1.0.0", description: "Exported from Slyshark batch tests." }, sourceDescriptions: doc ? [{ name: SOURCE, url: "./openapi.yaml", type: "openapi" }] : [], workflows }, linked, extension };
}

export function fromArazzo(raw: unknown, doc: OpenApiDoc | null): { scenarios: Scenario[]; skipped: string[] } {
  const a = raw as Partial<ArazzoDoc>;
  if (!a || typeof a !== "object" || typeof a.arazzo !== "string" || !Array.isArray(a.workflows)) throw new Error("This isn't an Arazzo document (it needs `arazzo` and `workflows`).");
  const skipped: string[] = [];
  const byOpId = new Map(ops(doc).filter((o) => o.op.operationId).map((o) => [o.op.operationId!, o]));
  const scenarios = a.workflows.map((w): Scenario => {
    const steps: Step[] = [];
    for (const s of w.steps ?? []) {
      const ext = s["x-slyshark-step"];
      if (ext && typeof ext === "object") { steps.push({ ...ext, id: uid() }); continue; }
      const opId = s.operationId?.split(".").pop();
      const o = opId ? byOpId.get(opId) : undefined;
      if (!o || !doc) { skipped.push(`${w.workflowId} → ${s.stepId}: ${s.operationId ? `operation ${s.operationId} isn't in your API docs` : "only operationId steps can be imported"}`); continue; }
      const vals = Object.fromEntries((s.parameters ?? []).map((p) => [`${p.in}:${p.name}`, String(p.value)]));
      let path = o.path;
      for (const p of allParams(doc, o).filter((p) => p.in === "path")) path = path.replace(`{${p.name}}`, encodeURIComponent(vals[`path:${p.name}`] ?? String(exampleFor(doc, p.schema) ?? p.name)));
      const qs = (s.parameters ?? []).filter((p) => p.in === "query").map((p) => `${encodeURIComponent(p.name)}=${encodeURIComponent(String(p.value))}`).join("&");
      const server = (o.op.servers ?? doc.servers ?? [])[0];
      steps.push({ id: uid(), name: s.description || o.op.summary || s.stepId, type: "http", target: `${server ? serverUrl(server) : ""}${path}${qs ? `?${qs}` : ""}`, enabled: true, method: o.method.toUpperCase(), expectStatus: expectFrom(s.successCriteria) });
    }
    const x = w["x-slyshark"];
    return { id: uid(), name: w.summary || w.workflowId, description: w.description ?? "Imported from Arazzo", steps, stopOnFail: x?.stopOnFail ?? false, concurrency: x?.concurrency ?? 2 };
  });
  return { scenarios, skipped };
}

/** API smoke + access-control scenario generated from the API docs. */
export function scenarioFromSpec(doc: OpenApiDoc, name: string): { scenario: Scenario; skipped: string[] } {
  const steps: Step[] = [], skipped: string[] = [];
  const origins = new Set<string>();
  for (const o of ops(doc)) {
    if (o.method !== "get") continue;
    const server = (o.op.servers ?? doc.servers ?? [])[0];
    if (!server || !/^https?:\/\//.test(serverUrl(server))) { skipped.push(`${o.key}: no full server URL`); continue; }
    let path = o.path, missing = false;
    const query: string[] = [];
    for (const p of allParams(doc, o)) {
      const v = p.example ?? deref(doc, p.schema)?.example ?? deref(doc, p.schema)?.default;
      if (p.in === "path") { if (v === undefined) { missing = true; break; } path = path.replace(`{${p.name}}`, encodeURIComponent(String(v))); }
      else if (p.in === "query" && p.required) { if (v === undefined) { missing = true; break; } query.push(`${encodeURIComponent(p.name)}=${encodeURIComponent(String(v))}`); }
      else if (p.required) { missing = true; break; }
    }
    if (missing) { skipped.push(`${o.key}: a required parameter has no example`); continue; }
    const url = `${serverUrl(server)}${path}${query.length ? `?${query.join("&")}` : ""}`;
    origins.add(new URL(url).origin);
    const ok = Object.keys(o.op.responses ?? {}).filter((c) => /^2(\d\d|XX)$/.test(c)).map((c) => c.toLowerCase()).join(",") || "2xx";
    const sec = effectiveSecurity(doc, o.op);
    const protectedOp = sec.reqs.length > 0 && sec.reqs.every((r) => Object.keys(r).length > 0);
    if (protectedOp) steps.push({ id: uid(), name: `${o.op.summary || o.key}: rejects missing credentials`, type: "http", target: url, enabled: true, method: "GET", expectStatus: "401,403" });
    else steps.push({ id: uid(), name: `${o.op.summary || o.key}: responds as documented`, type: "http", target: url, enabled: true, method: "GET", expectStatus: ok, maxMs: 3000 });
  }
  for (const origin of origins) steps.push({ id: uid(), name: `${new URL(origin).host}: security headers`, type: "audit", target: origin, enabled: true, minScore: 60, noHigh: true });
  return { scenario: { id: uid(), name, description: "Generated from the API docs: public GET endpoints should answer as documented; protected ones should refuse requests without credentials.", steps, stopOnFail: false, concurrency: 2 }, skipped };
}
