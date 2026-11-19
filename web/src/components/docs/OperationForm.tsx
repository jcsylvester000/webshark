"use client";
/** Form for one endpoint: method/path, description, authentication, parameters, body and responses. */
import { AlertCircle, Copy, Plus, Trash2, Wand2 } from "lucide-react";
import { useId, useState } from "react";
import { statusText } from "@/lib/openapi/generate";
import { inferSchema, methodsFor, moveOp, setOp, templateParams, typeText, uniqueOpId } from "@/lib/openapi/spec";
import type { Issue, MediaType, Method, OpenApiDoc, Operation, OpRef, Parameter, ResponseObj } from "@/lib/openapi/types";
import { dialogs } from "../Dialogs";
import { HelpTip } from "../HelpTip";
import { Area, clean, Select, Text } from "./fields";

const CONTENT_TYPES = [["application/json", "JSON"], ["application/x-www-form-urlencoded", "Form (urlencoded)"], ["multipart/form-data", "Form data (files)"], ["text/plain", "Plain text"], ["application/xml", "XML"]] as const;
const TYPES = [["string", "text"], ["integer", "whole number"], ["number", "number"], ["boolean", "true / false"], ["array", "list"], ["object", "object"]] as const;
const IN = [["query", "query"], ["path", "path"], ["header", "header"], ["cookie", "cookie"]] as const;

type Props = { doc: OpenApiDoc; op: OpRef; onChange: (d: OpenApiDoc) => void; onMoved: (key: string) => void; onDeleted: () => void; issues: Issue[] };

export function OperationForm({ doc, op, onChange, onMoved, onDeleted, issues }: Props) {
  const o = op.op;
  const set = (patch: Partial<Operation>) => onChange(setOp(doc, op.path, op.method, clean({ ...o, ...patch }) as Operation));
  const [path, setPath] = useState(op.path);
  const [pathErr, setPathErr] = useState<string | null>(null);
  const schemes = Object.keys(doc.components?.securitySchemes ?? {});
  const authMode = o.security === undefined ? "default" : o.security.length === 0 || o.security.every((r) => !Object.keys(r).length) ? "public" : "custom";
  const chosen = new Set((o.security ?? []).flatMap((r) => Object.keys(r)));

  function move(method: Method, p: string) {
    let next = p.trim();
    if (!next.startsWith("/")) next = `/${next}`;
    if (method === op.method && next === op.path) { setPath(next); setPathErr(null); return; }
    if (doc.paths?.[next]?.[method]) { setPathErr(`${method.toUpperCase()} ${next} already exists.`); return; }
    setPathErr(null); setPath(next);
    onChange(moveOp(doc, { path: op.path, method: op.method }, { path: next, method }));
    onMoved(`${method.toUpperCase()} ${next}`);
  }
  const params = o.parameters ?? [];
  const setParams = (next: Parameter[]) => set({ parameters: next.length ? next : undefined });
  const missing = templateParams(op.path).filter((t) => !params.some((p) => p.in === "path" && p.name === t) && !(op.item.parameters ?? []).some((p) => p.in === "path" && p.name === t));
  const body = o.requestBody && !o.requestBody.$ref ? o.requestBody : null;
  const [bodyType, bodyMedia] = Object.entries(body?.content ?? {})[0] ?? ["application/json", {}];
  const setBody = (ct: string, media: MediaType, extra: Partial<NonNullable<Operation["requestBody"]>> = {}) => set({ requestBody: { ...body, ...extra, content: { [ct]: media } } });
  const responses = o.responses ?? {};
  const setResponse = (code: string, r: ResponseObj | null, newCode = code) => {
    const entries = Object.entries(responses).map(([c, x]) => (c === code ? [newCode, r] : [c, x])).filter(([, x]) => x) as [string, ResponseObj][];
    set({ responses: Object.fromEntries(entries) });
  };

  return (
    <div className="max-w-3xl space-y-5">
      <h2 className="font-mono text-base font-semibold">{op.key}</h2>
      {issues.some((i) => i.level !== "tip") && (
        <ul className="space-y-1 rounded-md border border-danger/40 bg-danger/5 p-3 text-sm">{issues.filter((i) => i.level !== "tip").map((i, n) => <li key={n} className="flex gap-2"><AlertCircle size={14} className="mt-0.5 shrink-0 text-danger" />{i.message}</li>)}</ul>
      )}
      <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
        <Select label="Method" value={op.method} onChange={(m) => move(m as Method, path)} options={methodsFor(doc).map((m) => [m, m.toUpperCase()] as const)} />
        <div>
          <label className="label" htmlFor={`path-${op.key}`}>Path</label>
          <input id={`path-${op.key}`} className="input font-mono text-xs" value={path} onChange={(e) => setPath(e.target.value)} onBlur={() => move(op.method, path)} onKeyDown={(e) => e.key === "Enter" && move(op.method, path)} />
          {pathErr ? <p role="alert" className="mt-1 text-xs text-danger">{pathErr}</p> : <p className="mt-1 text-xs text-muted">Use {"{name}"} for parts that change, e.g. /orders/{"{orderId}"}.</p>}
        </div>
      </div>
      <Text label="Summary" value={o.summary} onChange={(summary) => set({ summary })} placeholder="e.g. Get one order" />
      <Area label="Description" value={o.description} onChange={(description) => set({ description })} placeholder="What it does, who may call it, side effects, rate limits…" />
      <div className="grid gap-3 sm:grid-cols-3">
        <TagSelect doc={doc} value={o.tags?.[0] ?? ""} onChange={(t) => set({ tags: t ? [t] : undefined })} />
        <Text label="Operation ID" mono value={o.operationId} onChange={(operationId) => set({ operationId })} hint="A unique name code generators use." />
        <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" checked={!!o.deprecated} onChange={(e) => set({ deprecated: e.target.checked || undefined })} />Deprecated</label>
      </div>

      <fieldset className="panel space-y-2 p-3">
        <legend className="flex items-center px-1 text-sm font-medium">Authentication<HelpTip>Default follows the “required by default” setting under Authentication. Public means anyone can call it, so document that on purpose.</HelpTip></legend>
        {([["default", "Use the API default"], ["public", "Public: no authentication"], ["custom", "Requires…"]] as const).map(([v, l]) => (
          <label key={v} className="mr-4 inline-flex items-center gap-1.5 text-sm"><input type="radio" name={`auth-${op.key}`} checked={authMode === v} onChange={() => set({ security: v === "default" ? undefined : v === "public" ? [] : schemes.length ? [{ [schemes[0]]: [] }] : [] })} />{l}</label>
        ))}
        {authMode === "custom" && (schemes.length ? <div className="flex flex-wrap gap-3 pl-1">{schemes.map((n) => <label key={n} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={chosen.has(n)} onChange={(e) => { const next = e.target.checked ? [...chosen, n] : [...chosen].filter((x) => x !== n); set({ security: next.map((x) => ({ [x]: [] })) }); }} /><span className="font-mono text-xs">{n}</span></label>)}<span className="text-xs text-muted">(any one of these)</span></div> : <p className="text-xs text-muted">Add an authentication method in the Authentication section first.</p>)}
      </fieldset>

      <section className="space-y-2">
        <div className="flex items-center justify-between"><h3 className="text-sm font-medium">Parameters ({params.length})</h3>
          <div className="flex gap-2">
            {missing.length > 0 && <button className="btn py-1 text-xs" onClick={() => setParams([...params, ...missing.map((name) => ({ name, in: "path" as const, required: true, schema: { type: "string" } }))])}><Wand2 size={13} />Add {missing.map((m) => `{${m}}`).join(", ")}</button>}
            <button className="btn py-1 text-xs" onClick={() => setParams([...params, { name: "", in: "query", required: false, schema: { type: "string" } }])}><Plus size={13} />Add parameter</button>
          </div>
        </div>
        {params.length > 0 && (
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="w-full text-xs">
              <thead className="text-left uppercase tracking-wider text-muted"><tr><th className="px-2 py-1.5">Name</th><th className="px-2">In</th><th className="px-2">Type</th><th className="px-2">Required</th><th className="px-2">Description</th><th className="px-2">Example</th><th><span className="sr-only">Remove</span></th></tr></thead>
              <tbody>{params.map((p, i) => {
                const up = (patch: Partial<Parameter>) => setParams(params.map((x, j) => (j === i ? clean({ ...x, ...patch }) as Parameter : x)));
                if (p.$ref) return <tr key={i} className="border-t border-line"><td colSpan={6} className="px-2 py-1.5 font-mono text-muted">Shared parameter {p.$ref}</td><td><RemoveBtn label="parameter" onClick={() => setParams(params.filter((_, j) => j !== i))} /></td></tr>;
                return (
                  <tr key={i} className="border-t border-line">
                    <td className="p-1"><input aria-label="Parameter name" className="input min-w-[7rem] py-1 font-mono text-xs" value={p.name} onChange={(e) => up({ name: e.target.value })} /></td>
                    <td className="p-1"><select aria-label="Parameter location" className="input min-w-[5.5rem] py-1 text-xs" value={p.in} onChange={(e) => up({ in: e.target.value as Parameter["in"], ...(e.target.value === "path" ? { required: true } : {}) })}>{IN.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
                    <td className="p-1"><select aria-label="Parameter type" className="input min-w-[7.5rem] py-1 text-xs" value={String(p.schema?.type ?? "string")} onChange={(e) => up({ schema: { ...p.schema, type: e.target.value } })}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
                    <td className="p-1 text-center"><input type="checkbox" aria-label="Required" checked={!!p.required} disabled={p.in === "path"} onChange={(e) => up({ required: e.target.checked })} /></td>
                    <td className="p-1"><input aria-label="Parameter description" className="input py-1 text-xs" value={p.description ?? ""} onChange={(e) => up({ description: e.target.value })} /></td>
                    <td className="p-1"><input aria-label="Parameter example" className="input py-1 font-mono text-xs" value={p.example === undefined ? "" : String(p.example)} onChange={(e) => up({ example: e.target.value === "" ? undefined : e.target.value })} /></td>
                    <td className="p-1"><RemoveBtn label={`parameter ${p.name}`} onClick={() => setParams(params.filter((_, j) => j !== i))} /></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between"><h3 className="text-sm font-medium">Request body</h3>
          {o.requestBody ? <button className="btn py-1 text-xs" onClick={() => set({ requestBody: undefined })}><Trash2 size={13} />Remove body</button> : <button className="btn py-1 text-xs" onClick={() => setBody("application/json", { schema: { type: "object" } }, { required: true })}><Plus size={13} />Add body</button>}
        </div>
        {o.requestBody?.$ref && <p className="text-xs text-muted">Uses shared body {o.requestBody.$ref}. Edit it in the YAML / JSON view.</p>}
        {body && (
          <div className="panel space-y-3 p-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <Select label="Content type" value={bodyType} onChange={(ct) => setBody(ct, bodyMedia)} options={CONTENT_TYPES.some(([v]) => v === bodyType) ? CONTENT_TYPES : [[bodyType, bodyType], ...CONTENT_TYPES]} />
              <label className="flex items-center gap-1.5 pt-6 text-sm"><input type="checkbox" checked={!!body.required} onChange={(e) => setBody(bodyType, bodyMedia, { required: e.target.checked })} />Required</label>
            </div>
            <MediaEditor media={bodyMedia} onChange={(m) => setBody(bodyType, m)} label="Example body" />
          </div>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between"><h3 className="text-sm font-medium">Responses ({Object.keys(responses).length})</h3>
          <button className="btn py-1 text-xs" onClick={async () => { const c = await dialogs.prompt({ title: "Add a response", message: "Status code such as 200, 404, 4XX or default.", label: "Status", defaultValue: Object.keys(responses).includes("200") ? "404" : "200" }); const code = c?.trim().toUpperCase().replace("DEFAULT", "default"); if (code && !responses[code]) set({ responses: { ...responses, [code]: { description: statusText(code) } } }); }}><Plus size={13} />Add response</button>
        </div>
        {Object.entries(responses).map(([code, r]) => <ResponseEditor key={code} code={code} r={r} onChange={(next, newCode) => setResponse(code, next, newCode)} taken={Object.keys(responses)} />)}
      </section>

      <div className="flex gap-2 border-t border-line pt-4">
        <button className="btn" onClick={() => {
          let p = `${op.path}-copy`; while (doc.paths?.[p]?.[op.method]) p += "-copy";
          onChange(setOp(doc, p, op.method, { ...structuredClone(o), operationId: o.operationId ? uniqueOpId(doc, `${o.operationId}Copy`) : undefined }));
          onMoved(`${op.method.toUpperCase()} ${p}`);
        }}><Copy size={14} />Duplicate</button>
        <button className="btn-danger" onClick={async () => { if (await dialogs.confirm({ title: `Delete ${op.key}?`, message: "It's removed from the API docs. Revert or don't save if you change your mind.", danger: true })) { onChange(setOp(doc, op.path, op.method, null)); onDeleted(); } }}><Trash2 size={14} />Delete endpoint</button>
      </div>
    </div>
  );
}

const RemoveBtn = ({ label, onClick }: { label: string; onClick: () => void }) => <button className="px-1 text-muted hover:text-danger" aria-label={`Remove ${label}`} onClick={onClick}><Trash2 size={13} /></button>;

function TagSelect({ doc, value, onChange }: { doc: OpenApiDoc; value: string; onChange: (v: string) => void }) {
  const names = (doc.tags ?? []).map((t) => t.name);
  const opts = [["", "None"], ...(value && !names.includes(value) ? [value] : []).map((v) => [v, v]), ...names.map((n) => [n, n])] as [string, string][];
  return <Select label="Group / tag" value={value} onChange={onChange} options={opts} />;
}

function ResponseEditor({ code, r, onChange, taken }: { code: string; r: ResponseObj; onChange: (r: ResponseObj | null, newCode?: string) => void; taken: string[] }) {
  const [c, setC] = useState(code);
  if (r.$ref) return <div className="panel flex items-center gap-2 p-3 text-xs"><span className="font-mono">{code}</span><span className="text-muted">Shared response {r.$ref}</span><span className="ml-auto"><RemoveBtn label={`response ${code}`} onClick={() => onChange(null)} /></span></div>;
  const [ct, media] = Object.entries(r.content ?? {})[0] ?? [null, null];
  const tone = code.startsWith("2") ? "text-emerald-300" : code.startsWith("4") || code.startsWith("5") ? "text-red-400" : "text-sky-300";
  return (
    <div className="panel space-y-3 p-3">
      <div className="grid gap-3 sm:grid-cols-[6rem_1fr_auto]">
        <div><label className="label" htmlFor={`rc-${code}`}>Status</label><input id={`rc-${code}`} className={`input font-mono text-xs ${tone}`} value={c} onChange={(e) => setC(e.target.value)} onBlur={() => { const n = c.trim(); if (n && n !== code && !taken.includes(n)) onChange(r, n); else setC(code); }} /></div>
        <Text label="Description" value={r.description} onChange={(description) => onChange({ ...r, description })} />
        <div className="self-end pb-2"><RemoveBtn label={`response ${code}`} onClick={() => onChange(null)} /></div>
      </div>
      {ct && media ? (
        <>
          <div className="flex items-end gap-2">
            <div className="flex-1"><Select label="Returns" value={ct} onChange={(v) => onChange({ ...r, content: { [v]: media } })} options={CONTENT_TYPES.some(([v]) => v === ct) ? CONTENT_TYPES : [[ct, ct], ...CONTENT_TYPES]} /></div>
            <button className="btn mb-0.5 py-1 text-xs" onClick={() => onChange({ ...r, content: undefined })}>No body</button>
          </div>
          <MediaEditor media={media} onChange={(m) => onChange({ ...r, content: { [ct]: m } })} label="Example response" />
        </>
      ) : <button className="btn py-1 text-xs" onClick={() => onChange({ ...r, content: { "application/json": { schema: { type: "object" } } } })}><Plus size={13} />Describe what it returns</button>}
    </div>
  );
}

/** Example editor: JSON is checked when you leave the box, and the schema can be rebuilt from it. */
function MediaEditor({ media, onChange, label }: { media: MediaType; onChange: (m: MediaType) => void; label: string }) {
  const id = useId();
  const initial = media.example === undefined ? "" : typeof media.example === "string" ? media.example : JSON.stringify(media.example, null, 2);
  const [text, setText] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  const read = (): { ok: true; v: unknown } | { ok: false } => { if (!text.trim()) return { ok: true, v: undefined }; try { return { ok: true, v: JSON.parse(text) }; } catch { return { ok: false }; } };
  const commit = () => { const r = read(); if (r.ok) { setErr(null); onChange(clean({ ...media, example: r.v }) as MediaType); } else { setErr("Not valid JSON, so it's kept as plain text."); onChange({ ...media, example: text }); } };
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <textarea id={id} rows={5} spellCheck={false} className="input font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} placeholder={'{\n  "id": 42,\n  "name": "Example"\n}'} />
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>Schema: <span className="font-mono text-ink">{typeText(media.schema)}</span>{media.schema?.properties ? ` with ${Object.keys(media.schema.properties).length} fields` : ""}</span>
        <button className="link" onClick={() => { const r = read(); if (r.ok && r.v !== undefined) { setErr(null); onChange({ ...media, example: r.v, schema: inferSchema(r.v) }); } else setErr("Write a JSON example first, then build the schema from it."); }}>Build schema from example</button>
        <span>Don&apos;t paste real tokens or personal data.</span>
      </div>
      {err && <p className="mt-1 text-xs text-amber-300">{err}</p>}
    </div>
  );
}
