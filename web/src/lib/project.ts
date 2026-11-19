/** Project snapshot model: everything a project needs to reopen exactly as it was left. */
import { nodeTarget } from "./nodes";
import { uid, type BatchRun, type Scenario, type Step } from "./batch";
import type { ApiDocState } from "./openapi/types";
import type { AuditReport, Canvas, HttpRequestSpec, KeyValue, ScanResponse } from "./types";

/** `sample` is the last response captured in the API client; it feeds examples in the API docs draft. */
export type ResponseSample = { status: number; statusText: string; contentType: string; body: string; at: string };
export type SavedRequest = { id: string; collection: string; name: string; request: HttpRequestSpec; sample?: ResponseSample };
export type ResultEntry = { id: string; at: string; tool: "ping" | "dns" | "portscan" | "http" | "audit"; target: string; ok: boolean; summary: string };

export type ProjectState = {
  version: 1;
  canvas: Canvas;
  api: { requests: SavedRequest[]; variables: KeyValue[]; draft: HttpRequestSpec | null };
  scanner: { target: string; ports: string; lastScan: ScanResponse | null; lastAudit: AuditReport | null };
  console: { history: string[] };
  batch: { scenarios: Scenario[]; activeScenarioId: string | null; lastRun: BatchRun | null };
  results: ResultEntry[];
  notes: string;
  /** Documentation authored in the Docs tab (OpenAPI for now). */
  docs: { api: ApiDocState };
};

export type ProjectMeta = { id: string; workspaceId: string | null; workspaceName: string; name: string; description: string; template: string | null; status: string; tags: string[]; stage: string; pinned: boolean };

export const MAX_RESULTS = 300;

export function emptyState(): ProjectState {
  return {
    version: 1,
    canvas: { nodes: [], edges: [], meta: {} },
    api: { requests: [], variables: [{ key: "baseUrl", value: "https://httpbin.org", enabled: true }], draft: null },
    scanner: { target: "", ports: "common", lastScan: null, lastAudit: null },
    console: { history: [] },
    batch: { scenarios: [], activeScenarioId: null, lastRun: null },
    results: [],
    notes: "",
    docs: { api: { spec: null, format: "yaml", updatedAt: null } },
  };
}

/** Fills defaults so snapshots saved by older versions (or partial ones) always load. */
export function normalizeState(raw: unknown): ProjectState {
  const s = (raw && typeof raw === "object" ? raw : {}) as Partial<ProjectState>;
  const e = emptyState();
  return {
    version: 1,
    canvas: { nodes: s.canvas?.nodes ?? [], edges: s.canvas?.edges ?? [], meta: s.canvas?.meta ?? {} },
    api: { ...e.api, ...s.api },
    scanner: { ...e.scanner, ...s.scanner },
    console: { history: s.console?.history ?? [] },
    batch: { ...e.batch, ...s.batch },
    results: s.results ?? [],
    notes: s.notes ?? "",
    docs: { api: { ...e.docs.api, ...s.docs?.api } },
  };
}

/** Builds a batch scenario from the canvas: reachability + documented ports per host, HTTP + audit per web app. */
export function scenarioFromCanvas(canvas: Canvas, name: string): Scenario {
  const steps: Step[] = [];
  for (const n of canvas.nodes) {
    const d = n.data;
    if (["note", "attacker", "vulnerability", "internet"].includes(d.kind)) continue;
    const target = nodeTarget(d);
    if (!target) continue;
    const ports = (d.ports ?? "").split(",").map((p) => p.trim()).filter((p) => /^\d+$/.test(p));
    steps.push({ id: uid(), name: `${d.label}: reachable`, type: "ping", target, enabled: true, port: Number(ports.includes("443") ? 443 : ports[0] ?? 443), count: 3 });
    if (ports.length) steps.push({ id: uid(), name: `${d.label}: documented ports open`, type: "portscan", target, enabled: true, ports: ports.join(","), expectOpen: ports.join(",") });
    if (d.url) {
      steps.push({ id: uid(), name: `${d.label}: responds`, type: "http", target: d.url, enabled: true, expectStatus: "2xx,3xx", maxMs: 3000 });
      steps.push({ id: uid(), name: `${d.label}: security audit`, type: "audit", target: d.url, enabled: true, minScore: 60, noHigh: true });
    }
  }
  return { id: uid(), name, description: "Generated from the environment canvas", steps, stopOnFail: false, concurrency: 2 };
}
