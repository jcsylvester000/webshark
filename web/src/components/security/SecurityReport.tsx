"use client";
/**
 * Security assessment report builder. Pulls findings from every part of the project, lets the user
 * triage them and add their own, and exports a branded PDF, Markdown or CSV. Saved with the project.
 */
import { FileText, Plus, Sparkles } from "lucide-react";
import { useId } from "react";
import { fileSlug } from "@/lib/export";
import { assessmentMarkdown, assessmentReport, buildAssessment, suggestSummary } from "@/lib/security/assessment";
import { setManual, setReport, setTriage } from "@/lib/security/triage";
import { SEVERITY_LABEL, SOURCE_LABEL, type FindingSource, type SecFinding, type Severity } from "@/lib/security/types";
import { useProjects } from "@/lib/store";
import { dialogs } from "../Dialogs";
import { ExportMenu } from "../ExportMenu";
import { HelpTip } from "../HelpTip";
import { Time } from "../Time";
import { FindingsList, SEV_CLASS } from "./FindingsList";

const SOURCES: FindingSource[] = ["api", "audit", "scan", "tests", "design", "manual"];

export function SecurityReport({ projectId }: { projectId: string }) {
  const project = useProjects((s) => s.loaded[projectId]);
  const id = useId();
  if (!project) return null;
  const st = project.state;
  const sec = st.docs.security;
  const s = sec.report;
  const a = buildAssessment(project.meta.name, { spec: st.docs.api.spec, audit: st.scanner.lastAudit, scan: st.scanner.lastScan, run: st.batch.lastRun, canvas: st.canvas }, sec);
  const vulnNodes = st.canvas.nodes.filter((n) => n.data.kind === "vulnerability").length;
  const sourceState: Record<FindingSource, { ready: boolean; text: React.ReactNode }> = {
    api: { ready: !!st.docs.api.spec, text: st.docs.api.spec ? `${st.docs.api.spec.info.title}: OWASP API Top 10 check` : "No API docs yet (API docs tab)" },
    audit: { ready: !!st.scanner.lastAudit, text: st.scanner.lastAudit ? `Web audit of ${st.scanner.lastAudit.url} (score ${st.scanner.lastAudit.score})` : "No web audit yet (Scanner & audit tab)" },
    scan: { ready: !!st.scanner.lastScan || st.canvas.nodes.some((n) => n.data.scan), text: st.scanner.lastScan ? `Port scan of ${st.scanner.lastScan.target}` : st.canvas.nodes.some((n) => n.data.scan) ? "Port scans on diagram components" : "No port scan yet (Scanner & audit tab)" },
    tests: { ready: !!st.batch.lastRun, text: st.batch.lastRun ? <>Last batch run “{st.batch.lastRun.scenarioName}”, <Time value={st.batch.lastRun.finishedAt} /></> : "No batch run yet (Batch tests tab)" },
    design: { ready: st.canvas.nodes.length > 0, text: st.canvas.nodes.length ? `Diagram: ${vulnNodes} vulnerability node${vulnNodes === 1 ? "" : "s"}, attack paths and unencrypted links` : "Empty diagram (Design tab)" },
    manual: { ready: sec.manual.length > 0, text: `${sec.manual.length} finding${sec.manual.length === 1 ? "" : "s"} you added` },
  };

  async function addFinding() {
    const r = await dialogs.form({ title: "Add a finding", message: "Something you found by hand, e.g. during a manual test or review.", confirmText: "Add finding",
      fields: [{ name: "finding", label: "Finding", placeholder: "e.g. Password reset token doesn't expire" }, { name: "severity", label: "Severity (high, medium, low, info)", defaultValue: "medium" }, { name: "location", label: "Where", placeholder: "e.g. POST /auth/reset or Admin portal" }, { name: "detail", label: "What happens and why it matters" }, { name: "fix", label: "How to fix" }] });
    if (!r?.finding.trim()) return;
    const sev = (["high", "medium", "low", "info"].includes(r.severity.trim().toLowerCase()) ? r.severity.trim().toLowerCase() : "medium") as Severity;
    const f: SecFinding = { key: `manual|${Math.random().toString(36).slice(2, 10)}`, rule: "manual", owasp: "", severity: sev, title: r.finding.trim(), location: r.location.trim() || "—", detail: r.detail.trim() || "Added manually.", fix: r.fix.trim() || "—", source: "manual" };
    setManual(projectId, (all) => [...all, f]);
  }
  const markdown = () => {
    const url = URL.createObjectURL(new Blob([assessmentMarkdown(a)], { type: "text/markdown" }));
    const el = document.createElement("a"); el.href = url; el.download = `${fileSlug(s.title || `security-assessment-${project.meta.name}`)}.md`; el.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="mx-auto grid max-w-7xl gap-5 p-5 lg:grid-cols-[22rem_1fr]">
      <aside className="space-y-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold"><FileText size={18} className="text-fin" />Security assessment report<HelpTip>Collects findings from the API security check, web audit, port scans, failed batch tests and the diagram. Mark each one Fixed, Risk accepted or Not an issue, add your own, then export. Everything is saved with the project.</HelpTip></h2>
          <p className="mt-1 text-xs text-muted">Only include systems you are authorised to test.</p>
        </div>
        <div className="panel space-y-3 p-3">
          <Field id={`${id}-t`} label="Report title"><input id={`${id}-t`} className="input" value={s.title} placeholder={`Security assessment: ${project.meta.name}`} onChange={(e) => setReport(projectId, { title: e.target.value })} /></Field>
          <Field id={`${id}-a`} label="Assessor"><input id={`${id}-a`} className="input" value={s.assessor} placeholder="Your name or team" onChange={(e) => setReport(projectId, { assessor: e.target.value })} /></Field>
          <Field id={`${id}-sc`} label="Scope"><textarea id={`${id}-sc`} rows={3} className="input" value={s.scope} placeholder="Systems, URLs and dates covered; what was out of scope" onChange={(e) => setReport(projectId, { scope: e.target.value })} /></Field>
          <Field id={`${id}-m`} label="Method"><textarea id={`${id}-m`} rows={3} className="input" value={s.method} placeholder="e.g. OWASP API Top 10 review of the OpenAPI description, header audit, TCP port scan, scripted checks" onChange={(e) => setReport(projectId, { method: e.target.value })} /></Field>
          <Field id={`${id}-su`} label="Executive summary"><textarea id={`${id}-su`} rows={5} className="input" value={s.summary} placeholder={suggestSummary(a)} onChange={(e) => setReport(projectId, { summary: e.target.value })} /></Field>
          <button className="btn py-1 text-xs" onClick={() => setReport(projectId, { summary: suggestSummary(a) })}><Sparkles size={13} />Write a summary from the findings</button>
        </div>
        <fieldset className="panel space-y-1.5 p-3 text-sm">
          <legend className="px-1 text-xs font-medium uppercase tracking-wider text-muted">Include</legend>
          {SOURCES.map((src) => (
            <label key={src} className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={s.include[src]} onChange={(e) => setReport(projectId, { include: { ...s.include, [src]: e.target.checked } })} />
              <span><span className="font-medium">{SOURCE_LABEL[src]}</span><span className={`block text-xs ${sourceState[src].ready ? "text-muted" : "text-muted/80 italic"}`}>{sourceState[src].text}</span></span></label>
          ))}
          <label className="flex items-center gap-2"><input type="checkbox" checked={s.include.matrix} onChange={(e) => setReport(projectId, { include: { ...s.include, matrix: e.target.checked } })} /><span className="font-medium">Authentication matrix appendix</span></label>
          <div className="pt-2"><label className="label" htmlFor={`${id}-min`}>Lowest severity to include</label>
            <select id={`${id}-min`} className="input py-1 text-xs" value={s.minSeverity} onChange={(e) => setReport(projectId, { minSeverity: e.target.value as Severity })}>{(["high", "medium", "low", "info"] as const).map((v) => <option key={v} value={v}>{SEVERITY_LABEL[v]}{v === "info" ? " (everything)" : " and above"}</option>)}</select></div>
        </fieldset>
      </aside>

      <section className="min-w-0 space-y-4" aria-label="Findings">
        <div className="panel flex flex-wrap items-center gap-4 p-4">
          <div><div className="text-xs uppercase tracking-wider text-muted">Risk score</div><div className={`text-3xl font-semibold ${a.score >= 80 ? "text-fin" : a.score >= 50 ? "text-amber-300" : "text-red-300"}`}>{a.score}<span className="text-base text-muted">/100</span></div></div>
          <div className="flex flex-wrap gap-2">{(["high", "medium", "low", "info"] as const).map((v) => <span key={v} className={`rounded border px-2 py-1 text-xs ${SEV_CLASS[v]}`}>{a.counts[v]} {SEVERITY_LABEL[v].toLowerCase()} open</span>)}</div>
          <div className="ml-auto flex flex-wrap gap-2">
            <button className="btn py-1 text-xs" onClick={addFinding}><Plus size={13} />Add finding</button>
            <button className="btn py-1 text-xs" onClick={markdown} disabled={!a.findings.length}>Markdown</button>
            <ExportMenu small disabled={!a.findings.length} build={() => assessmentReport(a)} />
          </div>
        </div>
        <FindingsList findings={a.findings} onTriage={(k, t) => setTriage(projectId, k, t)} onDelete={(k) => setManual(projectId, (all) => all.filter((f) => f.key !== k))}
          empty="No findings yet. Run a web audit or port scan, write API docs, run batch tests, document vulnerabilities on the diagram, or add a finding yourself." />
      </section>
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return <div><label className="label" htmlFor={id}>{label}</label>{children}</div>;
}
