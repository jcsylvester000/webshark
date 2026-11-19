/**
 * Security assessment report: gathers findings from every Slyshark source (API check, web audit,
 * port scans, batch test failures, the diagram, and findings the user adds), applies the user's
 * triage, and renders Markdown or the tabular CSV/PDF report. Pure functions: also used on the
 * server to build a shared, read-only copy.
 */
import type { Report } from "../export";
import type { BatchRun } from "../batch";
import { authMatrix, STATUS_TEXT } from "./authMatrix";
import type { OpenApiDoc } from "../openapi/types";
import type { AuditReport, Canvas, ScanResponse } from "../types";
import { owaspCheck } from "./owasp";
import { OWASP_API_2023, riskScore, SEVERITY_LABEL, SEVERITY_ORDER, SOURCE_LABEL, STATUS_LABEL, type FindingSource, type SecFinding, type Severity, type Triage } from "./types";

export type ReportSettings = {
  title: string; assessor: string; scope: string; method: string; summary: string;
  include: Record<FindingSource, boolean> & { matrix: boolean };
  minSeverity: Severity;
};
export type SecurityState = { triage: Record<string, Triage>; manual: SecFinding[]; report: ReportSettings };

export function emptySecurity(): SecurityState {
  return { triage: {}, manual: [], report: { title: "", assessor: "", scope: "", method: "", summary: "", include: { api: true, audit: true, scan: true, tests: true, design: true, manual: true, matrix: true }, minSeverity: "low" } };
}
export function normalizeSecurity(raw: Partial<SecurityState> | undefined): SecurityState {
  const e = emptySecurity();
  return { triage: raw?.triage ?? {}, manual: raw?.manual ?? [], report: { ...e.report, ...raw?.report, include: { ...e.report.include, ...raw?.report?.include } } };
}

export type Sources = { spec: OpenApiDoc | null; audit: AuditReport | null; scan: ScanResponse | null; run: BatchRun | null; canvas: Canvas };

const HIGH_PORTS = new Set([23, 2375, 6379, 11211, 9200, 27017, 5984]);
const MED_PORTS = new Set([21, 135, 139, 161, 445, 1433, 1521, 3306, 3389, 5432, 5900, 5672, 15672, 2049, 111]);
const portSeverity = (p: number): Severity => (HIGH_PORTS.has(p) ? "high" : MED_PORTS.has(p) ? "medium" : "low");
const PLAINTEXT = /^(http|ftp|telnet|ldap|smtp|pop3|imap|snmp|mqtt|redis|vnc)$/i;

export function collectFindings(src: Sources, manual: SecFinding[]): SecFinding[] {
  const out: SecFinding[] = [];
  if (src.spec?.info) out.push(...owaspCheck(src.spec));
  if (src.audit) {
    let host = src.audit.url;
    try { host = new URL(src.audit.final_url || src.audit.url).host; } catch { /* keep raw */ }
    for (const f of src.audit.findings) if (f.severity !== "pass") out.push({ key: `audit|${f.id}|${host}`, rule: f.id, owasp: "", severity: f.severity, title: f.title, location: host, detail: f.detail, fix: f.recommendation, source: "audit" });
  }
  const ports = (target: string, open: { port: number; service: string; note: string | null }[], where: string) => {
    for (const p of open) if (p.note || HIGH_PORTS.has(p.port) || MED_PORTS.has(p.port)) out.push({ key: `port|${target}|${p.port}`, rule: "exposed-port", owasp: "", severity: portSeverity(p.port), title: `Port ${p.port} (${p.service || "unknown"}) is open`, location: where, detail: p.note ?? "This service is reachable from where the scan ran.", fix: "Close the port or limit it with a firewall/security group to the hosts that need it; require authentication and encryption.", source: "scan" });
  };
  if (src.scan) ports(src.scan.target, src.scan.open, `${src.scan.target} (${src.scan.address})`);
  for (const n of src.canvas.nodes) {
    const d = n.data;
    if (d.scan?.open?.length && d.scan.address !== src.scan?.address) ports(d.host || d.url || d.label, d.scan.open, `${d.label} (${d.scan.address})`);
    if (d.kind === "vulnerability") {
      const text = `${d.tags ?? ""} ${d.notes ?? ""}`;
      const sev: Severity = /critical|high/i.test(text) ? "high" : /\blow\b/i.test(text) ? "low" : "medium";
      out.push({ key: `design|vuln|${n.id}`, rule: "documented-vulnerability", owasp: "", severity: sev, title: d.label || "Documented vulnerability", location: "Diagram", detail: d.notes || "Documented on the environment diagram.", fix: "Describe the fix in the node notes, then mark this finding Fixed.", source: "design" });
    }
  }
  const byId = Object.fromEntries(src.canvas.nodes.map((n) => [n.id, n.data.label]));
  for (const e of src.canvas.edges) {
    const l = e.data ?? {};
    if (l.attack) out.push({ key: `design|attack|${e.id}`, rule: "attack-path", owasp: "", severity: "info", title: `Attack path: ${byId[e.source] ?? "?"} → ${byId[e.target] ?? "?"}`, location: "Diagram", detail: l.label ? String(l.label) : "A documented attack scenario on the diagram.", fix: "Record the controls that stop this path (WAF rule, authentication, segmentation).", source: "design" });
    else if (!l.encrypted && (PLAINTEXT.test(String(l.protocol ?? "")) || ["21", "23", "80", "389"].includes(String(l.port ?? "")))) out.push({ key: `design|plain|${e.id}`, rule: "unencrypted-link", owasp: "", severity: "low", title: `Unencrypted link: ${byId[e.source] ?? "?"} → ${byId[e.target] ?? "?"}`, location: "Diagram", detail: `The link uses ${l.protocol || `port ${l.port}`} without encryption, so traffic can be read on the network.`, fix: "Use the encrypted variant (HTTPS, SFTP, LDAPS, TLS) or document why the link is trusted.", source: "design" });
  }
  for (const r of src.run?.results ?? []) {
    if (r.status !== "fail" && r.status !== "error") continue;
    out.push({ key: `tests|${src.run!.scenarioName}|${r.name}`, rule: "test-failed", owasp: "", severity: r.type === "audit" || r.type === "portscan" ? "medium" : "low", title: `Test ${r.status === "error" ? "couldn't run" : "failed"}: ${r.name}`, location: r.target, detail: r.error || r.checks?.filter((c) => !c.ok).map((c) => c.label).join("; ") || r.summary, fix: "Investigate the failed expectation, fix it, and run the scenario again.", source: "tests" });
  }
  out.push(...manual);
  const seen = new Set<string>();
  return out.filter((f) => (seen.has(f.key) ? false : (seen.add(f.key), true))).sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.source.localeCompare(b.source));
}

export type Assessment = { settings: ReportSettings; findings: (SecFinding & { triage: Triage | null })[]; score: number; counts: Record<Severity, number>; open: number; generatedAt: string; projectName: string; matrix: ReturnType<typeof authMatrix> | null; apiTitle: string | null };

export function buildAssessment(projectName: string, src: Sources, sec: SecurityState): Assessment {
  const s = sec.report;
  const all = collectFindings(src, sec.manual).filter((f) => s.include[f.source] !== false && SEVERITY_ORDER[f.severity] <= SEVERITY_ORDER[s.minSeverity]);
  const counts: Record<Severity, number> = { high: 0, medium: 0, low: 0, info: 0 };
  let open = 0;
  for (const f of all) { const st = sec.triage[f.key]?.status ?? "open"; if (st === "open") { counts[f.severity]++; open++; } }
  return { settings: s, findings: all.map((f) => ({ ...f, triage: sec.triage[f.key] ?? null })), score: riskScore(all, sec.triage), counts, open, generatedAt: new Date().toISOString(), projectName, matrix: s.include.matrix && src.spec?.info ? authMatrix(src.spec) : null, apiTitle: src.spec?.info?.title ?? null };
}

export function suggestSummary(a: Assessment): string {
  const c = a.counts;
  const parts = [`This assessment found ${a.findings.length} item${a.findings.length === 1 ? "" : "s"}; ${a.open} remain open (${c.high} high, ${c.medium} medium, ${c.low} low${c.info ? `, ${c.info} informational` : ""}). Risk score: ${a.score}/100.`];
  const top = a.findings.filter((f) => f.severity === "high" && (f.triage?.status ?? "open") === "open").slice(0, 3);
  if (top.length) parts.push(`Fix first: ${top.map((f) => `${f.title} (${f.location})`).join("; ")}.`);
  else parts.push("No high-severity issues are open.");
  return parts.join(" ");
}

const statusOf = (f: Assessment["findings"][number]) => STATUS_LABEL[f.triage?.status ?? "open"];
const mdc = (s: unknown) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");

export function assessmentMarkdown(a: Assessment): string {
  const s = a.settings;
  const L = [`# ${s.title || `Security assessment: ${a.projectName}`}`, "", `_Project: ${a.projectName} · Assessor: ${s.assessor || "-"} · Generated ${a.generatedAt.slice(0, 10)} by Slyshark_`, ""];
  L.push("## Summary", "", s.summary || suggestSummary(a), "", `**Risk score:** ${a.score}/100 · **Open:** ${a.counts.high} high, ${a.counts.medium} medium, ${a.counts.low} low, ${a.counts.info} info`, "");
  if (s.scope) L.push("## Scope", "", s.scope, "");
  if (s.method) L.push("## Method", "", s.method, "");
  const owasp = Object.entries(OWASP_API_2023).map(([id, name]) => [id, name, a.findings.filter((f) => f.owasp === id).length] as const).filter(([, , n]) => n);
  if (owasp.length) { L.push("## OWASP API Top 10 (2023) coverage", "", "| Category | Findings |", "|---|---|"); for (const [id, name, n] of owasp) L.push(`| ${id} ${name} | ${n} |`); L.push(""); }
  L.push("## Findings", "", "| # | Severity | Finding | Where | Source | Status |", "|---|---|---|---|---|---|");
  a.findings.forEach((f, i) => L.push(`| ${i + 1} | ${SEVERITY_LABEL[f.severity]} | ${mdc(f.title)} | ${mdc(f.location)} | ${SOURCE_LABEL[f.source]} | ${statusOf(f)} |`));
  L.push("");
  a.findings.forEach((f, i) => {
    L.push(`### ${i + 1}. ${f.title}`, "", `- **Severity:** ${SEVERITY_LABEL[f.severity]}${f.owasp ? ` · **OWASP:** ${f.owasp} ${OWASP_API_2023[f.owasp]}` : ""}`, `- **Where:** ${f.location}`, `- **Source:** ${SOURCE_LABEL[f.source]}`, `- **Status:** ${statusOf(f)}${f.triage?.note ? ` — ${f.triage.note}` : ""}`, "", f.detail, "", `**Recommendation:** ${f.fix}`, "");
  });
  if (a.matrix?.rows.length) {
    L.push("## Appendix: authentication matrix", "", `| Endpoint | Auth | ${a.matrix.schemes.join(" | ")} | Risk |`, `|---|---|${a.matrix.schemes.map(() => "---|").join("")}---|`);
    for (const r of a.matrix.rows) L.push(`| ${r.method} \`${mdc(r.path)}\` | ${STATUS_TEXT[r.status]} | ${a.matrix.schemes.map((n) => (r.options.some((o) => o.includes(n)) ? "✓" : "")).join(" | ")} | ${mdc(r.risk ?? "")} |`);
    L.push("");
  }
  L.push("---", "_Automated checks show what the documentation and scans reveal; they don't replace a manual penetration test. Only test systems you're authorised to test._");
  return L.join("\n");
}

export function assessmentReport(a: Assessment): Report {
  const s = a.settings;
  const sections: Report["sections"] = [
    { heading: "Summary", columns: [{ key: "k", label: "Item" }, { key: "v", label: "Value" }], rows: [{ k: "Summary", v: s.summary || suggestSummary(a) }, ...(s.scope ? [{ k: "Scope", v: s.scope }] : []), ...(s.method ? [{ k: "Method", v: s.method }] : []), { k: "Open by severity", v: `${a.counts.high} high, ${a.counts.medium} medium, ${a.counts.low} low, ${a.counts.info} info` }] },
    { heading: "Findings", columns: [{ key: "n", label: "#" }, { key: "sev", label: "Severity" }, { key: "title", label: "Finding" }, { key: "location", label: "Where" }, { key: "src", label: "Source" }, { key: "owasp", label: "OWASP" }, { key: "status", label: "Status" }, { key: "fix", label: "Recommendation" }],
      rows: a.findings.map((f, i) => ({ n: i + 1, sev: f.severity, title: f.title, location: f.location, src: SOURCE_LABEL[f.source], owasp: f.owasp, status: statusOf(f) + (f.triage?.note ? `: ${f.triage.note}` : ""), fix: f.fix })) },
  ];
  if (a.matrix?.rows.length) sections.push({ heading: "Authentication matrix", columns: [{ key: "ep", label: "Endpoint" }, { key: "auth", label: "Auth" }, { key: "how", label: "Methods" }, { key: "risk", label: "Risk" }], rows: a.matrix.rows.map((r) => ({ ep: `${r.method} ${r.path}`, auth: STATUS_TEXT[r.status], how: r.options.map((o) => o.join(" + ")).filter(Boolean).join(" or "), risk: r.risk ?? "" })) });
  return { title: s.title || `Security assessment - ${a.projectName}`, subtitle: "Automated checks plus your triage. Not a replacement for a manual penetration test.", meta: [["Project", a.projectName], ["Assessor", s.assessor || "-"], ["Risk score", `${a.score}/100`], ["Findings", `${a.findings.length} (${a.open} open)`]], sections };
}
