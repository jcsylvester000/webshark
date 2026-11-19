"use client";
/** Guided editor: a form for each part of the OpenAPI document, so beginners never touch YAML. */
import { Info, KeyRound, Plus, Server, Tags, Trash2 } from "lucide-react";
import { useState } from "react";
import { is32, methodsFor, ops, setOp, suggestOpId, uniqueOpId } from "@/lib/openapi/spec";
import type { Issue, Method, OpenApiDoc, SecurityScheme } from "@/lib/openapi/types";
import { dialogs } from "../Dialogs";
import { HelpTip } from "../HelpTip";
import { Area, clean, MethodBadge, Select, Text } from "./fields";
import { OperationForm } from "./OperationForm";

type Section = "overview" | "servers" | "auth" | "tags" | `op:${string}`;
const SCHEME_KINDS = [["bearer", "Bearer token"], ["basic", "Basic auth (username + password)"], ["apiKey", "API key"], ["oauth2", "OAuth 2.0"], ["openIdConnect", "OpenID Connect"]] as const;

export function GuidedEditor({ doc, onChange, initial, issues }: { doc: OpenApiDoc; onChange: (d: OpenApiDoc) => void; initial: string | null; issues: Issue[] }) {
  const [sel, setSel] = useState<Section>(initial ? `op:${initial}` : "overview");
  const list = ops(doc);
  const current = sel.startsWith("op:") ? list.find((o) => o.key === sel.slice(3)) : null;
  const errCount = (key: string) => issues.filter((i) => i.key === key && i.level === "error").length;

  async function addEndpoint() {
    const r = await dialogs.form({ title: "Add an endpoint", message: "Use {name} for parts of the path that change, e.g. /users/{userId}.", confirmText: "Add", fields: [{ name: "method", label: "Method (GET, POST, PUT, PATCH, DELETE…)", defaultValue: "GET" }, { name: "path", label: "Path", placeholder: "/users/{userId}" }] });
    if (!r) return;
    const method = r.method.trim().toLowerCase() as Method;
    let path = r.path.trim();
    if (!methodsFor(doc).includes(method)) return dialogs.confirm({ title: "Unknown method", message: `Use one of: ${methodsFor(doc).map((m) => m.toUpperCase()).join(", ")}.`, confirmText: "OK" });
    if (!path) return;
    if (!path.startsWith("/")) path = `/${path}`;
    if (doc.paths?.[path]?.[method]) { setSel(`op:${method.toUpperCase()} ${path}`); return; }
    const params = [...path.matchAll(/\{([^}/]+)\}/g)].map((m) => ({ name: m[1], in: "path" as const, required: true, schema: { type: "string" } }));
    onChange(setOp(doc, path, method, { operationId: uniqueOpId(doc, suggestOpId(method, path)), summary: "", ...(params.length ? { parameters: params } : {}), responses: { "200": { description: "OK" } } }));
    setSel(`op:${method.toUpperCase()} ${path}`);
  }

  const nav = (s: Section, label: React.ReactNode, icon: React.ReactNode) => (
    <button className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${sel === s ? "bg-panel-2 text-ink" : "text-muted hover:text-ink"}`} aria-current={sel === s ? "true" : undefined} onClick={() => setSel(s)}>{icon}{label}</button>
  );

  return (
    <div className="flex h-full min-h-0">
      <nav aria-label="API docs sections" className="w-64 shrink-0 overflow-y-auto border-r border-line bg-panel p-2">
        {nav("overview", "Overview", <Info size={14} />)}
        {nav("servers", `Servers (${doc.servers?.length ?? 0})`, <Server size={14} />)}
        {nav("auth", `Authentication (${Object.keys(doc.components?.securitySchemes ?? {}).length})`, <KeyRound size={14} />)}
        {nav("tags", `Groups / tags (${doc.tags?.length ?? 0})`, <Tags size={14} />)}
        <div className="mt-3 flex items-center justify-between px-2 pb-1 text-xs uppercase tracking-wider text-muted"><span>Endpoints ({list.length})</span><button className="text-fin" onClick={addEndpoint} aria-label="Add endpoint"><Plus size={14} /></button></div>
        {list.map((o) => (
          <button key={o.key} className={`flex w-full items-center gap-1 rounded px-2 py-1 text-left text-xs ${sel === `op:${o.key}` ? "bg-panel-2 text-ink" : "text-muted hover:text-ink"}`} aria-current={sel === `op:${o.key}` ? "true" : undefined} onClick={() => setSel(`op:${o.key}`)}>
            <MethodBadge method={o.method} className="w-12" /><span className="truncate font-mono">{o.path}</span>
            {errCount(o.key) > 0 && <span className="ml-auto rounded bg-danger/20 px-1 text-[10px] text-danger" title="Problems to fix">{errCount(o.key)}</span>}
          </button>
        ))}
        {!list.length && <p className="px-2 text-xs text-muted">No endpoints yet.</p>}
        <button className="btn mt-2 w-full justify-center py-1 text-xs" onClick={addEndpoint}><Plus size={13} />Add endpoint</button>
      </nav>
      <div className="min-w-0 flex-1 overflow-y-auto p-5">
        {sel === "overview" && <Overview doc={doc} onChange={onChange} />}
        {sel === "servers" && <Servers doc={doc} onChange={onChange} />}
        {sel === "auth" && <Auth doc={doc} onChange={onChange} />}
        {sel === "tags" && <TagsForm doc={doc} onChange={onChange} />}
        {current && <OperationForm key={current.key} doc={doc} op={current} onChange={onChange} onMoved={(key) => setSel(`op:${key}`)} onDeleted={() => setSel("overview")} issues={issues.filter((i) => i.key === current.key)} />}
        {sel.startsWith("op:") && !current && <p className="text-sm text-muted">This endpoint no longer exists.</p>}
      </div>
    </div>
  );
}

function Overview({ doc, onChange }: { doc: OpenApiDoc; onChange: (d: OpenApiDoc) => void }) {
  const info = doc.info;
  const set = (patch: Partial<OpenApiDoc["info"]>) => onChange({ ...doc, info: clean({ ...info, ...patch }) as OpenApiDoc["info"] });
  return (
    <div className="max-w-2xl space-y-4">
      <h2 className="text-base font-semibold">Overview</h2>
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]"><Text label="API title" value={info.title} onChange={(title) => set({ title })} /><Text label="API version" value={info.version} onChange={(version) => set({ version })} placeholder="1.0.0" /></div>
      <Text label="One-line summary" value={info.summary} onChange={(summary) => set({ summary })} placeholder="e.g. Orders and payments for the resort booking app" />
      <Area label="Description" rows={6} value={info.description} onChange={(description) => set({ description })} hint="Who uses this API, what it's for, how to get access. Markdown formatting is allowed." />
      <div className="grid gap-3 sm:grid-cols-2">
        <Text label="Contact name" value={info.contact?.name} onChange={(name) => set({ contact: clean({ ...info.contact, name }) })} />
        <Text label="Contact email" value={info.contact?.email} onChange={(email) => set({ contact: clean({ ...info.contact, email }) })} />
      </div>
      <Text label="License" value={info.license?.name} onChange={(name) => set({ license: name ? { ...info.license, name } : undefined })} placeholder="e.g. Proprietary, MIT, Apache-2.0" />
    </div>
  );
}

function Servers({ doc, onChange }: { doc: OpenApiDoc; onChange: (d: OpenApiDoc) => void }) {
  const servers = doc.servers ?? [];
  const set = (next: typeof servers) => onChange({ ...doc, servers: next });
  return (
    <div className="max-w-2xl space-y-4">
      <h2 className="flex items-center text-base font-semibold">Servers<HelpTip>The base URLs where the API runs, such as production and staging. Each endpoint path is added to the end of a server URL.</HelpTip></h2>
      {servers.map((s, i) => (
        <div key={i} className="panel grid gap-3 p-3 sm:grid-cols-[1fr_1fr_auto]">
          <Text label="URL" mono value={s.url} onChange={(url) => set(servers.map((x, j) => (j === i ? { ...x, url } : x)))} placeholder="https://api.example.com/v1" />
          <Text label="Description" value={s.description} onChange={(description) => set(servers.map((x, j) => (j === i ? clean({ ...x, description }) : x)))} placeholder="Production" />
          <button className="self-end pb-2 text-muted hover:text-danger" aria-label={`Remove server ${s.url}`} onClick={() => set(servers.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
        </div>
      ))}
      <button className="btn" onClick={() => set([...servers, { url: "https://", description: "" }])}><Plus size={14} />Add server</button>
    </div>
  );
}

function Auth({ doc, onChange }: { doc: OpenApiDoc; onChange: (d: OpenApiDoc) => void }) {
  const schemes = doc.components?.securitySchemes ?? {};
  const setSchemes = (next: Record<string, SecurityScheme>, security = doc.security) => onChange({ ...doc, components: { ...doc.components, securitySchemes: next }, ...(security?.length ? { security } : { security: undefined }) });
  const kindOf = (s: SecurityScheme) => (s.type === "http" ? (s.scheme?.toLowerCase() === "basic" ? "basic" : "bearer") : s.type);
  const fromKind = (k: string, prev: SecurityScheme): SecurityScheme => k === "bearer" ? { type: "http", scheme: "bearer", description: prev.description } : k === "basic" ? { type: "http", scheme: "basic", description: prev.description } : k === "apiKey" ? { type: "apiKey", in: "header", name: "X-API-Key", description: prev.description } : k === "oauth2" ? { type: "oauth2", flows: { clientCredentials: { tokenUrl: "https://", scopes: {} } }, description: prev.description } : { type: "openIdConnect", openIdConnectUrl: "https://", description: prev.description };
  const isDefault = (n: string) => !!doc.security?.some((r) => Object.hasOwn(r, n));
  async function add() {
    const name = await dialogs.prompt({ title: "Add an authentication method", message: "A short name you'll pick on each endpoint, e.g. bearerAuth or partnerKey.", label: "Name", defaultValue: Object.keys(schemes).length ? "" : "bearerAuth" });
    const n = name?.trim().replace(/[^\w.-]/g, "_");
    if (!n || schemes[n]) return;
    setSchemes({ ...schemes, [n]: { type: "http", scheme: "bearer" } });
  }
  return (
    <div className="max-w-2xl space-y-4">
      <h2 className="flex items-center text-base font-semibold">Authentication<HelpTip>How callers prove who they are. Describe each method once here, then choose which endpoints need it. Never paste real tokens or passwords: only describe how they are sent.</HelpTip></h2>
      {!Object.keys(schemes).length && <p className="text-sm text-muted">No authentication described. If your API needs a token, key or login, add it here.</p>}
      {Object.entries(schemes).map(([n, s]) => {
        const set = (next: SecurityScheme) => setSchemes({ ...schemes, [n]: clean(next) });
        return (
          <div key={n} className="panel space-y-3 p-3">
            <div className="flex items-center gap-2"><span className="font-mono text-sm">{n}</span>
              <label className="ml-auto flex items-center gap-1.5 text-xs"><input type="checkbox" checked={isDefault(n)} onChange={(e) => setSchemes(schemes, e.target.checked ? [...(doc.security ?? []), { [n]: [] }] : (doc.security ?? []).filter((r) => !Object.hasOwn(r, n)))} />Required by default on every endpoint</label>
              <button className="text-muted hover:text-danger" aria-label={`Remove ${n}`} onClick={() => { const next = { ...schemes }; delete next[n]; setSchemes(next, (doc.security ?? []).filter((r) => !Object.hasOwn(r, n))); }}><Trash2 size={15} /></button>
            </div>
            <Select label="Type" value={kindOf(s)} onChange={(k) => set(fromKind(k, s))} options={SCHEME_KINDS} />
            {s.type === "apiKey" && <div className="grid gap-3 sm:grid-cols-2"><Text label="Header / parameter name" mono value={s.name} onChange={(name) => set({ ...s, name })} /><Select label="Sent in" value={s.in ?? "header"} onChange={(v) => set({ ...s, in: v as "header" })} options={[["header", "Header"], ["query", "Query string (less safe)"], ["cookie", "Cookie"]]} /></div>}
            {s.type === "http" && s.scheme === "bearer" && <Text label="Token format (optional)" value={s.bearerFormat} onChange={(bearerFormat) => set({ ...s, bearerFormat })} placeholder="JWT" />}
            {s.type === "oauth2" && <Text label="Token URL (client credentials flow)" mono value={s.flows?.clientCredentials?.tokenUrl} onChange={(tokenUrl) => set({ ...s, flows: { ...s.flows, clientCredentials: { scopes: {}, ...s.flows?.clientCredentials, tokenUrl } } })} hint="For other OAuth flows, edit the YAML / JSON view." />}
            {s.type === "openIdConnect" && <Text label="Discovery URL" mono value={s.openIdConnectUrl} onChange={(openIdConnectUrl) => set({ ...s, openIdConnectUrl })} placeholder="https://login.example.com/.well-known/openid-configuration" />}
            <Text label="How to get credentials" value={s.description} onChange={(description) => set({ ...s, description })} placeholder="e.g. Create a key in Settings → API keys" />
          </div>
        );
      })}
      <button className="btn" onClick={add}><Plus size={14} />Add authentication method</button>
    </div>
  );
}

function TagsForm({ doc, onChange }: { doc: OpenApiDoc; onChange: (d: OpenApiDoc) => void }) {
  const tags = doc.tags ?? [];
  const v32 = is32(doc);
  const set = (i: number, patch: Record<string, string>) => onChange({ ...doc, tags: tags.map((t, j) => (j === i ? clean({ ...t, ...patch }) : t)) });
  const rename = (i: number, name: string) => {
    const old = tags[i].name;
    let next: OpenApiDoc = { ...doc, tags: tags.map((t, j) => (j === i ? { ...t, name } : t.parent === old ? { ...t, parent: name } : t)) };
    for (const o of ops(next)) if (o.op.tags?.includes(old)) next = setOp(next, o.path, o.method, { ...o.op, tags: o.op.tags.map((t) => (t === old ? name : t)) });
    onChange(next);
  };
  return (
    <div className="max-w-2xl space-y-4">
      <h2 className="flex items-center text-base font-semibold">Groups / tags<HelpTip>Tags group related endpoints in the reference, e.g. Users, Orders, Admin. Renaming a tag here updates every endpoint that uses it.</HelpTip></h2>
      {tags.map((t, i) => (
        <div key={i} className="panel space-y-3 p-3">
          <div className="grid gap-3 sm:grid-cols-[12rem_1fr_auto_auto]">
            <Text label="Name" value={t.name} onChange={(v) => rename(i, v)} />
            <Text label="Description" value={t.description} onChange={(description) => set(i, { description })} />
            <label className="flex items-center gap-1.5 self-end pb-2 text-xs" title="Hide this group's endpoints from the public version"><input type="checkbox" checked={t["x-internal"] === true} onChange={(e) => onChange({ ...doc, tags: tags.map((x, j) => (j === i ? clean({ ...x, "x-internal": e.target.checked || undefined }) : x)) })} />Internal</label>
            <button className="self-end pb-2 text-muted hover:text-danger" aria-label={`Remove tag ${t.name}`} onClick={() => onChange({ ...doc, tags: tags.filter((_, j) => j !== i) })}><Trash2 size={15} /></button>
          </div>
          {v32 && <div className="grid gap-3 sm:grid-cols-3">
            <Text label="Short label (3.2)" value={t.summary} onChange={(summary) => set(i, { summary })} />
            <Select label="Parent group (3.2)" value={t.parent ?? ""} onChange={(parent) => set(i, { parent })} options={[["", "None"], ...tags.filter((x) => x.name !== t.name).map((x) => [x.name, x.name] as const)]} />
            <Select label="Kind (3.2)" value={t.kind ?? ""} onChange={(kind) => set(i, { kind })} options={[["", "Not set"], ["nav", "Navigation"], ["badge", "Badge"], ["audience", "Audience"]]} />
          </div>}
        </div>
      ))}
      {!v32 && tags.length > 0 && <p className="text-xs text-muted">Switch the document to OpenAPI 3.2 (top right) to nest groups under a parent.</p>}
      <button className="btn" onClick={() => onChange({ ...doc, tags: [...tags, { name: `Group ${tags.length + 1}` }] })}><Plus size={14} />Add group</button>
    </div>
  );
}
