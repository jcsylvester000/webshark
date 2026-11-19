"use client";
/** Saves triage decisions and user-added findings into the project's working state. */
import { useProjects } from "../store";
import type { SecFinding, Triage } from "./types";
import type { ReportSettings } from "./assessment";

export function setTriage(projectId: string, key: string, t: Triage | null) {
  useProjects.getState().update(projectId, (s) => {
    const triage = { ...s.docs.security.triage };
    if (t) triage[key] = t; else delete triage[key];
    return { ...s, docs: { ...s.docs, security: { ...s.docs.security, triage } } };
  });
}
export function setManual(projectId: string, fn: (all: SecFinding[]) => SecFinding[]) {
  useProjects.getState().update(projectId, (s) => ({ ...s, docs: { ...s.docs, security: { ...s.docs.security, manual: fn(s.docs.security.manual) } } }));
}
export function setReport(projectId: string, patch: Partial<ReportSettings>) {
  useProjects.getState().update(projectId, (s) => ({ ...s, docs: { ...s.docs, security: { ...s.docs.security, report: { ...s.docs.security.report, ...patch } } } }));
}
