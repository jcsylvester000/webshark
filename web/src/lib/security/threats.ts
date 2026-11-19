/**
 * STRIDE threat model generated from the diagram: trust boundaries (zone changes, internet and
 * threat actors), data flows (protocol, encryption), documented attack paths and vulnerability
 * nodes. Each threat suggests a mitigation; the user records decisions with the same triage as
 * findings (status + note).
 */
import type { Canvas, CanvasNode } from "../types";
import type { Severity } from "./types";

export type Stride = "S" | "T" | "R" | "I" | "D" | "E";
export const STRIDE: Record<Stride, { name: string; question: string }> = {
  S: { name: "Spoofing", question: "Can someone pretend to be another user or system?" },
  T: { name: "Tampering", question: "Can data or code be changed in transit or at rest?" },
  R: { name: "Repudiation", question: "Can someone deny what they did because nothing was logged?" },
  I: { name: "Information disclosure", question: "Can data be read by someone who shouldn't see it?" },
  D: { name: "Denial of service", question: "Can the service be overwhelmed or made unavailable?" },
  E: { name: "Elevation of privilege", question: "Can someone gain rights they shouldn't have?" },
};
export type Threat = { key: string; stride: Stride; severity: Severity; element: string; threat: string; mitigation: string };

const EXTERNAL = new Set(["internet", "attacker"]);
const GUARDS = new Set(["firewall", "waf", "loadbalancer", "cdn", "vpn"]);
const DATA = new Set(["database", "cache", "storage", "queue"]);
const zoneOf = (n: CanvasNode) => (EXTERNAL.has(n.data.kind) ? "Internet" : (n.data.zone ?? "").trim() || null);
const label = (n?: CanvasNode) => n?.data.label || n?.data.kind || "?";

function strideFromText(t: string): Stride[] {
  const s = t.toLowerCase(), out: Stride[] = [];
  if (/sql|xss|inject|csrf|tamper|deseriali|upload|rce|command/.test(s)) out.push("T");
  if (/brute|credential|phish|spoof|session|token|password|login|mfa/.test(s)) out.push("S");
  if (/ddos|dos\b|flood|exhaust|rate/.test(s)) out.push("D");
  if (/exfil|leak|sniff|disclos|expos|idor|bola|read/.test(s)) out.push("I");
  if (/privilege|escalat|admin|root|bfla|authoriz/.test(s)) out.push("E");
  if (/repudiat|log|audit trail/.test(s)) out.push("R");
  return out.length ? out : ["T"];
}

export function threatModel(canvas: Canvas): { threats: Threat[]; boundaries: number; flows: number } {
  const byId = Object.fromEntries(canvas.nodes.map((n) => [n.id, n]));
  const out: Threat[] = [];
  const add = (t: Threat) => { if (!out.some((x) => x.key === t.key)) out.push(t); };
  let boundaries = 0, flows = 0;
  for (const e of canvas.edges) {
    const a = byId[e.source], b = byId[e.target];
    if (!a || !b) continue;
    const l = e.data ?? {};
    const name = `${label(a)} → ${label(b)}${l.protocol ? ` (${l.protocol}${l.port ? `:${l.port}` : ""})` : ""}`;
    if (l.attack) {
      for (const s of strideFromText(`${l.label ?? ""} ${a.data.notes ?? ""}`)) add({ key: `threat|attack|${e.id}|${s}`, stride: s, severity: DATA.has(b.data.kind) ? "high" : "medium", element: name, threat: `${l.label || "Documented attack"} against ${label(b)}`, mitigation: s === "T" ? "Validate and encode input; use parameterised queries; put a WAF rule in front." : s === "S" ? "Require MFA, lock out repeated failures, use short-lived tokens." : s === "D" ? "Rate limit and absorb traffic at a CDN/WAF; set resource quotas." : s === "I" ? "Check object ownership on every request; encrypt sensitive data." : s === "E" ? "Enforce role checks on the server for every function." : "Log security events centrally with user, time and action." });
      continue;
    }
    flows++;
    const za = zoneOf(a), zb = zoneOf(b);
    const crosses = !!za && !!zb && za !== zb;
    if (crosses) boundaries++;
    if (!l.encrypted) add({ key: `threat|plain|${e.id}`, stride: "I", severity: crosses || EXTERNAL.has(a.data.kind) ? "high" : "low", element: name, threat: `Traffic between ${label(a)} and ${label(b)} isn't marked encrypted${crosses ? `, and it crosses from ${za} to ${zb}` : ""}.`, mitigation: "Use TLS (HTTPS, LDAPS, TLS for databases/queues) and mark the link Encrypted once done." });
    if (!l.encrypted && crosses) add({ key: `threat|tamper|${e.id}`, stride: "T", severity: "medium", element: name, threat: "Unencrypted traffic across a trust boundary can be changed in transit.", mitigation: "Encrypt with TLS and authenticate both ends (mTLS for service-to-service)." });
    if (EXTERNAL.has(a.data.kind) && !GUARDS.has(b.data.kind)) {
      add({ key: `threat|spoof|${e.id}`, stride: "S", severity: "medium", element: name, threat: `${label(b)} accepts connections straight from ${label(a)}.`, mitigation: "Authenticate callers (OAuth/OIDC, API keys with rotation) and document it in the API docs." });
      add({ key: `threat|dos|${e.id}`, stride: "D", severity: "medium", element: name, threat: `No firewall, WAF, CDN or load balancer sits in front of ${label(b)}.`, mitigation: "Put a WAF/CDN or load balancer with rate limiting in front of internet-facing services." });
    }
    if (EXTERNAL.has(a.data.kind) && DATA.has(b.data.kind)) add({ key: `threat|dataexp|${e.id}`, stride: "I", severity: "high", element: name, threat: `${label(b)} (a data store) is reachable from ${label(a)}.`, mitigation: "Keep data stores in a private subnet reachable only from the application tier." });
    if (crosses && DATA.has(b.data.kind)) add({ key: `threat|priv|${e.id}`, stride: "E", severity: "low", element: name, threat: `${label(a)} in ${za} can reach the data store ${label(b)} in ${zb}.`, mitigation: "Give the connecting service a least-privilege database account; no admin credentials in app config." });
  }
  for (const n of canvas.nodes.filter((n) => n.data.kind === "vulnerability")) {
    const targets = canvas.edges.filter((e) => e.source === n.id || e.target === n.id).map((e) => label(byId[e.source === n.id ? e.target : e.source]));
    for (const s of strideFromText(`${n.data.label} ${n.data.notes ?? ""}`)) add({ key: `threat|vuln|${n.id}|${s}`, stride: s, severity: /critical|high/i.test(`${n.data.notes ?? ""} ${n.data.tags ?? ""}`) ? "high" : "medium", element: targets.length ? targets.join(", ") : n.data.label, threat: `${n.data.label}${n.data.notes ? `: ${n.data.notes}` : ""}`, mitigation: "Patch or remove the weak component; add a compensating control until it's fixed." });
  }
  const hasLogging = canvas.nodes.some((n) => /log|siem|monitor|audit/i.test(`${n.data.label} ${n.data.notes ?? ""} ${n.data.tags ?? ""}`));
  if (boundaries && !hasLogging) add({ key: "threat|repudiation", stride: "R", severity: "low", element: "Whole environment", threat: "No logging or monitoring component is documented, so actions across trust boundaries can't be traced.", mitigation: "Add central logging/SIEM to the diagram and log authentication, admin and data-access events." });
  return { threats: out.sort((x, y) => "STRIDE".indexOf(x.stride) - "STRIDE".indexOf(y.stride)), boundaries, flows };
}
