"use client";
/** Interactive console bound to the Slyshark command engine (`lib/terminal.ts`). */
import { useEffect, useRef, useState } from "react";
import { useProjects } from "@/lib/store";
import { CONSOLE_EXAMPLES } from "@/lib/glossary";
import { usePrefs } from "@/lib/prefs";
import { runCommand, type Line, type TermContext } from "@/lib/terminal";

// The console is always dark (terminal convention), so it uses fixed colours rather than theme tokens.
const TONE: Record<string, string> = { ok: "text-[#6ee7b7]", err: "text-[#f87171]", warn: "text-[#fcd34d]", dim: "text-[#8597a9]", accent: "text-[#2ee6c5]", cmd: "text-[#ffffff]" };

/** `projectId` binds command history and tool results to that project's working state. */
export function Terminal({ context = {}, className = "", prompt = "slyshark", initial, projectId }: { context?: TermContext; className?: string; prompt?: string; initial?: string; projectId?: string }) {
  const update = useProjects((s) => s.update);
  const tips = usePrefs((s) => s.prefs.learningTips);
  const addResult = useProjects((s) => s.addResult);
  const [lines, setLines] = useState<Line[]>([{ text: 'Slyshark console. Type "help" for commands.', tone: "dim" }]);
  const [input, setInput] = useState(initial ?? "");
  const [history, setHistory] = useState<string[]>(() => (projectId ? useProjects.getState().loaded[projectId]?.state.console.history ?? [] : []));
  const [cursor, setCursor] = useState(-1);
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [lines]);

  async function exec(cmd: string) {
    setLines((l) => [...l, { text: `${prompt}$ ${cmd}`, tone: "cmd" }]);
    const nextHistory = cmd.trim() ? [...history, cmd] : history;
    setHistory(nextHistory);
    if (projectId && cmd.trim()) update(projectId, (s) => ({ ...s, console: { history: nextHistory.slice(-200) } }));
    setCursor(-1);
    setBusy(true);
    const ctx: TermContext = projectId && !context.onResult ? { ...context, onResult: (r) => addResult(projectId, r) } : context;
    const out = await runCommand(cmd, ctx, nextHistory);
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
    <div className={`flex flex-col overflow-hidden bg-[#05080c] font-mono text-[13px] leading-relaxed text-[#dbe6f0] ${className}`} onClick={() => inputRef.current?.focus()}>
      {tips && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-[#1c2a38] px-3 py-1.5 font-sans text-xs text-[#8597a9]">
          <span>Try:</span>
          {CONSOLE_EXAMPLES.map((x) => <button key={x.c} type="button" title={x.why} disabled={busy} onClick={(e) => { e.stopPropagation(); setInput(x.c); inputRef.current?.focus(); }} className="rounded border border-[#1c2a38] px-1.5 py-0.5 font-mono text-[#2ee6c5] hover:border-[#2ee6c5]/60">{x.c}</button>)}
        </div>
      )}
      <div className="flex-1 overflow-auto px-4 py-3">
        {lines.map((l, i) => <div key={i} className={`whitespace-pre-wrap break-all ${TONE[l.tone ?? ""] ?? "text-[#dbe6f0]"}`}>{l.text || " "}</div>)}
        <div className="flex items-center gap-2" ref={bottom}>
          <span className="text-[#2ee6c5]">{prompt}$</span>
          <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey} disabled={busy}
            className="flex-1 bg-transparent text-[#ffffff] outline-none" spellCheck={false} autoComplete="off" aria-label="Console input" autoFocus />
          {busy && <span className="animate-pulse text-[#8597a9]">running…</span>}
        </div>
      </div>
    </div>
  );
}
