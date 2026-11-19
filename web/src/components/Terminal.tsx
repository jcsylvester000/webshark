"use client";
/** Interactive console bound to the Slyshark command engine (`lib/terminal.ts`). */
import { useEffect, useRef, useState } from "react";
import { runCommand, type Line, type TermContext } from "@/lib/terminal";

const TONE: Record<string, string> = { ok: "text-emerald-300", err: "text-red-400", warn: "text-amber-300", dim: "text-muted", accent: "text-fin", cmd: "text-white" };

export function Terminal({ context = {}, className = "", prompt = "slyshark", initial }: { context?: TermContext; className?: string; prompt?: string; initial?: string }) {
  const [lines, setLines] = useState<Line[]>([{ text: 'Slyshark console. Type "help" for commands.', tone: "dim" }]);
  const [input, setInput] = useState(initial ?? "");
  const [history, setHistory] = useState<string[]>([]);
  const [cursor, setCursor] = useState(-1);
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [lines]);

  async function exec(cmd: string) {
    setLines((l) => [...l, { text: `${prompt}$ ${cmd}`, tone: "cmd" }]);
    const nextHistory = cmd.trim() ? [...history, cmd] : history;
    setHistory(nextHistory);
    setCursor(-1);
    setBusy(true);
    const out = await runCommand(cmd, context, nextHistory);
    setBusy(false);
    if (out === "clear") setLines([]);
    else setLines((l) => [...l, ...out]);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !busy) { const c = input; setInput(""); exec(c); }
    else if (e.key === "ArrowUp" && history.length) { e.preventDefault(); const i = cursor === -1 ? history.length - 1 : Math.max(0, cursor - 1); setCursor(i); setInput(history[i]); }
    else if (e.key === "ArrowDown" && cursor !== -1) { e.preventDefault(); const i = cursor + 1; if (i >= history.length) { setCursor(-1); setInput(""); } else { setCursor(i); setInput(history[i]); } }
    else if (e.key === "l" && e.ctrlKey) { e.preventDefault(); setLines([]); }
  }

  return (
    <div className={`flex flex-col bg-[#05080c] font-mono text-[13px] leading-relaxed ${className}`} onClick={() => inputRef.current?.focus()}>
      <div className="flex-1 overflow-auto px-4 py-3">
        {lines.map((l, i) => <div key={i} className={`whitespace-pre-wrap break-all ${TONE[l.tone ?? ""] ?? "text-ink"}`}>{l.text || " "}</div>)}
        <div className="flex items-center gap-2" ref={bottom}>
          <span className="text-fin">{prompt}$</span>
          <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey} disabled={busy}
            className="flex-1 bg-transparent text-white outline-none" spellCheck={false} autoComplete="off" aria-label="Console input" autoFocus />
          {busy && <span className="animate-pulse text-muted">running…</span>}
        </div>
      </div>
    </div>
  );
}
