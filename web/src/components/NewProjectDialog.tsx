"use client";
/** Create a project (optionally from a template or from existing working state, e.g. scratch). */
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { errMsg } from "@/lib/api";
import { command, query, type WorkspaceSummary } from "@/lib/cqrs";
import { emptyState, type ProjectState } from "@/lib/project";
import { TEMPLATES } from "@/lib/templates";
import { StageSelect, TagInput } from "./ProjectDetailsDialog";

export function NewProjectDialog({ onClose, initialState, workspaceId, title = "New project" }: { onClose: () => void; initialState?: ProjectState; workspaceId?: string; title?: string }) {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[] | null>(null);
  const [ws, setWs] = useState(workspaceId ?? "");
  const [newWs, setNewWs] = useState("");
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("blank");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [stage, setStage] = useState("none");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    query<WorkspaceSummary[]>("workspaces").then((list) => {
      setWorkspaces(list);
      setWs((cur) => cur || list[0]?.id || "__new");
    }).catch((e) => setError(errMsg(e)));
  }, []);

  async function create() {
    setBusy(true); setError(null);
    try {
      let workspace = ws;
      if (ws === "__new") workspace = (await command("workspace.create", { name: newWs.trim() || "My Workspace" })).id;
      const t = TEMPLATES.find((x) => x.id === template)!;
      const state = initialState ?? { ...emptyState(), canvas: { ...t.canvas(), meta: {} } };
      const { id } = await command("project.create", { workspaceId: workspace, name: name.trim() || t.name, description: description.trim() || (initialState ? "" : t.description), template: initialState ? null : t.id, state, tags, stage });
      onClose();
      router.push(`/dashboard/projects/${id}`);
    } catch (e) { setError(errMsg(e)); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="panel w-full max-w-3xl space-y-4 p-5" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="flex items-center justify-between"><h2 className="font-semibold">{title}</h2><button onClick={onClose} aria-label="Close"><X size={16} /></button></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor="np-name">Project name</label><input id="np-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Resort booking — production" autoFocus /></div>
          <div>
            <label className="label" htmlFor="np-ws">Workspace</label>
            <select id="np-ws" className="input" value={ws} onChange={(e) => setWs(e.target.value)} disabled={!workspaces}>
              {workspaces?.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              <option value="__new">+ New workspace…</option>
            </select>
            {ws === "__new" && <input aria-label="New workspace name" className="input mt-1.5" value={newWs} onChange={(e) => setNewWs(e.target.value)} placeholder="Workspace name" />}
          </div>
        </div>
        <div><label className="label" htmlFor="np-desc">Description <span className="normal-case tracking-normal text-muted/80">(optional)</span></label>
          <textarea id="np-desc" className="input min-h-16" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this project document? e.g. Client A's production web stack" /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><span className="label">Tags <span className="normal-case tracking-normal text-muted/80">(optional)</span></span><TagInput value={tags} onChange={setTags} /></div>
          <div><label className="label" htmlFor="np-stage">Stage</label><StageSelect id="np-stage" value={stage} onChange={setStage} /></div>
        </div>
        {!initialState && (
          <div>
            <div className="label">Start from</div>
            <div className="grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-4">
              {TEMPLATES.map((t) => (
                <button key={t.id} onClick={() => setTemplate(t.id)} className={`panel p-3 text-left ${template === t.id ? "border-fin ring-1 ring-fin/40" : "hover:border-fin/40"}`}>
                  <div className="text-sm font-medium">{t.name}</div><div className="mt-1 text-xs text-muted">{t.description}</div>
                </button>
              ))}
            </div>
          </div>
        )}
        {error && <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="flex gap-2"><button className="btn-primary" onClick={create} disabled={busy}>{busy ? "Creating…" : "Create project"}</button><button className="btn" onClick={onClose}>Cancel</button></div>
      </div>
    </div>
  );
}
