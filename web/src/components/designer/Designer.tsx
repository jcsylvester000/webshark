"use client";
/**
 * Environment designer: palette (drag source) · React Flow canvas · inspector · console drawer.
 * Loads/saves the canvas through the Rust API (`/environments/{id}`), autosaving after edits.
 */
import {
  addEdge, Background, BackgroundVariant, ConnectionMode, Controls, MarkerType, MiniMap, ReactFlow, ReactFlowProvider,
  useEdgesState, useNodesState, useReactFlow, type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ChevronDown, FileDown, FileJson, FileUp, LayoutTemplate, Save, SquareTerminal, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, errMsg } from "@/lib/api";
import { canvasToMarkdown, download } from "@/lib/docs";
import { GROUPS, kindOf, nodeTarget, NODE_KINDS } from "@/lib/nodes";
import { TEMPLATES } from "@/lib/templates";
import type { AuditReport, Canvas, DeviceData, EnvFull, LinkData, PingResponse, ScanResponse } from "@/lib/types";
import { Terminal } from "../Terminal";
import { DeviceNode } from "./DeviceNode";
import type { DeviceNodeT, LinkEdgeT } from "./flow-types";
import { Inspector } from "./Inspector";
import { LinkEdge } from "./LinkEdge";

const nodeTypes = { device: DeviceNode };
const edgeTypes = { link: LinkEdge };
const uid = () => Math.random().toString(36).slice(2, 10);

function toFlow(c: Canvas): { nodes: DeviceNodeT[]; edges: LinkEdgeT[] } {
  return {
    nodes: (c.nodes ?? []).map((n) => ({ id: n.id, type: "device", position: n.position, data: n.data })),
    edges: (c.edges ?? []).map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: (e.sourceHandle as string) ?? null, targetHandle: (e.targetHandle as string) ?? null, type: "link", data: e.data ?? {}, animated: Boolean(e.data?.attack), markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 } })),
  };
}
function fromFlow(nodes: DeviceNodeT[], edges: LinkEdgeT[], meta: Canvas["meta"]): Canvas {
  return {
    nodes: nodes.map((n) => ({ id: n.id, type: "device", position: { x: Math.round(n.position.x), y: Math.round(n.position.y) }, data: n.data })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle, type: "link", data: e.data })),
    meta,
  };
}

function DesignerInner({ id }: { id: string }) {
  const flow = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<DeviceNodeT>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<LinkEdgeT>([]);
  const [env, setEnv] = useState<{ name: string; description: string; template: string | null; meta: NonNullable<Canvas["meta"]> } | null>(null);
  const [selection, setSelection] = useState<{ node?: string; edge?: string }>({});
  const [status, setStatus] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [consoleFor, setConsoleFor] = useState<string | null>(null);
  const [menu, setMenu] = useState<"templates" | null>(null);
  const loaded = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<EnvFull>(`/environments/${id}`).then((e) => {
      const f = toFlow(e.canvas);
      setNodes(f.nodes);
      setEdges(f.edges);
      setEnv({ name: e.name, description: e.description, template: e.template, meta: e.canvas.meta ?? {} });
      setTimeout(() => { loaded.current = true; flow.fitView({ padding: 0.2 }); }, 50);
    }).catch((e) => setError(errMsg(e)));
  }, [id, setNodes, setEdges, flow]);

  const save = useCallback(async () => {
    if (!env) return;
    setStatus("saving");
    try {
      await api(`/environments/${id}`, { method: "PUT", json: { name: env.name, description: env.description, canvas: fromFlow(nodes, edges, env.meta) } });
      setStatus("saved");
    } catch (e) { setStatus("error"); setError(errMsg(e)); }
  }, [env, id, nodes, edges]);

  // Mark dirty on any content change after the initial load, then autosave.
  useEffect(() => { if (loaded.current) setStatus("dirty"); }, [nodes, edges, env]);
  useEffect(() => {
    if (status !== "dirty") return;
    const t = setTimeout(save, 2500);
    return () => clearTimeout(t);
  }, [status, save]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); save(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  const onConnect = useCallback((c: Connection) => setEdges((es) => addEdge({ ...c, id: `e-${uid()}`, type: "link", data: {}, markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 } }, es)), [setEdges]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const kind = e.dataTransfer.getData("application/slyshark");
    if (!kind) return;
    const k = kindOf(kind);
    const position = flow.screenToFlowPosition({ x: e.clientX - 70, y: e.clientY - 20 });
    const nid = uid();
    setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), { id: nid, type: "device", position, selected: true, data: { kind, label: k.label, ports: k.ports } }]);
    setSelection({ node: nid });
  }, [flow, setNodes]);

  const patchNode = useCallback((nid: string, patch: Partial<DeviceData>) => setNodes((ns) => ns.map((n) => (n.id === nid ? { ...n, data: { ...n.data, ...patch } } : n))), [setNodes]);
  const patchEdge = useCallback((eid: string, patch: Partial<LinkData>) => setEdges((es) => es.map((e) => (e.id === eid ? { ...e, data: { ...e.data, ...patch }, animated: patch.attack ?? e.animated } : e))), [setEdges]);

  const applyScan = useCallback((target: string, r: ScanResponse) => {
    const scan = { at: new Date().toISOString(), address: r.address, open: r.open.map((p) => ({ port: p.port, service: p.service, note: p.note })) };
    setNodes((ns) => ns.map((n) => (nodeTarget(n.data) === target ? { ...n, data: { ...n.data, scan } } : n)));
  }, [setNodes]);
  const applyPing = useCallback((target: string, r: PingResponse) => {
    const ping = { at: new Date().toISOString(), ok: r.received > 0, avg_ms: r.avg_ms };
    setNodes((ns) => ns.map((n) => (nodeTarget(n.data) === target ? { ...n, data: { ...n.data, ping } } : n)));
  }, [setNodes]);

  const runTool = useCallback(async (tool: "ping" | "scan" | "audit", nid: string, ports = "common") => {
    const n = nodes.find((x) => x.id === nid);
    const target = n ? nodeTarget(n.data) : null;
    if (!n || !target) return;
    setBusy(`${tool}-${nid}`);
    setError(null);
    try {
      if (tool === "ping") applyPing(target, await api<PingResponse>("/tools/ping", { method: "POST", json: { host: target, count: 3 } }));
      if (tool === "scan") applyScan(target, await api<ScanResponse>("/tools/portscan", { method: "POST", json: { target, ports, authorized: true } }));
      if (tool === "audit") {
        const r = await api<AuditReport>("/tools/audit", { method: "POST", json: { url: n.data.url || target, authorized: true } });
        patchNode(nid, { audit: { at: new Date().toISOString(), score: r.score, issues: r.findings.filter((f) => !["pass", "info"].includes(f.severity)).length } });
      }
    } catch (e) { setError(errMsg(e)); }
    setBusy(null);
  }, [nodes, applyPing, applyScan, patchNode]);

  const applyUrl = useCallback(async (nid: string, raw: string) => {
    const value = raw.trim();
    if (!value) return;
    const url = value.includes("://") ? value : `https://${value}`;
    let host = "";
    try { host = new URL(url).hostname; } catch { setError("That URL is not valid"); return; }
    const n = nodes.find((x) => x.id === nid);
    const isDefault = !n || n.data.label === kindOf(n.data.kind).label;
    patchNode(nid, { url, ...(isDefault ? { label: host } : {}) });
    if (env?.meta.autoScan && env.meta.authorized) {
      setBusy(`scan-${nid}`);
      try {
        const r = await api<ScanResponse>("/tools/portscan", { method: "POST", json: { target: host, ports: "common", authorized: true } });
        patchNode(nid, { scan: { at: new Date().toISOString(), address: r.address, open: r.open.map((p) => ({ port: p.port, service: p.service, note: p.note })) } });
      } catch (e) { setError(errMsg(e)); }
      setBusy(null);
    }
  }, [nodes, env, patchNode]);

  const deleteSelected = useCallback(() => {
    if (selection.node) {
      setNodes((ns) => ns.filter((n) => n.id !== selection.node));
      setEdges((es) => es.filter((e) => e.source !== selection.node && e.target !== selection.node));
    }
    if (selection.edge) setEdges((es) => es.filter((e) => e.id !== selection.edge));
    setSelection({});
  }, [selection, setNodes, setEdges]);

  function applyTemplate(tid: string) {
    setMenu(null);
    if (nodes.length && !confirm("Replace the current canvas with this template?")) return;
    const t = TEMPLATES.find((x) => x.id === tid)!;
    const f = toFlow(t.canvas());
    setNodes(f.nodes);
    setEdges(f.edges);
    setEnv((e) => (e ? { ...e, template: t.id } : e));
    setTimeout(() => flow.fitView({ padding: 0.2 }), 50);
  }

  function importJson(file: File) {
    file.text().then((txt) => {
      const c = JSON.parse(txt) as Canvas;
      if (!Array.isArray(c.nodes) || !Array.isArray(c.edges)) throw new Error("Not a Slyshark canvas file");
      const f = toFlow(c);
      setNodes(f.nodes);
      setEdges(f.edges);
      setTimeout(() => flow.fitView({ padding: 0.2 }), 50);
    }).catch((e) => setError(errMsg(e)));
  }

  const selNode = nodes.find((n) => n.id === selection.node);
  const selEdge = edges.find((e) => e.id === selection.edge);
  const termContext = useMemo(() => ({
    nodes: nodes.map((n) => ({ id: n.id, label: n.data.label, target: nodeTarget(n.data) })),
    onScan: applyScan, onPing: applyPing,
  }), [nodes, applyScan, applyPing]);
  const consoleNode = nodes.find((n) => n.id === consoleFor);
  const consoleTarget = consoleNode ? nodeTarget(consoleNode.data) : null;

  if (error && !env) return <div className="p-8 text-danger">{error} <Link href="/dashboard/environments" className="text-fin">Back</Link></div>;
  if (!env) return <div className="p-8 text-muted">Loading environment…</div>;
  const canvasNow = () => fromFlow(nodes, edges, env.meta);
  const slug = env.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  return (
    <div className="flex h-screen flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-panel px-3">
        <Link href="/dashboard/environments" className="text-sm text-muted hover:text-ink">Environments /</Link>
        <input aria-label="Environment name" className="w-72 bg-transparent text-sm font-semibold outline-none" value={env.name} onChange={(e) => setEnv({ ...env, name: e.target.value })} />
        <span className={`font-mono text-xs ${status === "error" ? "text-danger" : status === "saved" ? "text-muted" : "text-amber-300"}`}>{status === "dirty" ? "unsaved" : status}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="relative">
            <button className="btn" onClick={() => setMenu(menu ? null : "templates")}><LayoutTemplate size={14} />Templates<ChevronDown size={13} /></button>
            {menu === "templates" && (
              <div className="panel absolute right-0 z-50 mt-1 w-72 p-1 shadow-xl">
                {TEMPLATES.map((t) => <button key={t.id} onClick={() => applyTemplate(t.id)} className="block w-full rounded px-3 py-2 text-left hover:bg-panel-2"><div className="text-sm">{t.name}</div><div className="text-xs text-muted">{t.description}</div></button>)}
              </div>
            )}
          </div>
          <button className="btn" title="Export documentation (Markdown)" onClick={() => download(`${slug}.md`, canvasToMarkdown(env.name, env.description, canvasNow()))}><FileDown size={14} />Docs</button>
          <button className="btn" title="Export canvas JSON" onClick={() => download(`${slug}.slyshark.json`, JSON.stringify(canvasNow(), null, 2), "application/json")}><FileJson size={14} />JSON</button>
          <button className="btn" title="Import canvas JSON" onClick={() => fileRef.current?.click()}><FileUp size={14} /></button>
          <input ref={fileRef} type="file" accept=".json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
          <button className={`btn ${consoleFor !== null ? "border-fin text-fin" : ""}`} onClick={() => setConsoleFor(consoleFor === null ? "" : null)}><SquareTerminal size={14} />Console</button>
          <button className="btn-primary" onClick={save}><Save size={14} />Save</button>
        </div>
      </div>
      {error && <div className="flex items-center justify-between bg-danger/15 px-4 py-1.5 text-sm text-danger">{error}<button onClick={() => setError(null)} aria-label="Dismiss"><X size={14} /></button></div>}
      <div className="flex min-h-0 flex-1">
        <aside className="w-52 shrink-0 overflow-y-auto border-r border-line bg-panel p-2">
          {GROUPS.map((g) => (
            <div key={g} className="mb-3">
              <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted">{g}</div>
              {NODE_KINDS.filter((k) => k.group === g).map((k) => (
                <div key={k.kind} draggable title={k.hint ?? `Drag ${k.label} onto the canvas`}
                  onDragStart={(e) => { e.dataTransfer.setData("application/slyshark", k.kind); e.dataTransfer.effectAllowed = "move"; }}
                  className="flex cursor-grab items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-ink hover:bg-panel-2 active:cursor-grabbing">
                  <k.icon size={15} style={{ color: k.color }} />{k.label}
                </div>
              ))}
            </div>
          ))}
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1" onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }} onDrop={onDrop}>
            <ReactFlow
              nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
              onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
              connectionMode={ConnectionMode.Loose} deleteKeyCode={["Delete", "Backspace"]}
              onNodeClick={(_, n) => setSelection({ node: n.id })} onEdgeClick={(_, e) => setSelection({ edge: e.id })} onPaneClick={() => { setSelection({}); setMenu(null); }}
              onNodeDoubleClick={(_, n) => n.data.kind === "terminal" && setConsoleFor(n.id)}
              onNodesDelete={() => setSelection({})} onEdgesDelete={() => setSelection({})}
              defaultEdgeOptions={{ type: "link" }} fitView proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#1c2a38" />
              <Controls />
              <MiniMap pannable zoomable style={{ width: 160, height: 100 }} nodeColor={(n) => kindOf((n.data as DeviceData).kind).color} maskColor="#070b10cc" />
            </ReactFlow>
          </div>
          {consoleFor !== null && (
            <div className="h-72 shrink-0 border-t border-line">
              <div className="flex h-8 items-center justify-between border-b border-line bg-panel px-3 text-xs text-muted">
                <span>Console {consoleNode ? `· ${consoleNode.data.label}${consoleTarget ? ` (${consoleTarget})` : ""}` : "· canvas"} — node names can be used as targets</span>
                <button onClick={() => setConsoleFor(null)} aria-label="Close console"><X size={14} /></button>
              </div>
              <Terminal key={consoleFor} className="h-[calc(100%-2rem)]" context={termContext} prompt={consoleNode ? consoleNode.data.label.replace(/\s+/g, "-").toLowerCase() : "slyshark"} initial={consoleTarget ? `ping ${consoleTarget}` : ""} />
            </div>
          )}
        </div>
        <aside className="w-80 shrink-0 overflow-y-auto border-l border-line bg-panel">
          <Inspector
            key={selNode?.id ?? selEdge?.id ?? "env"}
            node={selNode} edge={selEdge} busy={busy}
            env={{ name: env.name, description: env.description, meta: env.meta, nodes: nodes.length, edges: edges.length }}
            onEnv={(patch) => setEnv({ ...env, ...patch, meta: patch.meta ?? env.meta })}
            onNode={patchNode} onEdge={patchEdge} onDelete={deleteSelected} onApplyUrl={applyUrl}
            onTool={runTool} onConsole={(nid) => setConsoleFor(nid)}
          />
        </aside>
      </div>
    </div>
  );
}

export function Designer({ id }: { id: string }) {
  return <ReactFlowProvider><DesignerInner id={id} /></ReactFlowProvider>;
}
