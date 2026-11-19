"use client";
/** Saved batch test runs across all projects (read model), with detail view and CSV/PDF export. */
import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { dialogs } from "@/components/Dialogs";
import { ExportMenu } from "@/components/ExportMenu";
import { Time } from "@/components/Time";
import { PageHeader } from "@/components/PageHeader";
import { errMsg } from "@/lib/api";
import type { StepResult } from "@/lib/batch";
import { command, query, type RunSummary } from "@/lib/cqrs";
import { exportCsv, exportPdf } from "@/lib/export";
import { runReport } from "@/lib/reports";

type RunDetail = RunSummary & { results: StepResult[] };
const STATUS_CLS: Record<string, string> = { pass: "text-emerald-300", fail: "text-red-400", error: "text-orange-300", skipped: "text-muted" };

export default function RunsPage() {
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => query<RunSummary[]>("runs").then(setRuns).catch((e) => setError(errMsg(e)));
  useEffect(() => { load(); }, []);
  const fetchRun = (id: string) => query<RunDetail>(`runs/${id}`);
  const all = runs ?? [];
  const summaryReport = () => ({
    title: "Saved test runs", meta: [["Runs", String(all.length)]] as [string, string][],
    sections: [{ heading: "Runs", columns: [{ key: "created_at", label: "Saved", value: (r: RunSummary) => new Date(r.created_at).toLocaleString() }, { key: "project_name", label: "Project" }, { key: "scenario_name", label: "Scenario" }, { key: "total", label: "Steps" }, { key: "passed", label: "Passed" }, { key: "failed", label: "Failed" }, { key: "errored", label: "Errors" }, { key: "duration_ms", label: "Duration ms" }], rows: all }],
  });

  return (
    <div>
      <PageHeader title="Test runs" subtitle="Batch test runs you chose to save. Run new ones from a project's Batch tests tab. Click a row for details.">
        <ExportMenu disabled={!all.length} build={summaryReport} />
      </PageHeader>
      {error && <p className="mx-6 mt-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="space-y-4 p-6">
        <table className="panel w-full text-sm">
          <thead className="bg-panel-2 text-left text-xs uppercase tracking-wider text-muted"><tr><th className="px-3 py-2">Saved</th><th className="px-3 py-2">Project</th><th className="px-3 py-2">Scenario</th><th className="px-3 py-2">Result</th><th className="px-3 py-2">Duration</th><th className="px-3 py-2 text-right">Export</th></tr></thead>
          <tbody>
            {all.map((r) => (
              <tr key={r.id} className="cursor-pointer border-t border-line/60 hover:bg-panel-2" onClick={() => fetchRun(r.id).then(setDetail).catch((e) => setError(errMsg(e)))}>
                <td className="whitespace-nowrap px-3 py-2 text-muted"><Time value={r.created_at} /></td>
                <td className="px-3 py-2"><Link href={`/dashboard/projects/${r.project_id}`} onClick={(e) => e.stopPropagation()} className="hover:text-fin">{r.project_name}</Link></td>
                <td className="px-3 py-2">{r.scenario_name}</td>
                <td className={`px-3 py-2 font-mono text-xs ${r.failed + r.errored ? "text-red-400" : "text-emerald-300"}`}>{r.passed}/{r.total} passed{r.failed ? ` · ${r.failed} failed` : ""}{r.errored ? ` · ${r.errored} errors` : ""}</td>
                <td className="px-3 py-2 font-mono text-xs text-muted">{(r.duration_ms / 1000).toFixed(1)} s</td>
                <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                  <span className="inline-flex gap-1.5">
                    <button className="btn px-2 py-0.5 text-xs" onClick={async () => exportCsv(runReport(await fetchRun(r.id)))}>CSV</button>
                    <button className="btn px-2 py-0.5 text-xs" onClick={async () => exportPdf(runReport(await fetchRun(r.id)))}>PDF</button>
                    <button className="px-1 text-muted hover:text-danger" aria-label="Delete run" onClick={async () => { if (await dialogs.confirm({ title: "Delete this saved run?", message: "Its results will be removed permanently.", danger: true })) { await command("batch.deleteRun", { id: r.id }); if (detail?.id === r.id) setDetail(null); load(); } }}><Trash2 size={14} /></button>
                  </span>
                </td>
              </tr>
            ))}
            {runs?.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-muted">No saved runs yet. Open a project → Batch Tests → run a scenario → Save run.</td></tr>}
          </tbody>
        </table>
        {detail && (
          <div className="panel">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="font-medium">{detail.scenario_name} <span className="text-sm text-muted">· {detail.project_name} · {new Date(detail.started_at).toLocaleString()}</span></h2>
              <ExportMenu small build={() => runReport(detail)} />
            </div>
            <table className="w-full text-sm">
              <tbody>
                {detail.results.map((s) => (
                  <tr key={s.stepId} className="border-t border-line/60 align-top">
                    <td className={`px-3 py-1.5 font-mono text-xs uppercase ${STATUS_CLS[s.status]}`}>{s.status}</td>
                    <td className="px-3 py-1.5">{s.name}<div className="font-mono text-xs text-muted">{s.target}</div></td>
                    <td className="px-3 py-1.5 font-mono text-xs text-muted">{s.summary}{s.checks.filter((c) => !c.ok).map((c, i) => <div key={i} className="text-red-400">✗ {c.label}: {c.actual}</div>)}</td>
                    <td className="px-3 py-1.5 font-mono text-xs text-muted">{s.durationMs} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
