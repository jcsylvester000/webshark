"use client";
/**
 * Try it: sends the documented request through Slyshark's server-side HTTP tool (no browser CORS
 * limits, same SSRF protections). Credentials typed here stay in memory only and are never saved.
 */
import { ArrowRightLeft, Send } from "lucide-react";
import { useState } from "react";
import { api, errMsg } from "@/lib/api";
import { build, defaults, serversFor, serverUrl, type TryInputs } from "@/lib/openapi/request";
import { allParams, deref, effectiveSecurity, schemeLabel } from "@/lib/openapi/spec";
import type { OpenApiDoc, OpRef } from "@/lib/openapi/types";
import { useProjects } from "@/lib/store";
import type { HttpResponse } from "@/lib/types";

export function TryIt({ doc, o, projectId }: { doc: OpenApiDoc; o: OpRef; projectId: string }) {
  const [t, setT] = useState<TryInputs>(() => defaults(doc, o));
  const [res, setRes] = useState<HttpResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const params = allParams(doc, o);
  const servers = serversFor(doc, o);
  const reqs = effectiveSecurity(doc, o.op).reqs;
  const chosen = t.req >= 0 ? Object.keys(reqs[t.req] ?? {}) : [];
  const set = (patch: Partial<TryInputs>) => setT((x) => ({ ...x, ...patch }));
  const id = (s: string) => `try-${o.key}-${s}`.replace(/[^\w-]/g, "_");

  async function send() {
    setError(null); setRes(null);
    if (!/^https?:\/\//.test(t.server)) return setError("Choose or type a full server URL (starting with https://) first.");
    const { spec, missing } = build(doc, o, t, { placeholders: false });
    if (missing.length) return setError(`Fill in ${missing.join(", ")} first.`);
    setBusy(true);
    try {
      const r = await api<HttpResponse>("/tools/http", { method: "POST", json: spec });
      setRes(r);
      useProjects.getState().addResult(projectId, { tool: "http", target: `${spec.method} ${spec.url}`, ok: r.status < 400, summary: `API docs · ${r.status} ${r.status_text} in ${r.time_ms} ms` });
    } catch (e) { setError(errMsg(e)); }
    setBusy(false);
  }
  function toClient() {
    const { spec } = build(doc, o, { ...t, secrets: {}, users: {} }, { placeholders: true });
    useProjects.getState().update(projectId, (s) => ({ ...s, api: { ...s.api, draft: spec } }));
    setCopied(true); setTimeout(() => setCopied(false), 2500);
  }
  const pretty = (b: string) => { try { return JSON.stringify(JSON.parse(b), null, 2); } catch { return b; } };
  const expected = Object.keys(o.op.responses ?? {});

  return (
    <div className="space-y-3 rounded-md border border-fin/30 bg-fin/5 p-3">
      <div>
        <label className="label" htmlFor={id("server")}>Server</label>
        <input id={id("server")} list={id("servers")} className="input font-mono text-xs" value={t.server} onChange={(e) => set({ server: e.target.value })} placeholder="https://api.example.com" />
        <datalist id={id("servers")}>{servers.map((s) => <option key={s.url} value={serverUrl(s)}>{s.description}</option>)}</datalist>
      </div>
      {params.length > 0 && <div className="grid gap-2 sm:grid-cols-2">{params.map((p) => (
        <div key={`${p.in}:${p.name}`}>
          <label className="label" htmlFor={id(`${p.in}-${p.name}`)}>{p.name} <span className="normal-case text-muted">({p.in}{p.required ? ", required" : ""})</span></label>
          <input id={id(`${p.in}-${p.name}`)} className="input font-mono text-xs" value={t.values[`${p.in}:${p.name}`] ?? ""} placeholder={deref(doc, p.schema)?.type?.toString() ?? ""} onChange={(e) => set({ values: { ...t.values, [`${p.in}:${p.name}`]: e.target.value } })} />
        </div>
      ))}</div>}
      {reqs.length > 0 && (
        <div className="space-y-2">
          <div><label className="label" htmlFor={id("req")}>Authentication</label>
            <select id={id("req")} className="input text-xs" value={t.req} onChange={(e) => set({ req: Number(e.target.value) })}>
              <option value={-1}>Send without credentials</option>
              {reqs.map((r, i) => Object.keys(r).length ? <option key={i} value={i}>{Object.keys(r).map((n) => schemeLabel(doc.components?.securitySchemes?.[n])).join(" + ")}</option> : null)}
            </select></div>
          {chosen.map((n) => { const s = doc.components?.securitySchemes?.[n]; if (!s) return null; const basic = s.type === "http" && s.scheme?.toLowerCase() === "basic"; return (
            <div key={n} className={`grid gap-2 ${basic ? "sm:grid-cols-2" : ""}`}>
              {basic && <div><label className="label" htmlFor={id(`${n}-user`)}>{n}: username</label><input id={id(`${n}-user`)} className="input text-xs" autoComplete="off" value={t.users[n] ?? ""} onChange={(e) => set({ users: { ...t.users, [n]: e.target.value } })} /></div>}
              <div><label className="label" htmlFor={id(`${n}-secret`)}>{n}: {s.type === "apiKey" ? "API key" : basic ? "password" : "token"}</label><input id={id(`${n}-secret`)} type="password" autoComplete="off" className="input font-mono text-xs" value={t.secrets[n] ?? ""} onChange={(e) => set({ secrets: { ...t.secrets, [n]: e.target.value } })} /></div>
            </div>
          ); })}
          <p className="text-xs text-muted">Credentials typed here are used for this request only and are never saved with the project.</p>
        </div>
      )}
      {t.contentType && <div><label className="label" htmlFor={id("body")}>Body ({t.contentType})</label><textarea id={id("body")} rows={6} spellCheck={false} className="input font-mono text-xs" value={t.body} onChange={(e) => set({ body: e.target.value })} /></div>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" onClick={send} disabled={busy}><Send size={14} />{busy ? "Sending…" : "Send request"}</button>
        <button className="btn" onClick={toClient} title="Open this request in the API client tab (without credentials)"><ArrowRightLeft size={14} />{copied ? "Opened in API client" : "Open in API client"}</button>
      </div>
      {res && (
        <div className="space-y-1" role="status">
          <div className="flex flex-wrap gap-3 font-mono text-xs">
            <span className={res.status < 300 ? "text-emerald-300" : res.status < 400 ? "text-sky-300" : "text-red-400"}>{res.status} {res.status_text}</span>
            <span className="text-muted">{res.time_ms} ms</span>
            <span className={expected.includes(String(res.status)) || expected.includes(`${String(res.status)[0]}XX`) || expected.includes("default") ? "text-muted" : "text-amber-300"}>
              {expected.includes(String(res.status)) || expected.includes(`${String(res.status)[0]}XX`) ? "matches the documented responses" : expected.includes("default") ? "covered by “default”" : `not documented: add a ${res.status} response`}
            </span>
          </div>
          <pre tabIndex={0} className="max-h-72 overflow-auto rounded-md border border-line bg-bg p-2 font-mono text-xs">{res.is_binary ? `Binary response (${res.size_bytes} bytes)` : pretty(res.body) || "(empty body)"}</pre>
        </div>
      )}
    </div>
  );
}
