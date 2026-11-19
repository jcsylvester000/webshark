"use client";
/**
 * Layout docs: architecture documentation generated from the diagram (zones, inventory, data
 * flows, APIs linked to the API docs, security posture). The user adds a short intro to each
 * section; everything is saved with the project and exports to Markdown, PDF or CSV.
 */
import { ExternalLink, FileText, Lock, LockOpen } from "lucide-react";
import { useId } from "react";
import { fileSlug } from "@/lib/export";
import { LAYOUT_SECTIONS, layoutMarkdown, layoutModel, layoutReport, type LayoutSettings, type SectionId } from "@/lib/layout";
import { kindOf, nodeTarget } from "@/lib/nodes";
import { buildAssessment } from "@/lib/security/assessment";
import { threatModel } from "@/lib/security/threats";
import { useProjects } from "@/lib/store";
import { ExportMenu } from "./ExportMenu";
import { HelpTip } from "./HelpTip";
import { Time } from "./Time";

const HINTS: Record<SectionId, string> = {
  overview: "What this environment is for, who owns it, and when it was last reviewed.",
  zones: "How the network is divided (e.g. Internet, DMZ, App subnet, Data subnet) and what may cross.",
  inventory: "Anything a newcomer should know about the components (naming, where credentials live, backups).",
  flows: "Which flows are allowed and why; how encryption is enforced.",
  apis: "Who consumes each API and where its full reference lives.",
  security: "Current risks and what's planned to address them.",
};

export function LayoutDocs({ projectId, onOpen }: { projectId: string; onOpen: (tab: "design" | "docs" | "report") => void }) {
  const project = useProjects((s) => s.loaded[projectId]);
  const update = useProjects((s) => s.update);
  const id = useId();
  if (!project) return null;
  const st = project.state;
  const s = st.docs.layout;
  const set = (patch: Partial<LayoutSettings>) => update(projectId, (x) => ({ ...x, docs: { ...x.docs, layout: { ...x.docs.layout, ...patch } } }));
  const a = buildAssessment(project.meta.name, { spec: st.docs.api.spec, audit: st.scanner.lastAudit, scan: st.scanner.lastScan, run: st.batch.lastRun, canvas: st.canvas }, st.docs.security);
  const threats = threatModel(st.canvas).threats.filter((t) => (st.docs.security.triage[t.key]?.status ?? "open") === "open").length;
  const m = layoutModel({ name: project.meta.name, description: project.meta.description, savedAt: project.savedAt, canvas: st.canvas, spec: st.docs.api.spec, asyncSpec: st.docs.events.spec, posture: { high: a.counts.high, medium: a.counts.medium, low: a.counts.low, threats, score: a.findings.length ? a.score : null } });
  const md = () => { const url = URL.createObjectURL(new Blob([layoutMarkdown(m, s)], { type: "text/markdown" })); const el = document.createElement("a"); el.href = url; el.download = `${fileSlug(s.title || `${project.meta.name}-layout`)}.md`; el.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  const intro = (sid: SectionId) => s.intro[sid] ? <p className="whitespace-pre-wrap text-sm">{s.intro[sid]}</p> : null;

  if (!m.components.length) return (
    <div className="mx-auto max-w-2xl p-8 text-center">
      <FileText className="mx-auto text-fin" />
      <h2 className="mt-2 text-lg font-semibold">Layout documentation</h2>
      <p className="mt-1 text-sm text-muted">Layout docs are written from your diagram: zones, an inventory, data flows and the APIs each part exposes. Add components on the Design tab first.</p>
      <button className="btn-primary mt-4" onClick={() => onOpen("design")}>Open the designer</button>
    </div>
  );

  return (
    <div className="mx-auto grid max-w-7xl gap-5 p-5 lg:grid-cols-[20rem_1fr]">
      <aside className="space-y-4">
        <h2 className="flex items-center gap-2 text-base font-semibold"><FileText size={18} className="text-fin" />Layout docs<HelpTip>Architecture documentation built from the diagram. Fill in Zone, Owner and Runbook on each component and set Protocol, Port and Encrypted on each link: the tables update by themselves. Write a short intro for each section here.</HelpTip></h2>
        <div className="panel space-y-3 p-3">
          <div><label className="label" htmlFor={`${id}-t`}>Document title</label><input id={`${id}-t`} className="input" value={s.title} placeholder={`${project.meta.name}: environment layout`} onChange={(e) => set({ title: e.target.value })} /></div>
          <div><label className="label" htmlFor={`${id}-v`}>Document version</label><input id={`${id}-v`} className="input w-32" value={s.version} onChange={(e) => set({ version: e.target.value })} /></div>
        </div>
        <div className="panel divide-y divide-line/60">
          {LAYOUT_SECTIONS.map((sec) => (
            <div key={sec.id} className="space-y-1.5 p-3">
              <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={s.include[sec.id]} onChange={(e) => set({ include: { ...s.include, [sec.id]: e.target.checked } })} />{sec.title}</label>
              {s.include[sec.id] && <><label className="sr-only" htmlFor={`${id}-${sec.id}`}>{sec.title} introduction</label><textarea id={`${id}-${sec.id}`} rows={2} className="input text-xs" placeholder={HINTS[sec.id]} value={s.intro[sec.id] ?? ""} onChange={(e) => set({ intro: { ...s.intro, [sec.id]: e.target.value } })} /></>}
            </div>
          ))}
        </div>
      </aside>

      <article className="panel min-w-0 space-y-8 p-6" aria-label="Layout document preview">
        <header className="flex flex-wrap items-start gap-3 border-b border-line pb-4">
          <div className="min-w-0 flex-1"><h2 className="text-2xl font-semibold">{s.title || `${project.meta.name}: environment layout`}</h2><p className="text-xs text-muted">Version {s.version || "1.0"} · {project.savedAt ? <Time value={project.savedAt} prefix="project saved " /> : "not saved yet"}</p></div>
          <div className="flex gap-1.5"><button className="btn px-2 py-1 text-xs" onClick={md}>Markdown</button><ExportMenu small build={() => layoutReport(m, s)} /></div>
        </header>
        {s.include.overview && <section className="space-y-2"><h3 className="text-lg font-semibold">Overview</h3>{intro("overview")}{m.description && <p className="text-sm text-muted">{m.description}</p>}
          <dl className="grid gap-3 sm:grid-cols-4">{[["Components", m.components.length], ["Zones", m.zones.length], ["Data flows", m.flows.length], ["Unencrypted flows", m.flows.filter((f) => !f.encrypted).length]].map(([k, v]) => <div key={k} className="rounded-md border border-line p-3"><dt className="text-xs text-muted">{k}</dt><dd className="text-xl font-semibold">{v}</dd></div>)}</dl></section>}
        {s.include.zones && <section className="space-y-2"><h3 className="text-lg font-semibold">Trust zones</h3>{intro("zones")}
          {m.zones.some((z) => z.name === "Unzoned") && <p className="text-xs text-amber-300">Some components have no Zone yet. Set it in the designer so boundaries can be documented.</p>}
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-xs uppercase tracking-wider text-muted"><tr><th className="py-1.5 pr-3">Zone</th><th className="pr-3">Components</th><th className="pr-3">In</th><th>Out</th></tr></thead><tbody>{m.zones.map((z) => <tr key={z.name} className="border-t border-line/60"><td className="py-1.5 pr-3 font-medium">{z.name}</td><td className="pr-3 text-muted">{z.members.map((n) => n.data.label).join(", ")}</td><td className="pr-3">{z.inbound}</td><td>{z.outbound}</td></tr>)}</tbody></table></div></section>}
        {s.include.inventory && <section className="space-y-3"><h3 className="text-lg font-semibold">Inventory</h3>{intro("inventory")}
          {m.zones.map((z) => <div key={z.name} className="overflow-x-auto"><h4 className="mb-1 text-sm font-medium">{z.name}</h4><table className="w-full text-sm"><thead className="text-left text-xs uppercase tracking-wider text-muted"><tr><th className="py-1 pr-3">Component</th><th className="pr-3">Type</th><th className="pr-3">Host / URL</th><th className="pr-3">OS</th><th className="pr-3">Ports</th><th className="pr-3">Owner</th><th>Runbook</th></tr></thead>
            <tbody>{z.members.map((n) => <tr key={n.id} className="border-t border-line/60"><td className="py-1 pr-3">{n.data.label}</td><td className="pr-3 text-muted">{kindOf(n.data.kind).label}</td><td className="pr-3 font-mono text-xs">{n.data.url || nodeTarget(n.data) || "—"}</td><td className="pr-3 text-muted">{n.data.os || "—"}</td><td className="pr-3 font-mono text-xs">{n.data.ports || "—"}</td><td className="pr-3 text-muted">{n.data.owner || "—"}</td><td>{n.data.docsUrl && /^https?:\/\//.test(n.data.docsUrl) ? <a className="link inline-flex items-center gap-1 text-xs" href={n.data.docsUrl} target="_blank" rel="noopener noreferrer">Open<ExternalLink size={11} /></a> : <span className="text-muted">—</span>}</td></tr>)}</tbody></table></div>)}</section>}
        {s.include.flows && <section className="space-y-2"><h3 className="text-lg font-semibold">Data flows</h3>{intro("flows")}
          {!m.flows.length ? <p className="text-sm text-muted">No links between components yet.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-xs uppercase tracking-wider text-muted"><tr><th className="py-1.5 pr-3">From</th><th className="pr-3">To</th><th className="pr-3">Protocol / port</th><th className="pr-3">Encrypted</th><th className="pr-3">Boundary</th><th>Purpose</th></tr></thead>
            <tbody>{m.flows.map((f) => <tr key={f.id} className="border-t border-line/60"><td className="py-1.5 pr-3">{f.from}<span className="block text-xs text-muted">{f.fromZone}</span></td><td className="pr-3">{f.to}<span className="block text-xs text-muted">{f.toZone}</span></td><td className="pr-3 font-mono text-xs">{f.protocol || "—"}{f.port ? `:${f.port}` : ""}</td><td className="pr-3">{f.encrypted ? <span className="inline-flex items-center gap-1 text-emerald-300"><Lock size={12} />yes</span> : <span className="inline-flex items-center gap-1 text-amber-300"><LockOpen size={12} />no</span>}</td><td className="pr-3 text-xs">{f.crosses ? "crosses" : "—"}</td><td className="text-muted">{f.label || "—"}</td></tr>)}</tbody></table></div>}</section>}
        {s.include.apis && <section className="space-y-2"><h3 className="text-lg font-semibold">APIs and events</h3>{intro("apis")}
          {!m.apis.length && !m.channels.length && <p className="text-sm text-muted">No API components are linked to API docs yet. Give an API or Web App component a URL that matches a server in the API docs.</p>}
          {m.apis.map((x) => <div key={x.node.id} className="rounded-md border border-line p-3"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{x.node.data.label}</span><code className="font-mono text-xs text-fin">{x.url}</code><span className="ml-auto text-xs text-muted">{x.operations.length} documented endpoint{x.operations.length === 1 ? "" : "s"}</span></div>
            {x.operations.length > 0 && <ul className="mt-1 space-y-0.5 text-xs">{x.operations.slice(0, 12).map((o) => <li key={`${o.method} ${o.path}`}><span className="inline-block w-14 font-mono font-bold">{o.method}</span><span className="font-mono">{o.path}</span> <span className="text-muted">{o.summary}</span></li>)}{x.operations.length > 12 && <li className="text-muted">…and {x.operations.length - 12} more</li>}</ul>}</div>)}
          {m.channels.map((c) => <p key={c.node.id} className="text-sm"><b>{c.node.data.label}</b> channels: <span className="font-mono text-xs">{c.channels.join(", ")}</span></p>)}
          <button className="link text-sm" onClick={() => onOpen("docs")}>Open API docs</button></section>}
        {s.include.security && m.posture && <section className="space-y-2"><h3 className="text-lg font-semibold">Security posture</h3>{intro("security")}
          <p className="text-sm">{m.posture.score === null ? "No findings recorded yet." : <>Risk score <b>{m.posture.score}/100</b> · open findings: {m.posture.high} high, {m.posture.medium} medium, {m.posture.low} low</>} · {m.posture.threats} open threat{m.posture.threats === 1 ? "" : "s"} in the threat model.</p>
          <button className="link text-sm" onClick={() => onOpen("report")}>Open the security report</button></section>}
      </article>
    </div>
  );
}
