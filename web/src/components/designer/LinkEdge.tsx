"use client";
/** Canvas link: smooth-step path with a label; attack paths render red and animated. */
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from "@xyflow/react";
import { Lock } from "lucide-react";
import type { LinkEdgeT } from "./flow-types";

export function LinkEdge(props: EdgeProps<LinkEdgeT>) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected, markerEnd } = props;
  const [path, lx, ly] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 10 });
  const attack = Boolean(data?.attack);
  const color = attack ? "#ef4444" : selected ? "#2ee6c5" : "#3b5166";
  const label = [data?.label, data?.port && !data?.label?.includes(String(data.port)) ? `:${data.port}` : ""].filter(Boolean).join(" ");
  return (
    <>
      <BaseEdge path={path} markerEnd={markerEnd} style={{ stroke: color, strokeWidth: selected ? 2.2 : 1.6, strokeDasharray: attack ? "6 4" : undefined }} />
      {(label || data?.encrypted) && (
        <EdgeLabelRenderer>
          <div className="nodrag nopan pointer-events-auto absolute flex items-center gap-1 rounded border bg-bg px-1.5 py-0.5 font-mono text-[10px]"
            style={{ transform: `translate(-50%,-50%) translate(${lx}px,${ly}px)`, borderColor: color, color: attack ? "#fca5a5" : "#a9bccf" }}>
            {data?.encrypted && <Lock size={9} />}{label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
