"use client";
/** OWASP API Security Top 10 check of the API description, with triage. */
import { ShieldCheck } from "lucide-react";
import type { OpenApiDoc } from "@/lib/openapi/types";
import { owaspCheck } from "@/lib/security/owasp";
import { setTriage } from "@/lib/security/triage";
import { OWASP_API_2023, riskScore, SEVERITY_LABEL, SOURCE_LABEL, STATUS_LABEL } from "@/lib/security/types";
import { useProjects } from "@/lib/store";
import { ExportMenu } from "../ExportMenu";
import { HelpTip } from "../HelpTip";
import { FindingsList } from "../security/FindingsList";

export function SecurityCheckView({ doc, projectId, onOpenReport }: { doc: OpenApiDoc; projectId: string; onOpenReport: () => void }) {
  const triage = useProjects((s) => s.loaded[projectId]?.state.docs.security.triage) ?? {};
  const findings = owaspCheck(doc);
  const score = riskScore(findings, triage);
  const byCat = Object.entries(OWASP_API_2023).map(([id, name]) => ({ id, name, open: findings.filter((f) => f.owasp === id && (triage[f.key]?.status ?? "open") === "open").length, total: findings.filter((f) => f.owasp === id).length }));
  return (
    <div className="h-full overflow-auto p-5">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="flex items-center gap-2 text-base font-semibold"><ShieldCheck size={18} className="text-fin" />API security check<HelpTip>Checks your API description against the OWASP API Security Top 10 (2023), the most common ways APIs get breached. It reads what the documentation says, so it can&apos;t prove the live API behaves that way: use it to spot gaps and decide what to test.</HelpTip></h2>
          <span className={`rounded-md border px-2 py-0.5 font-mono text-sm ${score >= 80 ? "border-fin/40 text-fin" : score >= 50 ? "border-amber-500/50 text-amber-300" : "border-red-500/50 text-red-300"}`} title="100 minus open findings weighted by severity">Score {score}/100</span>
          <div className="ml-auto flex gap-2">
            <ExportMenu small disabled={!findings.length} build={() => ({ title: `API security check - ${doc.info.title}`, meta: [["API", `${doc.info.title} v${doc.info.version}`], ["Score", `${score}/100`]], sections: [{ heading: "Findings", columns: [{ key: "severity", label: "Severity", value: (f) => SEVERITY_LABEL[f.severity as keyof typeof SEVERITY_LABEL] }, { key: "owasp", label: "OWASP" }, { key: "title", label: "Finding" }, { key: "location", label: "Where" }, { key: "status", label: "Status", value: (f) => STATUS_LABEL[triage[f.key]?.status ?? "open"] }, { key: "note", label: "Note", value: (f) => triage[f.key]?.note ?? "" }, { key: "fix", label: "Recommendation" }, { key: "source", label: "Source", value: (f) => SOURCE_LABEL[f.source as keyof typeof SOURCE_LABEL] }], rows: findings }] })} />
            <button className="btn py-1 text-xs" onClick={onOpenReport}>Open security report</button>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {byCat.map((c) => <div key={c.id} className={`rounded-md border px-2.5 py-2 text-xs ${c.open ? "border-amber-500/40" : "border-line"}`} title={c.name}><div className="font-mono text-muted">{c.id.replace(":2023", "")}</div><div className="line-clamp-2 min-h-8">{c.name}</div><div className={c.open ? "text-amber-300" : "text-muted"}>{c.total ? `${c.open} open of ${c.total}` : "No findings"}</div></div>)}
        </div>
        <FindingsList findings={findings} triage={triage} onTriage={(k, t) => setTriage(projectId, k, t)} empty="No findings: the description covers the OWASP checks Slyshark runs." />
        <p className="text-xs text-muted">API6 (sensitive business flows) and API10 (unsafe consumption of third-party APIs) depend on how the API is used, so they can&apos;t be detected from the description. Add them as findings in the Security report if they apply.</p>
      </div>
    </div>
  );
}
