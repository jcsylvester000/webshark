"use client";
/** Canvas node: icon (or the site's favicon for web apps), label, target, status and open ports. */
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { memo, useState } from "react";
import { kindOf, nodeTarget } from "@/lib/nodes";
import type { DeviceNodeT } from "./flow-types";

function Favicon({ url, fallback }: { url: string; fallback: React.ReactNode }) {
  const [failed, setFailed] = useState(false);
  let origin = "";
  try { origin = new URL(url.includes("://") ? url : `https://${url}`).origin; } catch { return <>{fallback}</>; }
  if (failed) return <>{fallback}</>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`${origin}/favicon.ico`} alt="" width={20} height={20} referrerPolicy="no-referrer" onError={() => setFailed(true)} className="rounded-sm" />;
}

const SIDES = [Position.Top, Position.Right, Position.Bottom, Position.Left];

function DeviceNodeImpl({ data, selected }: NodeProps<DeviceNodeT>) {
  const k = kindOf(data.kind);
  const Icon = k.icon;
  const target = data.url || nodeTarget(data);
  const status = data.ping ? (data.ping.ok ? "#4ade80" : "#f05252") : null;
  const handles = SIDES.map((p) => <Handle key={p} id={p} type="source" position={p} className="!opacity-0 group-hover:!opacity-100" />);

  if (data.kind === "note") {
    return (
      <div className={`group w-52 rounded-md border bg-yellow-200/90 p-2.5 text-xs text-yellow-950 shadow ${selected ? "ring-2 ring-fin" : "border-yellow-300"}`}>
        {handles}
        <div className="font-semibold">{data.label}</div>
        <div className="mt-1 whitespace-pre-wrap">{data.notes || "Double-click to edit in the inspector"}</div>
      </div>
    );
  }
  const threat = data.kind === "attacker" || data.kind === "vulnerability";
  return (
    <div className={`group min-w-40 max-w-60 rounded-lg border bg-panel px-3 py-2 shadow-lg ${selected ? "ring-2 ring-fin" : ""}`}
      style={{ borderColor: threat ? "#ef444488" : `${k.color}55` }}>
      {handles}
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md" style={{ background: `${k.color}1f`, color: k.color }}>
          {data.kind === "webapp" && data.url ? <Favicon url={data.url} fallback={<Icon size={18} />} /> : <Icon size={18} />}
        </span>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium text-ink">{data.label}</div>
          <div className="truncate font-mono text-[10.5px] text-muted">{target || k.label}</div>
        </div>
        {status && <span className="ml-auto h-2 w-2 shrink-0 rounded-full" style={{ background: status }} title={data.ping?.ok ? `reachable ${data.ping.avg_ms ?? ""} ms` : "unreachable"} />}
      </div>
      {data.zone && <div className="mt-1.5 text-[10px] uppercase tracking-wider text-muted">{data.zone}</div>}
      {data.scan && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {data.scan.open.slice(0, 8).map((p) => (
            <span key={p.port} title={p.note ?? p.service} className={`rounded px-1 font-mono text-[10px] ${p.note ? "bg-amber-500/15 text-amber-300" : "bg-emerald-500/15 text-emerald-300"}`}>{p.port}</span>
          ))}
          {data.scan.open.length === 0 && <span className="font-mono text-[10px] text-muted">no open ports</span>}
          {data.scan.open.length > 8 && <span className="font-mono text-[10px] text-muted">+{data.scan.open.length - 8}</span>}
        </div>
      )}
      {data.audit && <div className={`mt-1 font-mono text-[10px] ${data.audit.score >= 80 ? "text-emerald-300" : data.audit.score >= 50 ? "text-amber-300" : "text-red-400"}`}>audit {data.audit.score}/100</div>}
    </div>
  );
}

export const DeviceNode = memo(DeviceNodeImpl);
