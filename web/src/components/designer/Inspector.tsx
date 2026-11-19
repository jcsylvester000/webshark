"use client";
/** Right-hand inspector: edits the selected node/link, or the environment when nothing is selected. */
import { Activity, Radar, ShieldCheck, SquareTerminal, Trash2 } from "lucide-react";
import { useState } from "react";
import { kindOf, nodeTarget, NODE_KINDS } from "@/lib/nodes";
import type { Canvas, DeviceData, LinkData } from "@/lib/types";
import type { DeviceNodeT, LinkEdgeT } from "./flow-types";

type Props = {
  node?: DeviceNodeT; edge?: LinkEdgeT;
  env: { name: string; description: string; meta: NonNullable<Canvas["meta"]>; nodes: number; edges: number };
  onEnv: (patch: Partial<{ name: string; description: string; meta: Canvas["meta"] }>) => void;
  onNode: (id: string, patch: Partial<DeviceData>) => void;
  onEdge: (id: string, patch: Partial<LinkData>) => void;
  onDelete: () => void;
  onApplyUrl: (id: string, url: string) => void;
  onTool: (tool: "ping" | "scan" | "audit", id: string, ports?: string) => void;
  onConsole: (id: string) => void;
  busy: string | null;
  onEditDetails?: () => void;
};

function Field({ label, value, onChange, placeholder, mono, area }: { label: string; value?: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean; area?: boolean }) {
  const id = `f-${label.replace(/\W/g, "")}`;
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      {area
        ? <textarea id={id} className="input min-h-24 resize-y" value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
        : <input id={id} className={`input ${mono ? "font-mono text-xs" : ""}`} value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />}
    </div>
  );
}

export function Inspector(p: Props) {
  const [url, setUrl] = useState(p.node?.data.url ?? "");
  const [ports, setPorts] = useState("common");

  if (p.edge) {
    const d = p.edge.data ?? {};
    const set = (patch: Partial<LinkData>) => p.onEdge(p.edge!.id, patch);
    return (
      <div className="space-y-3 p-4">
        <h2 className="text-sm font-semibold">Connection</h2>
        <Field label="Label" value={d.label} onChange={(v) => set({ label: v })} placeholder="HTTPS, SSH, replication…" />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Protocol" value={d.protocol} onChange={(v) => set({ protocol: v })} placeholder="TCP" />
          <Field label="Port" value={d.port} onChange={(v) => set({ port: v })} placeholder="443" mono />
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(d.encrypted)} onChange={(e) => set({ encrypted: e.target.checked })} />Encrypted in transit</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(d.attack)} onChange={(e) => set({ attack: e.target.checked })} />Attack path (scenario)</label>
        <button className="btn-danger w-full justify-center" onClick={p.onDelete}><Trash2 size={14} />Delete link</button>
      </div>
    );
  }

  if (p.node) {
    const n = p.node;
    const d = n.data;
    const k = kindOf(d.kind);
    const set = (patch: Partial<DeviceData>) => p.onNode(n.id, patch);
    const target = nodeTarget(d);
    const canTest = Boolean(target) && !["note", "attacker", "vulnerability"].includes(d.kind);
    return (
      <div className="space-y-3 p-4">
        <div className="flex items-center gap-2"><k.icon size={18} style={{ color: k.color }} /><h2 className="text-sm font-semibold">{k.label}</h2></div>
        {k.desc && <p className="text-xs text-muted">{k.desc}</p>}
        <Field label="Name" value={d.label} onChange={(v) => set({ label: v })} />
        <div>
          <label className="label" htmlFor="kind">Type</label>
          <select id="kind" className="input" value={d.kind} onChange={(e) => set({ kind: e.target.value })}>
            {NODE_KINDS.map((x) => <option key={x.kind} value={x.kind}>{x.group} · {x.label}</option>)}
          </select>
        </div>
        {(d.kind === "webapp" || d.kind === "api") && (
          <div>
            <label className="label" htmlFor="app-url">Application URL</label>
            <div className="flex gap-1.5">
              <input id="app-url" className="input font-mono text-xs" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://myapp.com" onKeyDown={(e) => e.key === "Enter" && p.onApplyUrl(n.id, url)} />
              <button className="btn-primary" onClick={() => p.onApplyUrl(n.id, url)}>Apply</button>
            </div>
            <p className="mt-1 text-xs text-muted">The node becomes this application. {p.env.meta.autoScan ? "Auto-scan is on." : "Turn on auto-scan in environment settings to scan ports on apply."}</p>
          </div>
        )}
        {d.kind !== "note" && <Field label="Host / IP" value={d.host} onChange={(v) => set({ host: v })} placeholder="10.0.0.12 or db.internal" mono />}
        {!["note", "attacker", "vulnerability"].includes(d.kind) && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Field label="OS / Runtime" value={d.os} onChange={(v) => set({ os: v })} placeholder="Ubuntu 24.04" />
              <Field label="Zone" value={d.zone} onChange={(v) => set({ zone: v })} placeholder="Private subnet" />
            </div>
            <Field label="Documented ports" value={d.ports} onChange={(v) => set({ ports: v })} placeholder={k.ports ?? "22,443"} mono />
            <div className="grid grid-cols-2 gap-2">
              <Field label="Owner" value={d.owner as string | undefined} onChange={(v) => set({ owner: v })} placeholder="Team or person" />
              <Field label="Runbook / docs link" value={d.docsUrl as string | undefined} onChange={(v) => set({ docsUrl: v })} placeholder="https://wiki/…" mono />
            </div>
          </>
        )}
        <Field label="Tags" value={d.tags} onChange={(v) => set({ tags: v })} placeholder="prod, pci" />
        <Field label="Notes" value={d.notes} onChange={(v) => set({ notes: v })} area placeholder="Purpose, owners, runbooks, risks…" />

        {canTest && (
          <div className="space-y-2 rounded-md border border-line p-3">
            <div className="text-xs font-medium uppercase tracking-wider text-muted">Test {target}</div>
            {!p.env.meta.authorized && <p className="text-xs text-amber-300">Before scanning or auditing: click an empty spot on the canvas and tick &ldquo;I own the hosts…&rdquo;. Ping works without it.</p>}
            <div className="flex flex-wrap gap-1.5">
              <button className="btn" disabled={!!p.busy} onClick={() => p.onTool("ping", n.id)}><Activity size={14} />{p.busy === `ping-${n.id}` ? "Pinging…" : "Ping"}</button>
              <button className="btn" disabled={!!p.busy || !p.env.meta.authorized} onClick={() => p.onTool("scan", n.id, ports)}><Radar size={14} />{p.busy === `scan-${n.id}` ? "Scanning…" : "Scan"}</button>
              {(d.kind === "webapp" || d.kind === "api" || d.url) && <button className="btn" disabled={!!p.busy || !p.env.meta.authorized} onClick={() => p.onTool("audit", n.id)}><ShieldCheck size={14} />{p.busy === `audit-${n.id}` ? "Auditing…" : "Audit"}</button>}
              <button className="btn" onClick={() => p.onConsole(n.id)}><SquareTerminal size={14} />Console</button>
            </div>
            <select className="input font-mono text-xs" value={ports} onChange={(e) => setPorts(e.target.value)} aria-label="Ports to scan">
              <option value="common">common (52 ports)</option><option value="web">web ports</option><option value="db">database ports</option><option value="well-known">1-1024</option>
              {d.ports && <option value={d.ports}>documented: {d.ports}</option>}
            </select>
            {d.scan && <p className="font-mono text-xs text-muted">Last scan {new Date(d.scan.at).toLocaleString()}: {d.scan.open.map((x) => x.port).join(", ") || "none open"}</p>}
          </div>
        )}
        <button className="btn-danger w-full justify-center" onClick={p.onDelete}><Trash2 size={14} />Delete node</button>
      </div>
    );
  }

  const meta = p.env.meta;
  return (
    <div className="space-y-3 p-4">
      <h2 className="text-sm font-semibold">{p.env.name}</h2>
      <p className="whitespace-pre-line text-sm text-muted">{p.env.description || "No description yet. Describe what this environment is and what's in scope."}</p>
      {p.onEditDetails && <button className="btn text-xs" onClick={p.onEditDetails}>Edit name, description, tags…</button>}
      <div className="label pt-2">Testing permission</div>
      <div className="space-y-2 rounded-md border border-line p-3 text-sm">
        <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={Boolean(meta.authorized)} onChange={(e) => p.onEnv({ meta: { ...meta, authorized: e.target.checked } })} />I own the hosts in this environment or have written permission to test them.</label>
        <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" disabled={!meta.authorized} checked={Boolean(meta.autoScan && meta.authorized)} onChange={(e) => p.onEnv({ meta: { ...meta, autoScan: e.target.checked } })} />Auto-scan common ports when a URL is applied to a Web App.</label>
      </div>
      <p className="font-mono text-xs text-muted">{p.env.nodes} nodes · {p.env.edges} links</p>
      <div className="text-xs leading-relaxed text-muted">
        <p className="font-medium text-ink">Tips</p>
        <p>Click a component on the canvas to edit it here. Connect components by dragging from any edge handle. Select and press Delete to remove. Ctrl+S saves the project.</p>
      </div>
    </div>
  );
}
