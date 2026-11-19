"use client";
/**
 * Events (AsyncAPI): documents message-driven APIs (Kafka topics, MQTT, AMQP queues, WebSockets).
 * Read-only reference + YAML/JSON source; drafted from queues on the diagram or imported.
 * Saved with the project like everything else.
 */
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, CheckCircle2, ChevronDown, Code2, FilePlus2, FileUp, Radio, Wand2 } from "lucide-react";
import { useRef, useState } from "react";
import { asyncFromCanvas, asyncMarkdown, validateAsync, viewOf, type AsyncView } from "@/lib/asyncapi";
import { fileSlug } from "@/lib/export";
import { parseDoc, toText } from "@/lib/openapi/io";
import type { OpenApiDoc } from "@/lib/openapi/types";
import { useProjects } from "@/lib/store";
import { dialogs } from "../Dialogs";
import { HelpTip } from "../HelpTip";
import { CodeEditor } from "./CodeEditor";
import { SchemaView } from "./SchemaView";

const EXAMPLE = { asyncapi: "3.0.0", info: { title: "Orders events", version: "1.0.0", description: "Events published when orders change." }, servers: { production: { host: "broker.example.com:9093", protocol: "kafka-secure", description: "Production Kafka (TLS + SASL)" } }, channels: { orderCreated: { address: "orders.created", messages: { OrderCreated: { $ref: "#/components/messages/OrderCreated" } } } }, operations: { publishOrderCreated: { action: "send", channel: { $ref: "#/channels/orderCreated" }, summary: "The order service publishes a message when an order is placed." } }, components: { messages: { OrderCreated: { name: "OrderCreated", contentType: "application/json", payload: { type: "object", required: ["orderId"], properties: { orderId: { type: "string", format: "uuid" }, total: { type: "number" }, createdAt: { type: "string", format: "date-time" } } } } } } };

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function EventsDocs({ projectId }: { projectId: string }) {
  const project = useProjects((s) => s.loaded[projectId]);
  const update = useProjects((s) => s.update);
  const [view, setView] = useState<"reference" | "code">("reference");
  const [menu, setMenu] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  if (!project) return null;
  const ev = project.state.docs.events;
  const spec = ev.spec;
  const set = (next: Record<string, unknown> | null, format = ev.format) => update(projectId, (s) => ({ ...s, docs: { ...s.docs, events: { spec: next, format, updatedAt: new Date().toISOString() } } }));
  const flash = (tone: "ok" | "err", text: string) => { setNotice({ tone, text }); setTimeout(() => setNotice(null), 6000); };
  const queues = project.state.canvas.nodes.filter((n) => ["queue", "cache"].includes(n.data.kind)).length;

  async function importFile(f: File) {
    const r = parseDoc(await f.text());
    if (!r.ok) return flash("err", `Couldn't import ${f.name}: ${r.message}`);
    const raw = r.doc as unknown as Record<string, unknown>;
    if (typeof raw.asyncapi !== "string") return flash("err", `${f.name} isn't an AsyncAPI document (it needs an asyncapi version). OpenAPI files go in REST API.`);
    if (spec && !(await dialogs.confirm({ title: "Replace the events docs?", message: `${f.name} replaces the current AsyncAPI document. Revert before saving to undo.`, confirmText: "Replace" }))) return;
    set(raw, r.format); flash("ok", `Imported ${f.name}.`);
  }
  const fileInput = <input ref={fileRef} type="file" accept=".yaml,.yml,.json" className="hidden" aria-label="Import AsyncAPI file" onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ""; }} />;
  const draft = () => { const r = asyncFromCanvas(project.state.canvas, project.meta.name); set(r.doc); flash("ok", `Draft created with ${r.channels} channel${r.channels === 1 ? "" : "s"} from the diagram. Describe each message's fields in YAML / JSON.`); };

  if (!spec) return (
    <div className="h-full overflow-auto p-6">
      {fileInput}
      <div className="mx-auto max-w-3xl space-y-5">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Radio size={18} className="text-fin" />Event documentation<HelpTip>Some systems talk through messages instead of request/response: a service publishes an event to a topic or queue, and others consume it. AsyncAPI is the OpenAPI-style standard for describing those channels and message formats.</HelpTip></h2>
          <p className="mt-1 text-sm text-muted">Describe topics, queues and the messages that travel on them in <b className="text-ink">AsyncAPI</b>, the standard for event-driven APIs (Kafka, MQTT, RabbitMQ, WebSockets).</p>
        </div>
        {notice && <p role="status" className={`rounded-md border px-3 py-2 text-sm ${notice.tone === "ok" ? "border-fin/40 bg-fin/5" : "border-danger/40 bg-danger/10 text-danger"}`}>{notice.text}</p>}
        <div className="grid gap-3 md:grid-cols-3">
          <button className="panel flex flex-col items-start gap-2 p-4 text-left hover:border-fin/60 disabled:opacity-60" disabled={!queues} onClick={draft}><Wand2 className="text-fin" size={20} /><span className="font-medium">Draft from the diagram</span><span className="text-xs text-muted">{queues ? `Uses your ${queues} queue/cache component${queues === 1 ? "" : "s"} and the links into and out of them.` : "Add a Message Queue component to the diagram first."}</span></button>
          <button className="panel flex flex-col items-start gap-2 p-4 text-left hover:border-fin/60" onClick={() => { set(structuredClone(EXAMPLE)); setView("code"); }}><FilePlus2 className="text-fin" size={20} /><span className="font-medium">Start from an example</span><span className="text-xs text-muted">An AsyncAPI 3.0 document with one Kafka topic you can edit.</span></button>
          <button className="panel flex flex-col items-start gap-2 p-4 text-left hover:border-fin/60" onClick={() => fileRef.current?.click()}><FileUp className="text-fin" size={20} /><span className="font-medium">Import a file</span><span className="text-xs text-muted">An AsyncAPI 3.0 or 2.x document in YAML or JSON.</span></button>
        </div>
      </div>
    </div>
  );

  const issues = validateAsync(spec);
  const errors = issues.filter((i) => i.level === "error").length, warnings = issues.filter((i) => i.level === "warning").length;
  const v = viewOf(spec);
  const name = fileSlug(v.title);
  return (
    <div className="flex h-full min-h-0 flex-col">
      {fileInput}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <div className="flex rounded-md border border-line p-0.5" role="group" aria-label="Events docs view">
          {([["reference", "Reference", <Radio key="r" size={14} />], ["code", "YAML / JSON", <Code2 key="c" size={14} />]] as const).map(([k, l, icon]) => <button key={k} aria-pressed={view === k} className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-sm ${view === k ? "bg-panel-2 text-ink" : "text-muted hover:text-ink"}`} onClick={() => setView(k)}>{icon}{l}</button>)}
        </div>
        <button title="Events check" aria-expanded={showIssues} onClick={() => setShowIssues(!showIssues)} className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm ${errors ? "border-danger/50 text-danger" : warnings ? "border-amber-500/50 text-amber-300" : "border-fin/40 text-fin"}`}>{errors || warnings ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}{errors ? `${errors} error${errors === 1 ? "" : "s"}` : warnings ? `${warnings} warning${warnings === 1 ? "" : "s"}` : "Valid"}</button>
        <span className="chip">AsyncAPI {v.version || "?"}</span>
        <div className="ml-auto flex gap-2">
          <button className="btn py-1" onClick={() => fileRef.current?.click()}><FileUp size={14} /><span className="hidden lg:inline">Import</span></button>
          <div className="relative">
            <button className="btn py-1" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>Export<ChevronDown size={14} /></button>
            {menu && <div role="menu" className="panel absolute right-0 top-9 z-30 w-52 p-1 text-sm shadow-xl">
              <button role="menuitem" className="w-full rounded px-2.5 py-1.5 text-left hover:bg-panel-2" onClick={() => { setMenu(false); download(`${name}.asyncapi.yaml`, toText(spec as unknown as OpenApiDoc, "yaml"), "application/yaml"); }}>AsyncAPI YAML (.yaml)</button>
              <button role="menuitem" className="w-full rounded px-2.5 py-1.5 text-left hover:bg-panel-2" onClick={() => { setMenu(false); download(`${name}.asyncapi.json`, toText(spec as unknown as OpenApiDoc, "json"), "application/json"); }}>AsyncAPI JSON (.json)</button>
              <button role="menuitem" className="w-full rounded px-2.5 py-1.5 text-left hover:bg-panel-2" onClick={() => { setMenu(false); download(`${name}-events.md`, asyncMarkdown(v), "text/markdown"); }}>Markdown (.md)</button>
              <div className="my-1 border-t border-line" />
              <button role="menuitem" className="w-full rounded px-2.5 py-1.5 text-left text-danger hover:bg-panel-2" onClick={async () => { setMenu(false); if (await dialogs.confirm({ title: "Remove the events docs?", message: "Nothing is deleted until you save the project.", danger: true, confirmText: "Remove" })) set(null); }}>Remove events docs…</button>
            </div>}
          </div>
        </div>
      </div>
      {notice && <p role="status" className={`shrink-0 border-b px-4 py-1.5 text-sm ${notice.tone === "ok" ? "border-fin/30 bg-fin/5" : "border-danger/40 bg-danger/10 text-danger"}`}>{notice.text}</p>}
      {showIssues && <ul aria-label="Events check" className="max-h-48 shrink-0 overflow-y-auto border-b border-line bg-panel px-4 py-2 text-sm">{issues.length ? issues.map((i, n) => <li key={n} className="flex gap-2 py-0.5"><span className={i.level === "error" ? "text-danger" : i.level === "warning" ? "text-amber-300" : "text-fin"}>{i.level}</span>{i.message}</li>) : <li className="text-muted">No problems found.</li>}</ul>}
      <div className="min-h-0 flex-1">
        {view === "reference" ? <EventsReference v={v} raw={spec} /> : <CodeEditor doc={spec as unknown as OpenApiDoc} format={ev.format} onFormat={(f) => set(spec, f)} onChange={(d) => set(d as unknown as Record<string, unknown>)} />}
      </div>
    </div>
  );
}

export function EventsReference({ v, raw, embedded }: { v: AsyncView; raw: Record<string, unknown>; embedded?: boolean }) {
  const doc = raw as unknown as OpenApiDoc;
  return (
    <div className={`overflow-y-auto ${embedded ? "max-h-[640px]" : "h-full"}`}>
      <div className="mx-auto max-w-4xl space-y-6 p-6">
        <header className="space-y-2">
          <div className="flex flex-wrap items-baseline gap-2"><h2 className="text-2xl font-semibold">{v.title}</h2><span className="chip">v{v.apiVersion}</span><span className="chip">AsyncAPI {v.version}</span></div>
          {v.description && <p className="whitespace-pre-wrap text-sm text-muted">{v.description}</p>}
          {v.servers.length > 0 && <div className="space-y-1 pt-1"><h3 className="text-xs uppercase tracking-wider text-muted">Servers</h3>{v.servers.map((s) => <div key={s.name} className="text-sm"><span className="font-mono text-xs">{s.name}</span> · <code className="font-mono text-xs text-fin">{s.url}</code> · <span className="chip">{s.protocol}</span>{s.description && <span className="text-muted"> {s.description}</span>}</div>)}</div>}
        </header>
        <section aria-label="Operations" className="space-y-2">
          <h3 className="text-lg font-semibold">Operations</h3>
          {!v.operations.length && <p className="text-sm text-muted">No operations: say which application sends or receives on each channel.</p>}
          {v.operations.map((o) => (
            <div key={o.id} className="panel flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
              <span className={`flex w-20 items-center gap-1 text-xs font-semibold uppercase ${o.action === "send" ? "text-amber-300" : "text-sky-300"}`}>{o.action === "send" ? <ArrowUpFromLine size={13} /> : <ArrowDownToLine size={13} />}{o.action}</span>
              <code className="font-mono text-xs">{v.channels.find((c) => c.id === o.channelId)?.address ?? o.channelId}</code>
              <span className="text-muted">{o.summary ?? o.id}</span>
              {o.messages.length > 0 && <span className="ml-auto text-xs text-muted">{o.messages.map((m) => m.title ?? m.name).join(", ")}</span>}
            </div>
          ))}
        </section>
        <section aria-label="Channels" className="space-y-3">
          <h3 className="text-lg font-semibold">Channels</h3>
          {v.channels.map((c) => (
            <article key={c.id} className="panel overflow-hidden">
              <div className="border-b border-line bg-panel-2/40 px-4 py-2.5"><code className="font-mono text-sm">{c.address}</code>{c.description && <p className="text-xs text-muted">{c.description}</p>}</div>
              <div className="space-y-3 p-4">
                {!c.messages.length && <p className="text-xs text-muted">No messages described.</p>}
                {c.messages.map((m) => (
                  <div key={m.id} className="space-y-1">
                    <h4 className="text-sm font-medium">{m.title ?? m.name}{m.contentType && <span className="ml-2 text-xs font-normal text-muted">{m.contentType}</span>}</h4>
                    {m.summary && <p className="text-xs text-muted">{m.summary}</p>}
                    <SchemaView doc={doc} schema={m.payload} />
                    {m.example !== undefined && <pre className="max-h-48 overflow-auto rounded-md border border-line bg-bg p-2 font-mono text-xs">{JSON.stringify(m.example, null, 2)}</pre>}
                  </div>
                ))}
              </div>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}
