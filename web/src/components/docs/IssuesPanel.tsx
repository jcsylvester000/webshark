"use client";
/** Lists checker findings; clicking one with an endpoint jumps to it in the editor. */
import { AlertCircle, AlertTriangle, Lightbulb, X } from "lucide-react";
import type { Issue } from "@/lib/openapi/types";

const ICON = { error: <AlertCircle size={14} className="text-danger" />, warning: <AlertTriangle size={14} className="text-amber-300" />, tip: <Lightbulb size={14} className="text-fin" /> };
const ORDER = { error: 0, warning: 1, tip: 2 };

export function IssuesPanel({ issues, onClose, onGo }: { issues: Issue[]; onClose: () => void; onGo: (key?: string) => void }) {
  const sorted = [...issues].sort((a, b) => ORDER[a.level] - ORDER[b.level]);
  return (
    <section aria-label="Documentation check" className="max-h-64 shrink-0 overflow-y-auto border-b border-line bg-panel">
      <div className="sticky top-0 flex items-center justify-between border-b border-line bg-panel px-4 py-2">
        <h2 className="text-sm font-medium">Documentation check</h2>
        <button onClick={onClose} aria-label="Close check results"><X size={15} /></button>
      </div>
      {!sorted.length && <p className="px-4 py-3 text-sm text-muted">No problems found. Your document follows the OpenAPI rules Slyshark checks.</p>}
      <ul>
        {sorted.map((i, n) => (
          <li key={n} className="border-b border-line/50 last:border-0">
            <button className="flex w-full items-start gap-2 px-4 py-2 text-left text-sm hover:bg-panel-2 disabled:cursor-default disabled:hover:bg-transparent" disabled={!i.key} onClick={() => onGo(i.key)}>
              <span className="mt-0.5 shrink-0">{ICON[i.level]}</span>
              <span className="min-w-0"><span className="font-mono text-xs text-muted">{i.where}</span><span className="block">{i.message}</span></span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
