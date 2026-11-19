"use client";
/** Dashboard overview: environment count, recent activity, and quick actions. */
import { Cable, FileSearch, Radar, Send, SquareTerminal } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { api } from "@/lib/api";
import type { EnvSummary } from "@/lib/types";

type Log = { id: number; kind: string; target: string; summary: Record<string, unknown>; created_at: string };

const QUICK = [
  { href: "/dashboard/environments", icon: Cable, title: "Design an environment", text: "Drag and drop infrastructure or start from a template." },
  { href: "/dashboard/terminal", icon: SquareTerminal, title: "Open the console", text: "ping, dns, curl, scan." },
  { href: "/dashboard/api-client", icon: Send, title: "Send an API request", text: "Test GET/POST with Bearer tokens." },
  { href: "/dashboard/scanner", icon: Radar, title: "Scan & audit a host", text: "Ports, headers, CORS, exposed files." },
  { href: "/dashboard/captures", icon: FileSearch, title: "Analyze a capture", text: "Open a .pcap or .pcapng file." },
];

export default function Overview() {
  const [envs, setEnvs] = useState<EnvSummary[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  useEffect(() => {
    api<EnvSummary[]>("/environments").then(setEnvs).catch(() => null);
    api<Log[]>("/tools/logs").then(setLogs).catch(() => null);
  }, []);
  return (
    <div>
      <PageHeader title="Overview" subtitle="Your environments, tools, and recent activity." />
      <div className="grid gap-6 p-6 xl:grid-cols-3">
        <section className="space-y-3 xl:col-span-2">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {QUICK.map(({ href, icon: Icon, title, text }) => (
              <Link key={href} href={href} className="panel group p-4 hover:border-fin/50">
                <Icon size={20} className="text-fin" />
                <div className="mt-3 font-medium group-hover:text-white">{title}</div>
                <div className="text-sm text-muted">{text}</div>
              </Link>
            ))}
          </div>
          <div className="panel">
            <div className="flex items-center justify-between border-b border-line px-4 py-3"><h2 className="font-medium">Recent environments</h2><Link href="/dashboard/environments" className="text-sm text-fin">All →</Link></div>
            {envs.length === 0 ? <p className="p-4 text-sm text-muted">No environments yet.</p> : envs.slice(0, 6).map((e) => (
              <Link key={e.id} href={`/dashboard/environments/${e.id}`} className="flex justify-between border-b border-line/60 px-4 py-2.5 text-sm last:border-0 hover:bg-panel-2">
                <span>{e.name}</span><span className="text-muted">{e.node_count ?? 0} nodes · {new Date(e.updated_at).toLocaleString()}</span>
              </Link>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="border-b border-line px-4 py-3"><h2 className="font-medium">Recent activity</h2></div>
          {logs.length === 0 ? <p className="p-4 text-sm text-muted">No tests run yet.</p> : logs.slice(0, 12).map((l) => (
            <div key={l.id} className="border-b border-line/60 px-4 py-2 text-sm last:border-0">
              <span className="mr-2 rounded bg-panel-2 px-1.5 py-0.5 font-mono text-xs text-fin">{l.kind}</span>{l.target}
              <div className="text-xs text-muted">{new Date(l.created_at).toLocaleString()}</div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
