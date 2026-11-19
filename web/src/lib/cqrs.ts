/** Browser-side CQRS helpers: `command()` for writes, `query()` for reads. */
import { api } from "./api";

export const command = <T = { id: string }>(name: string, payload: Record<string, unknown>) => api<T>(`/commands/${name}`, { method: "POST", json: payload });
export const query = <T>(path: string) => api<T>(`/queries/${path}`);

export type WorkspaceSummary = { id: string; name: string; description: string; color: string; active_projects: number; archived_projects: number; last_saved_at: string | null; created_at: string; updated_at: string };
export type ProjectSummary = { id: string; workspace_id: string; workspace_name: string; name: string; description: string; template: string | null; status: "active" | "archived"; state_version: number; node_count: number; scenario_count: number; run_count: number; created_at: string; saved_at: string };
export type RunSummary = { id: string; project_id: string; project_name: string; scenario_name: string; started_at: string; finished_at: string; total: number; passed: number; failed: number; errored: number; duration_ms: number; created_at: string };
