"use client";
/**
 * Packet capture analyzer — the Wireshark three-pane layout:
 * packet list (virtualized, colorized) · protocol tree · hex/ASCII bytes with field highlighting.
 * Plus display filters, Protocol/Conversation/Endpoint statistics, and Follow TCP Stream.
 */
import { ChevronDown, ChevronRight, Filter, Upload, Waves, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, errMsg } from "@/lib/api";
import { compileFilter, rowColor } from "@/lib/filter";
import type { CaptureLoad, Frame, TreeNode } from "@/lib/types";

const ROW_H = 22;
type FrameDetail = { summary: Frame; tree: TreeNode[]; bytes: string };
type Follow = { stream: number; client: string; server: string; client_bytes: number; server_bytes: number; segments: { no: number; from_client: boolean; text: string }[] };

function Tree({ nodes, depth = 0, onHover, active }: { nodes: TreeNode[]; depth?: number; onHover: (n: TreeNode | null) => void; active: TreeNode | null }) {
  const [open, setOpen] = useState<Record<number, boolean>>({});
  return (
    <>
      {nodes.map((n, i) => {
        const has = Boolean(n.children?.length);
        const isOpen = open[i] ?? depth > 0;
        return (
          <div key={i}>
            <div className={`flex cursor-default items-start gap-1 py-px pr-2 hover:bg-fin/10 ${active === n ? "bg-fin/20" : ""}`} style={{ paddingLeft: depth * 14 + 4 }}
              onMouseEnter={() => onHover(n)} onClick={() => has && setOpen({ ...open, [i]: !isOpen })}>
              <span className="mt-0.5 w-3 shrink-0 text-muted">{has ? (isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : null}</span>
              <span className="break-all">{n.label}</span>
            </div>
            {has && isOpen && <Tree nodes={n.children!} depth={depth + 1} onHover={onHover} active={active} />}
          </div>
        );
      })}
    </>
  );
}

function Hex({ b64, hl }: { b64: string; hl: TreeNode | null }) {
  const bytes = useMemo(() => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), [b64]);
  const rows = [];
  for (let off = 0; off < bytes.length; off += 16) {
    const chunk = Array.from(bytes.slice(off, off + 16));
    const inHl = (i: number) => hl && hl.len > 0 && off + i >= hl.start && off + i < hl.start + hl.len;
    rows.push(
      <div key={off} className="flex gap-4 whitespace-pre">
        <span className="text-muted">{off.toString(16).padStart(4, "0")}</span>
        <span>{chunk.map((b, i) => <span key={i} className={inHl(i) ? "bg-fin/35 text-white" : ""}>{b.toString(16).padStart(2, "0")}{i === 7 ? "  " : " "}</span>)}{"   ".repeat(16 - chunk.length)}</span>
        <span>{chunk.map((b, i) => <span key={i} className={inHl(i) ? "bg-fin/35 text-white" : "text-muted"}>{b >= 32 && b < 127 ? String.fromCharCode(b) : "."}</span>)}</span>
      </div>,
    );
  }
  return <div className="font-mono text-[12px] leading-5">{rows}</div>;
}

export default function CapturesPage() {
  const [cap, setCap] = useState<CaptureLoad | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");
  const [applied, setApplied] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<FrameDetail | null>(null);
  const [hl, setHl] = useState<TreeNode | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [view, setView] = useState<"packets" | "protocols" | "conversations" | "endpoints">("packets");
  const [follow, setFollow] = useState<Follow | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [viewH, setViewH] = useState(600);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewH(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [cap]);
  const fileRef = useRef<HTMLInputElement>(null);

  const { frames, filterError } = useMemo(() => {
    if (!cap) return { frames: [] as Frame[], filterError: null as string | null };
    try { const p = compileFilter(applied); return { frames: cap.frames.filter(p), filterError: null }; }
    catch (e) { return { frames: cap.frames, filterError: errMsg(e) }; }
  }, [cap, applied]);

  async function upload(file: File) {
    setLoading(true); setError(null); setDetail(null); setSelected(null); setFollow(null);
    if (cap) api(`/captures/${cap.id}`, { method: "DELETE" }).catch(() => null);
    const fd = new FormData();
    fd.append("file", file);
    try { setCap(await api<CaptureLoad>("/captures", { method: "POST", body: fd })); setView("packets"); }
    catch (e) { setError(errMsg(e)); }
    setLoading(false);
  }

  async function select(no: number) {
    if (!cap) return;
    setSelected(no); setHl(null);
    try { setDetail(await api<FrameDetail>(`/captures/${cap.id}/frames/${no}`)); } catch (e) { setError(errMsg(e)); }
  }

  async function followStream(stream: number) {
    if (!cap) return;
    try { setFollow(await api<Follow>(`/captures/${cap.id}/follow/${stream}`)); } catch (e) { setError(errMsg(e)); }
  }

  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - 10);
  const end = Math.min(frames.length, start + Math.ceil(viewH / ROW_H) + 20);

  function onKey(e: React.KeyboardEvent) {
    if (!frames.length) return;
    const idx = frames.findIndex((f) => f.no === selected);
    const next = e.key === "ArrowDown" ? idx + 1 : e.key === "ArrowUp" ? idx - 1 : -2;
    if (next < -1 || next < 0 || next >= frames.length) return;
    e.preventDefault();
    select(frames[next].no);
    const el = listRef.current;
    if (el) { const y = next * ROW_H; if (y < el.scrollTop) el.scrollTop = y; else if (y > el.scrollTop + el.clientHeight - ROW_H * 2) el.scrollTop = y - el.clientHeight + ROW_H * 2; }
  }

  return (
    <div className="flex h-full flex-col" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) upload(f); }}>
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-panel px-3 py-2">
        <button className="btn-primary" onClick={() => fileRef.current?.click()} disabled={loading}><Upload size={14} />{loading ? "Loading…" : "Open capture"}</button>
        <input ref={fileRef} type="file" hidden accept=".pcap,.pcapng,.cap,.dmp" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <form className="flex min-w-80 flex-1 items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); setApplied(filterText); }}>
          <Filter size={14} className="text-muted" />
          <input aria-label="Display filter" className={`input font-mono text-xs ${filterError ? "border-danger" : applied ? "border-emerald-500/60" : ""}`} value={filterText} onChange={(e) => setFilterText(e.target.value)}
            placeholder="Display filter: tcp.port == 443 && !tls · dns || icmp · ip.addr == 10.0.0.5 · http.request · info contains &quot;SNI&quot;" />
          <button className="btn">Apply</button>
          {applied && <button type="button" className="btn" onClick={() => { setFilterText(""); setApplied(""); }}><X size={13} /></button>}
        </form>
        {cap && <span className="font-mono text-xs text-muted">{cap.name} · {cap.format} · {cap.linktype} · {frames.length}/{cap.count} pkts · {cap.duration_s.toFixed(3)} s{cap.truncated ? " · truncated" : ""}</span>}
      </div>
      {(error || filterError) && <div className="bg-danger/15 px-4 py-1.5 text-sm text-danger">{error ?? `Filter: ${filterError}`}</div>}
      {!cap ? (
        <div className="grid flex-1 place-items-center p-8 text-center">
          <div className="max-w-md">
            <Waves size={36} className="mx-auto text-fin" />
            <h1 className="mt-3 text-lg font-semibold">Open a packet capture</h1>
            <p className="mt-1 text-sm text-muted">Drop a .pcap or .pcapng file here (max 50 MB). Capture with Wireshark, tcpdump (<code>tcpdump -w out.pcap</code>), or dumpcap. Captures stay in memory for one hour and are never stored in the database.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex border-b border-line px-2 text-sm">
            {(["packets", "protocols", "conversations", "endpoints"] as const).map((v) => <button key={v} className={`tab capitalize ${view === v ? "tab-active" : ""}`} onClick={() => setView(v)}>{v}</button>)}
          </div>
          {view === "packets" ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="grid grid-cols-[70px_100px_minmax(120px,1fr)_minmax(120px,1fr)_80px_70px_minmax(200px,3fr)] border-b border-line bg-panel-2 px-2 py-1 font-mono text-[11px] uppercase tracking-wider text-muted">
                <span>No.</span><span>Time</span><span>Source</span><span>Destination</span><span>Protocol</span><span>Length</span><span>Info</span>
              </div>
              <div ref={listRef} tabIndex={0} onKeyDown={onKey} className="h-[38%] min-h-40 overflow-auto outline-none" onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
                <div style={{ height: frames.length * ROW_H, position: "relative" }}>
                  {frames.slice(start, end).map((f, i) => (
                    <div key={f.no} onClick={() => select(f.no)} onDoubleClick={() => f.stream != null && followStream(f.stream)}
                      className={`absolute left-0 right-0 grid cursor-default grid-cols-[70px_100px_minmax(120px,1fr)_minmax(120px,1fr)_80px_70px_minmax(200px,3fr)] px-2 font-mono text-[12px] ${selected === f.no ? "!bg-fin !text-bg" : rowColor(f)}`}
                      style={{ top: (start + i) * ROW_H, height: ROW_H, lineHeight: `${ROW_H}px` }}>
                      <span>{f.no}</span><span>{f.time.toFixed(6)}</span><span className="truncate">{f.src}</span><span className="truncate">{f.dst}</span><span>{f.protocol}</span><span>{f.length}</span><span className="truncate">{f.info}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex min-h-0 flex-1 border-t border-line">
                <div className="min-w-0 flex-1 overflow-auto border-r border-line p-2 font-mono text-[12px]" onMouseLeave={() => setHl(null)}>
                  {detail ? (
                    <>
                      {detail.summary.stream != null && <button className="btn mb-2 text-xs" onClick={() => followStream(detail.summary.stream!)}>Follow TCP stream {detail.summary.stream}</button>}
                      <Tree key={detail.summary.no} nodes={detail.tree} onHover={setHl} active={hl} />
                    </>
                  ) : <p className="p-2 font-sans text-sm text-muted">Select a packet. Use ↑/↓ to move, double-click a TCP packet to follow its stream.</p>}
                </div>
                <div className="w-[560px] shrink-0 overflow-auto p-2">{detail && <Hex b64={detail.bytes} hl={hl} />}</div>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-auto p-4">
              <table className="panel w-full max-w-4xl text-sm">
                <thead className="bg-panel-2 text-left text-xs uppercase tracking-wider text-muted">
                  {view === "protocols" && <tr><th className="px-3 py-2">Protocol</th><th className="px-3 py-2">Packets</th><th className="px-3 py-2">%</th><th className="px-3 py-2">Bytes</th></tr>}
                  {view === "conversations" && <tr><th className="px-3 py-2">Address A</th><th className="px-3 py-2">Address B</th><th className="px-3 py-2">Packets</th><th className="px-3 py-2">Bytes</th></tr>}
                  {view === "endpoints" && <tr><th className="px-3 py-2">Address</th><th className="px-3 py-2">Packets</th><th className="px-3 py-2">Bytes</th></tr>}
                </thead>
                <tbody className="font-mono">
                  {view === "protocols" && cap.stats.protocols.map((p) => (
                    <tr key={p.protocol} className="border-t border-line/60 hover:bg-panel-2" onClick={() => { setFilterText(p.protocol.toLowerCase()); setApplied(p.protocol.toLowerCase()); setView("packets"); }}>
                      <td className="px-3 py-1.5">{p.protocol}</td><td className="px-3 py-1.5">{p.packets}</td>
                      <td className="px-3 py-1.5"><div className="flex items-center gap-2"><div className="h-1.5 rounded bg-fin" style={{ width: `${(p.packets / cap.count) * 120}px` }} />{((p.packets / cap.count) * 100).toFixed(1)}%</div></td><td className="px-3 py-1.5">{p.bytes}</td>
                    </tr>
                  ))}
                  {view === "conversations" && cap.stats.conversations.map((c) => (
                    <tr key={c.a + c.b} className="border-t border-line/60 hover:bg-panel-2" onClick={() => { const f = `ip.addr == ${c.a} && ip.addr == ${c.b}`; setFilterText(f); setApplied(f); setView("packets"); }}>
                      <td className="px-3 py-1.5">{c.a}</td><td className="px-3 py-1.5">{c.b}</td><td className="px-3 py-1.5">{c.packets}</td><td className="px-3 py-1.5">{c.bytes}</td>
                    </tr>
                  ))}
                  {view === "endpoints" && cap.stats.endpoints.map((e) => (
                    <tr key={e.address} className="border-t border-line/60 hover:bg-panel-2" onClick={() => { const f = `ip.addr == ${e.address}`; setFilterText(f); setApplied(f); setView("packets"); }}>
                      <td className="px-3 py-1.5">{e.address}</td><td className="px-3 py-1.5">{e.packets}</td><td className="px-3 py-1.5">{e.bytes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-muted">Click a row to filter the packet list.</p>
            </div>
          )}
        </>
      )}
      {follow && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6" onClick={() => setFollow(null)}>
          <div className="panel flex max-h-full w-full max-w-4xl flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-line px-4 py-2 text-sm">
              <span>Follow TCP Stream {follow.stream} · <span className="text-red-300">{follow.client}</span> → <span className="text-sky-300">{follow.server}</span> · {follow.client_bytes} B / {follow.server_bytes} B</span>
              <div className="flex gap-2">
                <button className="btn text-xs" onClick={() => { const f = `tcp.stream == ${follow.stream}`; setFilterText(f); setApplied(f); setFollow(null); setView("packets"); }}>Filter this stream</button>
                <button onClick={() => setFollow(null)} aria-label="Close"><X size={16} /></button>
              </div>
            </div>
            <pre className="flex-1 overflow-auto whitespace-pre-wrap break-all p-4 font-mono text-[12px]">
              {follow.segments.length === 0 ? <span className="text-muted">No payload in this stream.</span> : follow.segments.map((s, i) => <span key={i} className={s.from_client ? "text-red-300" : "text-sky-300"}>{s.text}</span>)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
