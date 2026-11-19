"use client";
/**
 * Environment designer: palette (drag source) · React Flow canvas · inspector · console drawer.
 * Bound to the in-memory project store: edits mark the project dirty and are written to the
 * database only when the user clicks "Save project" (CQRS command `project.save`).
 */
import {
  addEdge, Background, BackgroundVariant, ConnectionMode, Controls, MarkerType, MiniMap, ReactFlow, ReactFlowProvider,
  useEdgesState, useNodesState, useReactFlow, type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ChevronDown, FileDown, FileJson, FileUp, LayoutTemplate, SquareTerminal, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, errMsg } from "@/lib/api";
import { canvasToMarkdown, download } from "@/lib/docs";
import { scanPorts } from "@/lib/scan";
import { useProjects } from "@/lib/store";
import { GROUPS, kindOf, nodeTarget, NODE_KINDS } from "@/lib/nodes";
import { TEMPLATES } from "@/lib/templates";
import type { AuditReport, Canvas, DeviceData, LinkData, PingResponse, ScanResponse } from "@/lib/types";
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

function DesignerInner({ projectId }: { projectId: string }) {
  const flow = useReactFlow();
  const project = useProjects((s) => s.loaded[projectId]);
  const update = useProjects((s) => s.update);
  const setProjectMeta = useProjects((s) => s.setMeta);
  const addResult = useProjects((s) => s.addResult);
  const initial = useMemo(() => toFlow(useProjects.getState().loaded[projectId]?.state.canvas ?? { nodes: [], edges: [] }), [projectId]);
  const [nodes, setNodes, onNodesChange] = useNodesState<DeviceNodeT>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<LinkEdgeT>(initial.edges);
  const [meta, setMeta] = useState<NonNullable<Canvas["meta"]>>(() => useProjects.getState().loaded[projectId]?.state.canvas.meta ?? {});
  const [selection, setSelection] = useState<{ node?: string; edge?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [consoleFor, setConsoleFor] = useState<string | null>(null);
  const [menu, setMenu] = useState<"templates" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { const t = setTimeout(() => flow.fitView({ padding: 0.2 }), 50); return () => clearTimeout(t); }, [flow]);

  // Push canvas edits into the project's working state (memory only). Selection/drag noise is
  // ignored by comparing the serialized canvas, so only real changes mark the project unsaved.
  useEffect(() => {
    const t = setTimeout(() => {
      const next = fromFlow(nodes, edges, meta);
      update(projectId, (s) => (JSON.stringify(s.canvas) === JSON.stringify(next) ? s : { ...s, canvas: next }));
    }, 250);
    return () => clearTimeout(t);
  }, [nodes, edges, meta, projectId, update]);

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
      if (tool === "ping") {
        const r = await api<PingResponse>("/tools/ping", { method: "POST", json: { host: target, count: 3 } });
        applyPing(target, r);
        addResult(projectId, { tool: "ping", target, ok: r.received > 0, summary: `${r.received}/${r.sent} replies, avg ${r.avg_ms ?? "-"} ms` });
      }
      if (tool === "scan") {
        const r = await scanPorts(target, ports);
        applyScan(target, r);
        addResult(projectId, { tool: "portscan", target, ok: true, summary: `${r.scanned} scanned, open: ${r.open.map((p) => p.port).join(", ") || "none"}` });
      }
      if (tool === "audit") {
        const r = await api<AuditReport>("/tools/audit", { method: "POST", json: { url: n.data.url || target, authorized: true } });
        const issues = r.findings.filter((f) => !["pass", "info"].includes(f.severity)).length;
        patchNode(nid, { audit: { at: new Date().toISOString(), score: r.score, issues } });
        addResult(projectId, { tool: "audit", target: n.data.url || target, ok: r.score >= 70, summary: `score ${r.score}/100, ${issues} issue(s)` });
      }
    } catch (e) { setError(errMsg(e)); }
    setBusy(null);
  }, [nodes, applyPing, applyScan, patchNode, addResult, projectId]);

  const applyUrl = useCallback(async (nid: string, raw: string) => {
    const value = raw.trim();
    if (!value) return;
    const url = value.includes("://") ? value : `https://${value}`;
    let host = "";
    try { host = new URL(url).hostname; } catch { setError("That URL is not valid"); return; }
    const n = nodes.find((x) => x.id === nid);
    const isDefault = !n || n.data.label === kindOf(n.data.kind).label;
    patchNode(nid, { url, ...(isDefault ? { label: host } : {}) });
    if (meta.autoScan && meta.authorized) {
      setBusy(`scan-${nid}`);
      try {
        const r = await scanPorts(host, "common");
        patchNode(nid, { scan: { at: new Date().toISOString(), address: r.address, open: r.open.map((p) => ({ port: p.port, service: p.service, note: p.note })) } });
      } catch (e) { setError(errMsg(e)); }
      setBusy(null);
    }
  }, [nodes, meta, patchNode]);

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
    onResult: (r: Parameters<typeof addResult>[1]) => addResult(projectId, r),
  }), [nodes, applyScan, applyPing, addResult, projectId]);
  const consoleNode = nodes.find((n) => n.id === consoleFor);
  const consoleTarget = consoleNode ? nodeTarget(consoleNode.data) : null;

  if (!project) return <div className="p-8 text-muted">Loading project…</div>;
  const canvasNow = () => fromFlow(nodes, edges, meta);
  const slug = project.meta.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-panel px-3">
        <span className="text-xs text-muted">Drag components from the palette · connect handles · Delete removes</span>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="relative">
            <button className="btn" onClick={() => setMenu(menu ? null : "templates")}><LayoutTemplate size={14} />Templates<ChevronDown size={13} /></button>
            {menu === "templates" && (
              <div className="panel absolute right-0 z-50 mt-1 w-72 p-1 shadow-xl">
                {TEMPLATES.map((t) => <button key={t.id} onClick={() => applyTemplate(t.id)} className="block w-full rounded px-3 py-2 text-left hover:bg-panel-2"><div className="text-sm">{t.name}</div><div className="text-xs text-muted">{t.description}</div></button>)}
              </div>
            )}
          </div>
          <button className="btn" title="Export documentation (Markdown)" onClick={() => download(`${slug}.md`, canvasToMarkdown(project.meta.name, project.meta.description, canvasNow()))}><FileDown size={14} />Docs</button>
          <button className="btn" title="Export canvas JSON" onClick={() => download(`${slug}.slyshark.json`, JSON.stringify(canvasNow(), null, 2), "application/json")}><FileJson size={14} />JSON</button>
          <button className="btn" title="Import canvas JSON" onClick={() => fileRef.current?.click()}><FileUp size={14} /></button>
          <input ref={fileRef} type="file" accept=".json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
          <button className={`btn ${consoleFor !== null ? "border-fin text-fin" : ""}`} onClick={() => setConsoleFor(consoleFor === null ? "" : null)}><SquareTerminal size={14} />Console</button>
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
              <Terminal key={consoleFor} projectId={projectId} className="h-[calc(100%-2rem)]" context={termContext} prompt={consoleNode ? consoleNode.data.label.replace(/\s+/g, "-").toLowerCase() : "slyshark"} initial={consoleTarget ? `ping ${consoleTarget}` : ""} />
            </div>
          )}
        </div>
        <aside className="w-80 shrink-0 overflow-y-auto border-l border-line bg-panel">
          <Inspector
            key={selNode?.id ?? selEdge?.id ?? "env"}
            node={selNode} edge={selEdge} busy={busy}
            env={{ name: project.meta.name, description: project.meta.description, meta, nodes: nodes.length, edges: edges.length }}
            onEnv={(patch) => {
              if (patch.meta) setMeta(patch.meta);
              if (patch.name !== undefined || patch.description !== undefined) setProjectMeta(projectId, { ...(patch.name !== undefined ? { name: patch.name } : {}), ...(patch.description !== undefined ? { description: patch.description } : {}) });
            }}
            onNode={patchNode} onEdge={patchEdge} onDelete={deleteSelected} onApplyUrl={applyUrl}
            onTool={runTool} onConsole={(nid) => setConsoleFor(nid)}
          />
        </aside>
      </div>
    </div>
  );
}

export function Designer({ projectId }: { projectId: string }) {
  return <ReactFlowProvider><DesignerInner key={projectId} projectId={projectId} /></ReactFlowProvider>;
}
