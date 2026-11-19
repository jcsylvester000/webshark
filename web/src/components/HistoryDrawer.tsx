"use client";
/** Save history: the last 10 saves with notes; restoring creates a new save (nothing is lost). */
import { History, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { errMsg } from "@/lib/api";
import { command, query } from "@/lib/cqrs";
import { useProjects } from "@/lib/store";
import { dialogs } from "./Dialogs";
import { Time } from "./Time";

type Version = { version: number; note: string; saved_at: string; node_count: number };

export function HistoryDrawer({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const project = useProjects((s) => s.loaded[projectId]);
  const reload = useProjects((s) => s.reload);
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { query<Version[]>(`projects/${projectId}/versions`).then(setVersions).catch((e) => setError(errMsg(e))); }, [projectId, project?.version]);

  async function restore(v: Version) {
    const msg = project?.dirty ? "You have unsaved changes. Restoring replaces them with this saved version.\n\n" : "";
    if (!(await dialogs.confirm({ title: `Restore the version from ${new Date(v.saved_at).toLocaleString()}?`, message: `${msg}This creates a new save, so the current version stays in history.`, confirmText: "Restore" }))) return;
    try { await command("project.restoreVersion", { id: projectId, version: v.version }); await reload(projectId); onClose(); }
    catch (e) { setError(errMsg(e)); }
  }
  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <aside role="dialog" aria-label="Save history" className="absolute right-0 top-0 flex h-full w-full max-w-sm flex-col border-l border-line bg-panel shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3"><h2 className="flex items-center gap-2 font-medium"><History size={16} />Save history</h2><button onClick={onClose} aria-label="Close history"><X size={16} /></button></div>
        <p className="px-4 pt-3 text-xs text-muted">Your last 10 saves. Add a note when saving to remember what changed.</p>
        {error && <p role="alert" className="mx-4 mt-2 text-sm text-danger">{error}</p>}
        <ol className="flex-1 overflow-y-auto p-2">
          {versions?.map((v, i) => (
            <li key={v.version} className="rounded-md p-2.5 hover:bg-panel-2">
              <div className="flex items-center gap-2 text-sm"><span className="font-medium"><Time value={v.saved_at} /></span>{i === 0 && <span className="chip text-fin">Current</span>}</div>
              <div className="text-sm text-muted">{v.note || <span className="italic">No note</span>}</div>
              <div className="mt-1 flex items-center justify-between text-xs text-muted"><span>Save #{v.version} · {v.node_count} components</span>
                {i > 0 && <button className="btn px-2 py-0.5 text-xs" onClick={() => restore(v)}><RotateCcw size={12} />Restore</button>}</div>
            </li>
          ))}
          {versions?.length === 0 && <li className="p-3 text-sm text-muted">No saves yet.</li>}
        </ol>
      </aside>
    </div>
  );
}
