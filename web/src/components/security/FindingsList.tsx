"use client";
/**
 * Findings with filters and triage. Each finding can be marked Open, Risk accepted, Fixed or Not an
 * issue, with a note: that decision is saved with the project and shown in reports.
 */
import { ChevronRight, Search, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { OWASP_API_2023, SEVERITY_LABEL, SOURCE_LABEL, STATUS_LABEL, type FindingStatus, type SecFinding, type Severity, type Triage } from "@/lib/security/types";

export const SEV_CLASS: Record<Severity, string> = { high: "border-red-500/50 bg-red-500/10 text-red-300", medium: "border-amber-500/50 bg-amber-500/10 text-amber-300", low: "border-sky-500/50 bg-sky-500/10 text-sky-300", info: "border-line bg-panel-2 text-muted" };
export function SeverityPill({ s }: { s: Severity }) {
  return <span className={`inline-block w-16 shrink-0 rounded border px-1.5 py-0.5 text-center text-[10px] font-semibold uppercase ${SEV_CLASS[s]}`}>{SEVERITY_LABEL[s]}</span>;
}

type Row = SecFinding & { triage?: Triage | null };
type Props = { findings: Row[]; triage?: Record<string, Triage>; onTriage?: (key: string, t: Triage | null) => void; onDelete?: (key: string) => void; empty: string; defaultStatus?: "all" | FindingStatus };

export function FindingsList({ findings, triage = {}, onTriage, onDelete, empty, defaultStatus = "open" }: Props) {
  const [q, setQ] = useState("");
  const [sev, setSev] = useState<"all" | Severity>("all");
  const [status, setStatus] = useState<"all" | FindingStatus>(defaultStatus);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const id = useId();
  const tri = (f: Row) => f.triage ?? triage[f.key] ?? null;
  const shown = findings.filter((f) => (sev === "all" || f.severity === sev) && (status === "all" || (tri(f)?.status ?? "open") === status) && (!q || `${f.title} ${f.location} ${f.owasp}`.toLowerCase().includes(q.toLowerCase())));
  const count = (st: FindingStatus) => findings.filter((f) => (tri(f)?.status ?? "open") === st).length;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-56"><Search size={13} className="absolute left-2 top-2.5 text-muted" /><input aria-label="Search findings" className="input py-1.5 pl-7 text-xs" placeholder="Search findings" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <label className="sr-only" htmlFor={`${id}-sev`}>Severity</label>
        <select id={`${id}-sev`} className="input w-auto py-1 text-xs" value={sev} onChange={(e) => setSev(e.target.value as typeof sev)}><option value="all">All severities</option>{(["high", "medium", "low", "info"] as const).map((s) => <option key={s} value={s}>{SEVERITY_LABEL[s]}</option>)}</select>
        <div className="flex rounded-md border border-line p-0.5 text-xs" role="group" aria-label="Status filter">
          {(["open", "accepted", "fixed", "false-positive", "all"] as const).map((s) => <button key={s} aria-pressed={status === s} className={`rounded px-2 py-0.5 ${status === s ? "bg-panel-2 text-ink" : "text-muted hover:text-ink"}`} onClick={() => setStatus(s)}>{s === "all" ? `All (${findings.length})` : `${STATUS_LABEL[s]} (${count(s)})`}</button>)}
        </div>
      </div>
      {!shown.length && <p className="panel p-4 text-center text-sm text-muted">{findings.length ? "No findings match these filters." : empty}</p>}
      <ul className="panel divide-y divide-line/60">
        {shown.map((f) => {
          const t = tri(f); const isOpen = openKey === f.key;
          return (
            <li key={f.key}>
              <button className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-panel-2/60" aria-expanded={isOpen} onClick={() => setOpenKey(isOpen ? null : f.key)}>
                <ChevronRight size={14} className={`shrink-0 text-muted transition ${isOpen ? "rotate-90" : ""}`} />
                <SeverityPill s={f.severity} />
                <span className="min-w-0 flex-1"><span className={t && t.status !== "open" ? "text-muted line-through decoration-1" : ""}>{f.title}</span><span className="block truncate font-mono text-xs text-muted">{f.location}</span></span>
                {f.owasp && <span className="chip hidden md:inline-flex" title={OWASP_API_2023[f.owasp]}>{f.owasp.replace(":2023", "")}</span>}
                <span className="chip hidden sm:inline-flex">{SOURCE_LABEL[f.source]}</span>
                {t && t.status !== "open" && <span className="chip">{STATUS_LABEL[t.status]}</span>}
              </button>
              {isOpen && (
                <div className="space-y-3 border-t border-line/60 bg-bg/40 px-10 py-3 text-sm">
                  {f.owasp && <p className="text-xs text-muted">OWASP API Security Top 10: <b className="text-ink">{f.owasp} {OWASP_API_2023[f.owasp]}</b></p>}
                  <p>{f.detail}</p>
                  <p><span className="font-medium">How to fix: </span><span className="text-muted">{f.fix}</span></p>
                  {onTriage ? <TriageEditor value={t} onChange={(next) => onTriage(f.key, next)} /> : t && <p className="text-xs"><b>{STATUS_LABEL[t.status]}</b>{t.note ? `: ${t.note}` : ""}</p>}
                  {onDelete && f.source === "manual" && <button className="btn-danger py-1 text-xs" onClick={() => onDelete(f.key)}><Trash2 size={13} />Delete this finding</button>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TriageEditor({ value, onChange }: { value: Triage | null; onChange: (t: Triage | null) => void }) {
  const id = useId();
  const [note, setNote] = useState(value?.note ?? "");
  const status = value?.status ?? "open";
  const save = (st: FindingStatus, n: string) => onChange(st === "open" && !n.trim() ? null : { status: st, note: n.trim(), at: new Date().toISOString() });
  return (
    <div className="grid gap-2 sm:grid-cols-[12rem_1fr]">
      <div><label className="label" htmlFor={`${id}-st`}>Status</label>
        <select id={`${id}-st`} className="input py-1 text-xs" value={status} onChange={(e) => save(e.target.value as FindingStatus, note)}>{(Object.keys(STATUS_LABEL) as FindingStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select></div>
      <div><label className="label" htmlFor={`${id}-note`}>Note {status === "accepted" ? "(why the risk is acceptable)" : status === "false-positive" ? "(why it isn't an issue)" : ""}</label>
        <input id={`${id}-note`} className="input py-1 text-xs" value={note} placeholder={status === "open" ? "Owner, ticket, plan…" : "Reason, ticket or date"} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (value?.note ?? "") && save(status, note)} /></div>
    </div>
  );
}
