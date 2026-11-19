"use client";
/** Endpoint × authentication grid: shows at a glance which endpoints are protected, and how. */
import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { authMatrix, matrixReport, STATUS_TEXT, type MatrixRow } from "@/lib/security/authMatrix";
import { schemeLabel } from "@/lib/openapi/spec";
import type { OpenApiDoc } from "@/lib/openapi/types";
import { ExportMenu } from "../ExportMenu";
import { HelpTip } from "../HelpTip";
import { MethodBadge } from "./fields";

const STATUS_CLASS: Record<MatrixRow["status"], string> = { required: "text-emerald-300", optional: "text-amber-300", public: "text-sky-300", unstated: "text-muted" };

export function AuthMatrixView({ doc, project, onEdit }: { doc: OpenApiDoc; project: string; onEdit: (key: string) => void }) {
  const { schemes, rows } = authMatrix(doc);
  const [onlyRisk, setOnlyRisk] = useState(false);
  const shown = onlyRisk ? rows.filter((r) => r.risk) : rows;
  const defs = doc.components?.securitySchemes ?? {};
  const risky = rows.filter((r) => r.risk).length;
  return (
    <div className="h-full overflow-auto p-5">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="flex items-center text-base font-semibold">Authentication matrix<HelpTip>Each row is an endpoint, each column an authentication method. ✓ means that method is accepted; “all of” means several must be sent together. Rows flagged in amber change data without required authentication, or don&apos;t say.</HelpTip></h2>
          <span className="text-sm text-muted">{rows.length} endpoints · {rows.filter((r) => r.status === "required").length} require auth · {risky} to review</span>
          <label className="ml-auto flex items-center gap-1.5 text-sm"><input type="checkbox" checked={onlyRisk} onChange={(e) => setOnlyRisk(e.target.checked)} />Only rows to review</label>
          <ExportMenu small build={() => matrixReport(doc, project)} disabled={!rows.length} />
        </div>
        {!schemes.length && <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">No authentication methods are described yet. Add them in Edit → Authentication, then choose them per endpoint.</p>}
        <div className="panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted">
              <tr><th className="px-3 py-2">Endpoint</th><th className="px-3 py-2">Auth</th>{schemes.map((s) => <th key={s} className="px-3 py-2 normal-case" title={schemeLabel(defs[s])}><span className="font-mono">{s}</span></th>)}<th className="px-3 py-2">Scopes</th><th className="px-3 py-2">Review</th></tr>
            </thead>
            <tbody>
              {!shown.length && <tr><td colSpan={schemes.length + 4} className="px-3 py-4 text-center text-muted">{rows.length ? "Nothing to review: every endpoint states its authentication." : "No endpoints yet."}</td></tr>}
              {shown.map((r) => (
                <tr key={r.key} className="border-t border-line/60 align-top">
                  <td className="px-3 py-1.5"><button className="flex items-center gap-1 text-left hover:text-fin" onClick={() => onEdit(r.key)} title="Edit this endpoint"><MethodBadge method={r.method.toLowerCase()} /><span className="font-mono text-xs">{r.path}</span></button>{r.summary && <span className="block pl-14 text-xs text-muted">{r.summary}</span>}</td>
                  <td className={`px-3 py-1.5 text-xs font-medium ${STATUS_CLASS[r.status]}`}>{STATUS_TEXT[r.status]}</td>
                  {schemes.map((s) => {
                    const inAny = r.options.some((o) => o.includes(s));
                    const combined = r.options.some((o) => o.includes(s) && o.length > 1);
                    return <td key={s} className="px-3 py-1.5 text-xs">{inAny ? <span className="text-emerald-300" title={combined ? "Must be sent together with another method" : "Accepted"}>✓{combined ? " all of" : r.options.length > 1 ? " or" : ""}</span> : <span className="text-muted" aria-label="not accepted">·</span>}</td>;
                  })}
                  <td className="px-3 py-1.5 font-mono text-xs text-muted">{r.scopes.join(" ") || "—"}</td>
                  <td className="px-3 py-1.5 text-xs">{r.risk ? <span className="flex items-start gap-1 text-amber-300"><AlertTriangle size={13} className="mt-0.5 shrink-0" />{r.risk}</span> : <span className="text-muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
