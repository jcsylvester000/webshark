"use client";
/**
 * Batch testing scenarios. Scenarios are part of the project's working state (stored on
 * "Save project"). A run executes in the browser; its results are stored only when the user
 * clicks "Save run" (command `batch.saveRun`). Saved runs are read back with queries.
 */
import { ArrowDown, ArrowUp, BookOpen, ChevronDown, ChevronRight, Copy, FileDown, FileUp, Play, Plus, Save, Square, Trash2, Wand2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { errMsg } from "@/lib/api";
import { runScenario, SCENARIO_TEMPLATES, STEP_LABEL, uid, type BatchRun, type Scenario, type Step, type StepResult, type StepType } from "@/lib/batch";
import { command, query, type RunSummary } from "@/lib/cqrs";
import { scenarioFromCanvas } from "@/lib/project";
import { fromArazzo, scenarioFromSpec, toArazzo } from "@/lib/openapi/arazzo";
import { parseDoc, toText } from "@/lib/openapi/io";
import { fileSlug } from "@/lib/export";
import { runReport } from "@/lib/reports";
import { useProjects } from "@/lib/store";
import { dialogs } from "./Dialogs";
import { ExportMenu } from "./ExportMenu";
import { HelpTip } from "./HelpTip";

const STATUS_CLS: Record<string, string> = { pass: "bg-emerald-500/15 text-emerald-300", fail: "bg-red-500/20 text-red-300", error: "bg-orange-500/20 text-orange-300", skipped: "bg-zinc-500/20 text-zinc-300", running: "bg-sky-500/15 text-sky-300" };

function Num({ label, value, onChange }: { label: string; value?: number; onChange: (v?: number) => void }) {
  return <label className="block text-xs text-muted">{label}<input type="number" className="input mt-0.5 font-mono text-xs" value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))} /></label>;
}
function Txt({ label, value, onChange, placeholder, area }: { label: string; value?: string; onChange: (v: string) => void; placeholder?: string; area?: boolean }) {
  return <label className="block text-xs text-muted">{label}{area
    ? <textarea className="input mt-0.5 min-h-16 font-mono text-xs" value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    : <input className="input mt-0.5 font-mono text-xs" value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />}</label>;
}
function Flag({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return <label className="flex items-center gap-1.5 text-xs text-muted"><input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />{label}</label>;
}

function StepEditor({ step, set }: { step: Step; set: (p: Partial<Step>) => void }) {
  switch (step.type) {
    case "dns": return <div className="grid grid-cols-2 gap-2"><Flag label="Expect it to resolve" value={step.expectResolves !== false} onChange={(v) => set({ expectResolves: v })} /><Txt label="Must include IP" value={step.containsIp} onChange={(v) => set({ containsIp: v })} placeholder="93.184.216.34" /></div>;
    case "ping": return <div className="grid grid-cols-4 gap-2"><Num label="TCP port" value={step.port} onChange={(v) => set({ port: v })} /><Num label="Count" value={step.count} onChange={(v) => set({ count: v })} /><Num label="Max avg ms" value={step.maxMs} onChange={(v) => set({ maxMs: v })} /><Flag label="Expect unreachable" value={step.expectReachable === false} onChange={(v) => set({ expectReachable: !v })} /></div>;
    case "portscan": return <div className="grid grid-cols-3 gap-2"><Txt label="Ports to scan" value={step.ports} onChange={(v) => set({ ports: v })} placeholder="common | 22,80,443 | 8000-8100" /><Txt label="Must be open" value={step.expectOpen} onChange={(v) => set({ expectOpen: v })} placeholder="443" /><Txt label="Must be closed" value={step.expectClosed} onChange={(v) => set({ expectClosed: v })} placeholder="22,3306" /></div>;
    case "http": return (
      <div className="grid grid-cols-4 gap-2">
        <label className="block text-xs text-muted">Method<select className="input mt-0.5 font-mono text-xs" value={step.method ?? "GET"} onChange={(e) => set({ method: e.target.value })}>{["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((m) => <option key={m}>{m}</option>)}</select></label>
        <Txt label="Expected status" value={step.expectStatus} onChange={(v) => set({ expectStatus: v })} placeholder="2xx | 200,301 | 401" />
        <Num label="Max ms" value={step.maxMs} onChange={(v) => set({ maxMs: v })} />
        <Txt label="Bearer token" value={step.bearer} onChange={(v) => set({ bearer: v })} />
        <div className="col-span-2"><Txt area label="Headers (Key: Value per line)" value={step.headers} onChange={(v) => set({ headers: v })} /></div>
        <div className="col-span-2"><Txt area label="Body (JSON or text)" value={step.body} onChange={(v) => set({ body: v })} /></div>
        <Txt label="Body contains" value={step.bodyContains} onChange={(v) => set({ bodyContains: v })} />
        <Txt label="Header present" value={step.headerPresent} onChange={(v) => set({ headerPresent: v })} placeholder="strict-transport-security" />
        <Flag label="Follow redirects" value={step.followRedirects !== false} onChange={(v) => set({ followRedirects: v })} />
      </div>
    );
    case "audit": return <div className="grid grid-cols-3 gap-2"><Num label="Minimum score" value={step.minScore} onChange={(v) => set({ minScore: v })} /><Flag label="Fail on any high finding" value={step.noHigh !== false} onChange={(v) => set({ noHigh: v })} /></div>;
  }
}

function ResultsTable({ results }: { results: (StepResult | { stepId: string; name: string; type: StepType; target: string; status: "running" })[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  return (
    <table className="panel w-full text-sm">
      <thead className="bg-panel-2 text-left text-xs uppercase tracking-wider text-muted"><tr><th className="w-6"><span className="sr-only">Details</span></th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Step</th><th className="px-3 py-2">Target</th><th className="px-3 py-2">ms</th><th className="px-3 py-2">Summary</th></tr></thead>
      <tbody>
        {results.map((r) => {
          const done = r.status !== "running" ? (r as StepResult) : null;
          return [
            <tr key={r.stepId} className="cursor-pointer border-t border-line/60 hover:bg-panel-2" onClick={() => setOpen({ ...open, [r.stepId]: !open[r.stepId] })}>
              <td className="pl-2 text-muted">{done?.checks.length ? (open[r.stepId] ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : null}</td>
              <td className="px-3 py-1.5"><span className={`rounded px-1.5 py-0.5 font-mono text-[11px] uppercase ${STATUS_CLS[r.status]}`}>{r.status}</span></td>
              <td className="px-3 py-1.5">{r.name}<span className="ml-2 text-xs text-muted">{STEP_LABEL[r.type]}</span></td>
              <td className="max-w-56 truncate px-3 py-1.5 font-mono text-xs" title={r.target}>{r.target}</td>
              <td className="px-3 py-1.5 font-mono text-xs text-muted">{done?.durationMs ?? ""}</td>
              <td className="px-3 py-1.5 font-mono text-xs text-muted">{done?.summary}</td>
            </tr>,
            open[r.stepId] && done ? (
              <tr key={`${r.stepId}-c`} className="bg-bg/60"><td /><td colSpan={5} className="px-3 py-2">
                {done.checks.map((c, i) => <div key={i} className="font-mono text-xs"><span className={c.ok ? "text-emerald-300" : "text-red-400"}>{c.ok ? "✓" : "✗"}</span> {c.label} <span className="text-muted">— {c.actual}</span></div>)}
              </td></tr>
            ) : null,
          ];
        })}
      </tbody>
    </table>
  );
}

export function BatchTests({ projectId }: { projectId: string }) {
  const project = useProjects((s) => s.loaded[projectId]);
  const update = useProjects((s) => s.update);
  const scenarios = project?.state.batch.scenarios ?? [];
  const activeId = project?.state.batch.activeScenarioId ?? scenarios[0]?.id ?? null;
  const sc = scenarios.find((s) => s.id === activeId) ?? null;
  const [authorized, setAuthorized] = useState(false);
  const [running, setRunning] = useState(false);
  const [live, setLive] = useState<Record<string, StepResult>>({});
  const [viewRun, setViewRun] = useState<(BatchRun & { savedId?: string }) | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const arazzoRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [openStep, setOpenStep] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const lastRun = project?.state.batch.lastRun ?? null;

  const loadRuns = useCallback(() => { query<RunSummary[]>(`runs?projectId=${projectId}`).then(setRuns).catch(() => null); }, [projectId]);
  useEffect(() => { loadRuns(); }, [loadRuns]);

  const setBatch = (fn: (b: NonNullable<typeof project>["state"]["batch"]) => Partial<NonNullable<typeof project>["state"]["batch"]>) =>
    update(projectId, (s) => ({ ...s, batch: { ...s.batch, ...fn(s.batch) } }));
  const setScenario = (p: Partial<Scenario>) => setBatch((b) => ({ scenarios: b.scenarios.map((x) => (x.id === activeId ? { ...x, ...p } : x)) }));
  const setSteps = (fn: (steps: Step[]) => Step[]) => sc && setScenario({ steps: fn(sc.steps) });
  const addScenario = (s: Scenario) => setBatch((b) => ({ scenarios: [...b.scenarios, s], activeScenarioId: s.id }));

  async function fromTemplate(tid: string) {
    const t = SCENARIO_TEMPLATES.find((x) => x.id === tid);
    if (!t) return;
    const target = await dialogs.prompt({ title: t.name, message: `${t.description}\n\nWhich site should it test? Use a domain (example.com) or a base URL for APIs.`, label: "Target", defaultValue: "example.com", confirmText: "Create scenario" });
    if (!target?.trim()) return;
    addScenario({ id: uid(), name: `${t.name} — ${target.trim()}`, description: t.description, steps: t.build(target.trim().replace(/^https?:\/\//, "").replace(/\/$/, "")), stopOnFail: false, concurrency: 2 });
  }

  async function run() {
    if (!sc) return;
    setError(null); setLive({}); setViewRun(null); setRunning(true);
    abort.current = new AbortController();
    try {
      const r = await runScenario(sc, { authorized, signal: abort.current.signal, onResult: (res) => setLive((l) => ({ ...l, [res.stepId]: res })) });
      setBatch(() => ({ lastRun: r }));
    } catch (e) { setError(errMsg(e)); }
    setRunning(false);
  }

  async function saveRun(r: BatchRun) {
    setSaving(true); setError(null);
    try {
      await command("batch.saveRun", { projectId, scenarioName: r.scenarioName, startedAt: r.startedAt, finishedAt: r.finishedAt, results: r.results });
      loadRuns();
    } catch (e) { setError(errMsg(e)); }
    setSaving(false);
  }

  async function openSaved(id: string) {
    try {
      const r = await query<{ id: string; scenario_name: string; started_at: string; finished_at: string; results: StepResult[] }>(`runs/${id}`);
      setViewRun({ savedId: r.id, scenarioId: "", scenarioName: r.scenario_name, startedAt: r.started_at, finishedAt: r.finished_at, results: r.results });
    } catch (e) { setError(errMsg(e)); }
  }

  function exportArazzo(list: Scenario[]) {
    if (!project) return;
    const r = toArazzo(list, project.state.docs.api.spec, project.meta.name);
    const url = URL.createObjectURL(new Blob([toText(r.doc as never, "yaml")], { type: "application/yaml" }));
    const a = document.createElement("a"); a.href = url; a.download = `${fileSlug(list.length === 1 ? list[0].name : project.meta.name)}.arazzo.yaml`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    setInfo(`Exported ${list.length} workflow${list.length === 1 ? "" : "s"}: ${r.linked} step${r.linked === 1 ? "" : "s"} linked to API docs operations, ${r.extension} kept as Slyshark extensions.`);
  }
  async function importArazzo(f: File) {
    setError(null); setInfo(null);
    const p = parseDoc(await f.text());
    if (!p.ok) return setError(`Couldn't read ${f.name}: ${p.message}`);
    try {
      const r = fromArazzo(p.doc, project?.state.docs.api.spec ?? null);
      if (!r.scenarios.length) return setError("No workflows found in that file.");
      setBatch((b) => ({ scenarios: [...b.scenarios, ...r.scenarios], activeScenarioId: r.scenarios[0].id }));
      setInfo(`Imported ${r.scenarios.length} workflow${r.scenarios.length === 1 ? "" : "s"} as scenarios${r.skipped.length ? `; ${r.skipped.length} step${r.skipped.length === 1 ? "" : "s"} skipped (${r.skipped.slice(0, 2).join("; ")})` : ""}.`);
    } catch (e) { setError(errMsg(e)); }
  }

  if (!project) return null;
  const steps = sc?.steps ?? [];
  const runningRows = running && sc ? steps.filter((s) => s.enabled && s.target.trim()).map((s) => live[s.id] ?? { stepId: s.id, name: s.name || STEP_LABEL[s.type], type: s.type, target: s.target, status: "running" as const }) : null;
  const shown = viewRun ?? (!running ? lastRun : null);
  const counts = (r: BatchRun) => ({ pass: r.results.filter((x) => x.status === "pass").length, total: r.results.length });

  return (
    <div className="grid min-h-full gap-0 lg:grid-cols-[260px_1fr]">
      <aside className="border-r border-line bg-panel p-3">
        <div className="mb-2 flex items-center justify-between"><span className="text-sm font-medium">Scenarios</span>
          <button className="btn px-2 py-1 text-xs" onClick={() => addScenario({ id: uid(), name: "New scenario", description: "", steps: [], stopOnFail: false, concurrency: 2 })}><Plus size={12} />New</button></div>
        {scenarios.map((s) => (
          <button key={s.id} onClick={() => setBatch(() => ({ activeScenarioId: s.id }))} className={`mb-1 block w-full rounded-md px-2.5 py-2 text-left text-sm ${s.id === activeId ? "bg-fin/10 text-fin" : "hover:bg-panel-2"}`}>
            <div className="truncate">{s.name}</div><div className="text-xs text-muted">{s.steps.length} steps</div>
          </button>
        ))}
        {!scenarios.length && <p className="mb-2 text-xs text-muted">No scenarios yet.</p>}
        <div className="mt-3 space-y-1.5 border-t border-line pt-3">
          <select aria-label="New from template" className="input text-xs" value="" onChange={(e) => fromTemplate(e.target.value)}>
            <option value="">+ From template…</option>
            {SCENARIO_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button className="btn w-full justify-center text-xs" onClick={() => { const s = scenarioFromCanvas(project.state.canvas, `Canvas checks — ${project.meta.name}`); if (!s.steps.length) setError("No canvas nodes have a host or URL yet."); else addScenario(s); }}><Wand2 size={13} />Generate from canvas</button>
        </div>
        <div className="mt-3 space-y-1.5 border-t border-line pt-3">
          <div className="flex items-center text-xs font-medium uppercase tracking-wider text-muted">API workflows<HelpTip>Arazzo is the OpenAPI Initiative&apos;s format for ordered API calls with success criteria. Export a scenario to share it with other API tools, or import one. Steps that match an endpoint in your API docs become real Arazzo steps; DNS, ping, scan and audit steps are kept as Slyshark extensions.</HelpTip></div>
          <button className="btn w-full justify-center text-xs" disabled={!project.state.docs.api.spec} title={project.state.docs.api.spec ? "Public GET endpoints should answer as documented; protected ones should refuse requests without credentials" : "Write API docs first (API docs tab)"} onClick={() => { const r = scenarioFromSpec(project.state.docs.api.spec!, `API docs checks — ${project.state.docs.api.spec!.info.title}`); if (!r.scenario.steps.length) setError(`No endpoint could be turned into a test: ${r.skipped.slice(0, 3).join("; ")}`); else { addScenario(r.scenario); setInfo(`Created ${r.scenario.steps.length} steps from the API docs${r.skipped.length ? `; skipped ${r.skipped.length} (${r.skipped.slice(0, 2).join("; ")})` : ""}.`); } }}><BookOpen size={13} />Generate from API docs</button>
          <button className="btn w-full justify-center text-xs" onClick={() => arazzoRef.current?.click()}><FileUp size={13} />Import Arazzo…</button>
          <button className="btn w-full justify-center text-xs" disabled={!scenarios.length} onClick={() => exportArazzo(scenarios)}><FileDown size={13} />Export all as Arazzo</button>
          <input ref={arazzoRef} type="file" accept=".yaml,.yml,.json" className="hidden" aria-label="Import Arazzo file" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importArazzo(f); }} />
        </div>
        <div className="mt-4 border-t border-line pt-3">
          <div className="mb-1.5 text-sm font-medium">Saved runs</div>
          {runs.map((r) => (
            <div key={r.id} className="group mb-1 flex items-center gap-1 rounded-md px-2 py-1.5 text-xs hover:bg-panel-2">
              <button className="min-w-0 flex-1 text-left" onClick={() => openSaved(r.id)}>
                <div className="truncate">{r.scenario_name}</div>
                <div className="text-muted">{new Date(r.created_at).toLocaleString()} · <span className={r.failed + r.errored ? "text-red-400" : "text-emerald-300"}>{r.passed}/{r.total}</span></div>
              </button>
              <button className="opacity-0 group-hover:opacity-100 hover:text-danger" aria-label="Delete run" onClick={async () => { if (await dialogs.confirm({ title: "Delete this saved run?", message: "Its results will be removed permanently.", danger: true })) { await command("batch.deleteRun", { id: r.id }).catch((e) => setError(errMsg(e))); loadRuns(); } }}><Trash2 size={12} /></button>
            </div>
          ))}
          {!runs.length && <p className="text-xs text-muted">Runs you save appear here.</p>}
        </div>
      </aside>

      <section className="min-w-0 space-y-4 p-5">
        {error && <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        {info && <p role="status" className="rounded-md border border-fin/40 bg-fin/5 px-3 py-2 text-sm">{info}</p>}
        {sc ? (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <label className="block min-w-64 flex-1 text-xs text-muted">Scenario name<input className="input mt-0.5" value={sc.name} onChange={(e) => setScenario({ name: e.target.value })} /></label>
              <label className="block w-28 text-xs text-muted">Parallel steps<select className="input mt-0.5" value={sc.concurrency} onChange={(e) => setScenario({ concurrency: Number(e.target.value) })}>{[1, 2, 3, 4].map((n) => <option key={n}>{n}</option>)}</select></label>
              <Flag label="Stop on first failure" value={sc.stopOnFail} onChange={(v) => setScenario({ stopOnFail: v })} />
              <button className="btn" onClick={() => addScenario({ ...structuredClone(sc), id: uid(), name: `${sc.name} (copy)` })}><Copy size={14} />Duplicate</button>
              <button className="btn" onClick={() => exportArazzo([sc])} title="Download this scenario as an Arazzo workflow"><FileDown size={14} />Arazzo</button>
              <button className="btn-danger" aria-label="Delete scenario" title="Delete scenario" onClick={async () => { if (await dialogs.confirm({ title: `Delete scenario “${sc.name}”?`, message: "Saved runs are kept. This becomes permanent when you save the project.", danger: true })) setBatch((b) => ({ scenarios: b.scenarios.filter((x) => x.id !== sc.id), activeScenarioId: null })); }}><Trash2 size={14} /></button>
            </div>

            <div className="panel divide-y divide-line/60">
              {steps.map((st, i) => (
                <div key={st.id} className="p-2.5">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={st.enabled} onChange={(e) => setSteps((s) => s.map((x) => (x.id === st.id ? { ...x, enabled: e.target.checked } : x)))} aria-label="Enabled" />
                    <button onClick={() => setOpenStep(openStep === st.id ? null : st.id)} className="text-muted" aria-label="Edit step">{openStep === st.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
                    <select aria-label="Step type" title="What this step tests" className="input w-36 text-xs" value={st.type} onChange={(e) => setSteps((s) => s.map((x) => (x.id === st.id ? { ...x, type: e.target.value as StepType } : x)))}>
                      {(Object.keys(STEP_LABEL) as StepType[]).map((t) => <option key={t} value={t}>{STEP_LABEL[t]}</option>)}
                    </select>
                    <input aria-label="Step name" className="input text-xs" value={st.name} placeholder="Step name" onChange={(e) => setSteps((s) => s.map((x) => (x.id === st.id ? { ...x, name: e.target.value } : x)))} />
                    <input aria-label="Target" className="input font-mono text-xs" value={st.target} placeholder={st.type === "http" || st.type === "audit" ? "https://example.com/path" : "example.com or 10.0.0.5"} onChange={(e) => setSteps((s) => s.map((x) => (x.id === st.id ? { ...x, target: e.target.value } : x)))} />
                    <button className="text-muted hover:text-ink disabled:opacity-30" disabled={i === 0} aria-label="Move up" onClick={() => setSteps((s) => { const a = [...s]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; return a; })}><ArrowUp size={14} /></button>
                    <button className="text-muted hover:text-ink disabled:opacity-30" disabled={i === steps.length - 1} aria-label="Move down" onClick={() => setSteps((s) => { const a = [...s]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; return a; })}><ArrowDown size={14} /></button>
                    <button className="text-muted hover:text-danger" aria-label="Delete step" onClick={() => setSteps((s) => s.filter((x) => x.id !== st.id))}><Trash2 size={14} /></button>
                  </div>
                  {openStep === st.id && <div className="mt-2 pl-12"><StepEditor step={st} set={(p) => setSteps((s) => s.map((x) => (x.id === st.id ? { ...x, ...p } : x)))} /></div>}
                </div>
              ))}
              {!steps.length && <p className="p-4 text-sm text-muted">Add steps to build a test scenario.</p>}
              <div className="flex items-center gap-2 p-2.5"><HelpTip label="About steps and expectations">Click ▸ on a step to set what you expect, e.g. status <code>2xx</code> (any success), <code>301,308</code> (a redirect), ports that must be open or closed, or a minimum audit score. The step passes only if every expectation holds.</HelpTip><button className="btn text-xs" onClick={() => { const s: Step = { id: uid(), name: "", type: "http", target: "", enabled: true, expectStatus: "2xx" }; setSteps((x) => [...x, s]); setOpenStep(s.id); }}><Plus size={13} />Add step</button></div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-1.5 text-sm"><input type="checkbox" checked={authorized} onChange={(e) => setAuthorized(e.target.checked)} />I own these targets or have permission to scan/audit them</label>
              {running
                ? <button className="btn-danger" onClick={() => abort.current?.abort()}><Square size={14} />Cancel</button>
                : <button className="btn-primary" disabled={!steps.some((s) => s.enabled && s.target.trim())} onClick={run}><Play size={14} />Run scenario</button>}
            </div>
          </>
        ) : (
          <div className="panel max-w-2xl p-5">
            <h2 className="font-medium">What are batch tests?<HelpTip>A scenario is a checklist the computer runs for you: each step tests something (DNS, ping, ports, HTTP, audit) and passes or fails against what you expect.</HelpTip></h2>
            <p className="mt-1 text-sm text-muted">Group several checks into a scenario and run them all at once, e.g. &ldquo;Is the site up, on HTTPS, and are database ports closed?&rdquo;. Save runs to track results over time and export them as CSV or PDF.</p>
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted"><li>Pick <b className="text-ink">From template…</b> on the left (start with &ldquo;Website health & security&rdquo;), or <b className="text-ink">Generate from canvas</b>.</li><li>Tick the permission box and click <b className="text-ink">Run scenario</b>.</li><li>Click <b className="text-ink">Save run</b> to keep the results, then <b className="text-ink">Save project</b> to keep the scenario.</li></ol>
          </div>
        )}

        {runningRows && <ResultsTable results={runningRows} />}
        {shown && !runningRows && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-medium">{viewRun?.savedId ? "Saved run" : "Last run"}: {shown.scenarioName}</h2>
              <span className="font-mono text-xs text-muted">{new Date(shown.startedAt).toLocaleString()} · {counts(shown).pass}/{counts(shown).total} passed</span>
              <div className="ml-auto flex gap-1.5">
                {!viewRun?.savedId && <button className="btn" onClick={() => saveRun(shown)} disabled={saving}><Save size={14} />{saving ? "Saving…" : "Save run"}</button>}
                {viewRun && <button className="btn" onClick={() => setViewRun(null)}>Back to last run</button>}
                <ExportMenu build={() => runReport(shown, project.meta.name)} />
              </div>
            </div>
            <ResultsTable results={shown.results} />
          </div>
        )}
      </section>
    </div>
  );
}
