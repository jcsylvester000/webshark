/**
 * AsyncAPI (event-driven APIs: Kafka, MQTT, AMQP, WebSockets) — read-only reference support.
 * Reads AsyncAPI 3.0 fully and 2.x channels/operations, checks the basics, drafts a document
 * from queue/stream components on the diagram, and exports Markdown.
 */
import { resolveRef } from "./openapi/spec";
import type { OpenApiDoc, Schema } from "./openapi/types";
import type { Canvas } from "./types";

export type AsyncDocState = { spec: Record<string, unknown> | null; format: "yaml" | "json"; updatedAt: string | null };
export type Msg = { id: string; name: string; title?: string; summary?: string; contentType?: string; payload?: Schema; example?: unknown };
export type Channel = { id: string; address: string; description?: string; messages: Msg[] };
export type Operation = { id: string; action: "send" | "receive"; channelId: string; summary?: string; description?: string; messages: Msg[] };
export type AsyncView = { version: string; title: string; apiVersion: string; description?: string; servers: { name: string; url: string; protocol: string; description?: string }[]; channels: Channel[]; operations: Operation[] };

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const asDoc = (d: Obj) => d as unknown as OpenApiDoc;
const deref = (d: Obj, v: unknown, depth = 0): Obj => { const o = obj(v); return typeof o.$ref === "string" && depth < 8 ? deref(d, resolveRef(asDoc(d), o.$ref), depth + 1) : o; };
const refId = (v: unknown) => { const r = obj(v).$ref; return typeof r === "string" ? r.split("/").pop()! : ""; };

function message(d: Obj, id: string, v: unknown): Msg {
  const m = deref(d, v);
  const ex = Array.isArray(m.examples) ? obj(m.examples[0]).payload : undefined;
  return { id, name: str(m.name) ?? id, title: str(m.title), summary: str(m.summary), contentType: str(m.contentType) ?? str(d.defaultContentType), payload: m.payload as Schema | undefined, example: ex };
}

export function viewOf(raw: Obj): AsyncView {
  const v = String(raw.asyncapi ?? "");
  const info = obj(raw.info);
  const base = { version: v, title: str(info.title) ?? "Untitled", apiVersion: str(info.version) ?? "", description: str(info.description) };
  if (v.startsWith("2.")) {
    const servers = Object.entries(obj(raw.servers)).map(([name, s]) => ({ name, url: str(obj(s).url) ?? "", protocol: str(obj(s).protocol) ?? "", description: str(obj(s).description) }));
    const channels: Channel[] = [], operations: Operation[] = [];
    for (const [address, c] of Object.entries(obj(raw.channels))) {
      const ch = obj(c);
      const msgs: Msg[] = [];
      for (const [k, action] of [["publish", "receive"], ["subscribe", "send"]] as const) {
        const op = obj(ch[k]);
        if (!Object.keys(op).length) continue;
        const mm = obj(op.message);
        const list = Array.isArray(mm.oneOf) ? mm.oneOf : [op.message];
        const ms = list.map((x, i) => message(raw, refId(x) || `${address}-${k}-${i}`, x));
        msgs.push(...ms);
        operations.push({ id: str(op.operationId) ?? `${k} ${address}`, action, channelId: address, summary: str(op.summary), description: str(op.description), messages: ms });
      }
      channels.push({ id: address, address, description: str(ch.description), messages: msgs });
    }
    return { ...base, servers, channels, operations };
  }
  const servers = Object.entries(obj(raw.servers)).map(([name, s]) => { const x = obj(s); return { name, url: `${str(x.host) ?? ""}${str(x.pathname) ?? ""}`, protocol: str(x.protocol) ?? "", description: str(x.description) }; });
  const channels = Object.entries(obj(raw.channels)).map(([id, c]): Channel => { const ch = deref(raw, c); return { id, address: str(ch.address) ?? id, description: str(ch.description), messages: Object.entries(obj(ch.messages)).map(([mid, m]) => message(raw, mid, m)) }; });
  const operations = Object.entries(obj(raw.operations)).map(([id, o]): Operation => {
    const op = deref(raw, o);
    const channelId = refId(op.channel);
    const ch = channels.find((c) => c.id === channelId);
    const listed = Array.isArray(op.messages) ? op.messages.map((m) => refId(m)) : [];
    return { id, action: op.action === "receive" ? "receive" : "send", channelId, summary: str(op.summary), description: str(op.description), messages: listed.length ? (ch?.messages ?? []).filter((m) => listed.includes(m.id)) : ch?.messages ?? [] };
  });
  return { ...base, servers, channels, operations };
}

export type AsyncIssue = { level: "error" | "warning" | "tip"; message: string };
export function validateAsync(raw: Obj): AsyncIssue[] {
  const out: AsyncIssue[] = [];
  const v = String(raw.asyncapi ?? "");
  if (!/^[23]\.\d+\.\d+$/.test(v)) out.push({ level: "error", message: "Set `asyncapi` to a version such as 3.0.0." });
  else if (v.startsWith("2.")) out.push({ level: "tip", message: `AsyncAPI ${v} is shown read-only. Version 3.0 separates channels from operations and is what new tools expect.` });
  const info = obj(raw.info);
  if (!info.title) out.push({ level: "error", message: "Give the event API a title (info.title)." });
  if (!info.version) out.push({ level: "error", message: "Give the event API a version (info.version)." });
  if (!Object.keys(obj(raw.channels)).length) out.push({ level: "warning", message: "No channels yet: add the topics, queues or streams messages travel on." });
  if (v.startsWith("3.")) {
    for (const [id, o] of Object.entries(obj(raw.operations))) {
      const op = obj(o);
      if (op.action !== "send" && op.action !== "receive") out.push({ level: "error", message: `Operation “${id}” needs action: send or receive.` });
      const r = obj(op.channel).$ref;
      if (typeof r !== "string" || resolveRef(asDoc(raw), r) === undefined) out.push({ level: "error", message: `Operation “${id}” must point at a channel ($ref: '#/channels/…').` });
    }
    for (const [name, s] of Object.entries(obj(raw.servers))) {
      const x = obj(s);
      if (!x.host || !x.protocol) out.push({ level: "error", message: `Server “${name}” needs host and protocol.` });
      if (/^(mqtt|ws|http|amqp|kafka)$/i.test(String(x.protocol)) && (!Array.isArray(x.security) || !x.security.length)) out.push({ level: "warning", message: `Server “${name}” uses ${x.protocol} without documented security; prefer ${String(x.protocol).toLowerCase() === "kafka" ? "SASL/TLS (kafka-secure)" : `${x.protocol}s / TLS`} and describe authentication.` });
    }
  }
  const walk = (x: unknown, d: number) => { if (d > 40 || !x || typeof x !== "object") return; const r = (x as Obj).$ref; if (typeof r === "string" && r.startsWith("#") && resolveRef(asDoc(raw), r) === undefined) out.push({ level: "error", message: `Reference “${r}” points at nothing.` }); for (const c of Object.values(x)) walk(c, d + 1); };
  walk(raw, 0);
  return out;
}

const QUEUE_KINDS = new Set(["queue", "cache"]);
/** Draft AsyncAPI 3.0 from the diagram: each queue/stream is a channel; links into it are "send", links out are "receive". */
export function asyncFromCanvas(canvas: Canvas, title: string): { doc: Obj; channels: number } {
  const byId = Object.fromEntries(canvas.nodes.map((n) => [n.id, n]));
  const key = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "") || "item";
  const channels: Obj = {}, operations: Obj = {}, servers: Obj = {}, messages: Obj = {};
  for (const n of canvas.nodes.filter((n) => QUEUE_KINDS.has(n.data.kind))) {
    const ck = key(n.data.label), mk = `${ck}Event`;
    const proto = /kafka/i.test(`${n.data.label} ${n.data.tags ?? ""}`) ? "kafka" : /mqtt/i.test(`${n.data.label} ${n.data.tags ?? ""}`) ? "mqtt" : /redis/i.test(`${n.data.label} ${n.data.os ?? ""}`) ? "redis" : "amqp";
    if (n.data.host) servers[ck] = { host: n.data.host, protocol: proto, description: `${n.data.label} (from the diagram)` };
    messages[mk] = { name: mk, title: `${n.data.label} message`, contentType: "application/json", payload: { type: "object", description: "Describe the fields of this message." } };
    channels[ck] = { address: ck.toLowerCase().replace(/_/g, "."), description: n.data.notes || `${n.data.label} (${n.data.kind})`, messages: { [mk]: { $ref: `#/components/messages/${mk}` } }, ...(servers[ck] ? { servers: [{ $ref: `#/servers/${ck}` }] } : {}) };
    for (const e of canvas.edges) {
      if (e.data?.attack) continue;
      const other = e.target === n.id ? byId[e.source] : e.source === n.id ? byId[e.target] : null;
      if (!other) continue;
      const action = e.target === n.id ? "send" : "receive";
      operations[`${key(other.data.label)}_${action}_${ck}`] = { action, channel: { $ref: `#/channels/${ck}` }, summary: `${other.data.label} ${action === "send" ? "publishes to" : "consumes from"} ${n.data.label}` };
    }
  }
  return { doc: { asyncapi: "3.0.0", info: { title: `${title} events`, version: "1.0.0", description: "Drafted by Slyshark from queues and streams on the diagram. Describe each message payload." }, servers, channels, operations, components: { messages } }, channels: Object.keys(channels).length };
}

export function asyncMarkdown(v: AsyncView): string {
  const L = [`# ${v.title} (v${v.apiVersion})`, "", v.description ?? "", "", `_AsyncAPI ${v.version} · exported from Slyshark_`, ""];
  if (v.servers.length) { L.push("## Servers", "", "| Name | URL | Protocol |", "|---|---|---|"); for (const s of v.servers) L.push(`| ${s.name} | \`${s.url}\` | ${s.protocol} |`); L.push(""); }
  L.push("## Operations", "", "| Operation | Action | Channel | Summary |", "|---|---|---|---|");
  for (const o of v.operations) L.push(`| ${o.id} | ${o.action} | ${v.channels.find((c) => c.id === o.channelId)?.address ?? o.channelId} | ${o.summary ?? ""} |`);
  L.push("", "## Channels", "");
  for (const c of v.channels) { L.push(`### ${c.address}`, "", c.description ?? "", ""); for (const m of c.messages) L.push(`- **${m.title ?? m.name}**${m.contentType ? ` (\`${m.contentType}\`)` : ""}${m.summary ? `: ${m.summary}` : ""}`); L.push(""); }
  return L.join("\n");
}
