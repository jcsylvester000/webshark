/** Browser-side CQRS helpers: `command()` for writes, `query()` for reads. */
import { api } from "./api";

export const command = <T = { id: string }>(name: string, payload: Record<string, unknown>) => api<T>(`/commands/${name}`, { method: "POST", json: payload });
export const query = <T>(path: string) => api<T>(`/queries/${path}`);

export type WorkspaceSummary = { id: string; name: string; description: string; color: string; active_projects: number; archived_projects: number; last_saved_at: string | null; created_at: string; updated_at: string };
export type ProjectSummary = { id: string; workspace_id: string; workspace_name: string; workspace_color: string; name: string; description: string; template: string | null; status: "active" | "archived"; state_version: number; node_count: number; scenario_count: number; run_count: number; share_count: number; tags: string[]; stage: string; pinned: boolean; last_note: string; created_at: string; saved_at: string };
export type RunSummary = { id: string; project_id: string; project_name: string; scenario_name: string; started_at: string; finished_at: string; total: number; passed: number; failed: number; errored: number; duration_ms: number; created_at: string };

export const STAGES: { v: string; label: string; cls: string }[] = [
  { v: "none", label: "No stage", cls: "border-line text-muted" },
  { v: "production", label: "Production", cls: "border-red-500/40 text-red-300" },
  { v: "staging", label: "Staging", cls: "border-amber-500/40 text-amber-300" },
  { v: "development", label: "Development", cls: "border-sky-500/40 text-sky-300" },
  { v: "lab", label: "Lab", cls: "border-violet-500/40 text-violet-300" },
  { v: "learning", label: "Learning", cls: "border-emerald-500/40 text-emerald-300" },
];
export const stageOf = (v: string) => STAGES.find((s) => s.v === v) ?? STAGES[0];
