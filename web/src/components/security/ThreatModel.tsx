"use client";
/** STRIDE threat model from the diagram, grouped by category, with status + mitigation notes. */
import { useId, useState } from "react";
import { STRIDE, type Stride, type Threat } from "@/lib/security/threats";
import { STATUS_LABEL, type FindingStatus, type Triage } from "@/lib/security/types";
import { HelpTip } from "../HelpTip";
import { SeverityPill } from "./FindingsList";

type Row = Threat & { triage: Triage | null };

export function ThreatModel({ threats, boundaries, flows, onTriage }: { threats: Row[]; boundaries?: number; flows?: number; onTriage?: (key: string, t: Triage | null) => void }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <h3 className="flex items-center font-medium">Threat model (STRIDE)<HelpTip>STRIDE is a checklist of six kinds of threat. Slyshark reads your diagram: data flows, zones (trust boundaries), internet-facing parts, documented attack paths and vulnerabilities. Record how each threat is handled in the mitigation note.</HelpTip></h3>
        <span className="text-muted">{flows !== undefined ? `${flows} data flows · ${boundaries ?? 0} cross a trust boundary · ` : ""}{threats.length} threats</span>
      </div>
      {!threats.length && <p className="panel p-4 text-sm text-muted">No threats found. Connect components on the diagram, set a Zone on each one, and mark links Encrypted where they are, then come back.</p>}
      {(Object.keys(STRIDE) as Stride[]).map((k) => {
        const list = threats.filter((t) => t.stride === k);
        if (!list.length) return null;
        return (
          <section key={k} aria-label={STRIDE[k].name} className="panel">
            <div className="border-b border-line px-4 py-2.5"><h4 className="font-medium"><span className="mr-2 inline-grid h-6 w-6 place-items-center rounded bg-fin/15 font-mono text-xs text-fin">{k}</span>{STRIDE[k].name}</h4><p className="text-xs text-muted">{STRIDE[k].question}</p></div>
            <ul className="divide-y divide-line/60">{list.map((t) => <ThreatRow key={t.key} t={t} onTriage={onTriage} />)}</ul>
          </section>
        );
      })}
    </div>
  );
}

function ThreatRow({ t, onTriage }: { t: Row; onTriage?: (key: string, x: Triage | null) => void }) {
  const id = useId();
  const [note, setNote] = useState(t.triage?.note ?? "");
  const status = t.triage?.status ?? "open";
  const save = (st: FindingStatus, n: string) => onTriage?.(t.key, st === "open" && !n.trim() ? null : { status: st, note: n.trim(), at: new Date().toISOString() });
  return (
    <li className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[4.5rem_1fr_15rem]">
      <SeverityPill s={t.severity} />
      <div className="min-w-0">
        <div className={status !== "open" ? "text-muted line-through decoration-1" : ""}>{t.threat}</div>
        <div className="font-mono text-xs text-muted">{t.element}</div>
        <div className="mt-1 text-xs"><span className="font-medium">Suggested mitigation: </span><span className="text-muted">{t.mitigation}</span></div>
      </div>
      {onTriage ? (
        <div className="space-y-1.5">
          <label className="sr-only" htmlFor={`${id}-s`}>Status</label>
          <select id={`${id}-s`} className="input py-1 text-xs" value={status} onChange={(e) => save(e.target.value as FindingStatus, note)}>{(Object.keys(STATUS_LABEL) as FindingStatus[]).map((s) => <option key={s} value={s}>{s === "fixed" ? "Mitigated" : STATUS_LABEL[s]}</option>)}</select>
          <label className="sr-only" htmlFor={`${id}-n`}>Mitigation note</label>
          <input id={`${id}-n`} className="input py-1 text-xs" placeholder="How it's handled (control, ticket)" value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (t.triage?.note ?? "") && save(status, note)} />
        </div>
      ) : <div className="text-xs"><b>{status === "fixed" ? "Mitigated" : STATUS_LABEL[status]}</b>{t.triage?.note ? `: ${t.triage.note}` : ""}</div>}
    </li>
  );
}
