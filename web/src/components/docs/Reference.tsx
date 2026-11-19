"use client";
/**
 * Interactive API reference (Slyshark's own renderer for OpenAPI 3.x). Used in the project
 * workbench (with Try it) and read-only in shared links. Descriptions are shown as plain text.
 */
import { Check, Copy, KeyRound, Lock, Play, Search, Unlock } from "lucide-react";
import { useMemo, useState } from "react";
import { authText, samples } from "@/lib/openapi/io";
import { build, defaults } from "@/lib/openapi/request";
import { allParams, deref, effectiveSecurity, groupByTag, ops, schemeLabel, typeText } from "@/lib/openapi/spec";
import type { OpenApiDoc, OpRef } from "@/lib/openapi/types";
import { MethodBadge } from "./fields";
import { SchemaView } from "./SchemaView";
import { TryIt } from "./TryIt";

const anchor = (key: string) => `op-${key.replace(/[^\w-]/g, "_")}`;

export function Reference({ doc, projectId, embedded }: { doc: OpenApiDoc; projectId?: string; embedded?: boolean }) {
  const [q, setQ] = useState("");
  const all = useMemo(() => ops(doc), [doc]);
  const shown = useMemo(() => { const s = q.trim().toLowerCase(); return s ? all.filter((o) => `${o.key} ${o.op.summary ?? ""} ${o.op.tags?.join(" ") ?? ""}`.toLowerCase().includes(s)) : all; }, [all, q]);
  const groups = groupByTag(doc, shown);
  const schemes = Object.entries(doc.components?.securitySchemes ?? {});
  const go = (key: string) => document.getElementById(anchor(key))?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className={`flex min-h-0 ${embedded ? "max-h-[720px]" : "h-full"}`}>
      <nav aria-label="Endpoints" className="hidden w-64 shrink-0 overflow-y-auto border-r border-line bg-panel p-2 md:block">
        <div className="relative mb-2"><Search size={13} className="absolute left-2 top-2.5 text-muted" /><input aria-label="Filter endpoints" className="input py-1.5 pl-7 text-xs" placeholder="Filter endpoints" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {groups.map(([tag, list]) => (
          <div key={tag} className="mb-2">
            <div className="px-2 py-1 text-xs uppercase tracking-wider text-muted">{tag}</div>
            {list.map((o) => <button key={o.key} className="flex w-full items-center gap-1 rounded px-2 py-1 text-left text-xs text-muted hover:bg-panel-2 hover:text-ink" onClick={() => go(o.key)}><MethodBadge method={o.method} className="w-12" /><span className={`truncate ${o.op.deprecated ? "line-through" : ""}`}>{o.op.summary || o.path}</span></button>)}
          </div>
        ))}
        {!shown.length && <p className="px-2 text-xs text-muted">{all.length ? "No endpoints match." : "No endpoints yet."}</p>}
      </nav>
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-8 p-6">
          <header className="space-y-2">
            <div className="flex flex-wrap items-baseline gap-2"><h2 className="text-2xl font-semibold">{doc.info.title}</h2><span className="chip">v{doc.info.version}</span><span className="chip">OpenAPI {doc.openapi}</span></div>
            {doc.info.summary && <p className="text-ink">{doc.info.summary}</p>}
            {doc.info.description && <p className="whitespace-pre-wrap text-sm text-muted">{doc.info.description}</p>}
            {doc.info.contact?.email && <p className="text-xs text-muted">Contact: {doc.info.contact.name ? `${doc.info.contact.name} · ` : ""}{doc.info.contact.email}</p>}
            {(doc.servers?.length ?? 0) > 0 && <div className="space-y-1 pt-2"><h3 className="text-xs uppercase tracking-wider text-muted">Servers</h3>{doc.servers!.map((s) => <div key={s.url} className="text-sm"><code className="font-mono text-xs text-fin">{s.url}</code>{s.description && <span className="text-muted"> · {s.description}</span>}</div>)}</div>}
            {schemes.length > 0 && <div className="space-y-1 pt-2"><h3 className="text-xs uppercase tracking-wider text-muted">Authentication</h3>{schemes.map(([n, s]) => <div key={n} className="flex flex-wrap items-center gap-2 text-sm"><KeyRound size={13} className="text-fin" /><span className="font-mono text-xs">{n}</span><span>{schemeLabel(s)}</span>{s.description && <span className="text-muted">· {s.description}</span>}</div>)}</div>}
          </header>
          {!all.length && <p className="panel p-6 text-center text-sm text-muted">No endpoints documented yet{projectId ? ": add one in Edit, or use “Update from API client”." : "."}</p>}
          {groups.map(([tag, list]) => (
            <section key={tag} aria-label={tag} className="space-y-4">
              <div className="border-b border-line pb-1"><h3 className="text-lg font-semibold">{tag}</h3>{doc.tags?.find((t) => t.name === tag)?.description && <p className="text-sm text-muted">{doc.tags.find((t) => t.name === tag)!.description}</p>}</div>
              {list.map((o) => <OperationView key={o.key} doc={doc} o={o} projectId={projectId} />)}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function OperationView({ doc, o, projectId }: { doc: OpenApiDoc; o: OpRef; projectId?: string }) {
  const [trying, setTrying] = useState(false);
  const [lang, setLang] = useState<"cURL" | "JavaScript" | "Python">("cURL");
  const [copied, setCopied] = useState(false);
  const params = allParams(doc, o);
  const body = deref(doc, o.op.requestBody);
  const sec = effectiveSecurity(doc, o.op);
  const isPublic = sec.source !== "none" && (!sec.reqs.length || sec.reqs.every((r) => !Object.keys(r).length));
  const code = samples(build(doc, o, defaults(doc, o), { placeholders: true }).sample);
  return (
    <article id={anchor(o.key)} className="panel scroll-mt-4 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-panel-2/40 px-4 py-2.5">
        <MethodBadge method={o.method} /><code className={`font-mono text-sm ${o.op.deprecated ? "line-through" : ""}`}>{o.path}</code>
        {o.op.deprecated && <span className="chip">deprecated</span>}
        <span className={`ml-auto flex items-center gap-1 text-xs ${sec.source === "none" ? "text-muted" : isPublic ? "text-amber-300" : "text-fin"}`}>{isPublic ? <Unlock size={12} /> : sec.source === "none" ? null : <Lock size={12} />}{authText(doc, o)}</span>
      </div>
      <div className="space-y-4 p-4">
        {o.op.summary && <h4 className="font-medium">{o.op.summary}</h4>}
        {o.op.description && <p className="whitespace-pre-wrap text-sm text-muted">{o.op.description}</p>}
        {params.length > 0 && (
          <div><h5 className="mb-1 text-xs uppercase tracking-wider text-muted">Parameters</h5>
            <table className="w-full text-sm"><thead className="text-left text-xs text-muted"><tr><th className="py-1 pr-3 font-normal">Name</th><th className="pr-3 font-normal">In</th><th className="pr-3 font-normal">Type</th><th className="font-normal">Description</th></tr></thead>
              <tbody>{params.map((p) => <tr key={`${p.in}:${p.name}`} className="border-t border-line/50 align-top"><td className="py-1 pr-3 font-mono text-xs">{p.name}{p.required && <span className="ml-1 text-danger" title="required">*</span>}</td><td className="pr-3 text-xs text-muted">{p.in}</td><td className="pr-3 font-mono text-xs text-fin">{typeText(deref(doc, p.schema))}</td><td className="text-xs text-muted">{p.description}{p.example !== undefined && <span className="block font-mono">e.g. {String(p.example)}</span>}</td></tr>)}</tbody></table>
          </div>
        )}
        {body && Object.entries(body.content ?? {}).map(([ct, m]) => (
          <div key={ct}><h5 className="mb-1 text-xs uppercase tracking-wider text-muted">Request body · <span className="normal-case">{ct}</span>{body.required ? " · required" : ""}</h5>
            <SchemaView doc={doc} schema={m.schema} />
            {m.example !== undefined && <pre className="mt-2 max-h-56 overflow-auto rounded-md border border-line bg-bg p-2 font-mono text-xs">{typeof m.example === "string" ? m.example : JSON.stringify(m.example, null, 2)}</pre>}
          </div>
        ))}
        <div><h5 className="mb-1 text-xs uppercase tracking-wider text-muted">Responses</h5>
          {!Object.keys(o.op.responses ?? {}).length && <p className="text-xs text-muted">No responses documented.</p>}
          {Object.entries(o.op.responses ?? {}).map(([c, raw]) => { const r = deref(doc, raw); const content = Object.entries(r?.content ?? {}); return (
            <details key={c} className="border-t border-line/50 py-1.5" open={c.startsWith("2") && content.length > 0}>
              <summary className="cursor-pointer text-sm"><span className={`mr-2 font-mono text-xs ${c.startsWith("2") ? "text-emerald-300" : c.startsWith("4") || c.startsWith("5") ? "text-red-400" : "text-sky-300"}`}>{c}</span>{r?.description}</summary>
              {content.map(([ct, m]) => <div key={ct} className="mt-1 space-y-1 pl-4"><span className="text-xs text-muted">{ct}</span><SchemaView doc={doc} schema={m.schema} />{m.example !== undefined && <pre className="max-h-56 overflow-auto rounded-md border border-line bg-bg p-2 font-mono text-xs">{typeof m.example === "string" ? m.example : JSON.stringify(m.example, null, 2)}</pre>}</div>)}
            </details>
          ); })}
        </div>
        <div>
          <div className="flex items-center gap-1 border-b border-line">
            <div className="flex gap-1" role="tablist" aria-label="Code sample language">{(["cURL", "JavaScript", "Python"] as const).map((l) => <button key={l} role="tab" aria-selected={lang === l} className={`tab py-1 text-xs ${lang === l ? "tab-active" : ""}`} onClick={() => setLang(l)}>{l}</button>)}</div>
            <button className="ml-auto flex items-center gap-1 text-xs text-muted hover:text-ink" onClick={async () => { await navigator.clipboard.writeText(code[lang]).catch(() => null); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? <Check size={12} /> : <Copy size={12} />}{copied ? "Copied" : "Copy"}</button>
          </div>
          <pre className="overflow-x-auto rounded-b-md bg-bg p-2 font-mono text-xs">{code[lang]}</pre>
        </div>
        {projectId && (trying ? <TryIt doc={doc} o={o} projectId={projectId} /> : <button className="btn" onClick={() => setTrying(true)}><Play size={14} />Try it</button>)}
      </div>
    </article>
  );
}
