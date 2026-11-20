"use client";
/**
 * Tutorial library: every follow-along tutorial by track, with search, level/role/status filters,
 * progress, and Start / Resume / Restart. Starting a tutorial may create a practice project.
 */
import { CheckCircle2, CircleDot, Clock, GraduationCap, PlayCircle, RotateCcw, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { dialogs } from "@/components/Dialogs";
import { PageHeader } from "@/components/PageHeader";
import { errMsg } from "@/lib/api";
import { useTour } from "@/lib/tour/engine";
import { TRACKS, type Tutorial } from "@/lib/tour/types";
import { recommendNext, ROLES, TUTORIALS } from "@/lib/tutorials";

type Status = "all" | "new" | "started" | "completed";

export default function TutorialsPage() {
  const router = useRouter();
  const progress = useTour((s) => s.progress);
  const active = useTour((s) => s.active);
  const loaded = useTour((s) => s.loaded);
  const [q, setQ] = useState("");
  const [level, setLevel] = useState("all");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState<Status>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { useTour.getState().loadProgress(); }, []);

  const doneSet = useMemo(() => new Set(Object.entries(progress).filter(([, p]) => p.status === "completed").map(([k]) => k)), [progress]);
  const stateOf = (t: Tutorial): Exclude<Status, "all"> => progress[t.id]?.status === "completed" ? "completed" : progress[t.id] ? "started" : "new";
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return TUTORIALS.filter((t) => (!term || `${t.id} ${t.title} ${t.summary} ${t.covers} ${t.compliance}`.toLowerCase().includes(term))
      && (level === "all" || t.level === level) && (role === "all" || t.roles?.includes(role))
      && (status === "all" || (progress[t.id]?.status === "completed" ? "completed" : progress[t.id] ? "started" : "new") === status));
  }, [q, level, role, status, progress]);
  const recommended = recommendNext(doneSet);
  const minutesLeft = TUTORIALS.filter((t) => !doneSet.has(t.id)).reduce((a, t) => a + t.minutes, 0);

  async function begin(t: Tutorial, restart = false) {
    setBusy(t.id); setError(null);
    try { router.push(await useTour.getState().start(t.id, { restart })); }
    catch (e) { setError(errMsg(e)); }
    setBusy(null);
  }
  async function resetAll() {
    if (!(await dialogs.confirm({ title: "Reset all tutorial progress?", message: "Every tutorial goes back to “not started”. Practice projects are kept (delete the “Tutorial practice” workspace to remove them).", confirmText: "Reset", danger: true }))) return;
    try { await useTour.getState().reset("all"); } catch (e) { setError(errMsg(e)); }
  }

  return (
    <div>
      <PageHeader title="Tutorials" subtitle="Follow-along guides for every feature, icon and scenario. The app highlights what to click and notices when you've done it.">
        <button className="btn" onClick={resetAll} disabled={!Object.keys(progress).length}><RotateCcw size={14} />Reset progress</button>
      </PageHeader>
      <div className="space-y-6 p-6">
        {error && <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="panel p-5">
            <div className="flex items-center gap-3"><GraduationCap className="text-fin" aria-hidden /><h2 className="font-medium">Your progress</h2></div>
            <p className="mt-2 text-sm text-muted">{doneSet.size} of {TUTORIALS.length} tutorials completed · about {Math.round(minutesLeft / 6) / 10} hours of guided content left.</p>
            <div className="mt-3 h-2 overflow-hidden rounded bg-panel-2" role="progressbar" aria-label="Tutorials completed" aria-valuenow={doneSet.size} aria-valuemin={0} aria-valuemax={TUTORIALS.length}><div className="h-full bg-fin" style={{ width: `${(doneSet.size / TUTORIALS.length) * 100}%` }} /></div>
            <p className="mt-3 text-xs text-muted">Guides use a <b className="text-ink">help box</b>, <b className="text-ink">shout-outs</b> for tips and warnings, a <b className="text-ink">highlighted area</b> and a <b className="text-ink">pointer</b>. Most tutorials open a practice project in the “Tutorial practice” workspace, so your real work is never touched.</p>
          </div>
          {recommended && (
            <div className="panel border-fin/40 p-5">
              <div className="text-xs uppercase tracking-wider text-muted">{active ? "In progress" : "Recommended next"}</div>
              {(() => { const t = active ? TUTORIALS.find((x) => x.id === active.id) ?? recommended : recommended; return (<>
                <h2 className="mt-1 font-medium">{t.title}</h2>
                <p className="mt-1 line-clamp-2 text-sm text-muted">{t.summary}</p>
                <button className="btn-primary mt-3" disabled={busy !== null} onClick={() => begin(t)}><PlayCircle size={15} />{active?.id === t.id || progress[t.id] ? "Resume" : "Start"}</button>
              </>); })()}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-60 flex-1"><Search size={15} className="absolute left-2.5 top-2.5 text-muted" aria-hidden /><input aria-label="Search tutorials" className="input pl-8" placeholder="Search tutorials, features or frameworks…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <select aria-label="Level" className="input w-40" value={level} onChange={(e) => setLevel(e.target.value)}><option value="all">All levels</option><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select>
          <select aria-label="Progress" className="input w-40" value={status} onChange={(e) => setStatus(e.target.value as Status)}><option value="all">Any progress</option><option value="new">Not started</option><option value="started">In progress</option><option value="completed">Completed</option></select>
        </div>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Focus">
          {[{ id: "all", label: "Everything" }, ...ROLES].map((r) => <button key={r.id} role="radio" aria-checked={role === r.id} className={`chip min-h-7 px-2.5 ${role === r.id ? "border-fin text-fin" : "hover:border-fin/50"}`} onClick={() => setRole(r.id)}>{r.label}</button>)}
        </div>
        {!loaded && <p className="sr-only" role="status">Loading your progress…</p>}
        {list.length === 0 && <p className="panel p-6 text-center text-sm text-muted">No tutorials match these filters.</p>}

        {TRACKS.map((tr) => {
          const items = list.filter((t) => t.track === tr.id);
          if (!items.length) return null;
          const all = TUTORIALS.filter((t) => t.track === tr.id);
          return (
            <section key={tr.id} aria-labelledby={`track-${tr.id}`}>
              <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
                <h2 id={`track-${tr.id}`} className="text-base font-semibold">{tr.id} · {tr.name}</h2>
                <span className="text-xs text-muted">{all.filter((t) => doneSet.has(t.id)).length}/{all.length} done · {tr.blurb}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((t) => {
                  const st = stateOf(t);
                  return (
                    <article key={t.id} className="panel flex flex-col p-4">
                      <div className="flex items-start gap-2">
                        <span className="chip font-mono">{t.id}</span>
                        <h3 className="min-w-0 flex-1 font-medium">{t.title}</h3>
                        {st === "completed" ? <CheckCircle2 size={17} className="shrink-0 text-emerald-400" aria-label="Completed" /> : st === "started" ? <CircleDot size={17} className="shrink-0 text-amber-400" aria-label="In progress" /> : null}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted"><span>{t.level}</span><span className="inline-flex items-center gap-1"><Clock size={12} aria-hidden />{t.minutes} min</span><span>{t.steps.length} steps</span>{t.practice && <span>· practice project</span>}</div>
                      <p className="mt-2 line-clamp-3 flex-1 text-sm text-muted">{t.summary}</p>
                      <details className="mt-2 text-xs">
                        <summary className="cursor-pointer text-fin">What you&apos;ll learn and produce</summary>
                        <dl className="mt-2 space-y-1.5 text-muted">
                          <div><dt className="font-medium text-ink">Covers</dt><dd>{t.covers}</dd></div>
                          <div><dt className="font-medium text-ink">Output</dt><dd>{t.output}</dd></div>
                          {t.docValue && <div><dt className="font-medium text-ink">Helps documentation</dt><dd>{t.docValue}</dd></div>}
                          {t.compliance && t.compliance !== "—" && <div><dt className="font-medium text-ink">Security / compliance</dt><dd>{t.compliance}</dd></div>}
                        </dl>
                      </details>
                      <div className="mt-3 flex gap-2">
                        <button className="btn-primary px-3 py-1 text-xs" disabled={busy !== null} onClick={() => begin(t)} aria-label={`${st === "started" ? "Resume" : st === "completed" ? "Replay" : "Start"} ${t.title}`}>
                          <PlayCircle size={14} />{busy === t.id ? "Opening…" : st === "started" ? "Resume" : st === "completed" ? "Replay" : "Start"}
                        </button>
                        {st === "started" && <button className="btn px-3 py-1 text-xs" disabled={busy !== null} onClick={() => begin(t, true)} aria-label={`Restart ${t.title}`}>Restart</button>}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
