/** Saved security-report state (triage, manual findings, report settings): kept tiny so every page can load it cheaply. */
import type { FindingSource, SecFinding, Severity, Triage } from "./types";

export type ReportSettings = {
  title: string; assessor: string; scope: string; method: string; summary: string;
  include: Record<FindingSource, boolean> & { matrix: boolean; threats: boolean };
  minSeverity: Severity;
};
export type SecurityState = { triage: Record<string, Triage>; manual: SecFinding[]; report: ReportSettings };

export function emptySecurity(): SecurityState {
  return { triage: {}, manual: [], report: { title: "", assessor: "", scope: "", method: "", summary: "", include: { api: true, audit: true, scan: true, tests: true, design: true, manual: true, matrix: true, threats: true }, minSeverity: "low" } };
}
export function normalizeSecurity(raw: Partial<SecurityState> | undefined): SecurityState {
  const e = emptySecurity();
  return { triage: raw?.triage ?? {}, manual: raw?.manual ?? [], report: { ...e.report, ...raw?.report, include: { ...e.report.include, ...raw?.report?.include } } };
}
