"use client";
/**
 * YAML / JSON source editor. Text is parsed shortly after typing stops; only a document that
 * parses replaces the project's spec, so a half-typed line never destroys work.
 */
import { Check, Copy } from "lucide-react";
import { useRef, useState } from "react";
import { parseDoc, toText } from "@/lib/openapi/io";
import type { OpenApiDoc } from "@/lib/openapi/types";

export function CodeEditor({ doc, format, onFormat, onChange }: { doc: OpenApiDoc; format: "yaml" | "json"; onFormat: (f: "yaml" | "json") => void; onChange: (d: OpenApiDoc) => void }) {
  const docJson = JSON.stringify(doc);
  const [synced, setSynced] = useState(docJson);
  const [text, setText] = useState(() => toText(doc, format));
  const [err, setErr] = useState<{ message: string; line?: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gutter = useRef<HTMLDivElement>(null);
  // The spec changed somewhere else (guided editor, generator, import): show the new text.
  if (docJson !== synced) { setSynced(docJson); setText(toText(doc, format)); setErr(null); }

  const apply = (t: string) => {
    const r = parseDoc(t);
    if (!r.ok) { setErr({ message: r.message, line: r.line }); return; }
    setErr(null);
    const j = JSON.stringify(r.doc);
    if (j !== docJson) { setSynced(j); onChange(r.doc); }
  };
  const onType = (t: string) => {
    setText(t);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => apply(t), 450);
  };
  const switchTo = (f: "yaml" | "json") => {
    if (f === format) return;
    const r = parseDoc(text);
    if (!r.ok) { setErr({ message: `Fix this first, then switch format. ${r.message}`, line: r.line }); return; }
    setText(toText(r.doc, f)); onFormat(f);
  };
  const lines = text.split("\n").length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-1.5 text-sm">
        <div className="flex rounded-md border border-line p-0.5" role="group" aria-label="Source format">
          {(["yaml", "json"] as const).map((f) => <button key={f} aria-pressed={format === f} className={`rounded px-2 py-0.5 text-xs uppercase ${format === f ? "bg-panel-2 text-ink" : "text-muted"}`} onClick={() => switchTo(f)}>{f}</button>)}
        </div>
        <span className="text-xs text-muted">Changes apply as you type. Nothing is stored until you save the project.</span>
        <button className="btn ml-auto py-1 text-xs" onClick={async () => { await navigator.clipboard.writeText(text).catch(() => null); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? "Copied" : "Copy"}</button>
      </div>
      {err && <p role="alert" className="shrink-0 border-b border-danger/40 bg-danger/10 px-4 py-1.5 text-sm text-danger">{err.line ? `Line ${err.line}: ` : ""}{err.message} <span className="text-muted">(your last valid version is kept)</span></p>}
      <div className="flex min-h-0 flex-1 overflow-hidden bg-bg">
        <div ref={gutter} aria-hidden className="w-12 shrink-0 select-none overflow-hidden border-r border-line py-3 pr-2 text-right font-mono text-xs leading-5 text-muted">
          {Array.from({ length: lines }, (_, i) => <div key={i} className={err?.line === i + 1 ? "bg-danger/20 text-danger" : ""}>{i + 1}</div>)}
        </div>
        <textarea aria-label={`OpenAPI ${format.toUpperCase()} source`} spellCheck={false} wrap="off" className="min-h-0 flex-1 resize-none bg-transparent px-3 py-3 font-mono text-xs leading-5 text-ink outline-none"
          value={text} onChange={(e) => onType(e.target.value)} onBlur={() => { if (timer.current) { clearTimeout(timer.current); timer.current = null; apply(text); } }}
          onScroll={(e) => { if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop; }} />
      </div>
    </div>
  );
}
