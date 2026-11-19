"use client";
/**
 * Project workbench. Opening the route loads ONLY this project's snapshot (query); every tab
 * edits the in-memory working state. "Save project" sends the `project.save` command.
 */
import { AlertTriangle, ArchiveRestore, ChevronDown, History, Monitor, Pencil, RotateCcw, Save, Share2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApiClient } from "@/components/ApiClient";
import { BatchTests } from "@/components/BatchTests";
import { ApiDocs } from "@/components/docs/ApiDocs";
import { SecurityReport } from "@/components/security/SecurityReport";
import { Designer } from "@/components/designer/Designer";
import { dialogs } from "@/components/Dialogs";
import { HistoryDrawer } from "@/components/HistoryDrawer";
import { StageBadge, Tags } from "@/components/ProjectBadges";
import { ProjectDetailsDialog } from "@/components/ProjectDetailsDialog";
import { ResultsPanel } from "@/components/ResultsPanel";
import { Scanner } from "@/components/Scanner";
import { ShareDialog } from "@/components/ShareDialog";
import { Terminal } from "@/components/Terminal";
import { Time } from "@/components/Time";
import { ApiError, errMsg } from "@/lib/api";
import { command } from "@/lib/cqrs";
import { useProjects } from "@/lib/store";

const TABS = [["design", "Design"], ["console", "Console"], ["api", "API client"], ["docs", "API docs"], ["scanner", "Scanner & audit"], ["batch", "Batch tests"], ["report", "Security report"], ["results", "Results"], ["notes", "Notes"]] as const;
type TabId = (typeof TABS)[number][0];

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const project = useProjects((s) => s.loaded[id]);
  const loadError = useProjects((s) => s.errors[id]);
  const { open, save, reload, setMeta, update } = useProjects.getState();
  const [tab, setTab] = useState<TabId>("design");
  const [visited, setVisited] = useState<Set<TabId>>(new Set(["design"]));
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [panel, setPanel] = useState<"details" | "history" | "share" | "saveMenu" | null>(null);

  useEffect(() => { open(id); }, [id, open]);
  useEffect(() => { if (project) document.title = `${project.dirty ? "• " : ""}${project.meta.name} · Slyshark`; }, [project]);
  const go = (t: TabId) => { setTab(t); setVisited((v) => new Set(v).add(t)); };

  const doSave = useCallback(async (note = "") => {
    setMsg(null); setPanel(null);
    const cur = useProjects.getState().loaded[id];
    if (cur && !cur.dirty && !note) { setMsg({ tone: "ok", text: "Already saved — nothing new to save" }); setTimeout(() => setMsg(null), 2500); return; }
    const attempt = async (force: boolean): Promise<void> => {
      try {
        await save(id, { force, note });
        setMsg({ tone: "ok", text: "Saved" });
        setTimeout(() => setMsg(null), 2500);
      } catch (e) {
        if (!force && e instanceof ApiError && e.status === 409 && (await dialogs.confirm({ title: "Saved somewhere else", message: `${e.message}\n\nOverwrite it with your changes? The other version stays in History.`, confirmText: "Overwrite" }))) return attempt(true);
        setMsg({ tone: "err", text: errMsg(e) });
      }
    };
    await attempt(false);
  }, [id, save]);
  const saveWithNote = async () => { const note = await dialogs.prompt({ title: "Save with a note", message: "Describe what changed. It appears in History.", label: "Note", placeholder: "e.g. Added load balancer and staging DB", confirmText: "Save project" }); if (note !== null) doSave(note); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); doSave(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doSave]);

  if (loadError) return <div className="p-8"><p className="text-danger">{loadError === "Not found" ? "This project doesn't exist or was deleted." : loadError}</p><Link href="/dashboard/workspaces" className="text-fin">Back to workspaces</Link></div>;
  if (!project) return <div className="p-8 text-sm text-muted">Opening project…</div>;

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-panel px-4 py-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-muted">
            <Link href={`/dashboard/workspaces?ws=${project.meta.workspaceId}`} className="hover:text-ink">{project.meta.workspaceName}</Link><span>/</span>
            <StageBadge stage={project.meta.stage} /><Tags tags={project.meta.tags} />
          </div>
          <div className="flex items-center gap-2">
            <h1 className="sr-only">{project.meta.name}</h1>
            <input aria-label="Project name" size={Math.max(8, Math.min(48, project.meta.name.length + 1))} className="min-w-0 bg-transparent text-base font-semibold outline-none" value={project.meta.name} onChange={(e) => setMeta(id, { name: e.target.value })} />
            <button className="text-muted hover:text-ink" title="Edit details: description, tags, stage" aria-label="Edit project details" onClick={() => setPanel("details")}><Pencil size={14} /></button>
          </div>
          {project.meta.description && <p className="line-clamp-1 text-xs text-muted" title={project.meta.description}>{project.meta.description}</p>}
        </div>
        <span role="status" aria-live="polite" className={`rounded px-2 py-0.5 text-xs ${project.saving ? "text-muted" : project.dirty ? "bg-amber-500/15 text-amber-300" : msg?.tone === "ok" ? "text-emerald-300" : "text-muted"}`}>
          {project.saving ? "Saving…" : project.dirty ? "Unsaved changes" : msg?.tone === "ok" ? (msg.text === "Saved" ? "✓ Saved" : msg.text) : <Time value={project.savedAt} prefix="Saved " />}
        </span>
        {msg?.tone === "err" && <span role="alert" className="max-w-xs text-xs text-danger">{msg.text}</span>}
        <div className="flex gap-1.5">
          <button className="btn" onClick={() => setPanel("history")} title="Save history and restore"><History size={14} /><span className="hidden lg:inline">History</span></button>
          <button className="btn" onClick={() => setPanel("share")} title="Share a read-only link"><Share2 size={14} /><span className="hidden lg:inline">Share</span></button>
          <button className="btn" disabled={!project.dirty} title="Discard unsaved changes"
            onClick={async () => { if (await dialogs.confirm({ title: "Discard unsaved changes?", message: "The project goes back to its last saved version.", confirmText: "Discard", danger: true })) reload(id); }}><RotateCcw size={14} /><span className="hidden lg:inline">Revert</span></button>
          <div className="relative flex">
            <button className="btn-primary rounded-r-none" onClick={() => doSave()} disabled={project.saving} title="Save project (Ctrl+S)"><Save size={14} />Save project</button>
            <button className="btn-primary rounded-l-none border-l border-bg/30 px-1.5" aria-label="More save options" aria-expanded={panel === "saveMenu"} onClick={() => setPanel(panel === "saveMenu" ? null : "saveMenu")}><ChevronDown size={14} /></button>
            {panel === "saveMenu" && <div className="panel absolute right-0 top-9 z-30 w-44 p-1 text-sm shadow-xl"><button className="w-full rounded px-2.5 py-1.5 text-left hover:bg-panel-2" onClick={saveWithNote}>Save with a note…</button></div>}
          </div>
        </div>
      </div>
      {project.meta.status === "archived" && (
        <div className="flex items-center gap-2 bg-amber-500/10 px-4 py-1.5 text-sm text-amber-200">
          <AlertTriangle size={14} />This project is archived, so it&apos;s hidden from your project lists.
          <button className="btn ml-2 px-2 py-0.5 text-xs" onClick={async () => { await command("project.setStatus", { id, status: "active" }); reload(id); }}><ArchiveRestore size={12} />Restore</button>
        </div>
      )}
      <div className="flex shrink-0 items-center gap-2 bg-panel/40 px-4 py-1.5 text-xs text-muted md:hidden"><Monitor size={13} />The designer works best on a larger screen; results, notes and sharing work here too.</div>
      <div className="flex shrink-0 overflow-x-auto border-b border-line px-2" role="tablist">
        {TABS.map(([t, label]) => <button key={t} role="tab" aria-selected={tab === t} className={`tab whitespace-nowrap ${tab === t ? "tab-active" : ""}`} onClick={() => go(t)}>{label}{t === "results" && project.state.results.length ? <span className="ml-1 text-muted">({project.state.results.length})</span> : null}</button>)}
      </div>
      <div className="relative min-h-0 flex-1">
        {visited.has("design") && <div className={`absolute inset-0 ${tab === "design" ? "" : "hidden"}`}><Designer projectId={id} onEditDetails={() => setPanel("details")} /></div>}
        {visited.has("console") && <div className={`absolute inset-0 flex flex-col p-4 ${tab === "console" ? "" : "hidden"}`}><Terminal projectId={id} className="flex-1 rounded-lg border border-line" context={{ nodes: project.state.canvas.nodes.map((n) => ({ id: n.id, label: n.data.label, target: n.data.host || (n.data.url ? safeHost(n.data.url) : null) })) }} /></div>}
        {visited.has("api") && <div className={`absolute inset-0 ${tab === "api" ? "" : "hidden"}`}><ApiClient projectId={id} /></div>}
        {visited.has("docs") && <div className={`absolute inset-0 ${tab === "docs" ? "" : "hidden"}`}><ApiDocs projectId={id} onOpenReport={() => go("report")} /></div>}
        {visited.has("scanner") && <div className={`absolute inset-0 overflow-auto ${tab === "scanner" ? "" : "hidden"}`}><Scanner projectId={id} /></div>}
        {visited.has("batch") && <div className={`absolute inset-0 overflow-auto ${tab === "batch" ? "" : "hidden"}`}><BatchTests projectId={id} /></div>}
        {tab === "report" && <div className="absolute inset-0 overflow-auto"><SecurityReport projectId={id} /></div>}
        {tab === "results" && <div className="absolute inset-0 overflow-auto"><ResultsPanel projectId={id} /></div>}
        {tab === "notes" && (
          <div className="absolute inset-0 flex flex-col gap-2 p-6">
            <label className="label" htmlFor="notes">Project notes (saved with the project; can be included in share links)</label>
            <textarea id="notes" className="input flex-1 resize-none font-mono text-sm" value={project.state.notes} onChange={(e) => { const v = e.target.value; update(id, (s) => ({ ...s, notes: v })); }} placeholder={"Runbooks, findings, owners, where credentials are kept (not the secrets themselves)…\n\nTip: write findings as: What I tested → What I found → Why it matters → How to fix."} />
          </div>
        )}
      </div>
      {panel === "details" && <ProjectDetailsDialog project={{ id, name: project.meta.name, description: project.meta.description, tags: project.meta.tags, stage: project.meta.stage, pinned: project.meta.pinned }} onClose={() => setPanel(null)}
        onSaved={(d) => useProjects.getState().applyDetails(id, d)} />}
      {panel === "history" && <HistoryDrawer projectId={id} onClose={() => setPanel(null)} />}
      {panel === "share" && <ShareDialog projectId={id} dirty={project.dirty} onClose={() => setPanel(null)} />}
    </div>
  );
}

function safeHost(u: string): string | null {
  try { return new URL(u.includes("://") ? u : `https://${u}`).hostname; } catch { return null; }
}
