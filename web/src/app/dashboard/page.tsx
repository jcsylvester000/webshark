"use client";
/** Dashboard home: greeting, getting-started checklist, continue card, search, pinned and recent projects, recent runs. */
import { ArrowRight, Check, Circle, FileSearch, Pin, Plus, Radar, Search, Send, SquareTerminal, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { NewProjectDialog } from "@/components/NewProjectDialog";
import { StageBadge, Tags } from "@/components/ProjectBadges";
import { Time } from "@/components/Time";
import { command, query, type ProjectSummary, type RunSummary, type WorkspaceSummary } from "@/lib/cqrs";
import { usePrefs } from "@/lib/prefs";
import { LAST_KEY } from "@/lib/store";

const noSub = () => () => {};

type Profile = { display_name: string | null; username: string; workspace_count: number; project_count: number; mapped_projects: number; run_count: number; share_count: number };

const QUICK = [
  { href: "/dashboard/terminal", icon: SquareTerminal, title: "Console", text: "ping, dns, curl, scan" },
  { href: "/dashboard/api-client", icon: Send, title: "API client", text: "Send GET/POST with tokens" },
  { href: "/dashboard/scanner", icon: Radar, title: "Scanner & audit", text: "Ports and security headers" },
  { href: "/dashboard/captures", icon: FileSearch, title: "Packet captures", text: "Open a .pcap file" },
];

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Working late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function Overview() {
  const router = useRouter();
  const prefs = usePrefs((s) => s.prefs);
  const setPrefs = usePrefs((s) => s.set);
  const [me, setMe] = useState<Profile | null>(null);
  const [ws, setWs] = useState<WorkspaceSummary[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [ready, setReady] = useState(false);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState("");
  const lastRaw = useSyncExternalStore(noSub, () => localStorage.getItem(LAST_KEY), () => null);
  const last = useMemo(() => { try { return lastRaw ? (JSON.parse(lastRaw) as { id: string; name: string; at: string }) : null; } catch { return null; } }, [lastRaw]);
  useEffect(() => {
    // Render the lists together once everything has arrived, so nothing jumps around (layout shift).
    Promise.allSettled([
      query<Profile>("profile").then(setMe),
      query<WorkspaceSummary[]>("workspaces").then(setWs),
      query<ProjectSummary[]>("projects?recent=8").then(setProjects),
      query<RunSummary[]>("runs").then(setRuns),
    ]).then(() => setReady(true));
  }, []);

  const steps = me ? [
    { done: me.workspace_count > 0, label: "Have a workspace (we made one for you)", href: "/dashboard/workspaces" },
    { done: me.project_count > 0, label: "Create your first project", action: () => setCreating(true) },
    { done: me.mapped_projects > 0, label: "Add components to a project's map", href: projects[0] ? `/dashboard/projects/${projects[0].id}` : "/dashboard/workspaces" },
    { done: me.run_count > 0, label: "Run and save a batch test", href: projects[0] ? `/dashboard/projects/${projects[0].id}` : "/dashboard/workspaces" },
    { done: me.share_count > 0, label: "Share a read-only link or export a PDF", href: projects[0] ? `/dashboard/projects/${projects[0].id}` : "/dashboard/workspaces" },
  ] : [];
  const doneCount = steps.filter((s) => s.done).length;
  const showChecklist = me && !prefs.onboardingDismissed && doneCount < steps.length;
  const name = me?.display_name || me?.username || "";
  const pinned = projects.filter((p) => p.pinned);
  const active = ws.reduce((a, w) => a + w.active_projects, 0);

  return (
    <div>
      <div className="border-b border-line px-6 py-6">
        <h1 className="text-2xl font-semibold">{greeting()}{name ? `, ${name.split(" ")[0]}` : ""} 👋</h1>
        <p className="mt-1 min-h-10 text-sm text-muted sm:min-h-5">{me ? (active ? `You have ${active} active project${active === 1 ? "" : "s"} in ${ws.length} workspace${ws.length === 1 ? "" : "s"}${runs.length ? ` and ${runs.length} saved test run${runs.length === 1 ? "" : "s"}` : ""}.` : "Let's map and test your first environment.") : " "}</p>
        <form className="mt-4 flex max-w-xl gap-2" onSubmit={(e) => { e.preventDefault(); router.push(`/dashboard/workspaces?q=${encodeURIComponent(q)}`); }}>
          <div className="relative flex-1"><Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input aria-label="Search projects" className="input pl-8" placeholder="Search all projects by name, description or tag…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <button className="btn-primary" type="button" onClick={() => setCreating(true)}><Plus size={15} />New project</button>
        </form>
      </div>

      {!ready ? <div className="grid gap-6 p-6 xl:grid-cols-3" aria-busy="true" aria-label="Loading your projects"><div className="h-[560px] animate-pulse rounded-lg bg-panel/60 xl:col-span-2" /><div className="h-[560px] animate-pulse rounded-lg bg-panel/60" /></div> :
      <div className="grid gap-6 p-6 xl:grid-cols-3">
        <section className="space-y-5 xl:col-span-2">
          {showChecklist && (
            <div className="panel p-5" data-tour="getting-started">
              <div className="flex items-start justify-between gap-3">
                <div><h2 className="font-medium">Getting started</h2><p className="text-sm text-muted">{doneCount} of {steps.length} done. New to networking? The <Link href="/dashboard/help" className="link">Help & glossary</Link> explains every term, and <Link href="/dashboard/tutorials" className="link">Tutorials</Link> walk you through each feature.</p></div>
                <button className="text-muted hover:text-ink" aria-label="Hide getting started" title="Hide (you can bring it back in Account → Display)"
                  onClick={() => { setPrefs({ onboardingDismissed: true }); command("profile.savePreferences", { ...prefs, onboardingDismissed: true }).catch(() => null); }}><X size={16} /></button>
              </div>
              <div className="mt-3 h-1.5 rounded bg-line"><div className="h-1.5 rounded bg-fin transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} /></div>
              <ul className="mt-3 space-y-1.5">
                {steps.map((s) => {
                  const inner = <>{s.done ? <Check size={16} className="text-fin" /> : <Circle size={16} className="text-muted" />}<span className={s.done ? "text-muted line-through" : ""}>{s.label}</span>{!s.done && <ArrowRight size={14} className="ml-auto text-muted" />}</>;
                  return <li key={s.label}>{s.action && !s.done ? <button className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-panel-2" onClick={s.action}>{inner}</button> : <Link href={s.href ?? "#"} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-panel-2">{inner}</Link>}</li>;
                })}
              </ul>
            </div>
          )}

          {last && (
            <Link href={`/dashboard/projects/${last.id}`} className="panel flex items-center gap-3 p-4 hover:border-fin/50">
              <div className="flex-1"><div className="text-xs uppercase tracking-wider text-muted">Continue where you left off</div><div className="font-medium">{last.name}</div><div className="text-xs text-muted">Opened <Time value={last.at} /></div></div>
              <ArrowRight className="text-fin" />
            </Link>
          )}

          {pinned.length > 0 && (
            <div>
              <h2 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-muted"><Pin size={14} />Pinned</h2>
              <div className="grid gap-3 sm:grid-cols-2">{pinned.map((p) => <ProjectRow key={p.id} p={p} />)}</div>
            </div>
          )}

          <div className="panel">
            <div className="flex items-center justify-between border-b border-line px-4 py-3"><h2 className="font-medium">Recently saved projects</h2><Link href="/dashboard/workspaces" className="text-sm text-fin">All projects →</Link></div>
            {projects.length === 0 ? <p className="p-4 text-sm text-muted">No projects yet. <button className="link" onClick={() => setCreating(true)}>Create one</button> from a template to see how it works.</p> : projects.map((p) => (
              <Link key={p.id} href={`/dashboard/projects/${p.id}`} className="flex items-center gap-3 border-b border-line/60 px-4 py-2.5 text-sm last:border-0 hover:bg-panel-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.workspace_color }} title={p.workspace_name} />
                <span className="min-w-0 flex-1"><span className="flex items-center gap-2"><span className="truncate">{p.name}</span><StageBadge stage={p.stage} /></span><span className="block truncate text-xs text-muted">{p.workspace_name}{p.last_note ? ` · “${p.last_note}”` : ""}</span></span>
                <span className="shrink-0 text-xs text-muted"><Time value={p.saved_at} prefix="Saved " /></span>
              </Link>
            ))}
          </div>

          <div>
            <h2 className="mb-2 text-sm font-medium text-muted">Quick tools <span className="font-normal">(not saved; open a project to keep your work)</span></h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {QUICK.map(({ href, icon: Icon, title, text }) => <Link key={href} href={href} className="panel group p-3.5 hover:border-fin/50"><Icon size={18} className="text-fin" /><div className="mt-2 text-sm font-medium group-hover:text-fin">{title}</div><div className="text-xs text-muted">{text}</div></Link>)}
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="panel">
            <div className="flex items-center justify-between border-b border-line px-4 py-3"><h2 className="font-medium">Workspaces</h2><Link href="/dashboard/workspaces" className="text-sm text-fin">Manage</Link></div>
            {ws.map((w) => (
              <Link key={w.id} href={`/dashboard/workspaces?ws=${w.id}`} className="flex items-center gap-2 border-b border-line/60 px-4 py-2 text-sm last:border-0 hover:bg-panel-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: w.color }} /><span className="flex-1 truncate">{w.name}</span><span className="text-xs text-muted">{w.active_projects} project{w.active_projects === 1 ? "" : "s"}</span>
              </Link>
            ))}
          </div>
          <div className="panel">
            <div className="flex items-center justify-between border-b border-line px-4 py-3"><h2 className="font-medium">Recent test runs</h2><Link href="/dashboard/runs" className="text-sm text-fin">All →</Link></div>
            {runs.length === 0 ? <p className="p-4 text-sm text-muted">No saved runs yet. Run a batch test inside a project, then click Save run.</p> : runs.slice(0, 6).map((r) => (
              <Link key={r.id} href={`/dashboard/projects/${r.project_id}`} className="block border-b border-line/60 px-4 py-2 text-sm last:border-0 hover:bg-panel-2">
                <div className="truncate">{r.scenario_name}</div>
                <div className="text-xs text-muted">{r.project_name} · <Time value={r.created_at} /> · <span className={r.failed + r.errored ? "text-red-400" : "text-emerald-300"}>{r.passed}/{r.total} passed</span></div>
              </Link>
            ))}
          </div>
        </section>
      </div>}
      {creating && <NewProjectDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

function ProjectRow({ p }: { p: ProjectSummary }) {
  return (
    <Link href={`/dashboard/projects/${p.id}`} className="panel block p-3.5 hover:border-fin/50">
      <div className="flex items-center gap-2"><span className="truncate font-medium">{p.name}</span><StageBadge stage={p.stage} /></div>
      <div className="mt-1 line-clamp-1 text-xs text-muted">{p.description || p.workspace_name}</div>
      <div className="mt-2 flex items-center justify-between gap-2"><Tags tags={p.tags.slice(0, 3)} /><span className="shrink-0 text-xs text-muted"><Time value={p.saved_at} /></span></div>
    </Link>
  );
}
