"use client";
/**
 * Follow-along tutorial overlay: help box, shout-out box, spotlight and pointer for the running
 * step, plus action detection. Every 250 ms it re-measures the target and evaluates the step's
 * check against the open project, the page and recent user events; when the check passes the
 * step is marked done and the guide moves on. Loaded only while a tutorial is running.
 */
import { ArrowDown, ArrowLeft, ArrowUp, Check, ChevronLeft, ChevronRight, GraduationCap, Lightbulb, PartyPopper, SkipForward, TriangleAlert, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { usePrefs, type Prefs } from "@/lib/prefs";
import { useProjects } from "@/lib/store";
import { since } from "@/lib/tour/bus";
import { useTour } from "@/lib/tour/engine";
import { checkedOf, matches, resolve, selectedTab, valueOf } from "@/lib/tour/target";
import type { TourCtx, Tutorial } from "@/lib/tour/types";
import type { ProjectState } from "@/lib/project";

type Registry = typeof import("@/lib/tutorials");
type Rect = { top: number; left: number; width: number; height: number };
const BOX_W = 360;
const TONE = {
  tip: { cls: "border-fin/50 bg-fin/10 text-ink", icon: <Lightbulb size={15} className="mt-0.5 shrink-0 text-fin" aria-hidden /> },
  warn: { cls: "border-amber-500/50 bg-amber-500/10 text-ink", icon: <TriangleAlert size={15} className="mt-0.5 shrink-0 text-amber-400" aria-hidden /> },
  win: { cls: "border-emerald-500/50 bg-emerald-500/10 text-ink", icon: <PartyPopper size={15} className="mt-0.5 shrink-0 text-emerald-400" aria-hidden /> },
};

export default function TourOverlay() {
  const active = useTour((s) => s.active);
  const finished = useTour((s) => s.finished);
  const [reg, setReg] = useState<Registry | null>(null);
  useEffect(() => { import("@/lib/tutorials").then(setReg); }, []);
  if (!reg) return null;
  if (finished) return <Finished reg={reg} id={finished} />;
  const tut = active ? reg.tutorialById(active.id) : undefined;
  if (!active || !tut || !tut.steps[active.step]) return null;
  // Keyed by step, so every step starts with fresh state.
  return <StepGuide key={`${active.id}-${active.step}`} tut={tut} idx={active.step} projectIdOfTour={active.projectId} />;
}

function Finished({ reg, id }: { reg: Registry; id: string }) {
  const router = useRouter();
  const progress = useTour((s) => s.progress);
  const { closeFinished, start } = useTour.getState();
  const t = reg.tutorialById(id);
  const doneSet = new Set(Object.entries(progress).filter(([, p]) => p.status === "completed").map(([k]) => k));
  const nxt = reg.recommendNext(doneSet, id);
  return (
    <section data-tour-ui role="region" aria-label="Tutorial complete" className="fixed bottom-4 right-4 z-[80] w-[min(92vw,380px)] rounded-xl border border-emerald-500/50 bg-panel p-5 shadow-2xl">
      <div className="flex items-start gap-3"><PartyPopper className="shrink-0 text-emerald-400" aria-hidden /><div><h2 className="font-semibold">Tutorial complete</h2><p className="text-sm text-muted">{t?.title}</p></div>
        <button className="ml-auto text-muted hover:text-ink" aria-label="Close" onClick={closeFinished}><X size={16} /></button></div>
      {t && <p className="mt-3 text-sm"><b>You now have:</b> {t.output}</p>}
      {t && <p className="mt-1 text-xs text-muted">{t.docValue}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        {nxt && <button className="btn-primary" onClick={async () => { closeFinished(); router.push(await start(nxt.id)); }}>Next: {nxt.title}</button>}
        <button className="btn" onClick={() => { closeFinished(); router.push("/dashboard/tutorials"); }}>Tutorial library</button>
      </div>
    </section>
  );
}

function StepGuide({ tut, idx, projectIdOfTour }: { tut: Tutorial; idx: number; projectIdOfTour?: string }) {
  const { goto, exit, complete } = useTour.getState();
  const path = usePathname();
  const router = useRouter();
  const step = tut.steps[idx];
  const last = idx === tut.steps.length - 1;
  const [rect, setRect] = useState<Rect | null>(null);
  const [found, setFound] = useState(false);
  const [done, setDone] = useState(false);
  const [quiz, setQuiz] = useState<number | null>(null);
  const [hint, setHint] = useState(false);
  const [boxH, setBoxH] = useState(260);
  // Open dialogs and dropdown menus the help box must not cover.
  const [avoid, setAvoid] = useState<{ kind: "dialog" | "menu"; r: Rect } | null>(null);
  const [vw, setVw] = useState(() => (typeof window === "undefined" ? 1200 : window.innerWidth));
  const [vh, setVh] = useState(() => (typeof window === "undefined" ? 800 : window.innerHeight));
  const startRef = useRef<{ at: number; state?: ProjectState; version: number; prefs?: Prefs; captured: boolean; scrolled: boolean; advancing: boolean }>({ at: 0, version: 0, captured: false, scrolled: false, advancing: false });
  const boxRef = useRef<HTMLElement>(null);
  const projectId = /^\/dashboard\/projects\/([0-9a-f-]{36})/.exec(path)?.[1];
  const next = () => { if (last) complete(idx); else goto(idx + 1); };
  const nextRef = useRef(next);
  useEffect(() => { nextRef.current = next; });

  useEffect(() => {
    startRef.current = { at: Date.now(), version: 0, captured: false, scrolled: false, advancing: false, prefs: usePrefs.getState().prefs };
    const t = setTimeout(() => setHint(true), 30_000);
    // Don't pull focus away from a field the user is typing in.
    if (!document.activeElement || document.activeElement === document.body) boxRef.current?.focus({ preventScroll: true });
    const onResize = () => { setVw(window.innerWidth); setVh(window.innerHeight); };
    window.addEventListener("resize", onResize);
    return () => { clearTimeout(t); window.removeEventListener("resize", onResize); };
  }, []);

  // The detection loop.
  useEffect(() => {
    const tick = () => {
      const s = startRef.current;
      if (!s.at) return;
      if (boxRef.current) { const h = boxRef.current.offsetHeight; setBoxH((p) => (Math.abs(p - h) > 2 ? h : p)); }
      const dlgEl = [...document.querySelectorAll("[role=dialog]")].find((d) => !d.closest("[data-tour-ui]") && d.getBoundingClientRect().width > 0);
      const menuEl = dlgEl ? null : [...document.querySelectorAll("[role=menu], .panel.absolute.shadow-xl")].find((d) => d.getBoundingClientRect().width > 0);
      const ob = dlgEl ?? menuEl;
      if (ob) { const r = ob.getBoundingClientRect(); setAvoid((p) => (p && p.r.top === r.top && p.r.left === r.left && p.r.width === r.width ? p : { kind: dlgEl ? "dialog" : "menu", r: { top: r.top, left: r.left, width: r.width, height: r.height } })); }
      else setAvoid((p) => (p ? null : p));
      const el = resolve(step.target);
      setFound(Boolean(el));
      if (el) {
        const r = el.getBoundingClientRect();
        setRect((p) => (p && p.top === r.top && p.left === r.left && p.width === r.width && p.height === r.height ? p : { top: r.top, left: r.left, width: r.width, height: r.height }));
        if (!s.scrolled && (r.bottom < 0 || r.top > window.innerHeight)) { s.scrolled = true; el.scrollIntoView({ block: "center" }); }
      } else setRect(null);
      const proj = projectId ? useProjects.getState().loaded[projectId] : undefined;
      if (!s.captured && proj) { s.state = proj.state; s.version = proj.version; s.captured = true; }
      if (!s.captured && !projectId) s.captured = true;
      if (!step.check || s.advancing) return;
      const ev = since(s.at);
      const ctx: TourCtx = {
        path, state: proj?.state, meta: proj?.meta, dirty: Boolean(proj?.dirty), version: proj?.version ?? 0,
        start: s.state, startVersion: s.version, startPrefs: s.prefs,
        clicked: (t) => ev.some((e) => e.type === "click" && matches(e.el, t)),
        cmd: (n) => ev.some((e) => e.type === "cmd" && e.name === n),
        tool: (n) => ev.some((e) => e.type === "tool" && e.name === n),
        downloaded: (re) => ev.some((e) => e.type === "download" && (!re || re.test(e.name))),
        fileChosen: () => ev.some((e) => e.type === "file"),
        key: (c) => ev.some((e) => e.type === "key" && e.combo === c),
        exists: (t) => Boolean(resolve(t)), value: valueOf, checked: checkedOf, tab: selectedTab,
        text: (re) => re.test(document.querySelector("main")?.textContent ?? ""),
        quizOk: false,
      };
      let ok = false;
      try { ok = Boolean(s.captured && step.check(ctx)); } catch { ok = false; }
      if (ok) {
        s.advancing = true;
        setDone(true);
        if (!last) setTimeout(() => nextRef.current(), 1100);
      }
    };
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [step, path, projectId, last]);

  const quizOk = step.quiz ? quiz === step.quiz.answer : false;
  const canNext = !step.check || done || step.optional || false;
  const blockedByQuiz = Boolean(step.quiz && !quizOk);

  function showMe() {
    const target = step.go?.path?.replace(":project", projectIdOfTour ?? "");
    if (target && path !== target) router.push(target);
    else if (!target && projectIdOfTour && !path.startsWith(`/dashboard/projects/${projectIdOfTour}`)) router.push(`/dashboard/projects/${projectIdOfTour}`);
    const tab = step.go?.tab;
    if (tab) setTimeout(() => resolve(`tab:${tab}`)?.click(), target || !projectId ? 700 : 0);
  }
  const lostProject = Boolean(projectIdOfTour && !path.startsWith(`/dashboard/projects/${projectIdOfTour}`) && !step.go?.path);

  const mobile = vw < 640;
  const spot = rect && step.target && found ? rect : null;
  let box: React.CSSProperties = { right: 16, bottom: 16, width: Math.min(BOX_W, vw - 32) };
  let pointerAbove = true;
  if (spot && !mobile) {
    const h = boxH;
    const below = spot.top + spot.height + 14;
    const left = Math.max(12, Math.min(spot.left, vw - BOX_W - 12));
    if (below + h < vh - 8) box = { top: below, left, width: BOX_W };
    else if (spot.top - h - 14 > 8) { box = { top: spot.top - h - 14, left, width: BOX_W }; pointerAbove = false; }
    else if (spot.left + spot.width + BOX_W + 24 < vw) box = { top: Math.max(8, Math.min(spot.top, vh - h - 8)), left: spot.left + spot.width + 16, width: BOX_W };
    else if (spot.left - BOX_W - 24 > 0) box = { top: Math.max(8, Math.min(spot.top, vh - h - 8)), left: spot.left - BOX_W - 16, width: BOX_W };
  }
  if (avoid && !mobile) {
    // Sit beside an open dialog, or move away from an open menu, so the guide never hides what the user must click.
    const a = avoid.r, h = boxH;
    const top = Math.max(8, Math.min(a.top, vh - h - 8));
    if (avoid.kind === "dialog" && a.left + a.width + BOX_W + 24 < vw) box = { top, left: a.left + a.width + 16, width: BOX_W };
    else if (avoid.kind === "dialog" && a.left - BOX_W - 24 > 0) box = { top, left: a.left - BOX_W - 16, width: BOX_W };
    else box = a.left + a.width / 2 > vw / 2 ? { left: 16, bottom: 16, width: Math.min(BOX_W, vw - 32) } : { right: 16, bottom: 16, width: Math.min(BOX_W, vw - 32) };
  }
  if (mobile) box = { left: 8, right: 8, bottom: 8 };
  const pct = Math.round(((idx + (done ? 1 : 0)) / tut.steps.length) * 100);

  return (
    <>
      {spot && (
        <div data-tour-ui aria-hidden className="tour-spot pointer-events-none fixed z-[70] rounded-lg"
          style={{ top: spot.top - 6, left: spot.left - 6, width: spot.width + 12, height: spot.height + 12, boxShadow: "0 0 0 3px var(--c-fin), 0 0 18px 6px rgba(46,230,197,0.45), 0 0 0 9999px rgba(3,8,12,0.55)" }} />
      )}
      {spot && step.point && !mobile && (() => {
        // Pointer beside the target (right if there's room), otherwise above or below it.
        const right = spot.left + spot.width + 150 < vw && spot.height < 120;
        const pos: React.CSSProperties = right ? { top: spot.top + spot.height / 2 - 13, left: spot.left + spot.width + 12 }
          : pointerAbove && spot.top > 40 ? { top: spot.top - 38, left: Math.max(8, spot.left + Math.min(spot.width / 2, 120) - 20) }
          : { top: spot.top + spot.height + 10, left: Math.max(8, spot.left + Math.min(spot.width / 2, 120) - 20) };
        return (
          <div data-tour-ui aria-hidden className={`${right ? "tour-nudge" : "tour-bounce"} pointer-events-none fixed z-[75] flex items-center gap-1 rounded-full bg-fin px-2.5 py-1 text-xs font-semibold text-[#070b10] shadow-lg`} style={pos}>
            {right ? <ArrowLeft size={13} /> : pointerAbove && spot.top > 40 ? <ArrowDown size={13} /> : <ArrowUp size={13} />}{step.point}
          </div>
        );
      })()}
      <section ref={boxRef} tabIndex={-1} data-tour-ui role="region" aria-label={`Tutorial guide: ${tut.title}`}
        onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); exit(); } }}
        className="fixed z-[80] max-h-[80vh] overflow-y-auto rounded-xl border border-fin/50 bg-panel p-4 text-sm shadow-2xl outline-none" style={box}>
        <div className="flex items-center gap-2 text-xs text-muted">
          <GraduationCap size={14} className="text-fin" aria-hidden /><span className="truncate">{tut.id} · {tut.title}</span>
          <span className="ml-auto shrink-0">Step {idx + 1} of {tut.steps.length}</span>
          <button className="shrink-0 rounded p-0.5 hover:text-ink" aria-label="Pause tutorial" title="Pause (Esc). Resume from the Tutorials library." onClick={exit}><X size={15} /></button>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded bg-panel-2" role="progressbar" aria-label="Tutorial progress" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div className="h-full bg-fin transition-all" style={{ width: `${pct}%` }} /></div>
        <h2 className="mt-3 font-semibold">{step.title}</h2>
        <p className="mt-1 whitespace-pre-line text-ink/90">{step.body}</p>
        {step.shout && <div className={`mt-3 flex gap-2 rounded-md border px-3 py-2 text-xs ${TONE[step.shout.tone].cls}`}>{TONE[step.shout.tone].icon}<span>{step.shout.text}</span></div>}
        {step.quiz && (
          <fieldset className="mt-3 space-y-1.5">
            <legend className="mb-1 text-xs font-medium">{step.quiz.q}</legend>
            {step.quiz.options.map((o, i) => (
              <button key={o} className={`block w-full rounded-md border px-2.5 py-1.5 text-left text-xs ${quiz === i ? (i === step.quiz!.answer ? "border-emerald-500 bg-emerald-500/10" : "border-danger bg-danger/10") : "border-line hover:border-fin/60"}`} aria-pressed={quiz === i} onClick={() => setQuiz(i)}>{o}</button>
            ))}
            {quiz !== null && <p className={`text-xs ${quizOk ? "text-emerald-300" : "text-danger"}`}>{quizOk ? `Correct. ${step.quiz.why}` : "Not quite — try another answer."}</p>}
          </fieldset>
        )}
        {step.check && (
          <p className={`mt-3 flex items-center gap-1.5 text-xs ${done ? "text-emerald-300" : "text-muted"}`} role="status" aria-live="polite">
            {done ? <><Check size={14} aria-hidden />Done!{last ? "" : " Moving on…"}</> : <><span className="tour-pulse h-2 w-2 rounded-full bg-fin" aria-hidden />Waiting for {step.waiting ?? "the action"}…</>}
          </p>
        )}
        {!done && hint && step.hint && <p className="mt-2 text-xs text-muted">Hint: {step.hint}</p>}
        {step.target && !found && !done && (
          <div className="mt-3 rounded-md border border-line bg-panel-2 px-3 py-2 text-xs text-muted">
            Can&apos;t see the highlighted control on this page.
            {(step.go || lostProject) && <button className="btn ml-2 px-2 py-0.5 text-xs" onClick={showMe}>Show me</button>}
          </div>
        )}
        <div className="mt-4 flex items-center gap-2">
          <button className="btn px-2 py-1 text-xs" disabled={idx === 0} onClick={() => goto(idx - 1)}><ChevronLeft size={14} />Back</button>
          {!last && <button className="btn px-2 py-1 text-xs" onClick={() => goto(idx + 1)} title="Move on without doing this step"><SkipForward size={13} />Skip step</button>}
          <button className="btn-primary ml-auto px-3 py-1 text-xs" disabled={!canNext || blockedByQuiz} onClick={next}>{last ? "Finish" : "Next"}{!last && <ChevronRight size={14} />}</button>
        </div>
      </section>
    </>
  );
}
