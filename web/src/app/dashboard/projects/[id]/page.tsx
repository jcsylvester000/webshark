"use client";
/**
 * Project workbench. Opening the route loads ONLY this project's snapshot (query); every tab
 * edits the in-memory working state. "Save project" sends the `project.save` command.
 */
import { AlertTriangle, ArchiveRestore, RotateCcw, Save } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApiClient } from "@/components/ApiClient";
import { BatchTests } from "@/components/BatchTests";
import { Designer } from "@/components/designer/Designer";
import { ResultsPanel } from "@/components/ResultsPanel";
import { Scanner } from "@/components/Scanner";
import { Terminal } from "@/components/Terminal";
import { ApiError, errMsg } from "@/lib/api";
import { command } from "@/lib/cqrs";
import { useProjects } from "@/lib/store";

const TABS = [["design", "Design"], ["console", "Console"], ["api", "API Client"], ["scanner", "Scanner & Audit"], ["batch", "Batch Tests"], ["results", "Results"], ["notes", "Notes"]] as const;
type TabId = (typeof TABS)[number][0];

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const project = useProjects((s) => s.loaded[id]);
  const loadError = useProjects((s) => s.errors[id]);
  const { open, save, reload, setMeta, update } = useProjects.getState();
  const [tab, setTab] = useState<TabId>("design");
  const [visited, setVisited] = useState<Set<TabId>>(new Set(["design"]));
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  useEffect(() => { open(id); }, [id, open]);
  const go = (t: TabId) => { setTab(t); setVisited((v) => new Set(v).add(t)); };

  const doSave = useCallback(async () => {
    setMsg(null);
    const attempt = async (force: boolean): Promise<void> => {
      try {
        await save(id, { force });
        setMsg({ tone: "ok", text: "Project saved" });
        setTimeout(() => setMsg(null), 2500);
      } catch (e) {
        if (!force && e instanceof ApiError && e.status === 409 && confirm(`${e.message}\n\nOverwrite the newer version with your changes?`)) return attempt(true);
        setMsg({ tone: "err", text: errMsg(e) });
      }
    };
    await attempt(false);
  }, [id, save]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); doSave(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doSave]);

  if (loadError) return <div className="p-8"><p className="text-danger">{loadError}</p><Link href="/dashboard/workspaces" className="text-fin">Back to workspaces</Link></div>;
  if (!project) return <div className="p-8 text-sm text-muted">Loading project…</div>;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-panel px-4">
        <Link href={`/dashboard/workspaces?ws=${project.meta.workspaceId}`} className="truncate text-sm text-muted hover:text-ink">{project.meta.workspaceName} /</Link>
        <input aria-label="Project name" className="w-64 bg-transparent text-sm font-semibold outline-none" value={project.meta.name} onChange={(e) => setMeta(id, { name: e.target.value })} />
        <span className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${project.dirty ? "bg-amber-500/15 text-amber-300" : "text-muted"}`}>
          {project.saving ? "saving…" : project.dirty ? "unsaved changes" : `saved v${project.version}${project.savedAt ? ` · ${new Date(project.savedAt).toLocaleTimeString()}` : ""}`}
        </span>
        {msg && <span className={`text-xs ${msg.tone === "ok" ? "text-emerald-300" : "text-danger"}`}>{msg.text}</span>}
        <div className="ml-auto flex gap-1.5">
          <button className="btn" disabled={!project.dirty} title="Discard unsaved changes and reload the last saved version"
            onClick={() => confirm("Discard unsaved changes and reload the last saved version?") && reload(id)}><RotateCcw size={14} />Revert</button>
          <button className="btn-primary" onClick={() => doSave()} disabled={project.saving} title="Save project (Ctrl+S)"><Save size={14} />Save project</button>
        </div>
      </div>
      {project.meta.status === "archived" && (
        <div className="flex items-center gap-2 bg-amber-500/10 px-4 py-1.5 text-sm text-amber-200">
          <AlertTriangle size={14} />This project is archived.
          <button className="btn ml-2 px-2 py-0.5 text-xs" onClick={async () => { await command("project.setStatus", { id, status: "active" }); reload(id); }}><ArchiveRestore size={12} />Restore</button>
        </div>
      )}
      <div className="flex shrink-0 border-b border-line px-2">
        {TABS.map(([t, label]) => <button key={t} className={`tab ${tab === t ? "tab-active" : ""}`} onClick={() => go(t)}>{label}</button>)}
      </div>
      <div className="relative min-h-0 flex-1">
        {/* Visited tabs stay mounted (hidden) so in-progress UI state survives tab switches. */}
        {visited.has("design") && <div className={`absolute inset-0 ${tab === "design" ? "" : "hidden"}`}><Designer projectId={id} /></div>}
        {visited.has("console") && <div className={`absolute inset-0 flex flex-col p-4 ${tab === "console" ? "" : "hidden"}`}><Terminal projectId={id} className="flex-1 rounded-lg border border-line" context={{ nodes: project.state.canvas.nodes.map((n) => ({ id: n.id, label: n.data.label, target: n.data.host || (n.data.url ? safeHost(n.data.url) : null) })) }} /></div>}
        {visited.has("api") && <div className={`absolute inset-0 ${tab === "api" ? "" : "hidden"}`}><ApiClient projectId={id} /></div>}
        {visited.has("scanner") && <div className={`absolute inset-0 overflow-auto ${tab === "scanner" ? "" : "hidden"}`}><Scanner projectId={id} /></div>}
        {visited.has("batch") && <div className={`absolute inset-0 overflow-auto ${tab === "batch" ? "" : "hidden"}`}><BatchTests projectId={id} /></div>}
        {tab === "results" && <div className="absolute inset-0 overflow-auto"><ResultsPanel projectId={id} /></div>}
        {tab === "notes" && (
          <div className="absolute inset-0 flex flex-col gap-2 p-6">
            <label className="label" htmlFor="notes">Project notes (stored with the project)</label>
            <textarea id="notes" className="input flex-1 resize-none font-mono text-sm" value={project.state.notes} onChange={(e) => { const v = e.target.value; update(id, (s) => ({ ...s, notes: v })); }} placeholder="Runbooks, findings, owners, credentials locations (not the secrets themselves)…" />
          </div>
        )}
      </div>
    </div>
  );
}

function safeHost(u: string): string | null {
  try { return new URL(u.includes("://") ? u : `https://${u}`).hostname; } catch { return null; }
}
