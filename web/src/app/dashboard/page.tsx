"use client";
/** Dashboard overview: workspaces, recent projects and recent saved test runs (all read-model queries). */
import { FileSearch, FolderKanban, Plus, Radar, Send, SquareTerminal } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { NewProjectDialog } from "@/components/NewProjectDialog";
import { PageHeader } from "@/components/PageHeader";
import { query, type ProjectSummary, type RunSummary, type WorkspaceSummary } from "@/lib/cqrs";

const QUICK = [
  { href: "/dashboard/workspaces", icon: FolderKanban, title: "Workspaces", text: "Organize and open projects." },
  { href: "/dashboard/terminal", icon: SquareTerminal, title: "Quick console", text: "ping, dns, curl, scan (scratch)." },
  { href: "/dashboard/api-client", icon: Send, title: "Quick API request", text: "Postman-style, no saving." },
  { href: "/dashboard/scanner", icon: Radar, title: "Quick scan & audit", text: "Ports, headers, CORS." },
  { href: "/dashboard/captures", icon: FileSearch, title: "Analyze a capture", text: "Decoded in your browser." },
];

export default function Overview() {
  const [ws, setWs] = useState<WorkspaceSummary[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    query<WorkspaceSummary[]>("workspaces").then(setWs).catch(() => null);
    query<ProjectSummary[]>("projects?recent=8").then(setProjects).catch(() => null);
    query<RunSummary[]>("runs").then(setRuns).catch(() => null);
  }, []);
  return (
    <div>
      <PageHeader title="Overview" subtitle="Your workspaces, recent projects and saved test runs.">
        <button className="btn-primary" onClick={() => setCreating(true)}><Plus size={15} />New project</button>
      </PageHeader>
      <div className="grid gap-6 p-6 xl:grid-cols-3">
        <section className="space-y-4 xl:col-span-2">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {QUICK.map(({ href, icon: Icon, title, text }) => (
              <Link key={href} href={href} className="panel group p-4 hover:border-fin/50"><Icon size={20} className="text-fin" /><div className="mt-3 font-medium group-hover:text-white">{title}</div><div className="text-sm text-muted">{text}</div></Link>
            ))}
          </div>
          <div className="panel">
            <div className="flex items-center justify-between border-b border-line px-4 py-3"><h2 className="font-medium">Recent projects</h2><Link href="/dashboard/workspaces" className="text-sm text-fin">All workspaces →</Link></div>
            {projects.length === 0 ? <p className="p-4 text-sm text-muted">No projects yet. Create one to start mapping and testing.</p> : projects.map((p) => (
              <Link key={p.id} href={`/dashboard/projects/${p.id}`} className="flex justify-between gap-3 border-b border-line/60 px-4 py-2.5 text-sm last:border-0 hover:bg-panel-2">
                <span className="truncate">{p.name} <span className="text-muted">· {p.workspace_name}</span></span><span className="shrink-0 text-muted">{p.node_count} nodes · saved {new Date(p.saved_at).toLocaleString()}</span>
              </Link>
            ))}
          </div>
        </section>
        <section className="space-y-4">
          <div className="panel">
            <div className="border-b border-line px-4 py-3"><h2 className="font-medium">Workspaces</h2></div>
            {ws.length === 0 ? <p className="p-4 text-sm text-muted">None yet.</p> : ws.map((w) => (
              <Link key={w.id} href={`/dashboard/workspaces?ws=${w.id}`} className="flex items-center gap-2 border-b border-line/60 px-4 py-2 text-sm last:border-0 hover:bg-panel-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: w.color }} /><span className="flex-1 truncate">{w.name}</span><span className="font-mono text-xs text-muted">{w.active_projects}</span>
              </Link>
            ))}
          </div>
          <div className="panel">
            <div className="flex items-center justify-between border-b border-line px-4 py-3"><h2 className="font-medium">Recent test runs</h2><Link href="/dashboard/runs" className="text-sm text-fin">All →</Link></div>
            {runs.length === 0 ? <p className="p-4 text-sm text-muted">No saved runs yet.</p> : runs.slice(0, 8).map((r) => (
              <div key={r.id} className="border-b border-line/60 px-4 py-2 text-sm last:border-0">
                <div className="truncate">{r.scenario_name}</div>
                <div className="text-xs text-muted">{r.project_name} · {new Date(r.created_at).toLocaleString()} · <span className={r.failed + r.errored ? "text-red-400" : "text-emerald-300"}>{r.passed}/{r.total} passed</span></div>
              </div>
            ))}
          </div>
        </section>
      </div>
      {creating && <NewProjectDialog onClose={() => setCreating(false)} />}
    </div>
  );
}
