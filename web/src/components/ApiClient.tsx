"use client";
/**
 * Postman-style API client. Requests run server-side (`/api/tools/http`), so there are no browser
 * CORS limits. Collections, {{variables}} and the open request live in the project's working
 * state and are stored only when the project is saved.
 */
import { Copy, FolderOpen, Save, Send, Trash2, Variable } from "lucide-react";
import { useMemo, useState } from "react";
import { KeyValueEditor } from "@/components/KeyValueEditor";
import { api, errMsg } from "@/lib/api";
import type { SavedRequest } from "@/lib/project";
import { SCRATCH, useProjects } from "@/lib/store";
import { dialogs } from "./Dialogs";
import { HelpTip } from "./HelpTip";
import type { Auth, BodyMode, HttpRequestSpec, HttpResponse, KeyValue } from "@/lib/types";

type Saved = SavedRequest;
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
const METHOD_COLOR: Record<string, string> = { GET: "text-emerald-300", POST: "text-amber-300", PUT: "text-sky-300", PATCH: "text-violet-300", DELETE: "text-red-400", HEAD: "text-zinc-300", OPTIONS: "text-pink-300" };
const blank = (): HttpRequestSpec => ({ method: "GET", url: "https://httpbin.org/get", headers: [{ key: "Accept", value: "application/json", enabled: true }], params: [], auth: { type: "none" }, body: { mode: "none", raw: "", fields: [] }, timeout_ms: 30000, follow_redirects: true });

function substitute(spec: HttpRequestSpec, vars: KeyValue[]): HttpRequestSpec {
  const map = Object.fromEntries(vars.filter((v) => v.enabled && v.key).map((v) => [v.key, v.value]));
  const sub = (s: string) => s.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (m, k) => map[k] ?? m);
  return JSON.parse(sub(JSON.stringify(spec)));
}

function pretty(body: string, headers: KeyValue[]): string {
  const ct = headers.find((h) => h.key.toLowerCase() === "content-type")?.value ?? "";
  if (ct.includes("json") || /^\s*[[{]/.test(body)) { try { return JSON.stringify(JSON.parse(body), null, 2); } catch { /* not JSON */ } }
  return body;
}

export function ApiClient({ projectId }: { projectId: string }) {
  const project = useProjects((s) => s.loaded[projectId]);
  const update = useProjects((s) => s.update);
  const addResult = useProjects((s) => s.addResult);
  const savedRaw = project?.state.api.requests;
  const saved = useMemo(() => savedRaw ?? [], [savedRaw]);
  const vars = project?.state.api.variables ?? [];
  const req = project?.state.api.draft ?? blank();
  const setReq = (fn: HttpRequestSpec | ((r: HttpRequestSpec) => HttpRequestSpec)) =>
    update(projectId, (s) => ({ ...s, api: { ...s.api, draft: typeof fn === "function" ? fn(s.api.draft ?? blank()) : fn } }));
  const [tab, setTab] = useState<"params" | "auth" | "headers" | "body" | "settings">("params");
  const [resTab, setResTab] = useState<"body" | "headers" | "redirects">("body");
  const [res, setRes] = useState<HttpResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const current = saved.find((x) => x.id === currentId) ?? null;
  const [showVars, setShowVars] = useState(false);
  const [history, setHistory] = useState<{ method: string; url: string; status: number; ms: number }[]>([]);

  const setSaved = (fn: (all: Saved[]) => Saved[]) => update(projectId, (s) => ({ ...s, api: { ...s.api, requests: fn(s.api.requests) } }));

  const collections = useMemo(() => {
    const m = new Map<string, Saved[]>();
    for (const s of saved) m.set(s.collection, [...(m.get(s.collection) ?? []), s]);
    return [...m.entries()];
  }, [saved]);

  const set = (patch: Partial<HttpRequestSpec>) => setReq((r) => ({ ...r, ...patch }));

  async function send() {
    setSending(true);
    setError(null);
    try {
      const r = await api<HttpResponse>("/tools/http", { method: "POST", json: substitute(req, vars) });
      setRes(r);
      addResult(projectId, { tool: "http", target: `${req.method} ${req.url}`, ok: r.status < 400, summary: `${r.status} ${r.status_text} in ${r.time_ms} ms` });
      setHistory((h) => [{ method: req.method, url: req.url, status: r.status, ms: r.time_ms }, ...h].slice(0, 30));
    } catch (e) { setError(errMsg(e)); setRes(null); }
    setSending(false);
  }

  // Adds/updates the request in the project's collections (memory; stored on "Save project").
  async function save(asNew = false) {
    if (current && !asNew) {
      setSaved((all) => all.map((x) => (x.id === current.id ? { ...x, request: req } : x)));
      return;
    }
    const r = await dialogs.form({ title: "Add to collection", message: projectId === SCRATCH ? "Scratch mode: kept until you leave this page." : "Saved with the project when you click Save project.", confirmText: "Add",
      fields: [{ name: "name", label: "Request name", defaultValue: `${req.method} ${req.url.replace(/^https?:\/\//, "").slice(0, 40)}` }, { name: "collection", label: "Collection (folder)", defaultValue: current?.collection ?? collections[0]?.[0] ?? "Default" }] });
    if (!r?.name.trim()) return;
    const s: Saved = { id: Math.random().toString(36).slice(2, 10), name: r.name.trim(), collection: r.collection.trim() || "Default", request: req };
    setSaved((all) => [...all, s]);
    setCurrentId(s.id);
  }

  async function remove(s: Saved) {
    if (!(await dialogs.confirm({ title: `Remove “${s.name}” from the collection?`, danger: true, confirmText: "Remove" }))) return;
    setSaved((all) => all.filter((x) => x.id !== s.id));
    if (currentId === s.id) setCurrentId(null);
  }

  const saveVars = (next: KeyValue[]) => update(projectId, (s) => ({ ...s, api: { ...s.api, variables: next } }));

  function curl(): string {
    const r = substitute(req, vars);
    const parts = [`curl -X ${r.method}`];
    r.headers.filter((h) => h.enabled && h.key).forEach((h) => parts.push(`-H '${h.key}: ${h.value}'`));
    if (r.auth.type === "bearer") parts.push(`-H 'Authorization: Bearer ${r.auth.token}'`);
    if (r.auth.type === "basic") parts.push(`-u '${r.auth.username}:${r.auth.password}'`);
    if (["json", "text", "xml"].includes(r.body.mode) && r.body.raw) parts.push(`-d '${r.body.raw.replace(/'/g, "'\\''")}'`);
    const qs = r.params.filter((p) => p.enabled && p.key).map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join("&");
    parts.push(`'${r.url}${qs ? (r.url.includes("?") ? "&" : "?") + qs : ""}'`);
    return parts.join(" \\\n  ");
  }

  const auth = req.auth;
  const setAuth = (a: Auth) => set({ auth: a });

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-60 shrink-0 overflow-y-auto border-r border-line bg-panel">
        <div className="flex items-center justify-between px-3 py-3"><span className="text-sm font-semibold">Collections</span><button className="text-xs text-fin" onClick={() => { setReq(blank()); setCurrentId(null); setRes(null); }}>+ New</button></div>
        {collections.length === 0 && <p className="px-3 text-xs text-muted">{projectId === SCRATCH ? "Scratch mode: requests are kept until you leave. Open a project to keep collections." : "Requests you add are stored when you save the project."}</p>}
        {collections.map(([c, items]) => (
          <div key={c} className="mb-2">
            <div className="flex items-center gap-1.5 px-3 py-1 text-xs uppercase tracking-wider text-muted"><FolderOpen size={12} />{c}</div>
            {items.map((s) => (
              <div key={s.id} className={`group flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-panel-2 ${currentId === s.id ? "bg-panel-2" : ""}`}>
                <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => { setReq({ ...blank(), ...s.request }); setCurrentId(s.id); setRes(null); }}>
                  <span className={`w-11 shrink-0 font-mono text-[10px] font-bold ${METHOD_COLOR[s.request.method] ?? ""}`}>{s.request.method}</span><span className="truncate">{s.name}</span>
                </button>
                <button className="opacity-0 group-hover:opacity-100 hover:text-danger" onClick={() => remove(s)} aria-label={`Delete ${s.name}`}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        ))}
        {history.length > 0 && (
          <div className="border-t border-line pt-2">
            <div className="px-3 py-1 text-xs uppercase tracking-wider text-muted">History</div>
            {history.map((h, i) => <div key={i} className="truncate px-3 py-1 font-mono text-[11px] text-muted"><span className={METHOD_COLOR[h.method]}>{h.method}</span> {h.status} · {h.url}</div>)}
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-line p-3">
          <select aria-label="Method" className={`input w-28 font-mono font-bold ${METHOD_COLOR[req.method]}`} value={req.method} onChange={(e) => set({ method: e.target.value })}>
            {METHODS.map((m) => <option key={m}>{m}</option>)}
          </select>
          <input aria-label="URL" className="input font-mono text-sm" value={req.url} onChange={(e) => set({ url: e.target.value })} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="https://api.example.com/v1/users or {{baseUrl}}/get" />
          <button className="btn-primary px-4" onClick={send} disabled={sending}><Send size={14} />{sending ? "Sending…" : "Send"}</button>
          <button className="btn" onClick={() => save()} title="Save"><Save size={14} />{current ? "Save" : "Save as"}</button>
          {current && <button className="btn" onClick={() => save(true)}>Save as…</button>}
          <button className={`btn ${showVars ? "border-fin text-fin" : ""}`} onClick={() => setShowVars(!showVars)} title="Variables"><Variable size={14} /></button>
        </div>
        {showVars && (
          <div className="border-b border-line bg-panel-2/40 p-3">
            <p className="mb-2 text-xs text-muted">Use as <code className="text-fin">{"{{name}}"}</code> in the URL, headers, auth, or body. Stored with the project.</p>
            <KeyValueEditor rows={vars} onChange={saveVars} keyPlaceholder="name" valuePlaceholder="value" />
          </div>
        )}
        <div className="flex border-b border-line px-2">
          {(["params", "auth", "headers", "body", "settings"] as const).map((t) => (
            <button key={t} className={`tab capitalize ${tab === t ? "tab-active" : ""}`} onClick={() => setTab(t)}>
              {t}{t === "headers" && req.headers.filter((h) => h.enabled).length ? ` (${req.headers.filter((h) => h.enabled).length})` : ""}{t === "params" && req.params.length ? ` (${req.params.length})` : ""}
            </button>
          ))}
        </div>
        <div className="max-h-[38%] min-h-36 overflow-y-auto p-3">
          {tab === "params" && <KeyValueEditor rows={req.params} onChange={(params) => set({ params })} />}
          {tab === "headers" && <KeyValueEditor rows={req.headers} onChange={(headers) => set({ headers })} keyPlaceholder="Header" />}
          {tab === "auth" && (
            <div className="max-w-lg space-y-2">
              <select aria-label="Auth type" className="input w-56" value={auth.type} onChange={(e) => {
                const t = e.target.value;
                setAuth(t === "bearer" ? { type: "bearer", token: "" } : t === "basic" ? { type: "basic", username: "", password: "" } : t === "apikey" ? { type: "apikey", key: "X-API-Key", value: "", in_query: false } : { type: "none" });
              }}>
                <option value="none">No auth</option><option value="bearer">Bearer token</option><option value="basic">Basic auth</option><option value="apikey">API key</option>
              </select>
              <HelpTip>Bearer token: sends &ldquo;Authorization: Bearer &lt;token&gt;&rdquo; (common for APIs). Basic: username and password. API key: a key in a header or query parameter.</HelpTip>
              {auth.type === "bearer" && <textarea aria-label="Token" className="input min-h-20 font-mono text-xs" placeholder="eyJhbGciOi… or {{token}}" value={auth.token} onChange={(e) => setAuth({ ...auth, token: e.target.value })} />}
              {auth.type === "basic" && <div className="grid grid-cols-2 gap-2"><input aria-label="Username" className="input" placeholder="username" value={auth.username} onChange={(e) => setAuth({ ...auth, username: e.target.value })} /><input aria-label="Password" className="input" type="password" placeholder="password" value={auth.password} onChange={(e) => setAuth({ ...auth, password: e.target.value })} /></div>}
              {auth.type === "apikey" && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2"><input aria-label="Key name" className="input font-mono text-xs" value={auth.key} onChange={(e) => setAuth({ ...auth, key: e.target.value })} /><input aria-label="Key value" className="input font-mono text-xs" placeholder="value" value={auth.value} onChange={(e) => setAuth({ ...auth, value: e.target.value })} /></div>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={auth.in_query} onChange={(e) => setAuth({ ...auth, in_query: e.target.checked })} />Send as query parameter instead of header</label>
                </div>
              )}
              <p className="text-xs text-muted">Credentials are sent only to the target URL. Saving the project stores them; prefer {"{{variables}}"} for secrets.</p>
            </div>
          )}
          {tab === "body" && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-3 text-sm">
                {(["none", "json", "text", "xml", "urlencoded", "form"] as BodyMode[]).map((m) => (
                  <label key={m} className="flex items-center gap-1.5"><input type="radio" name="bodymode" checked={req.body.mode === m} onChange={() => set({ body: { ...req.body, mode: m } })} />{m === "urlencoded" ? "x-www-form-urlencoded" : m === "form" ? "form-data" : m}</label>
                ))}
              </div>
              {["json", "text", "xml"].includes(req.body.mode) && <textarea aria-label="Body" className="input min-h-40 font-mono text-xs" value={req.body.raw} onChange={(e) => set({ body: { ...req.body, raw: e.target.value } })} placeholder={req.body.mode === "json" ? '{\n  "name": "slyshark"\n}' : ""} />}
              {["urlencoded", "form"].includes(req.body.mode) && <KeyValueEditor rows={req.body.fields} onChange={(fields) => set({ body: { ...req.body, fields } })} />}
            </div>
          )}
          {tab === "settings" && (
            <div className="max-w-md space-y-3 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={req.follow_redirects} onChange={(e) => set({ follow_redirects: e.target.checked })} />Follow redirects</label>
              <div><label className="label" htmlFor="timeout">Timeout (ms)</label><input id="timeout" type="number" className="input w-40" value={req.timeout_ms} onChange={(e) => set({ timeout_ms: Number(e.target.value) })} /></div>
              <div><div className="label">cURL</div><pre className="overflow-x-auto rounded-md border border-line bg-bg p-2 font-mono text-xs">{curl()}</pre><button className="btn mt-1 text-xs" onClick={() => navigator.clipboard.writeText(curl())}><Copy size={12} />Copy</button></div>
            </div>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col border-t border-line">
          <div className="flex items-center gap-4 border-b border-line px-3">
            {(["body", "headers", "redirects"] as const).map((t) => <button key={t} className={`tab capitalize ${resTab === t ? "tab-active" : ""}`} onClick={() => setResTab(t)}>{t}{t === "headers" && res ? ` (${res.headers.length})` : ""}</button>)}
            {res && (
              <div className="ml-auto flex gap-4 font-mono text-xs">
                <span className={res.status < 300 ? "text-emerald-300" : res.status < 400 ? "text-sky-300" : "text-red-400"}>{res.status} {res.status_text}</span>
                <span className="text-muted">{res.time_ms} ms</span><span className="text-muted">{(res.size_bytes / 1024).toFixed(2)} KB</span><span className="text-muted">{res.http_version}</span><span className="text-muted">{res.remote_addr}</span>
              </div>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-3">
            {error && <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
            {!res && !error && <p className="text-sm text-muted">Send a request to see the response.</p>}
            {res && resTab === "body" && (res.is_binary ? <p className="text-sm text-muted">Binary response ({res.size_bytes} bytes).</p> : <pre className="whitespace-pre-wrap break-all font-mono text-xs text-ink">{pretty(res.body, res.headers)}{res.truncated && "\n\n… truncated at 2 MB"}</pre>)}
            {res && resTab === "headers" && (
              <table className="w-full font-mono text-xs"><tbody>{res.headers.map((h, i) => <tr key={i} className="border-b border-line/50"><td className="py-1 pr-4 text-fin">{h.key}</td><td className="break-all py-1">{h.value}</td></tr>)}</tbody></table>
            )}
            {res && resTab === "redirects" && (res.redirects.length ? res.redirects.map((r, i) => <div key={i} className="font-mono text-xs">{r.status} {r.url} → {r.location}</div>) : <p className="text-sm text-muted">No redirects.</p>)}
          </div>
        </div>
      </div>
    </div>
  );
}
