/**
 * Layout / architecture documentation generated from the diagram: overview, trust zones,
 * inventory, data flows, APIs (linked to OpenAPI operations and AsyncAPI channels) and a security
 * posture summary. The user adds an intro per section; exports go to Markdown, PDF and CSV.
 */
import type { Report } from "./export";
import { kindOf, nodeTarget } from "./nodes";
import { serverUrl } from "./openapi/request";
import { ops } from "./openapi/spec";
import type { OpenApiDoc } from "./openapi/types";
import { viewOf } from "./asyncapi";
import type { Canvas, CanvasNode } from "./types";

export const LAYOUT_SECTIONS = [
  { id: "overview", title: "Overview" }, { id: "zones", title: "Trust zones" }, { id: "inventory", title: "Inventory" },
  { id: "flows", title: "Data flows" }, { id: "apis", title: "APIs and events" }, { id: "security", title: "Security posture" },
] as const;
export type SectionId = (typeof LAYOUT_SECTIONS)[number]["id"];
export type LayoutSettings = { title: string; version: string; intro: Partial<Record<SectionId, string>>; include: Record<SectionId, boolean> };
export const emptyLayout = (): LayoutSettings => ({ title: "", version: "1.0", intro: {}, include: { overview: true, zones: true, inventory: true, flows: true, apis: true, security: true } });
export const normalizeLayout = (raw: Partial<LayoutSettings> | undefined): LayoutSettings => ({ ...emptyLayout(), ...raw, intro: { ...raw?.intro }, include: { ...emptyLayout().include, ...raw?.include } });

const SKIP = new Set(["note", "attacker", "vulnerability"]);
const API_KINDS = new Set(["api", "webapp", "serverless", "loadbalancer", "vercel", "netlify", "aws", "forge", "kubernetes", "container", "server"]);
const UNZONED = "Unzoned";
const zone = (n: CanvasNode) => (n.data.kind === "internet" ? "Internet" : n.data.zone?.trim() || UNZONED);
const origin = (u: string) => { try { return new URL(u.includes("://") ? u : `https://${u}`).origin; } catch { return null; } };

export type Flow = { id: string; from: string; to: string; fromZone: string; toZone: string; protocol: string; port: string; encrypted: boolean; crosses: boolean; label: string };
export type LayoutModel = {
  name: string; description: string; savedAt: string | null;
  components: CanvasNode[]; zones: { name: string; members: CanvasNode[]; inbound: number; outbound: number }[];
  flows: Flow[]; attackPaths: number;
  apis: { node: CanvasNode; url: string; operations: { method: string; path: string; summary: string }[] }[];
  channels: { node: CanvasNode; channels: string[] }[];
  posture: { high: number; medium: number; low: number; threats: number; score: number | null } | null;
};

export function layoutModel(input: { name: string; description: string; savedAt: string | null; canvas: Canvas; spec: OpenApiDoc | null; asyncSpec: Record<string, unknown> | null; posture: LayoutModel["posture"] }): LayoutModel {
  const { canvas, spec } = input;
  const byId = Object.fromEntries(canvas.nodes.map((n) => [n.id, n]));
  const components = canvas.nodes.filter((n) => !SKIP.has(n.data.kind));
  const flows: Flow[] = [];
  let attackPaths = 0;
  for (const e of canvas.edges) {
    const a = byId[e.source], b = byId[e.target];
    if (!a || !b) continue;
    if (e.data?.attack) { attackPaths++; continue; }
    const fz = zone(a), tz = zone(b);
    flows.push({ id: e.id, from: a.data.label, to: b.data.label, fromZone: fz, toZone: tz, protocol: String(e.data?.protocol ?? ""), port: String(e.data?.port ?? ""), encrypted: !!e.data?.encrypted, crosses: fz !== tz && fz !== UNZONED && tz !== UNZONED, label: String(e.data?.label ?? "") });
  }
  const zoneNames = [...new Set(components.map(zone))].sort((x, y) => (x === UNZONED ? 1 : y === UNZONED ? -1 : x.localeCompare(y)));
  const zones = zoneNames.map((name) => ({ name, members: components.filter((n) => zone(n) === name), inbound: flows.filter((f) => f.toZone === name && f.fromZone !== name).length, outbound: flows.filter((f) => f.fromZone === name && f.toZone !== name).length }));
  const opList = ops(spec);
  const apis = components.filter((n) => API_KINDS.has(n.data.kind) && n.data.url).map((n) => {
    const o = origin(n.data.url!);
    const operations = opList.filter((x) => x.op["x-slyshark-node"] === n.id || [...(x.op.servers ?? []), ...(spec?.servers ?? [])].some((s) => origin(serverUrl(s)) === o)).map((x) => ({ method: x.method.toUpperCase(), path: x.path, summary: x.op.summary ?? "" }));
    return { node: n, url: n.data.url!, operations };
  }).filter((a) => a.operations.length || a.node.data.kind === "api");
  let channels: LayoutModel["channels"] = [];
  if (input.asyncSpec) {
    const v = viewOf(input.asyncSpec);
    const k = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
    channels = components.filter((n) => ["queue", "cache"].includes(n.data.kind)).map((n) => ({ node: n, channels: v.channels.filter((c) => k(c.address).includes(k(n.data.label)) || k(c.id) === k(n.data.label)).map((c) => c.address) })).filter((c) => c.channels.length);
  }
  return { name: input.name, description: input.description, savedAt: input.savedAt, components, zones, flows, attackPaths, apis, channels, posture: input.posture };
}

const md = (s: unknown) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const target = (n: CanvasNode) => n.data.url || nodeTarget(n.data) || "";

export function layoutMarkdown(m: LayoutModel, s: LayoutSettings): string {
  const L = [`# ${s.title || `${m.name}: environment layout`}`, "", `_Version ${s.version || "1.0"} · generated by Slyshark on ${new Date().toISOString().slice(0, 10)}${m.savedAt ? ` · project saved ${m.savedAt.slice(0, 10)}` : ""}_`, ""];
  const sec = (id: SectionId, title: string) => { L.push(`## ${title}`, ""); if (s.intro[id]) L.push(s.intro[id]!, ""); };
  if (s.include.overview) {
    sec("overview", "Overview");
    if (m.description) L.push(m.description, "");
    L.push(`- **Components:** ${m.components.length} in ${m.zones.length} zone${m.zones.length === 1 ? "" : "s"}`, `- **Data flows:** ${m.flows.length} (${m.flows.filter((f) => f.crosses).length} cross a trust boundary, ${m.flows.filter((f) => !f.encrypted).length} not marked encrypted)`, `- **Documented attack paths:** ${m.attackPaths}`, "");
  }
  if (s.include.zones) {
    sec("zones", "Trust zones");
    L.push("| Zone | Components | Inbound flows | Outbound flows |", "|---|---|---|---|");
    for (const z of m.zones) L.push(`| ${md(z.name)} | ${md(z.members.map((n) => n.data.label).join(", "))} | ${z.inbound} | ${z.outbound} |`);
    L.push("");
  }
  if (s.include.inventory) {
    sec("inventory", "Inventory");
    for (const z of m.zones) {
      L.push(`### ${z.name}`, "", "| Component | Type | Host / URL | OS | Ports | Owner | Runbook |", "|---|---|---|---|---|---|---|");
      for (const n of z.members) L.push(`| ${md(n.data.label)} | ${md(kindOf(n.data.kind).label)} | ${md(target(n) || "-")} | ${md(n.data.os || "-")} | ${md(n.data.ports || "-")} | ${md(n.data.owner || "-")} | ${n.data.docsUrl ? `[link](${n.data.docsUrl})` : "-"} |`);
      L.push("");
    }
  }
  if (s.include.flows) {
    sec("flows", "Data flows");
    L.push("| From | To | Protocol | Port | Encrypted | Crosses boundary | Purpose |", "|---|---|---|---|---|---|---|");
    for (const f of m.flows) L.push(`| ${md(f.from)} (${md(f.fromZone)}) | ${md(f.to)} (${md(f.toZone)}) | ${md(f.protocol || "-")} | ${md(f.port || "-")} | ${f.encrypted ? "yes" : "**no**"} | ${f.crosses ? "yes" : "no"} | ${md(f.label || "-")} |`);
    L.push("");
  }
  if (s.include.apis) {
    sec("apis", "APIs and events");
    if (!m.apis.length && !m.channels.length) L.push("_No API components are linked to API docs yet._", "");
    for (const a of m.apis) { L.push(`### ${a.node.data.label} — \`${a.url}\``, ""); if (a.operations.length) for (const o of a.operations) L.push(`- \`${o.method} ${o.path}\` ${o.summary}`); else L.push("_No endpoints documented for this URL._"); L.push(""); }
    for (const c of m.channels) L.push(`- **${c.node.data.label}** channels: ${c.channels.map((x) => `\`${x}\``).join(", ")}`);
    if (m.channels.length) L.push("");
  }
  if (s.include.security && m.posture) {
    sec("security", "Security posture");
    L.push(`- **Risk score:** ${m.posture.score ?? "-"}/100`, `- **Open findings:** ${m.posture.high} high, ${m.posture.medium} medium, ${m.posture.low} low`, `- **Threats in the threat model:** ${m.posture.threats}`, "", "_See the security assessment report for details._", "");
  }
  return L.join("\n");
}

export function layoutReport(m: LayoutModel, s: LayoutSettings): Report {
  const sections: Report["sections"] = [];
  if (s.include.zones) sections.push({ heading: "Trust zones", note: s.intro.zones, columns: [{ key: "name", label: "Zone" }, { key: "members", label: "Components", value: (z) => z.members.map((n: CanvasNode) => n.data.label).join(", ") }, { key: "inbound", label: "Inbound" }, { key: "outbound", label: "Outbound" }], rows: m.zones });
  if (s.include.inventory) sections.push({ heading: "Inventory", note: s.intro.inventory, columns: [{ key: "zone", label: "Zone" }, { key: "label", label: "Component" }, { key: "type", label: "Type" }, { key: "target", label: "Host / URL" }, { key: "os", label: "OS" }, { key: "ports", label: "Ports" }, { key: "owner", label: "Owner" }, { key: "docs", label: "Runbook" }], rows: m.zones.flatMap((z) => z.members.map((n) => ({ zone: z.name, label: n.data.label, type: kindOf(n.data.kind).label, target: target(n), os: n.data.os ?? "", ports: n.data.ports ?? "", owner: n.data.owner ?? "", docs: n.data.docsUrl ?? "" }))) });
  if (s.include.flows) sections.push({ heading: "Data flows", note: s.intro.flows, columns: [{ key: "from", label: "From" }, { key: "fromZone", label: "From zone" }, { key: "to", label: "To" }, { key: "toZone", label: "To zone" }, { key: "protocol", label: "Protocol" }, { key: "port", label: "Port" }, { key: "enc", label: "Encrypted", value: (f) => (f.encrypted ? "yes" : "no") }, { key: "x", label: "Crosses boundary", value: (f) => (f.crosses ? "yes" : "no") }, { key: "label", label: "Purpose" }], rows: m.flows });
  if (s.include.apis) sections.push({ heading: "APIs", note: s.intro.apis, columns: [{ key: "c", label: "Component" }, { key: "url", label: "URL" }, { key: "ep", label: "Endpoint" }, { key: "sum", label: "Summary" }], rows: m.apis.flatMap((a) => (a.operations.length ? a.operations : [{ method: "", path: "(none documented)", summary: "" }]).map((o) => ({ c: a.node.data.label, url: a.url, ep: `${o.method} ${o.path}`.trim(), sum: o.summary }))) });
  return {
    title: s.title || `Environment layout - ${m.name}`, subtitle: s.intro.overview || m.description || undefined,
    meta: [["Project", m.name], ["Version", s.version || "1.0"], ["Components", String(m.components.length)], ["Data flows", `${m.flows.length} (${m.flows.filter((f) => !f.encrypted).length} unencrypted)`], ...(m.posture ? [["Risk score", `${m.posture.score ?? "-"}/100`] as [string, string]] : [])],
    sections,
  };
}
