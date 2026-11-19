/** Report builders (shared by pages) for CSV/PDF export. */
import type { BatchRun, StepResult } from "./batch";
import type { Report } from "./export";
import type { ResultEntry } from "./project";
import type { AuditReport, Frame, ScanResponse } from "./types";

export const scanReport = (s: ScanResponse, project?: string): Report => ({
  title: `Port scan - ${s.target}`, meta: [["Target", `${s.target} (${s.address})`], ["Ports scanned", String(s.scanned)], ["Open / closed / filtered", `${s.open.length} / ${s.closed_count} / ${s.filtered_count}`], ["Duration", `${s.duration_ms} ms`], ...(project ? [["Project", project] as [string, string]] : [])],
  sections: [{ heading: "Open ports", columns: [{ key: "port", label: "Port" }, { key: "state", label: "State" }, { key: "service", label: "Service" }, { key: "rtt_ms", label: "RTT (ms)" }, { key: "banner", label: "Banner" }, { key: "note", label: "Note" }], rows: s.open }],
});

export const auditReport = (a: AuditReport, project?: string): Report => ({
  title: `Web audit - ${a.final_url}`, meta: [["URL", a.final_url], ["HTTP status", String(a.status)], ["Score", `${a.score}/100`], ...(project ? [["Project", project] as [string, string]] : [])],
  sections: [{ heading: "Findings", columns: [{ key: "severity", label: "Severity" }, { key: "title", label: "Finding" }, { key: "detail", label: "Detail" }, { key: "recommendation", label: "Recommendation" }], rows: a.findings }],
});

export const runReport = (r: BatchRun | { scenario_name: string; started_at: string; finished_at: string; results: StepResult[]; project_name?: string }, project?: string): Report => {
  const name = "scenarioName" in r ? r.scenarioName : r.scenario_name;
  const started = "startedAt" in r ? r.startedAt : r.started_at;
  const finished = "finishedAt" in r ? r.finishedAt : r.finished_at;
  const res = r.results;
  const count = (s: string) => res.filter((x) => x.status === s).length;
  return {
    title: `Batch test - ${name}`,
    meta: [["Project", project ?? ("project_name" in r ? r.project_name ?? "" : "")], ["Started", new Date(started).toLocaleString()], ["Finished", new Date(finished).toLocaleString()],
      ["Result", `${count("pass")} passed, ${count("fail")} failed, ${count("error")} errors, ${count("skipped")} skipped of ${res.length}`]],
    sections: [
      { heading: "Steps", columns: [{ key: "status", label: "Status" }, { key: "name", label: "Step" }, { key: "type", label: "Type" }, { key: "target", label: "Target" }, { key: "durationMs", label: "ms" }, { key: "summary", label: "Summary" }], rows: res },
      { heading: "Checks", columns: [{ key: "step", label: "Step" }, { key: "check", label: "Check" }, { key: "ok", label: "Result" }, { key: "actual", label: "Actual" }],
        rows: res.flatMap((x) => x.checks.map((c) => ({ step: x.name, check: c.label, ok: c.ok ? "pass" : "fail", actual: c.actual }))) },
    ],
  };
};

export const resultsReport = (rows: ResultEntry[], project: string): Report => ({
  title: `Test results - ${project}`, meta: [["Project", project], ["Entries", String(rows.length)]],
  sections: [{ heading: "Results", columns: [{ key: "at", label: "Time", value: (r: ResultEntry) => new Date(r.at).toLocaleString() }, { key: "tool", label: "Tool" }, { key: "target", label: "Target" }, { key: "ok", label: "Result", value: (r: ResultEntry) => (r.ok ? "pass" : "fail") }, { key: "summary", label: "Summary" }], rows: rows }],
});

export const framesReport = (frames: Frame[], name: string, filter: string): Report => ({
  title: `Packet capture - ${name}`, meta: [["File", name], ["Display filter", filter || "(none)"], ["Packets", String(frames.length)]],
  sections: [{ heading: "Packets", note: frames.length > 5000 ? "PDF shows the first 5000 packets; CSV contains all." : undefined,
    columns: [{ key: "no", label: "No." }, { key: "time", label: "Time" }, { key: "src", label: "Source" }, { key: "dst", label: "Destination" }, { key: "protocol", label: "Protocol" }, { key: "length", label: "Length" }, { key: "info", label: "Info" }], rows: frames }],
});
