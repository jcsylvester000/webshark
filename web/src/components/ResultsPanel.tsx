"use client";
/** Results recorded during this project's work (ping, scans, HTTP, audits). Stored with the project. */
import { Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { resultsReport } from "@/lib/reports";
import { useProjects } from "@/lib/store";
import { dialogs } from "./Dialogs";
import { ExportMenu } from "./ExportMenu";

export function ResultsPanel({ projectId }: { projectId: string }) {
  const project = useProjects((s) => s.loaded[projectId]);
  const update = useProjects((s) => s.update);
  const [tool, setTool] = useState("all");
  const rows = useMemo(() => (project?.state.results ?? []).filter((r) => tool === "all" || r.tool === tool), [project, tool]);
  if (!project) return null;
  return (
    <div className="space-y-3 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-medium">Test results</h2>
        <span className="text-sm text-muted">{project.state.results.length} entries · kept with the project (latest 300)</span>
        <select aria-label="Filter by tool" className="input ml-auto w-40" value={tool} onChange={(e) => setTool(e.target.value)}>
          {["all", "ping", "dns", "portscan", "http", "audit"].map((t) => <option key={t}>{t}</option>)}
        </select>
        <ExportMenu disabled={!rows.length} build={() => resultsReport(rows, project.meta.name)} />
        <button className="btn-danger" disabled={!project.state.results.length} onClick={async () => { if (await dialogs.confirm({ title: "Clear all results?", message: "Results are removed from the project. This becomes permanent when you save; Revert undoes it before then.", confirmText: "Clear", danger: true })) update(projectId, (s) => ({ ...s, results: [] })); }}><Trash2 size={14} />Clear</button>
      </div>
      <table className="panel w-full text-sm">
        <thead className="bg-panel-2 text-left text-xs uppercase tracking-wider text-muted"><tr><th className="px-3 py-2">Time</th><th className="px-3 py-2">Tool</th><th className="px-3 py-2">Target</th><th className="px-3 py-2">Result</th><th className="px-3 py-2">Summary</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-line/60">
              <td className="whitespace-nowrap px-3 py-1.5 text-muted">{new Date(r.at).toLocaleString()}</td>
              <td className="px-3 py-1.5 font-mono text-fin">{r.tool}</td>
              <td className="max-w-xs truncate px-3 py-1.5" title={r.target}>{r.target}</td>
              <td className={`px-3 py-1.5 font-mono text-xs ${r.ok ? "text-emerald-300" : "text-red-400"}`}>{r.ok ? "pass" : "fail"}</td>
              <td className="px-3 py-1.5 font-mono text-xs text-muted">{r.summary}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={5} className="px-3 py-6 text-center text-muted">Run tools from the designer, console, API client or scanner, and results appear here.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
