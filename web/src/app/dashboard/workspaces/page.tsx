"use client";
/**
 * Workspaces & projects manager. Lists come from read-model queries (summaries only: no project
 * state is downloaded here). Every change is an explicit command.
 */
import { Archive, ArchiveRestore, FolderOpen, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { NewProjectDialog } from "@/components/NewProjectDialog";
import { PageHeader } from "@/components/PageHeader";
import { errMsg } from "@/lib/api";
import { command, query, type ProjectSummary, type WorkspaceSummary } from "@/lib/cqrs";
import { useProjects } from "@/lib/store";

const COLORS = ["#2ee6c5", "#60a5fa", "#a78bfa", "#f472b6", "#f59e0b", "#4ade80", "#f87171"];

export default function WorkspacesPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[] | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [status, setStatus] = useState<"active" | "archived">("active");
  const [newWs, setNewWs] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeProject = useProjects((s) => s.close);
  const selected = params.get("ws") ?? workspaces?.[0]?.id ?? null;
  const ws = workspaces?.find((w) => w.id === selected);

  const loadWs = useCallback(() => query<WorkspaceSummary[]>("workspaces").then(setWorkspaces).catch((e) => setError(errMsg(e))), []);
  const loadProjects = useCallback(() => {
    if (!selected) return Promise.resolve();
    return query<ProjectSummary[]>(`projects?workspaceId=${selected}&status=${status}`).then(setProjects).catch((e) => setError(errMsg(e)));
  }, [selected, status]);
  useEffect(() => { loadWs(); }, [loadWs]);
  useEffect(() => { loadProjects(); }, [loadProjects]);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try { await fn(); await Promise.all([loadWs(), loadProjects()]); } catch (e) { setError(errMsg(e)); }
  }
  const createWs = () => run(async () => {
    const { id } = await command("workspace.create", { name: newWs.trim(), color: COLORS[(workspaces?.length ?? 0) % COLORS.length] });
    setNewWs("");
    router.replace(`/dashboard/workspaces?ws=${id}`);
  });

  return (
    <div>
      <PageHeader title="Workspaces" subtitle="Organize projects into workspaces. Only projects you open are loaded.">
        <button className="btn-primary" onClick={() => setCreating(true)} disabled={!workspaces}><Plus size={15} />New project</button>
      </PageHeader>
      {error && <p className="mx-6 mt-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="grid gap-6 p-6 lg:grid-cols-[280px_1fr]">
        <aside className="panel h-fit">
          <div className="border-b border-line px-4 py-3 text-sm font-medium">Workspaces</div>
          {workspaces?.map((w) => (
            <Link key={w.id} href={`/dashboard/workspaces?ws=${w.id}`} className={`group flex items-center gap-2 border-b border-line/50 px-4 py-2.5 text-sm ${w.id === selected ? "bg-fin/10" : "hover:bg-panel-2"}`}>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: w.color }} />
              <span className="min-w-0 flex-1 truncate">{w.name}</span>
              <span className="font-mono text-xs text-muted">{w.active_projects}</span>
            </Link>
          ))}
          {workspaces?.length === 0 && <p className="px-4 py-3 text-sm text-muted">Create your first workspace.</p>}
          <form className="flex gap-1.5 p-3" onSubmit={(e) => { e.preventDefault(); if (newWs.trim()) createWs(); }}>
            <input aria-label="New workspace name" className="input" placeholder="New workspace" value={newWs} onChange={(e) => setNewWs(e.target.value)} />
            <button className="btn" aria-label="Create workspace"><Plus size={14} /></button>
          </form>
        </aside>

        <section className="min-w-0">
          {ws && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{ws.name}</h2>
              <button className="text-muted hover:text-ink" aria-label="Rename workspace" onClick={() => { const n = prompt("Rename workspace", ws.name); if (n?.trim()) run(() => command("workspace.update", { id: ws.id, name: n.trim() })); }}><Pencil size={14} /></button>
              <button className="text-muted hover:text-danger" aria-label="Delete workspace" onClick={() => { if (confirm(`Delete workspace "${ws.name}" and ALL ${ws.active_projects + ws.archived_projects} project(s) in it? This cannot be undone.`)) run(async () => { await command("workspace.delete", { id: ws.id }); router.replace("/dashboard/workspaces"); }); }}><Trash2 size={14} /></button>
              <div className="ml-auto flex rounded-md border border-line text-sm">
                {(["active", "archived"] as const).map((s) => <button key={s} onClick={() => setStatus(s)} className={`px-3 py-1 capitalize ${status === s ? "bg-panel-2 text-ink" : "text-muted"}`}>{s} ({s === "active" ? ws.active_projects : ws.archived_projects})</button>)}
              </div>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {projects?.map((p) => (
              <div key={p.id} className="panel group flex flex-col p-4 hover:border-fin/50">
                <Link href={`/dashboard/projects/${p.id}`} className="flex-1">
                  <div className="font-medium group-hover:text-white">{p.name}</div>
                  <div className="mt-1 line-clamp-2 text-sm text-muted">{p.description || "No description"}</div>
                  <div className="mt-3 font-mono text-xs text-muted">{p.node_count} nodes · {p.scenario_count} scenarios · {p.run_count} runs · v{p.state_version}</div>
                </Link>
                <div className="mt-3 flex items-center justify-between text-xs text-muted">
                  <span>Saved {new Date(p.saved_at).toLocaleString()}</span>
                  <span className="flex gap-2 opacity-60 group-hover:opacity-100">
                    <Link href={`/dashboard/projects/${p.id}`} aria-label={`Open ${p.name}`} className="hover:text-fin"><FolderOpen size={15} /></Link>
                    <button aria-label={p.status === "active" ? "Archive" : "Restore"} className="hover:text-ink" onClick={() => run(async () => { await command("project.setStatus", { id: p.id, status: p.status === "active" ? "archived" : "active" }); if (p.status === "active") closeProject(p.id); })}>
                      {p.status === "active" ? <Archive size={15} /> : <ArchiveRestore size={15} />}
                    </button>
                    <button aria-label={`Delete ${p.name}`} className="hover:text-danger" onClick={() => { if (confirm(`Delete project "${p.name}" and its saved test runs? This cannot be undone.`)) run(async () => { await command("project.delete", { id: p.id }); closeProject(p.id); }); }}><Trash2 size={15} /></button>
                  </span>
                </div>
              </div>
            ))}
          </div>
          {projects?.length === 0 && ws && <p className="text-sm text-muted">{status === "active" ? "No active projects in this workspace yet." : "No archived projects."}</p>}
        </section>
      </div>
      {creating && <NewProjectDialog workspaceId={selected ?? undefined} onClose={() => setCreating(false)} />}
    </div>
  );
}
