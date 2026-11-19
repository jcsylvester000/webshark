"use client";
/**
 * Workspaces & projects. Lists come from read-model queries (summaries only; no project state is
 * downloaded). Search, filters and sorting run server-side. Every change is an explicit command.
 */
import { Archive, ArchiveRestore, Copy, FolderInput, FolderOpen, MoreHorizontal, Pencil, Pin, PinOff, Plus, Search, Share2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { dialogs } from "@/components/Dialogs";
import { NewProjectDialog } from "@/components/NewProjectDialog";
import { PageHeader } from "@/components/PageHeader";
import { StageBadge, Tags } from "@/components/ProjectBadges";
import { ProjectDetailsDialog, type Details } from "@/components/ProjectDetailsDialog";
import { Time } from "@/components/Time";
import { errMsg } from "@/lib/api";
import { command, query, STAGES, type ProjectSummary, type WorkspaceSummary } from "@/lib/cqrs";
import { useProjects } from "@/lib/store";

const COLORS = ["#2ee6c5", "#60a5fa", "#a78bfa", "#f472b6", "#f59e0b", "#4ade80", "#f87171"];

export default function WorkspacesPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[] | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [tags, setTags] = useState<{ tag: string; count: number }[]>([]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Details | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const closeProject = useProjects((s) => s.close);
  const selected = params.get("ws") ?? "all";
  const status = params.get("status") ?? "active";
  const q = params.get("q") ?? "";
  const tag = params.get("tag") ?? "";
  const stage = params.get("stage") ?? "all";
  const sort = params.get("sort") ?? "saved";
  const [search, setSearch] = useState(q);
  const ws = workspaces?.find((w) => w.id === selected);

  const setParam = (patch: Record<string, string | null>) => {
    const u = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) { if (v === null || v === "" || (k === "ws" && v === "all") || (k === "status" && v === "active") || (k === "stage" && v === "all") || (k === "sort" && v === "saved")) u.delete(k); else u.set(k, v); }
    router.replace(`/dashboard/workspaces${u.toString() ? `?${u}` : ""}`);
  };

  const loadWs = useCallback(() => Promise.all([
    query<WorkspaceSummary[]>("workspaces").then(setWorkspaces),
    query<{ tag: string; count: number }[]>("tags").then(setTags),
  ]).catch((e) => setError(errMsg(e))), []);
  const loadProjects = useCallback(() => {
    const u = new URLSearchParams({ status, sort });
    if (selected !== "all") u.set("workspaceId", selected);
    if (q) u.set("q", q);
    if (tag) u.set("tag", tag);
    if (stage !== "all") u.set("stage", stage);
    return query<ProjectSummary[]>(`projects?${u}`).then(setProjects).catch((e) => setError(errMsg(e)));
  }, [selected, status, q, tag, stage, sort]);
  useEffect(() => { loadWs(); }, [loadWs]);
  useEffect(() => { loadProjects(); }, [loadProjects]);
  useEffect(() => { const t = setTimeout(() => { if (search !== q) setParam({ q: search }); }, 300); return () => clearTimeout(t); });

  async function run(fn: () => Promise<unknown>, ok?: string) {
    setError(null); setMenu(null);
    try { await fn(); await Promise.all([loadWs(), loadProjects()]); if (ok) { setNotice(ok); setTimeout(() => setNotice(null), 3000); } } catch (e) { setError(errMsg(e)); }
  }
  async function editWorkspace(w?: WorkspaceSummary) {
    const r = await dialogs.form({ title: w ? "Edit workspace" : "New workspace", message: "Workspaces are folders for related projects, e.g. one per client, course or site.", confirmText: w ? "Save" : "Create",
      fields: [{ name: "name", label: "Name", defaultValue: w?.name ?? "", placeholder: "e.g. Client A, Homelab, CCNA course" }, { name: "description", label: "Description (optional)", defaultValue: w?.description ?? "" }] });
    if (!r || !r.name.trim()) return;
    if (w) await run(() => command("workspace.update", { id: w.id, name: r.name.trim(), description: r.description }), "Workspace saved");
    else await run(async () => { const { id } = await command("workspace.create", { name: r.name.trim(), description: r.description, color: COLORS[(workspaces?.length ?? 0) % COLORS.length] }); setParam({ ws: id }); }, "Workspace created");
  }
  async function moveProject(p: ProjectSummary) {
    const others = (workspaces ?? []).filter((w) => w.id !== p.workspace_id);
    if (!others.length) { setError("Create another workspace first, then move projects into it."); setMenu(null); return; }
    const r = await dialogs.form({ title: `Move “${p.name}”`, message: `Type the destination workspace name:\n${others.map((w) => `• ${w.name}`).join("\n")}`, confirmText: "Move", fields: [{ name: "to", label: "Workspace", defaultValue: others[0].name }] });
    const dest = others.find((w) => w.name.toLowerCase() === r?.to.trim().toLowerCase());
    if (r && !dest) { setError(`No workspace named “${r.to}”.`); return; }
    if (dest) await run(() => command("project.move", { id: p.id, workspaceId: dest.id }), `Moved to ${dest.name}`);
  }

  const filtersOn = q || tag || stage !== "all";
  return (
    <div onClick={() => setMenu(null)}>
      <PageHeader title="Workspaces & projects" subtitle="Organize work into workspaces, label projects with tags and stages, and find anything fast.">
        <button className="btn" onClick={() => editWorkspace()}><Plus size={15} />New workspace</button>
        <button className="btn-primary" onClick={() => setCreating(true)}><Plus size={15} />New project</button>
      </PageHeader>
      {error && <p role="alert" className="mx-6 mt-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      {notice && <p role="status" className="mx-6 mt-4 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{notice}</p>}
      <div className="grid gap-6 p-6 lg:grid-cols-[260px_1fr]">
        <aside className="space-y-4">
          <nav className="panel" aria-label="Workspaces">
            <button onClick={() => setParam({ ws: "all" })} className={`flex w-full items-center gap-2 border-b border-line/50 px-4 py-2.5 text-left text-sm ${selected === "all" ? "bg-fin/10 text-fin" : "hover:bg-panel-2"}`}>
              <span className="flex-1">All projects</span><span className="text-xs text-muted">{workspaces?.reduce((a, w) => a + w.active_projects, 0) ?? ""}</span></button>
            {workspaces?.map((w) => (
              <button key={w.id} onClick={() => setParam({ ws: w.id })} className={`flex w-full items-center gap-2 border-b border-line/50 px-4 py-2.5 text-left text-sm last:border-0 ${w.id === selected ? "bg-fin/10 text-fin" : "hover:bg-panel-2"}`}>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: w.color }} /><span className="min-w-0 flex-1 truncate">{w.name}</span><span className="text-xs text-muted">{w.active_projects}</span>
              </button>
            ))}
          </nav>
          {tags.length > 0 && (
            <div className="panel p-3"><div className="label">Tags</div>
              <div className="flex flex-wrap gap-1">{tags.map((t) => <button key={t.tag} onClick={() => setParam({ tag: tag === t.tag ? null : t.tag })} className={`chip ${tag === t.tag ? "border-fin text-fin" : "hover:text-ink"}`}>#{t.tag} <span className="opacity-60">{t.count}</span></button>)}</div></div>
          )}
        </aside>

        <section className="min-w-0 space-y-3">
          {ws && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ background: ws.color }} />
              <h2 className="text-lg font-semibold">{ws.name}</h2>
              <button className="text-muted hover:text-ink" aria-label="Edit workspace" title="Edit workspace" onClick={() => editWorkspace(ws)}><Pencil size={14} /></button>
              <div className="flex gap-1" role="radiogroup" aria-label="Workspace colour">{COLORS.map((c) => <button key={c} role="radio" aria-checked={ws.color === c} aria-label={`Colour ${c}`} className={`h-4 w-4 rounded-full ${ws.color === c ? "ring-2 ring-ink ring-offset-1 ring-offset-bg" : ""}`} style={{ background: c }} onClick={() => run(() => command("workspace.update", { id: ws.id, color: c }))} />)}</div>
              <button className="ml-1 text-muted hover:text-danger" aria-label="Delete workspace" title="Delete workspace" onClick={async () => {
                const n = ws.active_projects + ws.archived_projects;
                if (await dialogs.confirm({ title: `Delete “${ws.name}”?`, message: `This permanently deletes the workspace and ${n} project${n === 1 ? "" : "s"} in it, with their saved runs and share links.`, danger: true, typeToConfirm: ws.name }))
                  run(async () => { await command("workspace.delete", { id: ws.id }); setParam({ ws: "all" }); }, "Workspace deleted");
              }}><Trash2 size={14} /></button>
              {ws.description && <p className="w-full text-sm text-muted">{ws.description}</p>}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-56 flex-1"><Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <input aria-label="Search projects" className="input pl-8" placeholder="Search name, description or tag…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
            <select aria-label="Filter by stage" className="input w-40" value={stage} onChange={(e) => setParam({ stage: e.target.value })}><option value="all">All stages</option>{STAGES.slice(1).map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}</select>
            <select aria-label="Sort projects" className="input w-44" value={sort} onChange={(e) => setParam({ sort: e.target.value })}><option value="saved">Last saved</option><option value="name">Name A–Z</option><option value="created">Newest first</option></select>
            <div className="flex rounded-md border border-line text-sm" role="radiogroup" aria-label="Status">
              {(["active", "archived"] as const).map((s) => <button key={s} role="radio" aria-checked={status === s} onClick={() => setParam({ status: s })} className={`px-3 py-1.5 capitalize ${status === s ? "bg-panel-2 text-ink" : "text-muted"}`}>{s}</button>)}
            </div>
          </div>
          {filtersOn && <div className="flex items-center gap-2 text-sm text-muted">Showing {projects?.length ?? 0} result{projects?.length === 1 ? "" : "s"}{tag && <> tagged <b className="text-ink">#{tag}</b></>}{q && <> for <b className="text-ink">&ldquo;{q}&rdquo;</b></>}<button className="text-fin" onClick={() => { setSearch(""); setParam({ q: null, tag: null, stage: "all" }); }}>Clear filters</button></div>}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {projects?.map((p) => (
              <article key={p.id} className="panel group relative flex flex-col p-4 hover:border-fin/50">
                <Link href={`/dashboard/projects/${p.id}`} className="flex-1">
                  <div className="flex items-start gap-2">
                    {p.pinned && <Pin size={13} className="mt-1 shrink-0 text-fin" aria-label="Pinned" />}
                    <h2 className="min-w-0 flex-1 font-medium group-hover:text-fin">{p.name}</h2>
                    <StageBadge stage={p.stage} />
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{p.description || <span className="italic">No description yet</span>}</p>
                  <div className="mt-2"><Tags tags={p.tags} onClick={(t) => setParam({ tag: t })} /></div>
                  <div className="mt-3 text-xs text-muted">
                    {selected === "all" && <span className="mr-1 inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: p.workspace_color }} />{p.workspace_name} ·</span>}
                    {p.node_count} component{p.node_count === 1 ? "" : "s"} · {p.scenario_count} scenario{p.scenario_count === 1 ? "" : "s"} · {p.run_count} saved run{p.run_count === 1 ? "" : "s"}{p.share_count ? <> · <Share2 size={11} className="inline" /> shared</> : ""}
                  </div>
                </Link>
                <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2 text-xs text-muted">
                  <span title={p.last_note ? `Last note: ${p.last_note}` : undefined}><Time value={p.saved_at} prefix="Saved " /> · {p.state_version} save{p.state_version === 1 ? "" : "s"}</span>
                  <div className="relative">
                    <button aria-label={`Actions for ${p.name}`} aria-haspopup="menu" aria-expanded={menu === p.id} className="rounded p-1 hover:bg-panel-2 hover:text-ink" onClick={(e) => { e.stopPropagation(); setMenu(menu === p.id ? null : p.id); }}><MoreHorizontal size={16} /></button>
                    {menu === p.id && (
                      <div role="menu" className="panel absolute bottom-7 right-0 z-30 w-48 p-1 text-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
                        {([
                          [<FolderOpen key="o" size={14} />, "Open", () => router.push(`/dashboard/projects/${p.id}`)],
                          [<Pencil key="e" size={14} />, "Edit details", () => { setMenu(null); setEditing({ id: p.id, name: p.name, description: p.description, tags: p.tags, stage: p.stage, pinned: p.pinned }); }],
                          [p.pinned ? <PinOff key="p" size={14} /> : <Pin key="p" size={14} />, p.pinned ? "Unpin" : "Pin to top", () => run(() => command("project.updateDetails", { id: p.id, pinned: !p.pinned }))],
                          [<Copy key="d" size={14} />, "Duplicate", () => run(() => command("project.duplicate", { id: p.id }), "Project duplicated")],
                          [<FolderInput key="m" size={14} />, "Move to…", () => moveProject(p)],
                          [p.status === "active" ? <Archive key="a" size={14} /> : <ArchiveRestore key="a" size={14} />, p.status === "active" ? "Archive" : "Restore", () => run(async () => { await command("project.setStatus", { id: p.id, status: p.status === "active" ? "archived" : "active" }); if (p.status === "active") closeProject(p.id); }, p.status === "active" ? "Archived (find it under Archived)" : "Restored")],
                        ] as [React.ReactNode, string, () => void][]).map(([icon, label, fn]) => <button key={label} role="menuitem" className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left hover:bg-panel-2" onClick={fn}>{icon}{label}</button>)}
                        <button role="menuitem" className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-danger hover:bg-danger/10" onClick={async () => {
                          setMenu(null);
                          if (await dialogs.confirm({ title: `Delete “${p.name}”?`, message: "The project, its save history, saved runs and share links will be deleted permanently.", danger: true, typeToConfirm: p.name }))
                            run(async () => { await command("project.delete", { id: p.id }); closeProject(p.id); }, "Project deleted");
                        }}><Trash2 size={14} />Delete…</button>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
          {projects?.length === 0 && (
            <div className="panel p-8 text-center">
              <p className="text-sm text-muted">{filtersOn ? "No projects match these filters." : status === "archived" ? "No archived projects. Archive projects you're not using to keep this list tidy." : "No projects here yet."}</p>
              {!filtersOn && status === "active" && <button className="btn-primary mt-3" onClick={() => setCreating(true)}><Plus size={15} />Create a project</button>}
            </div>
          )}
        </section>
      </div>
      {creating && <NewProjectDialog workspaceId={selected !== "all" ? selected : undefined} onClose={() => setCreating(false)} />}
      {editing && <ProjectDetailsDialog project={editing} onClose={() => setEditing(null)} onSaved={() => { loadProjects(); loadWs(); }} />}
    </div>
  );
}
