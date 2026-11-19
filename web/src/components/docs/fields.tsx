"use client";
/** Small labelled inputs shared by the guided API docs editor. */
import { useId } from "react";

export function Text({ label, value, onChange, placeholder, mono, hint }: { label: string; value: string | undefined; onChange: (v: string) => void; placeholder?: string; mono?: boolean; hint?: string }) {
  const id = useId();
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <input id={id} className={`input ${mono ? "font-mono text-xs" : ""}`} value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Area({ label, value, onChange, placeholder, rows = 3, mono, hint }: { label: string; value: string | undefined; onChange: (v: string) => void; placeholder?: string; rows?: number; mono?: boolean; hint?: string }) {
  const id = useId();
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <textarea id={id} rows={rows} className={`input ${mono ? "font-mono text-xs" : ""}`} value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: readonly (readonly [string, string])[] }) {
  const id = useId();
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
    </div>
  );
}

/** Removes keys whose value is "" or undefined, so the document stays clean. */
export function clean<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== "" && v !== undefined)) as T;
}

export const METHOD_COLOR: Record<string, string> = { get: "text-emerald-300", post: "text-amber-300", put: "text-sky-300", patch: "text-violet-300", delete: "text-red-400", head: "text-zinc-300", options: "text-pink-300", trace: "text-zinc-300", query: "text-teal-300" };
export function MethodBadge({ method, className = "" }: { method: string; className?: string }) {
  return <span className={`inline-block w-14 shrink-0 font-mono text-[11px] font-bold uppercase ${METHOD_COLOR[method] ?? ""} ${className}`}>{method}</span>;
}
