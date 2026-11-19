"use client";
/** Public read-only view of a shared project (diagram, inventory, notes, saved runs) + password gate. */
import { Background, BackgroundVariant, Controls, MarkerType, ReactFlow, ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Lock } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { StepResult } from "@/lib/batch";
import { stageOf } from "@/lib/cqrs";
import { kindOf, nodeTarget } from "@/lib/nodes";
import { runReport } from "@/lib/reports";
import type { OpenApiDoc } from "@/lib/openapi/types";
import type { Canvas } from "@/lib/types";
import { Reference } from "./docs/Reference";
import { EventsReference } from "./docs/EventsDocs";
import { ThreatModel } from "./security/ThreatModel";
import { viewOf } from "@/lib/asyncapi";
import { layoutModel } from "@/lib/layout";
import { FindingsList, SEV_CLASS } from "./security/FindingsList";
import { assessmentMarkdown, assessmentReport, suggestSummary, type Assessment } from "@/lib/security/assessment";
import { SEVERITY_LABEL } from "@/lib/security/types";
import { DeviceNode } from "./designer/DeviceNode";
import { LinkEdge } from "./designer/LinkEdge";
import { ExportMenu } from "./ExportMenu";
import { Wordmark } from "./Logo";
import { PasswordInput } from "./PasswordInput";
import { Tags } from "./ProjectBadges";
import { Time } from "./Time";

type Run = { id: string; scenario_name: string; started_at: string; finished_at: string; total: number; passed: number; failed: number; errored: number; results: StepResult[] };
type Data = { locked: false; label: string; project: { name: string; description: string; tags: string[]; stage: string; savedAt: string; version: number; owner: string }; canvas: Canvas; notes: string | null; apiSpec: OpenApiDoc | null; eventsSpec: Record<string, unknown> | null; report: Assessment | null; runs: Run[] };
const nodeTypes = { device: DeviceNode };
const edgeTypes = { link: LinkEdge };

export function SharedView() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<Data | null>(null);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await fetch(`/api/share/${token}`, { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setError(j.message ?? "This link isn't available."); return; }
    if (j.locked) setLocked(true); else { setLocked(false); setData(j); }
  }, [token]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch; state is set after the request resolves
  useEffect(() => { load(); }, [load]);

  const flow = useMemo(() => data ? {
    nodes: data.canvas.nodes.map((n) => ({ id: n.id, type: "device", position: n.position, data: n.data, draggable: false, connectable: false })),
    edges: data.canvas.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: (e.sourceHandle as string) ?? null, targetHandle: (e.targetHandle as string) ?? null, type: "link", data: e.data ?? {}, animated: !!e.data?.attack, markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 } })),
  } : null, [data]);

  if (error) return <Centered><h1 className="text-xl font-semibold">Link unavailable</h1><p className="text-muted">{error}</p></Centered>;
  if (locked) return (
    <Centered>
      <Lock className="mx-auto text-fin" />
      <h1 className="text-xl font-semibold">This shared project is password-protected</h1>
      <p className="text-sm text-muted">Enter the password the owner gave you.</p>
      <form className="space-y-3 text-left" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setPwError(null);
        const r = await fetch(`/api/share/${token}/unlock`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: pw }) });
        const j = await r.json().catch(() => ({}));
        setBusy(false);
        if (!r.ok) { setPwError(j.message ?? "Could not unlock"); return; }
        load();
      }}>
        <label className="label" htmlFor="share-pw">Password</label>
        <PasswordInput id="share-pw" autoComplete="current-password" value={pw} onChange={setPw} />
        {pwError && <p role="alert" className="text-sm text-danger">{pwError}</p>}
        <button className="btn-primary w-full justify-center" disabled={busy}>{busy ? "Checking…" : "View project"}</button>
      </form>
    </Centered>
  );
  if (!data || !flow) return <Centered><p className="text-muted">Loading shared project…</p></Centered>;

  const assets = data.canvas.nodes.filter((n) => !["note", "attacker", "vulnerability"].includes(n.data.kind));
  const st = stageOf(data.project.stage);
  return (
    <div className="min-h-screen">
      <header className="flex flex-wrap items-center gap-3 border-b border-line bg-panel px-6 py-3">
        <Wordmark /><span className="chip">Read-only shared view</span>
        <span className="ml-auto text-xs text-muted">Shared by {data.project.owner} · <Time value={data.project.savedAt} prefix="last saved " /></span>
      </header>
      <main className="mx-auto max-w-6xl space-y-6 p-6">
        <div>
          <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-semibold">{data.project.name}</h1>{data.project.stage !== "none" && <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${st.cls}`}>{st.label}</span>}</div>
          {data.project.description && <p className="mt-1 max-w-3xl text-muted">{data.project.description}</p>}
          <div className="mt-2"><Tags tags={data.project.tags} /></div>
        </div>
        {flow.nodes.length === 0 ? <section className="panel p-8 text-center text-sm text-muted" aria-label="Environment diagram">No diagram yet: the owner hasn&apos;t added components to this project.</section> :
        <section className="panel h-[480px] overflow-hidden" aria-label="Environment diagram">
          <ReactFlowProvider>
            <ReactFlow nodes={flow.nodes} edges={flow.edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} fitView nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} proOptions={{ hideAttribution: true }}>
              <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="var(--c-line)" /><Controls showInteractive={false} />
            </ReactFlow>
          </ReactFlowProvider>
        </section>}
        <section tabIndex={0} aria-label="Inventory" className="panel overflow-x-auto">
          <div className="flex items-center justify-between border-b border-line px-4 py-3"><h2 className="font-medium">Inventory ({assets.length})</h2>
            <ExportMenu small build={() => ({ title: `Inventory - ${data.project.name}`, meta: [["Project", data.project.name], ["Saved", new Date(data.project.savedAt).toLocaleString()]], sections: [{ heading: "Components", columns: [{ key: "label", label: "Component" }, { key: "type", label: "Type" }, { key: "target", label: "Host / URL" }, { key: "zone", label: "Zone" }, { key: "os", label: "OS" }, { key: "ports", label: "Ports" }, { key: "notes", label: "Notes" }], rows: assets.map((n) => ({ label: n.data.label, type: kindOf(n.data.kind).label, target: n.data.url || nodeTarget(n.data) || "", zone: n.data.zone ?? "", os: n.data.os ?? "", ports: n.data.ports ?? "", notes: n.data.notes ?? "" })) }] })} />
          </div>
          <table className="w-full text-sm"><thead className="text-left text-xs uppercase tracking-wider text-muted"><tr><th className="px-4 py-2">Component</th><th className="px-4 py-2">Type</th><th className="px-4 py-2">Host / URL</th><th className="px-4 py-2">Zone</th><th className="px-4 py-2">Ports</th></tr></thead>
            <tbody>{!assets.length && <tr><td colSpan={5} className="px-4 py-4 text-center text-muted">No components documented yet.</td></tr>}{assets.map((n) => <tr key={n.id} className="border-t border-line/60"><td className="px-4 py-1.5">{n.data.label}</td><td className="px-4 py-1.5 text-muted">{kindOf(n.data.kind).label}</td><td className="px-4 py-1.5 font-mono text-xs">{n.data.url || nodeTarget(n.data) || "—"}</td><td className="px-4 py-1.5 text-muted">{n.data.zone || "—"}</td><td className="px-4 py-1.5 font-mono text-xs">{n.data.ports || "—"}</td></tr>)}</tbody></table>
        </section>
        {data.notes && <section className="panel p-4"><h2 className="font-medium">Notes</h2><pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-muted">{data.notes}</pre></section>}
        {(() => { const lm = layoutModel({ name: data.project.name, description: "", savedAt: null, canvas: data.canvas, spec: null, asyncSpec: null, posture: null }); return lm.flows.length > 0 && (
          <section tabIndex={0} className="panel overflow-x-auto" aria-label="Data flows">
            <div className="border-b border-line px-4 py-3"><h2 className="font-medium">Data flows ({lm.flows.length})</h2></div>
            <table className="w-full text-sm"><thead className="text-left text-xs uppercase tracking-wider text-muted"><tr><th className="px-4 py-2">From</th><th className="px-4 py-2">To</th><th className="px-4 py-2">Protocol / port</th><th className="px-4 py-2">Encrypted</th><th className="px-4 py-2">Purpose</th></tr></thead>
              <tbody>{lm.flows.map((f) => <tr key={f.id} className="border-t border-line/60"><td className="px-4 py-1.5">{f.from}<span className="block text-xs text-muted">{f.fromZone}</span></td><td className="px-4 py-1.5">{f.to}<span className="block text-xs text-muted">{f.toZone}</span></td><td className="px-4 py-1.5 font-mono text-xs">{f.protocol || "—"}{f.port ? `:${f.port}` : ""}</td><td className="px-4 py-1.5">{f.encrypted ? "yes" : "no"}</td><td className="px-4 py-1.5 text-muted">{f.label || "—"}</td></tr>)}</tbody></table>
          </section>); })()}
        {data.eventsSpec && (
          <section className="panel overflow-hidden" aria-label="Events reference">
            <div className="border-b border-line px-4 py-3"><h2 className="font-medium">Events (AsyncAPI)</h2></div>
            <EventsReference v={viewOf(data.eventsSpec)} raw={data.eventsSpec} embedded />
          </section>
        )}
        {data.apiSpec?.info && (
          <section className="panel overflow-hidden" aria-label="API reference">
            <div className="border-b border-line px-4 py-3"><h2 className="font-medium">API reference</h2></div>
            <Reference doc={data.apiSpec} embedded />
          </section>
        )}
        {data.report && <SharedReport a={data.report} />}
        {data.runs.length > 0 && (
          <section className="panel">
            <div className="border-b border-line px-4 py-3"><h2 className="font-medium">Saved test runs</h2></div>
            {data.runs.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 border-b border-line/60 px-4 py-2.5 text-sm last:border-0">
                <span className="flex-1">{r.scenario_name}<span className="block text-xs text-muted"><Time value={r.started_at} /></span></span>
                <span className={`font-mono text-xs ${r.failed + r.errored ? "text-red-400" : "text-emerald-300"}`}>{r.passed}/{r.total} passed</span>
                <ExportMenu small build={() => runReport({ scenario_name: r.scenario_name, started_at: r.started_at, finished_at: r.finished_at, results: r.results, project_name: data.project.name })} />
              </div>
            ))}
          </section>
        )}
        <p className="text-center text-xs text-muted">Made with Slyshark · network, server and application documentation</p>
      </main>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="grid min-h-screen place-items-center px-4"><div className="panel w-full max-w-sm space-y-3 p-7 text-center"><div className="flex justify-center"><Wordmark /></div>{children}</div></main>;
}

function SharedReport({ a }: { a: Assessment }) {
  const s = a.settings;
  const md = () => { const url = URL.createObjectURL(new Blob([assessmentMarkdown(a)], { type: "text/markdown" })); const el = document.createElement("a"); el.href = url; el.download = "security-assessment.md"; el.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  return (
    <section className="panel" aria-label="Security assessment">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <h2 className="font-medium">{s.title || "Security assessment"}</h2>
        <span className="font-mono text-sm">Risk score {a.score}/100</span>
        <div className="ml-auto flex gap-1.5"><button className="btn px-2 py-1 text-xs" onClick={md}>Markdown</button><ExportMenu small build={() => assessmentReport(a)} /></div>
      </div>
      <div className="space-y-3 p-4 text-sm">
        <div className="flex flex-wrap gap-2">{(["high", "medium", "low", "info"] as const).map((v) => <span key={v} className={`rounded border px-2 py-1 text-xs ${SEV_CLASS[v]}`}>{a.counts[v]} {SEVERITY_LABEL[v].toLowerCase()} open</span>)}</div>
        <p className="whitespace-pre-wrap">{s.summary || suggestSummary(a)}</p>
        {s.scope && <p className="whitespace-pre-wrap text-muted"><b className="text-ink">Scope: </b>{s.scope}</p>}
        {s.method && <p className="whitespace-pre-wrap text-muted"><b className="text-ink">Method: </b>{s.method}</p>}
        {s.assessor && <p className="text-xs text-muted">Assessor: {s.assessor}</p>}
        <FindingsList findings={a.findings} defaultStatus="all" empty="No findings recorded." />
        {a.threats && a.threats.length > 0 && <ThreatModel threats={a.threats} />}
      </div>
    </section>
  );
}
