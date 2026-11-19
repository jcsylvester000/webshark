"use client";
/**
 * Guided editor for AsyncAPI 3.0: overview, servers, channels, operations, messages and security
 * schemes, so beginners never touch YAML. Renaming an item updates every $ref that points at it.
 */
import { ArrowDownToLine, ArrowUpFromLine, Info, KeyRound, Mail, Plus, Radio, Server, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { getIn, obj, refKey, refTo, removeKey, renameKey, setIn, uniqueKey, type Obj, type Section } from "@/lib/asyncEdit";
import { inferSchema, typeText } from "@/lib/openapi/spec";
import type { Schema } from "@/lib/openapi/types";
import { dialogs } from "../Dialogs";
import { HelpTip } from "../HelpTip";
import { Area, clean, Select, Text } from "./fields";

const PROTOCOLS = ["kafka", "kafka-secure", "amqp", "amqps", "mqtt", "secure-mqtt", "ws", "wss", "http", "https", "nats", "redis", "jms", "sns", "sqs", "googlepubsub", "pulsar", "solace", "ibmmq", "stomp", "stomps", "mercure"].map((p) => [p, p] as const);
const SCHEMES = [["userPassword", "Username + password"], ["apiKey", "API key (user/password field)"], ["httpApiKey", "HTTP API key (header/query/cookie)"], ["http", "HTTP bearer / basic"], ["scramSha256", "SASL SCRAM-SHA-256"], ["scramSha512", "SASL SCRAM-SHA-512"], ["plain", "SASL PLAIN"], ["gssapi", "SASL GSSAPI (Kerberos)"], ["X509", "Client certificate (X.509)"], ["symmetricEncryption", "Symmetric encryption"], ["asymmetricEncryption", "Asymmetric encryption"], ["oauth2", "OAuth 2.0"], ["openIdConnect", "OpenID Connect"]] as const;
const CONTENT = [["application/json", "JSON"], ["application/avro", "Avro"], ["application/x-protobuf", "Protobuf"], ["text/plain", "Plain text"], ["application/xml", "XML"]] as const;
const ICON: Record<Section | "overview", React.ReactNode> = { overview: <Info size={14} />, servers: <Server size={14} />, channels: <Radio size={14} />, operations: <ArrowUpFromLine size={14} />, messages: <Mail size={14} />, securitySchemes: <KeyRound size={14} /> };
const LABEL: Record<Section, string> = { servers: "Servers", channels: "Channels", operations: "Operations", messages: "Messages", securitySchemes: "Security" };
const PATH: Record<Section, string[]> = { servers: ["servers"], channels: ["channels"], operations: ["operations"], messages: ["components", "messages"], securitySchemes: ["components", "securitySchemes"] };

type Sel = { section: "overview" } | { section: Section; key: string };

export function AsyncEditor({ doc, onChange }: { doc: Obj; onChange: (d: Obj) => void }) {
  const [sel, setSel] = useState<Sel>({ section: "overview" });
  if (!String(doc.asyncapi ?? "").startsWith("3.")) return <p className="m-6 rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">The guided editor works with AsyncAPI 3.0. This document is {String(doc.asyncapi ?? "unversioned")}: edit it in YAML / JSON, or start a 3.0 document.</p>;
  const map = (s: Section) => obj(getIn(doc, PATH[s]));
  const put = (s: Section, key: string, value: unknown) => onChange(setIn(doc, [...PATH[s], key], value));
  async function add(s: Section) {
    const base = { servers: "production", channels: "newChannel", operations: "newOperation", messages: "NewMessage", securitySchemes: "brokerAuth" }[s];
    const name = await dialogs.prompt({ title: `Add to ${LABEL[s]}`, message: "A short name (letters, numbers, - and _). Other parts refer to it by this name.", label: "Name", defaultValue: uniqueKey(map(s), base) });
    const key = name?.trim().replace(/[^\w.-]/g, "_");
    if (!key || Object.hasOwn(map(s), key)) return;
    const firstChannel = Object.keys(map("channels"))[0];
    const init: Record<Section, unknown> = {
      servers: { host: "broker.example.com:9093", protocol: "kafka-secure", description: "" },
      channels: { address: key.replace(/([a-z])([A-Z])/g, "$1.$2").toLowerCase(), messages: {} },
      operations: { action: "send", ...(firstChannel ? { channel: { $ref: refTo("channels", firstChannel) } } : {}), summary: "" },
      messages: { name: key, contentType: "application/json", payload: { type: "object", properties: {} } },
      securitySchemes: { type: "scramSha512", description: "" },
    };
    put(s, key, init[s]); setSel({ section: s, key });
  }
  const nav = (s: Section) => (
    <div key={s} className="mt-2">
      <div className="flex items-center justify-between px-2 pb-0.5 text-xs uppercase tracking-wider text-muted"><span className="flex items-center gap-1.5">{ICON[s]}{LABEL[s]} ({Object.keys(map(s)).length})</span><button className="text-fin" aria-label={`Add to ${LABEL[s]}`} onClick={() => add(s)}><Plus size={14} /></button></div>
      {Object.keys(map(s)).map((k) => { const on = sel.section === s && "key" in sel && sel.key === k; return <button key={k} aria-current={on ? "true" : undefined} className={`block w-full truncate rounded px-2 py-1 text-left font-mono text-xs ${on ? "bg-panel-2 text-ink" : "text-muted hover:text-ink"}`} onClick={() => setSel({ section: s, key: k })}>{k}</button>; })}
    </div>
  );
  const current = sel.section !== "overview" && "key" in sel && Object.hasOwn(map(sel.section), sel.key) ? sel : null;
  const rename = (s: Section, from: string, to: string) => { const next = renameKey(doc, s, from, to); if (next !== doc) { onChange(next); setSel({ section: s, key: to }); } };
  const remove = async (s: Section, key: string) => { if (await dialogs.confirm({ title: `Remove ${key}?`, message: "Anything that points at it loses that link. Revert or don't save if you change your mind.", danger: true, confirmText: "Remove" })) { onChange(removeKey(doc, s, key)); setSel({ section: "overview" }); } };

  return (
    <div className="flex h-full min-h-0">
      <nav aria-label="Events docs sections" className="w-60 shrink-0 overflow-y-auto border-r border-line bg-panel p-2">
        <button aria-current={sel.section === "overview" ? "true" : undefined} className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${sel.section === "overview" ? "bg-panel-2 text-ink" : "text-muted hover:text-ink"}`} onClick={() => setSel({ section: "overview" })}>{ICON.overview}Overview</button>
        {(["servers", "channels", "operations", "messages", "securitySchemes"] as Section[]).map(nav)}
      </nav>
      <div className="min-w-0 flex-1 overflow-y-auto p-5">
        {sel.section === "overview" && <Overview doc={doc} onChange={onChange} />}
        {current && (
          <div key={`${current.section}:${current.key}`} className="max-w-2xl space-y-4">
            <div className="flex items-end gap-2">
              <div className="flex-1"><KeyField label={`${LABEL[current.section].replace(/s$/, "")} name`} value={current.key} onCommit={(v) => rename(current.section, current.key, v)} /></div>
              <button className="btn-danger" onClick={() => remove(current.section, current.key)}><Trash2 size={14} />Remove</button>
            </div>
            {current.section === "servers" && <ServerForm doc={doc} v={obj(map("servers")[current.key])} set={(v) => put("servers", current.key, v)} />}
            {current.section === "channels" && <ChannelForm doc={doc} v={obj(map("channels")[current.key])} set={(v) => put("channels", current.key, v)} />}
            {current.section === "operations" && <OperationForm doc={doc} v={obj(map("operations")[current.key])} set={(v) => put("operations", current.key, v)} />}
            {current.section === "messages" && <MessageForm key={current.key} v={obj(map("messages")[current.key])} set={(v) => put("messages", current.key, v)} />}
            {current.section === "securitySchemes" && <SchemeForm v={obj(map("securitySchemes")[current.key])} set={(v) => put("securitySchemes", current.key, v)} />}
          </div>
        )}
      </div>
    </div>
  );
}

function KeyField({ label, value, onCommit }: { label: string; value: string; onCommit: (v: string) => void }) {
  const id = useId();
  const [v, setV] = useState(value);
  return <div><label className="label" htmlFor={id}>{label}</label><input id={id} className="input font-mono text-xs" value={v} onChange={(e) => setV(e.target.value.replace(/[^\w.-]/g, "_"))} onBlur={() => v !== value && onCommit(v)} onKeyDown={(e) => e.key === "Enter" && v !== value && onCommit(v)} /><p className="mt-1 text-xs text-muted">Renaming updates everything that refers to it.</p></div>;
}
const str = (v: unknown) => (typeof v === "string" ? v : "");
function Checks({ legend, options, chosen, onChange, empty, help }: { legend: string; options: string[]; chosen: string[]; onChange: (v: string[]) => void; empty: string; help?: string }) {
  return (
    <fieldset className="panel space-y-1.5 p-3">
      <legend className="flex items-center px-1 text-sm font-medium">{legend}{help && <HelpTip>{help}</HelpTip>}</legend>
      {!options.length && <p className="text-xs text-muted">{empty}</p>}
      <div className="flex flex-wrap gap-x-4 gap-y-1">{options.map((o) => <label key={o} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={chosen.includes(o)} onChange={(e) => onChange(e.target.checked ? [...chosen, o] : chosen.filter((x) => x !== o))} /><span className="font-mono text-xs">{o}</span></label>)}</div>
    </fieldset>
  );
}

function Overview({ doc, onChange }: { doc: Obj; onChange: (d: Obj) => void }) {
  const info = obj(doc.info);
  const set = (patch: Obj) => onChange({ ...doc, info: clean({ ...info, ...patch }) });
  return (
    <div className="max-w-2xl space-y-4">
      <h2 className="flex items-center text-base font-semibold">Overview<HelpTip>An event API is described by servers (brokers), channels (topics/queues), operations (which app sends or receives) and messages (the data format).</HelpTip></h2>
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]"><Text label="Title" value={str(info.title)} onChange={(title) => set({ title })} /><Text label="Version" value={str(info.version)} onChange={(version) => set({ version })} /></div>
      <Area label="Description" rows={5} value={str(info.description)} onChange={(description) => set({ description })} placeholder="What events this system emits and consumes, and who owns them." />
      <Select label="Default message format" value={str(doc.defaultContentType) || "application/json"} onChange={(v) => onChange({ ...doc, defaultContentType: v })} options={CONTENT} />
    </div>
  );
}

function ServerForm({ doc, v, set }: { doc: Obj; v: Obj; set: (v: Obj) => void }) {
  const up = (patch: Obj) => set(clean({ ...v, ...patch }));
  const schemes = Object.keys(obj(obj(doc.components).securitySchemes));
  const chosen = Array.isArray(v.security) ? v.security.map(refKey) : [];
  const insecure = /^(kafka|amqp|mqtt|ws|http|stomp)$/.test(str(v.protocol));
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem]"><Text label="Host (and port)" mono value={str(v.host)} onChange={(host) => up({ host })} placeholder="broker.example.com:9093" /><Select label="Protocol" value={str(v.protocol) || "kafka"} onChange={(protocol) => up({ protocol })} options={PROTOCOLS} /></div>
      {insecure && <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">{str(v.protocol)} is unencrypted. Use the TLS variant ({str(v.protocol) === "kafka" ? "kafka-secure" : str(v.protocol) === "mqtt" ? "secure-mqtt" : `${str(v.protocol)}s`}) if the broker supports it.</p>}
      <div className="grid gap-3 sm:grid-cols-2"><Text label="Path (optional)" mono value={str(v.pathname)} onChange={(pathname) => up({ pathname })} placeholder="/events" /><Text label="Protocol version (optional)" value={str(v.protocolVersion)} onChange={(protocolVersion) => up({ protocolVersion })} placeholder="3.6" /></div>
      <Text label="Description" value={str(v.description)} onChange={(description) => up({ description })} placeholder="Production cluster (TLS + SASL)" />
      <Checks legend="Authentication" options={schemes} chosen={chosen} onChange={(c) => up({ security: c.length ? c.map((k) => ({ $ref: refTo("securitySchemes", k) })) : undefined })} empty="Add a scheme under Security first." help="How clients prove who they are to this broker." />
    </div>
  );
}

function ChannelForm({ doc, v, set }: { doc: Obj; v: Obj; set: (v: Obj) => void }) {
  const up = (patch: Obj) => set(clean({ ...v, ...patch }));
  const messages = Object.keys(obj(obj(doc.components).messages));
  const servers = Object.keys(obj(doc.servers));
  const current = obj(v.messages);
  const chosen = Object.entries(current).filter(([, m]) => obj(m).$ref).map(([, m]) => refKey(m));
  const inline = Object.entries(current).filter(([, m]) => !obj(m).$ref).map(([k]) => k);
  const chosenServers = Array.isArray(v.servers) ? v.servers.map(refKey) : [];
  return (
    <div className="space-y-4">
      <Text label="Address (topic / queue name)" mono value={str(v.address)} onChange={(address) => up({ address })} placeholder="orders.created or users/{userId}/events" hint="Use {name} for parts that change, then describe them as parameters in YAML." />
      <Area label="Description" value={str(v.description)} onChange={(description) => up({ description })} placeholder="What travels on this channel and why." />
      <Checks legend="Messages on this channel" options={messages} chosen={chosen} onChange={(c) => {
        // Keep existing entries (their keys are what operations point at); add new ones under the message name.
        const kept = Object.entries(current).filter(([, m]) => !obj(m).$ref || c.includes(refKey(m)));
        const added = c.filter((k) => !kept.some(([, m]) => refKey(m) === k)).map((k) => [uniqueKey(Object.fromEntries(kept), k), { $ref: refTo("messages", k) }] as const);
        up({ messages: Object.fromEntries([...kept, ...added]) });
      }} empty="Add a message under Messages first." />
      {inline.length > 0 && <p className="text-xs text-muted">Also defined inline (edit in YAML): {inline.join(", ")}</p>}
      <Checks legend="Available on servers" options={servers} chosen={chosenServers} onChange={(c) => up({ servers: c.length ? c.map((k) => ({ $ref: refTo("servers", k) })) : undefined })} empty="No servers yet." help="Leave all unticked if the channel exists on every server." />
    </div>
  );
}

function OperationForm({ doc, v, set }: { doc: Obj; v: Obj; set: (v: Obj) => void }) {
  const up = (patch: Obj) => set(clean({ ...v, ...patch }));
  const channels = Object.keys(obj(doc.channels));
  const ch = refKey(v.channel);
  const chMsgs = Object.keys(obj(obj(obj(doc.channels)[ch]).messages));
  const chosen = Array.isArray(v.messages) ? v.messages.map(refKey) : [];
  return (
    <div className="space-y-4">
      <fieldset className="panel flex flex-wrap gap-4 p-3 text-sm">
        <legend className="flex items-center px-1 font-medium">Action<HelpTip>Send: this application publishes messages to the channel. Receive: it consumes them.</HelpTip></legend>
        {(["send", "receive"] as const).map((a) => <label key={a} className="flex items-center gap-1.5"><input type="radio" name="op-action" checked={v.action === a} onChange={() => up({ action: a })} />{a === "send" ? <ArrowUpFromLine size={14} className="text-amber-300" /> : <ArrowDownToLine size={14} className="text-sky-300" />}{a === "send" ? "Send (publish)" : "Receive (consume)"}</label>)}
      </fieldset>
      <Select label="Channel" value={ch} onChange={(k) => up({ channel: k ? { $ref: refTo("channels", k) } : undefined, messages: undefined })} options={[["", "Choose a channel…"], ...channels.map((c) => [c, `${c} (${str(obj(obj(doc.channels)[c]).address) || "no address"})`] as const)]} />
      <Text label="Summary" value={str(v.summary)} onChange={(summary) => up({ summary })} placeholder="e.g. The order service publishes OrderCreated when checkout succeeds" />
      <Area label="Description" value={str(v.description)} onChange={(description) => up({ description })} />
      {ch && <Checks legend="Messages (leave empty for all on the channel)" options={chMsgs} chosen={chosen} onChange={(c) => up({ messages: c.length ? c.map((k) => ({ $ref: `${refTo("channels", ch)}/messages/${k}` })) : undefined })} empty="This channel has no messages yet." />}
    </div>
  );
}

function MessageForm({ v, set }: { v: Obj; set: (v: Obj) => void }) {
  const id = useId();
  const up = (patch: Obj) => set(clean({ ...v, ...patch }));
  const ex = Array.isArray(v.examples) ? obj(v.examples[0]).payload : undefined;
  const [text, setText] = useState(ex === undefined ? "" : JSON.stringify(ex, null, 2));
  const [err, setErr] = useState<string | null>(null);
  const read = () => { try { return { ok: true as const, v: JSON.parse(text) as unknown }; } catch { return { ok: false as const }; } };
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2"><Text label="Name" value={str(v.name)} onChange={(name) => up({ name })} /><Text label="Title" value={str(v.title)} onChange={(title) => up({ title })} placeholder="Order created" /></div>
      <Text label="Summary" value={str(v.summary)} onChange={(summary) => up({ summary })} placeholder="Sent when a customer completes checkout" />
      <Select label="Format" value={str(v.contentType) || "application/json"} onChange={(contentType) => up({ contentType })} options={CONTENT} />
      <div>
        <label className="label" htmlFor={id}>Example message</label>
        <textarea id={id} rows={7} spellCheck={false} className="input font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} placeholder={'{\n  "orderId": "3f2b…",\n  "total": 42.5\n}'}
          onBlur={() => { if (!text.trim()) { setErr(null); up({ examples: undefined }); return; } const r = read(); if (r.ok) { setErr(null); up({ examples: [{ payload: r.v }] }); } else setErr("Not valid JSON yet."); }} />
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>Payload: <span className="font-mono text-ink">{typeText(v.payload as Schema)}</span>{obj(v.payload).properties ? ` with ${Object.keys(obj(obj(v.payload).properties)).length} fields` : ""}</span>
          <button className="link" onClick={() => { const r = read(); if (r.ok) { setErr(null); up({ payload: inferSchema(r.v), examples: [{ payload: r.v }] }); } else setErr("Write a JSON example first."); }}>Build payload schema from example</button>
          <span>Don&apos;t paste real customer data.</span>
        </div>
        {err && <p className="mt-1 text-xs text-amber-300">{err}</p>}
      </div>
    </div>
  );
}

function SchemeForm({ v, set }: { v: Obj; set: (v: Obj) => void }) {
  const up = (patch: Obj) => set(clean({ ...v, ...patch }));
  const t = str(v.type);
  return (
    <div className="space-y-4">
      <Select label="Type" value={t || "userPassword"} onChange={(type) => set(clean({ type, description: v.description }))} options={SCHEMES} />
      {t === "apiKey" && <Select label="Sent as" value={str(v.in) || "user"} onChange={(x) => up({ in: x })} options={[["user", "User field"], ["password", "Password field"]]} />}
      {t === "httpApiKey" && <div className="grid gap-3 sm:grid-cols-2"><Text label="Header / parameter name" mono value={str(v.name)} onChange={(name) => up({ name })} /><Select label="Sent in" value={str(v.in) || "header"} onChange={(x) => up({ in: x })} options={[["header", "Header"], ["query", "Query (less safe)"], ["cookie", "Cookie"]]} /></div>}
      {t === "http" && <div className="grid gap-3 sm:grid-cols-2"><Select label="Scheme" value={str(v.scheme) || "bearer"} onChange={(scheme) => up({ scheme })} options={[["bearer", "Bearer"], ["basic", "Basic"]]} /><Text label="Token format" value={str(v.bearerFormat)} onChange={(bearerFormat) => up({ bearerFormat })} placeholder="JWT" /></div>}
      {t === "openIdConnect" && <Text label="Discovery URL" mono value={str(v.openIdConnectUrl)} onChange={(openIdConnectUrl) => up({ openIdConnectUrl })} />}
      {t === "oauth2" && <Text label="Token URL (client credentials)" mono value={str(obj(obj(v.flows).clientCredentials).tokenUrl)} onChange={(tokenUrl) => up({ flows: { clientCredentials: { availableScopes: {}, ...obj(obj(v.flows).clientCredentials), tokenUrl } } })} />}
      {t === "plain" && <p className="text-xs text-amber-300">SASL PLAIN sends the password as-is: only use it over TLS.</p>}
      <Text label="How to get credentials" value={str(v.description)} onChange={(description) => up({ description })} placeholder="e.g. Ask the platform team for a service account" />
    </div>
  );
}
