"use client";
/** Editable key/value rows with enable toggles (params, headers, form fields, variables). */
import { Plus, X } from "lucide-react";
import type { KeyValue } from "@/lib/types";

export function KeyValueEditor({ rows, onChange, keyPlaceholder = "Key", valuePlaceholder = "Value" }: { rows: KeyValue[]; onChange: (rows: KeyValue[]) => void; keyPlaceholder?: string; valuePlaceholder?: string }) {
  const set = (i: number, patch: Partial<KeyValue>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input type="checkbox" checked={r.enabled} onChange={(e) => set(i, { enabled: e.target.checked })} aria-label="Enabled" />
          <input className="input font-mono text-xs" value={r.key} placeholder={keyPlaceholder} onChange={(e) => set(i, { key: e.target.value })} aria-label="Key" />
          <input className="input font-mono text-xs" value={r.value} placeholder={valuePlaceholder} onChange={(e) => set(i, { value: e.target.value })} aria-label="Value" />
          <button className="text-muted hover:text-danger" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label="Remove row"><X size={15} /></button>
        </div>
      ))}
      <button className="btn text-xs" onClick={() => onChange([...rows, { key: "", value: "", enabled: true }])}><Plus size={13} />Add</button>
    </div>
  );
}
