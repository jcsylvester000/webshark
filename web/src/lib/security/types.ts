/** Shared security-finding model for the API security check and the assessment report. */
export type Severity = "high" | "medium" | "low" | "info";
export type FindingSource = "api" | "audit" | "scan" | "tests" | "design" | "manual";

export type SecFinding = {
  /** Stable id (rule + location) so a status or note survives regeneration. */
  key: string;
  rule: string;
  /** e.g. "API2:2023"; empty for non-API findings. */
  owasp: string;
  severity: Severity;
  title: string;
  location: string;
  detail: string;
  fix: string;
  source: FindingSource;
};

export type FindingStatus = "open" | "accepted" | "fixed" | "false-positive";
/** What the user decided about a finding (saved with the project). */
export type Triage = { status: FindingStatus; note: string; owner?: string; at: string };

export const OWASP_API_2023: Record<string, string> = {
  "API1:2023": "Broken Object Level Authorization",
  "API2:2023": "Broken Authentication",
  "API3:2023": "Broken Object Property Level Authorization",
  "API4:2023": "Unrestricted Resource Consumption",
  "API5:2023": "Broken Function Level Authorization",
  "API6:2023": "Unrestricted Access to Sensitive Business Flows",
  "API7:2023": "Server Side Request Forgery",
  "API8:2023": "Security Misconfiguration",
  "API9:2023": "Improper Inventory Management",
  "API10:2023": "Unsafe Consumption of APIs",
};

export const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2, info: 3 };
export const SEVERITY_LABEL: Record<Severity, string> = { high: "High", medium: "Medium", low: "Low", info: "Info" };
export const STATUS_LABEL: Record<FindingStatus, string> = { open: "Open", accepted: "Risk accepted", fixed: "Fixed", "false-positive": "Not an issue" };
export const SOURCE_LABEL: Record<FindingSource, string> = { api: "API check", audit: "Web audit", scan: "Port scan", tests: "Batch tests", design: "Diagram", manual: "Added by you" };

/** 100 minus weighted open findings (high 15, medium 6, low 2), floored at 0. */
export function riskScore(findings: SecFinding[], triage: Record<string, Triage>): number {
  const w: Record<Severity, number> = { high: 15, medium: 6, low: 2, info: 0 };
  const open = findings.filter((f) => (triage[f.key]?.status ?? "open") === "open");
  return Math.max(0, 100 - open.reduce((n, f) => n + w[f.severity], 0));
}
