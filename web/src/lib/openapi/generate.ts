/**
 * Drafts an OpenAPI description from what the user already did: saved API-client requests
 * (method, URL, params, headers, auth, body, last captured response) plus API/web-app URLs on
 * the canvas. Secrets are never copied: auth becomes a security scheme and sensitive values
 * are redacted. Merging into an existing document only ADDS what is missing.
 */
import type { SavedRequest } from "../project";
import type { Canvas, KeyValue } from "../types";
import { DEFAULT_VERSION, emptySpec, inferSchema, isSensitive, opKey, ops, redact, REDACTED, scalarType, setOp, suggestOpId, uniqueOpId } from "./spec";
import type { Method, OpenApiDoc, Operation, Parameter, RequestBody, ResponseObj, SecurityScheme } from "./types";

const SKIP_HEADERS = new Set(["accept", "content-type", "user-agent", "host", "content-length", "accept-encoding", "connection", "cache-control", "pragma", "origin", "referer", "authorization", "cookie"]);
const STATUS_TEXT: Record<string, string> = { "200": "OK", "201": "Created", "202": "Accepted", "204": "No content", "301": "Moved permanently", "302": "Found (redirect)", "304": "Not modified", "400": "Bad request", "401": "Not signed in", "403": "Forbidden", "404": "Not found", "409": "Conflict", "422": "Validation failed", "429": "Too many requests", "500": "Server error", "502": "Bad gateway", "503": "Unavailable" };
export const statusText = (code: string) => STATUS_TEXT[code] ?? (code === "default" ? "Any other response" : `HTTP ${code}`);

const singular = (w: string) => w.replace(/ies$/, "y").replace(/(?<=[^s])s$/, "");
const isIdLike = (seg: string) => /^\d+$/.test(seg) || /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(seg) || /^[0-9a-f]{16,}$/i.test(seg);

function substitute(s: string, vars: KeyValue[]): string {
  const map = Object.fromEntries(vars.filter((v) => v.enabled && v.key).map((v) => [v.key, v.value]));
  return s.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (m, k) => map[k] ?? m);
}

/** Splits a request URL into server origin + templated path + path parameters. */
function splitUrl(raw: string): { server: string; path: string; pathParams: Parameter[]; query: [string, string][] } | null {
  // Unresolved {{var}} placeholders in the path become {var} path parameters.
  const marked = raw.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, "__VAR_$1__");
  let u: URL;
  try { u = new URL(marked.includes("://") ? marked : `https://${marked}`); } catch { return null; }
  if (/__VAR_/.test(u.host)) return null;
  const params: Parameter[] = [];
  const segs = u.pathname.split("/").filter(Boolean).map((seg, i, all) => {
    const v = /^__VAR_([\w.-]+)__$/.exec(decodeURIComponent(seg));
    let name: string | null = v ? v[1].replace(/[^\w]/g, "_") : null;
    if (!name && isIdLike(seg)) name = i > 0 ? `${singular(all[i - 1]).replace(/[^\w]/g, "")}Id` : "id";
    if (!name) return seg;
    while (params.some((p) => p.name === name)) name += "2";
    params.push({ name, in: "path", required: true, schema: { type: /^\d+$/.test(seg) ? "integer" : "string" }, ...(v ? {} : { example: /^\d+$/.test(seg) ? Number(seg) : seg }) });
    return `{${name}}`;
  });
  return { server: u.origin, path: `/${segs.join("/")}`, pathParams: params, query: [...u.searchParams.entries()] };
}

const exampleOf = (name: string, value: string) => (isSensitive(name) ? REDACTED : scalarType(value) === "integer" ? Number(value) : scalarType(value) === "boolean" ? value.toLowerCase() === "true" : value);
const param = (name: string, where: "query" | "header", value: string): Parameter => ({ name, in: where, required: false, schema: { type: isSensitive(name) ? "string" : scalarType(value) }, ...(value ? { example: exampleOf(name, value) } : {}) });

function parseJson(s: string): { ok: true; v: unknown } | { ok: false } {
  try { return { ok: true, v: JSON.parse(s) }; } catch { return { ok: false }; }
}

export type GenerateResult = { doc: OpenApiDoc; added: string[]; skipped: string[] };
type Input = { title: string; description: string; requests: SavedRequest[]; variables: KeyValue[]; canvas: Canvas; existing?: OpenApiDoc | null; version?: string };

export function generateSpec({ title, description, requests, variables, canvas, existing, version }: Input): GenerateResult {
  let doc: OpenApiDoc = existing ? structuredClone(existing) : { ...emptySpec(`${title} API`, description), openapi: version ?? DEFAULT_VERSION };
  if (!existing) doc.info.description = `${description ? description + "\n\n" : ""}Drafted by Slyshark from ${requests.length} saved request${requests.length === 1 ? "" : "s"} on ${new Date().toISOString().slice(0, 10)}. Review each endpoint and fill in what it does.`;
  const servers = new Map((doc.servers ?? []).map((s) => [s.url.replace(/\/$/, ""), s]));
  const schemes: Record<string, SecurityScheme> = { ...(doc.components?.securitySchemes ?? {}) };
  const tags = new Map((doc.tags ?? []).map((t) => [t.name, t]));
  const existingKeys = new Set(ops(doc).map((o) => o.key));
  const added: string[] = [], skipped: string[] = [];
  const originCount = new Map<string, number>();

  const parsed: { r: SavedRequest; u: ReturnType<typeof splitUrl> }[] = requests.map((r) => ({ r, u: splitUrl(substitute(r.request.url, variables)) }));
  // A version/api prefix shared by every request to one origin (e.g. /v1) moves into the server URL.
  const byOrigin = new Map<string, string[][]>();
  for (const { u } of parsed) if (u) byOrigin.set(u.server, [...(byOrigin.get(u.server) ?? []), u.path.split("/").filter(Boolean)]);
  for (const [origin, paths] of byOrigin) {
    let n = 0;
    while (paths.every((p) => p.length > n + 1 && /^(api|rest|v\d+(\.\d+)?)$/i.test(p[n]) && p[n] === paths[0][n])) n++;
    if (!n) continue;
    const prefix = `/${paths[0].slice(0, n).join("/")}`;
    for (const x of parsed) if (x.u?.server === origin) x.u = { ...x.u, server: origin + prefix, path: x.u.path.slice(prefix.length) };
  }
  for (const { u } of parsed) if (u) originCount.set(u.server, (originCount.get(u.server) ?? 0) + 1);
  const primary = [...originCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (primary && !servers.has(primary)) servers.set(primary, { url: primary, description: "Main server (from saved requests)" });

  for (const { r, u } of parsed) {
    const req = r.request;
    const method = req.method.toLowerCase() as Method;
    if (!u) { skipped.push(`${r.name}: the URL couldn't be read`); continue; }
    if (!["get", "put", "post", "delete", "options", "head", "patch"].includes(method)) { skipped.push(`${r.name}: method ${req.method} isn't supported`); continue; }
    const key = opKey(method, u.path);
    if (existingKeys.has(key)) { skipped.push(`${key} is already documented`); continue; }
    existingKeys.add(key);

    const parameters: Parameter[] = [...u.pathParams];
    const seen = new Set(parameters.map((p) => `${p.in}:${p.name}`));
    const push = (p: Parameter) => { const k = `${p.in}:${p.name}`; if (!seen.has(k)) { seen.add(k); parameters.push(p); } };
    for (const [k, v] of u.query) push(param(k, "query", substitute(v, variables)));
    for (const p of req.params.filter((p) => p.enabled && p.key)) push(param(p.key, "query", substitute(p.value, variables)));

    // Credentials sent together form ONE requirement (all of them are needed).
    const needed: Record<string, string[]> = {};
    const addScheme = (name: string, s: SecurityScheme) => { if (!schemes[name]) schemes[name] = s; needed[name] = []; };
    for (const h of req.headers.filter((h) => h.enabled && h.key)) {
      const lk = h.key.toLowerCase();
      if (/api[-_]?key|x-auth|token/.test(lk)) addScheme(`apiKey_${h.key.replace(/[^\w]/g, "_")}`, { type: "apiKey", in: "header", name: h.key, description: "API key sent in a request header." });
      else if (!SKIP_HEADERS.has(lk)) push(param(h.key, "header", substitute(h.value, variables)));
    }
    const a = req.auth;
    if (a.type === "bearer") addScheme("bearerAuth", { type: "http", scheme: "bearer", ...(/^eyJ/.test(substitute(a.token, variables)) ? { bearerFormat: "JWT" } : {}), description: "Send the header Authorization: Bearer <token>." });
    if (a.type === "basic") addScheme("basicAuth", { type: "http", scheme: "basic", description: "Username and password (HTTP Basic)." });
    if (a.type === "apikey") addScheme(`apiKey_${a.key.replace(/[^\w]/g, "_")}`, { type: "apiKey", in: a.in_query ? "query" : "header", name: a.key, description: `API key sent as a ${a.in_query ? "query parameter" : "header"}.` });

    let requestBody: RequestBody | undefined;
    const b = req.body;
    if (b.mode === "json" && b.raw.trim()) {
      const j = parseJson(substitute(b.raw, variables));
      requestBody = { required: true, content: { "application/json": j.ok ? { schema: inferSchema(j.v), example: redact(j.v) } : { schema: { type: "object" } } } };
    } else if ((b.mode === "text" || b.mode === "xml") && b.raw.trim()) {
      requestBody = { required: true, content: { [b.mode === "xml" ? "application/xml" : "text/plain"]: { schema: { type: "string" } } } };
    } else if ((b.mode === "urlencoded" || b.mode === "form") && b.fields.length) {
      const fields = b.fields.filter((f) => f.enabled && f.key);
      requestBody = { required: true, content: { [b.mode === "form" ? "multipart/form-data" : "application/x-www-form-urlencoded"]: { schema: { type: "object", properties: Object.fromEntries(fields.map((f) => [f.key, { type: isSensitive(f.key) ? "string" : scalarType(f.value) }])) }, example: Object.fromEntries(fields.map((f) => [f.key, exampleOf(f.key, substitute(f.value, variables))])) } } };
    }

    const security = Object.keys(needed).length ? [needed] : [];
    const responses: Record<string, ResponseObj> = {};
    const s = r.sample;
    if (s) {
      const code = String(s.status);
      const ct = (s.contentType.split(";")[0] || "application/octet-stream").trim();
      const j = ct.includes("json") ? parseJson(s.body) : { ok: false as const };
      responses[code] = { description: s.statusText || statusText(code), ...(s.body ? { content: { [ct]: j.ok ? { schema: inferSchema(j.v), example: redact(j.v) } : { schema: { type: "string" } } } } : {}) };
    } else responses[method === "post" ? "201" : "200"] = { description: `${statusText(method === "post" ? "201" : "200")}. Send this request in the API client to capture a real example.` };
    if (security.length) responses["401"] = { description: "Missing or invalid credentials" };

    const tag = r.collection || "Default";
    if (!tags.has(tag)) tags.set(tag, { name: tag, description: `Requests from the “${tag}” collection` });
    const op: Operation = { operationId: uniqueOpId(doc, suggestOpId(method, u.path)), summary: r.name, tags: [tag], ...(parameters.length ? { parameters } : {}), ...(requestBody ? { requestBody } : {}), responses, ...(security.length ? { security } : {}) };
    if (primary && u.server !== primary) {
      op.servers = [{ url: u.server }];
      if (!servers.has(u.server)) servers.set(u.server, { url: u.server, description: "Other server used by some endpoints" });
    }
    doc = setOp(doc, u.path, method, op);
    added.push(key);
  }

  for (const n of canvas.nodes) {
    if (!["api", "webapp", "serverless", "loadbalancer"].includes(n.data.kind) || !n.data.url) continue;
    try { const o = new URL(n.data.url.includes("://") ? n.data.url : `https://${n.data.url}`).origin; if (!servers.has(o)) servers.set(o, { url: o, description: `${n.data.label} (from the diagram)` }); } catch { /* not a URL */ }
  }
  doc.servers = [...servers.values()];
  doc.tags = [...tags.values()];
  doc.components = { ...(doc.components ?? {}), securitySchemes: schemes };
  return { doc, added, skipped };
}
