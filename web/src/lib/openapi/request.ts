/** Turns an OpenAPI operation + user inputs into an API-client request (Try it) and code samples. */
import type { HttpRequestSpec, KeyValue } from "../types";
import type { SampleInput } from "./io";
import { allParams, deref, effectiveSecurity, exampleFor } from "./spec";
import type { OpenApiDoc, OpRef, SecurityScheme, Server } from "./types";

/** `req` is the index of the chosen security requirement (-1 = send without credentials). Secrets are per scheme and never saved. */
export type TryInputs = { server: string; values: Record<string, string>; req: number; secrets: Record<string, string>; users: Record<string, string>; contentType: string | null; body: string };

export function serversFor(doc: OpenApiDoc, o: OpRef): Server[] {
  return o.op.servers?.length ? o.op.servers : o.item.servers?.length ? o.item.servers : doc.servers ?? [];
}
export const serverUrl = (s: Server) => s.url.replace(/\{([^}]+)\}/g, (m, k) => s.variables?.[k]?.default ?? m).replace(/\/$/, "");

const str = (v: unknown) => (v === undefined || v === null ? "" : typeof v === "string" ? v : JSON.stringify(v));

export function defaults(doc: OpenApiDoc, o: OpRef): TryInputs {
  const values: Record<string, string> = {};
  for (const p of allParams(doc, o)) values[`${p.in}:${p.name}`] = str(p.example ?? deref(doc, p.schema)?.example ?? (p.required ? exampleFor(doc, p.schema) : ""));
  const body = deref(doc, o.op.requestBody);
  const [ct, media] = Object.entries(body?.content ?? {})[0] ?? [null, null];
  const ex = media ? (media.example ?? Object.values(media.examples ?? {})[0]?.value ?? exampleFor(doc, media.schema)) : undefined;
  const reqs = effectiveSecurity(doc, o.op).reqs;
  const servers = serversFor(doc, o);
  return { server: servers[0] ? serverUrl(servers[0]) : "", values, req: reqs.findIndex((r) => Object.keys(r).length > 0), secrets: {}, users: {}, contentType: ct, body: ex === undefined ? "" : typeof ex === "string" ? ex : JSON.stringify(ex, null, 2) };
}

export function build(doc: OpenApiDoc, o: OpRef, t: TryInputs, opts: { placeholders: boolean }): { spec: HttpRequestSpec; sample: SampleInput; missing: string[] } {
  const params = allParams(doc, o);
  const missing: string[] = [];
  let path = o.path;
  const query: KeyValue[] = [], headers: KeyValue[] = [], cookies: string[] = [];
  for (const p of params) {
    const v = t.values[`${p.in}:${p.name}`] ?? "";
    if (!v) { if (p.required) missing.push(p.name); if (p.in !== "path") continue; }
    if (p.in === "path") path = path.replace(`{${p.name}}`, v ? encodeURIComponent(v) : `{${p.name}}`);
    if (p.in === "query") query.push({ key: p.name, value: v, enabled: true });
    if (p.in === "header") headers.push({ key: p.name, value: v, enabled: true });
    if (p.in === "cookie") cookies.push(`${p.name}=${encodeURIComponent(v)}`);
  }
  let auth: HttpRequestSpec["auth"] = { type: "none" };
  const chosen = t.req >= 0 ? Object.keys(effectiveSecurity(doc, o.op).reqs[t.req] ?? {}) : [];
  for (const name of chosen) {
    const s: SecurityScheme | undefined = doc.components?.securitySchemes?.[name];
    if (!s) continue;
    const given = t.secrets[name] ?? "";
    if (!opts.placeholders && !given) missing.push(`the ${s.type === "apiKey" ? "API key" : s.scheme === "basic" ? "password" : "token"} for ${name}`);
    const secret = opts.placeholders || !given ? `<${s.type === "apiKey" ? "api-key" : s.scheme === "basic" ? "password" : "token"}>` : given;
    const scheme = s.scheme?.toLowerCase();
    if (s.type === "http" && scheme === "basic") auth = { type: "basic", username: (!opts.placeholders && t.users[name]) || "<username>", password: secret };
    else if (s.type === "http" || s.type === "oauth2" || s.type === "openIdConnect") auth = { type: "bearer", token: secret };
    else if (s.type === "apiKey" && s.name) {
      if (s.in === "query") query.push({ key: s.name, value: secret, enabled: true });
      else if (s.in === "cookie") cookies.push(`${s.name}=${secret}`);
      else headers.push({ key: s.name, value: secret, enabled: true });
    }
  }
  if (cookies.length) headers.push({ key: "Cookie", value: cookies.join("; "), enabled: true });

  const ct = t.contentType;
  let body: HttpRequestSpec["body"] = { mode: "none", raw: "", fields: [] };
  if (ct && t.body.trim()) {
    if (ct.includes("json")) body = { mode: "json", raw: t.body, fields: [] };
    else if (ct.includes("xml")) body = { mode: "xml", raw: t.body, fields: [] };
    else if (ct.includes("urlencoded") || ct.includes("multipart")) {
      let obj: Record<string, unknown> = {};
      try { obj = JSON.parse(t.body); } catch { /* keep empty */ }
      body = { mode: ct.includes("multipart") ? "form" : "urlencoded", raw: "", fields: Object.entries(obj).map(([key, v]) => ({ key, value: str(v), enabled: true })) };
    } else body = { mode: "text", raw: t.body, fields: [] };
    if (!ct.includes("multipart")) headers.push({ key: "Content-Type", value: ct, enabled: true });
  }
  const qs = query.map((q) => `${encodeURIComponent(q.key)}=${encodeURIComponent(q.value)}`).join("&");
  const url = `${t.server}${path}`;
  const sampleHeaders: [string, string][] = [...headers.map((h) => [h.key, h.value] as [string, string])];
  if (auth.type === "bearer") sampleHeaders.unshift(["Authorization", `Bearer ${auth.token}`]);
  if (auth.type === "basic") sampleHeaders.unshift(["Authorization", `Basic <base64 of ${auth.username}:password>`]);
  const spec: HttpRequestSpec = { method: o.method.toUpperCase(), url, headers, params: query, auth, body, timeout_ms: 15000, follow_redirects: false };
  const rawBody = body.mode === "none" ? null : body.raw || (body.fields.length ? body.fields.map((f) => `${encodeURIComponent(f.key)}=${encodeURIComponent(f.value)}`).join("&") : null);
  return { spec, sample: { method: o.method, url: `${url}${qs ? `?${qs}` : ""}`, headers: sampleHeaders, body: rawBody }, missing };
}
