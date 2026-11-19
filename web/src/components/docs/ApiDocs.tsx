"use client";
/**
 * API docs tab: an OpenAPI 3.1 (3.2 optional) description of the project's API, edited with a
 * guided form or as YAML/JSON, and read as an interactive reference with Try it. Everything lives
 * in the project's working state and is stored only when the user clicks "Save project".
 */
import { AlertTriangle, BookOpen, CheckCircle2, ChevronDown, Code2, FilePlus2, FileUp, Grid3x3, ListTree, ShieldCheck, Sparkles, Wand2 , X } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { useDismiss } from "@/lib/useDismiss";
import { exportCsv, exportPdf, fileSlug } from "@/lib/export";
import { generateSpec } from "@/lib/openapi/generate";
import { apiReport, parseDoc, toMarkdown, toText } from "@/lib/openapi/io";
import { emptySpec, is32, ops, VERSIONS } from "@/lib/openapi/spec";
import { applyOverlay, countInternal, isOverlay, publicOverlay, publicVersion } from "@/lib/openapi/overlay";
import { convertSwagger2, isSwagger2 } from "@/lib/openapi/swagger2";
import type { OpenApiDoc } from "@/lib/openapi/types";
import { summarize, validate } from "@/lib/openapi/validate";
import { useProjects } from "@/lib/store";
import { dialogs } from "../Dialogs";
import { HelpTip } from "../HelpTip";
import { CodeEditor } from "./CodeEditor";
import { GuidedEditor } from "./GuidedEditor";
import { AuthMatrixView } from "./AuthMatrixView";
import { IssuesPanel } from "./IssuesPanel";
import { Reference } from "./Reference";
import { SecurityCheckView } from "./SecurityCheckView";
import { EventsDocs } from "./EventsDocs";

type View = "reference" | "edit" | "code" | "matrix" | "security";

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ApiDocs({ projectId, onOpenReport }: { projectId: string; onOpenReport: () => void }) {
  const [kind, setKind] = useState<"rest" | "events">("rest");
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-line bg-panel/40 px-3 py-1" role="group" aria-label="Kind of API">
        {([["rest", "REST API (OpenAPI)"], ["events", "Events (AsyncAPI)"]] as const).map(([k, l]) => <button key={k} aria-pressed={kind === k} className={`rounded px-2.5 py-1 text-xs ${kind === k ? "bg-panel-2 text-ink" : "text-muted hover:text-ink"}`} onClick={() => setKind(k)}>{l}</button>)}
      </div>
      <div className="min-h-0 flex-1">{kind === "rest" ? <RestDocs projectId={projectId} onOpenReport={onOpenReport} onEvents={() => setKind("events")} /> : <EventsDocs projectId={projectId} />}</div>
    </div>
  );
}

function RestDocs({ projectId, onOpenReport, onEvents }: { projectId: string; onOpenReport: () => void; onEvents: () => void }) {
  const project = useProjects((s) => s.loaded[projectId]);
  const update = useProjects((s) => s.update);
  const [view, setView] = useState<View>("reference");
  const [menu, setMenu] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [focus, setFocus] = useState<{ key: string | null; n: number }>({ key: null, n: 0 });
  const fileRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setMenu(false), []);
  useDismiss(menu, closeMenu, menuRef);
  const docState = project?.state.docs.api;
  const spec = docState?.spec ?? null;
  const issues = useMemo(() => (spec ? validate(spec) : []), [spec]);
  const counts = summarize(issues);
  if (!project || !docState) return null;
  const requests = project.state.api.requests;

  const setSpec = (next: OpenApiDoc | null) => update(projectId, (s) => ({ ...s, docs: { ...s.docs, api: { ...s.docs.api, spec: next, updatedAt: new Date().toISOString() } } }));
  const setFormat = (format: "yaml" | "json") => update(projectId, (s) => ({ ...s, docs: { ...s.docs, api: { ...s.docs.api, format } } }));
  // Messages stay until dismissed or replaced, so nobody misses them (no time limit).
  const flash = (tone: "ok" | "err", text: string) => setNotice({ tone, text });

  function generate() {
    const r = generateSpec({ title: project.meta.name, description: project.meta.description, requests, variables: project.state.api.variables, canvas: project.state.canvas, existing: spec });
    setSpec(r.doc);
    if (spec) flash("ok", r.added.length ? `Added ${r.added.length} endpoint${r.added.length === 1 ? "" : "s"} from the API client. Existing endpoints were left as they were.` : "Nothing new: every saved request is already documented.");
    else flash("ok", `Draft created with ${r.added.length} endpoint${r.added.length === 1 ? "" : "s"}. Tokens and passwords were left out; review each endpoint and describe what it does.`);
    setView("reference");
  }
  async function importFile(f: File) {
    if (f.size > 2 * 1024 * 1024) return flash("err", "That file is larger than 2 MB.");
    const r = parseDoc(await f.text());
    if (!r.ok) return flash("err", `Couldn't import ${f.name}: ${r.message}${r.line ? ` (line ${r.line})` : ""}`);
    const raw = r.doc as unknown as Record<string, unknown>;
    if (isOverlay(raw)) {
      if (!spec) return flash("err", "That's an Overlay file: it changes an existing API description, so create or import the API docs first.");
      const res = applyOverlay(spec, raw);
      setSpec(res.doc);
      return flash(res.unmatched.length ? "err" : "ok", `Applied overlay “${raw.info?.title ?? f.name}”: ${res.applied} of ${raw.actions.length} changes${res.unmatched.length ? `; no match for ${res.unmatched.slice(0, 3).join(", ")}` : ""}. Revert if it isn't what you wanted.`);
    }
    if (isSwagger2(raw)) {
      if (spec && !(await dialogs.confirm({ title: "Replace the current API docs?", message: `${f.name} is a Swagger 2.0 file. It will be converted to OpenAPI 3.1 and replace this project's API description. Revert before saving to undo.`, confirmText: "Convert and replace" }))) return;
      const c = convertSwagger2(raw);
      setSpec(c.doc); setFormat(r.format); setView("reference");
      return flash("ok", `Converted ${f.name} from Swagger 2.0 to OpenAPI 3.1: ${ops(c.doc).length} endpoints.${c.notes.length ? ` Check: ${c.notes.slice(0, 3).join(" ")}${c.notes.length > 3 ? ` (+${c.notes.length - 3} more in the check panel)` : ""}` : ""}`);
    }
    if (typeof raw.arazzo === "string") return flash("err", "That's an Arazzo workflow file. Import it in the Batch tests tab, where workflows become test scenarios.");
    if (typeof raw.asyncapi === "string") {
      update(projectId, (s) => ({ ...s, docs: { ...s.docs, events: { spec: raw, format: r.format, updatedAt: new Date().toISOString() } } }));
      onEvents(); return;
    }
    if (spec && !(await dialogs.confirm({ title: "Replace the current API docs?", message: `${f.name} will replace this project's API description. You can undo by clicking Revert before saving.`, confirmText: "Replace" }))) return;
    setSpec(r.doc); setFormat(r.format);
    const c = summarize(validate(r.doc));
    flash(c.errors ? "err" : "ok", `Imported ${f.name}: ${ops(r.doc).length} endpoints${c.errors ? `, ${c.errors} problem${c.errors === 1 ? "" : "s"} to fix` : ""}.`);
  }
  const name = fileSlug(spec?.info.title ?? project.meta.name);
  const exportAs = async (kind: "yaml" | "json" | "md" | "pdf" | "csv" | "public" | "overlay") => {
    setMenu(false);
    if (!spec) return;
    if (kind === "public") download(`${name}.public.openapi.yaml`, toText(publicVersion(spec), "yaml"), "application/yaml");
    if (kind === "overlay") download(`${name}.public.overlay.yaml`, toText(publicOverlay(spec) as never, "yaml"), "application/yaml");
    if (kind === "yaml") download(`${name}.openapi.yaml`, toText(spec, "yaml"), "application/yaml");
    if (kind === "json") download(`${name}.openapi.json`, toText(spec, "json"), "application/json");
    if (kind === "md") download(`${name}-api.md`, toMarkdown(spec), "text/markdown");
    if (kind === "pdf") await exportPdf(apiReport(spec, project.meta.name));
    if (kind === "csv") exportCsv(apiReport(spec, project.meta.name));
  };
  const fileInput = <input ref={fileRef} type="file" accept=".yaml,.yml,.json,application/json,application/yaml" className="hidden" aria-label="Import OpenAPI file" onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ""; }} />;

  if (!spec) return (
    <div className="h-full overflow-auto p-6">
      {fileInput}
      <div className="mx-auto max-w-3xl space-y-5">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold"><BookOpen size={18} className="text-fin" />API documentation</h2>
          <p className="mt-1 text-sm text-muted">Describe your API&apos;s endpoints, parameters, responses and authentication in <b className="text-ink">OpenAPI</b>, the standard format behind Swagger. Other tools (Swagger UI, Postman, code generators, security scanners) can read the file you export.</p>
        </div>
        {notice && <p role="status" className={`rounded-md border px-3 py-2 text-sm ${notice.tone === "ok" ? "border-fin/40 bg-fin/5" : "border-danger/40 bg-danger/10 text-danger"}`}>{notice.text}<button className="ml-2 align-middle text-muted hover:text-ink" aria-label="Dismiss message" onClick={() => setNotice(null)}><X size={13} /></button></p>}
        <div className="grid gap-3 md:grid-cols-3">
          <button className="panel flex flex-col items-start gap-2 p-4 text-left hover:border-fin/60 disabled:opacity-60" disabled={!requests.length} onClick={generate}>
            <Wand2 className="text-fin" size={20} /><span className="font-medium">Generate from API client</span>
            <span className="text-xs text-muted">{requests.length ? `Uses your ${requests.length} saved request${requests.length === 1 ? "" : "s"}: URLs, parameters, auth type, bodies and captured responses. Secrets are left out.` : "Save a few requests to a collection in the API client tab first."}</span>
          </button>
          <button className="panel flex flex-col items-start gap-2 p-4 text-left hover:border-fin/60" onClick={() => { setSpec(emptySpec(`${project.meta.name} API`, project.meta.description)); setView("edit"); }}>
            <FilePlus2 className="text-fin" size={20} /><span className="font-medium">Start blank</span><span className="text-xs text-muted">Fill in a guided form: overview, servers, authentication and endpoints.</span>
          </button>
          <button className="panel flex flex-col items-start gap-2 p-4 text-left hover:border-fin/60" onClick={() => fileRef.current?.click()}>
            <FileUp className="text-fin" size={20} /><span className="font-medium">Import a file</span><span className="text-xs text-muted">OpenAPI 3.x or Swagger 2.0 (converted automatically), YAML or JSON. AsyncAPI files open in Events.</span>
          </button>
        </div>
        <p className="text-xs text-muted">New documents use OpenAPI 3.1, which most tools support. You can switch to 3.2 later for its newer features.</p>
      </div>
    </div>
  );

  const views: [View, string, React.ReactNode][] = [["reference", "Reference", <BookOpen key="r" size={14} />], ["edit", "Edit", <ListTree key="e" size={14} />], ["code", "YAML / JSON", <Code2 key="c" size={14} />], ["matrix", "Auth matrix", <Grid3x3 key="m" size={14} />], ["security", "Security check", <ShieldCheck key="s" size={14} />]];
  return (
    <div className="flex h-full min-h-0 flex-col">
      {fileInput}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <div className="flex max-w-full overflow-x-auto rounded-md border border-line p-0.5" role="group" aria-label="API docs view">
          {views.map(([v, label, icon]) => <button key={v} aria-pressed={view === v} className={`flex items-center gap-1.5 whitespace-nowrap rounded px-2.5 py-1 text-sm ${view === v ? "bg-panel-2 text-ink" : "text-muted hover:text-ink"}`} onClick={() => setView(v)}>{icon}{label}</button>)}
        </div>
        <button className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm ${counts.errors ? "border-danger/50 text-danger" : counts.warnings ? "border-amber-500/50 text-amber-300" : "border-fin/40 text-fin"}`} aria-expanded={showIssues} title="Documentation check" onClick={() => setShowIssues(!showIssues)}>
          {counts.errors || counts.warnings ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
          {counts.errors ? `${counts.errors} error${counts.errors === 1 ? "" : "s"}` : counts.warnings ? `${counts.warnings} warning${counts.warnings === 1 ? "" : "s"}` : "Valid"}
          {counts.tips > 0 && <span className="text-muted">· {counts.tips} tip{counts.tips === 1 ? "" : "s"}</span>}
        </button>
        <HelpTip>The checker reads your document like other OpenAPI tools would. Errors stop tools from reading it; warnings are likely mistakes or security risks; tips make the docs clearer for readers.</HelpTip>
        <label className="sr-only" htmlFor="oas-version">OpenAPI version</label>
        <select id="oas-version" title="3.1 has the widest tool support; 3.2 adds newer features (QUERY method, nested tags)" className="input ml-auto w-auto py-1 text-xs" value={is32(spec) ? "3.2.0" : /^3\.0/.test(spec.openapi) ? spec.openapi : "3.1.0"} onChange={(e) => setSpec({ ...spec, openapi: e.target.value })}>
          {/^3\.0/.test(spec.openapi) && <option value={spec.openapi}>OpenAPI {spec.openapi} (imported)</option>}
          {VERSIONS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
        </select>
        <button className="btn py-1" aria-label="Update from API client" onClick={generate} disabled={!requests.length} title={requests.length ? "Add endpoints for saved requests that aren't documented yet" : "Save requests in the API client first"}><Sparkles size={14} /><span className="hidden lg:inline">Update from API client</span></button>
        <button className="btn py-1" aria-label="Import OpenAPI, Swagger 2.0, AsyncAPI or Overlay file" title="Import OpenAPI, Swagger 2.0, AsyncAPI or Overlay file" onClick={() => fileRef.current?.click()}><FileUp size={14} /><span className="hidden lg:inline">Import</span></button>
        <div ref={menuRef} className="relative">
          <button className="btn py-1" aria-expanded={menu} aria-haspopup="menu" onClick={() => setMenu(!menu)}>Export<ChevronDown size={14} /></button>
          {menu && (
            <div role="menu" className="panel absolute right-0 top-9 z-30 w-56 p-1 text-sm shadow-xl">
              {([["yaml", "OpenAPI YAML (.yaml)"], ["json", "OpenAPI JSON (.json)"], ["md", "Markdown (.md)"], ["pdf", "PDF report"], ["csv", "CSV tables"]] as const).map(([k, label]) => <button key={k} role="menuitem" className="w-full rounded px-2.5 py-1.5 text-left hover:bg-panel-2" onClick={() => exportAs(k)}>{label}</button>)}
              <div className="my-1 border-t border-line" />
              <div className="px-2.5 pb-1 pt-0.5 text-[11px] text-muted">Public version: {countInternal(spec) ? `${countInternal(spec)} internal item${countInternal(spec) === 1 ? "" : "s"} removed` : "mark endpoints Internal in Edit"}</div>
              <button role="menuitem" className="w-full rounded px-2.5 py-1.5 text-left hover:bg-panel-2" onClick={() => exportAs("public")}>Public version (.yaml)</button>
              <button role="menuitem" className="w-full rounded px-2.5 py-1.5 text-left hover:bg-panel-2" onClick={() => exportAs("overlay")}>Public overlay (.yaml)</button>
              <div className="my-1 border-t border-line" />
              <button role="menuitem" className="w-full rounded px-2.5 py-1.5 text-left text-danger hover:bg-panel-2" onClick={async () => { setMenu(false); if (await dialogs.confirm({ title: "Remove the API docs from this project?", message: "Export a copy first if you might need it. Nothing is deleted until you save the project.", confirmText: "Remove", danger: true })) setSpec(null); }}>Remove API docs…</button>
            </div>
          )}
        </div>
      </div>
      {notice && <p role="status" className={`shrink-0 border-b px-4 py-1.5 text-sm ${notice.tone === "ok" ? "border-fin/30 bg-fin/5" : "border-danger/40 bg-danger/10 text-danger"}`}>{notice.text}<button className="ml-2 align-middle text-muted hover:text-ink" aria-label="Dismiss message" onClick={() => setNotice(null)}><X size={13} /></button></p>}
      {isSwagger2(spec) && <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">This is Swagger 2.0, the older format. Convert it to OpenAPI 3.1 to edit, check and render it.<button className="btn ml-auto py-1 text-xs" onClick={() => { const c = convertSwagger2(spec); setSpec(c.doc); flash("ok", `Converted to OpenAPI 3.1: ${ops(c.doc).length} endpoints.${c.notes.length ? ` Check: ${c.notes.slice(0, 2).join(" ")}` : ""}`); }}>Convert to OpenAPI 3.1</button></div>}
      {showIssues && <IssuesPanel issues={issues} onClose={() => setShowIssues(false)} onGo={(key) => { if (key) { setFocus((f) => ({ key, n: f.n + 1 })); setView("edit"); } setShowIssues(false); }} />}
      <div className="min-h-0 flex-1">
        {view === "reference" && <Reference doc={spec} projectId={projectId} />}
        {view === "edit" && <GuidedEditor key={focus.n} doc={spec} onChange={setSpec} initial={focus.key} issues={issues} />}
        {view === "code" && <CodeEditor doc={spec} format={docState.format} onFormat={setFormat} onChange={setSpec} />}
        {view === "matrix" && <AuthMatrixView doc={spec} project={project.meta.name} onEdit={(key) => { setFocus((f) => ({ key, n: f.n + 1 })); setView("edit"); }} />}
        {view === "security" && <SecurityCheckView doc={spec} projectId={projectId} onOpenReport={onOpenReport} />}
      </div>
    </div>
  );
}
