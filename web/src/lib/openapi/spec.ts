/** Helpers for reading and immutably editing an OpenAPI document. */
import { METHODS, type Method, type OpenApiDoc, type Operation, type OpRef, type Parameter, type PathItem, type Schema, type SecurityRequirement, type SecurityScheme } from "./types";

export const DEFAULT_VERSION = "3.1.0";
export const VERSIONS = [{ value: "3.1.0", label: "OpenAPI 3.1" }, { value: "3.2.0", label: "OpenAPI 3.2 (newer)" }] as const;
export const is32 = (doc: OpenApiDoc) => /^3\.2\./.test(doc.openapi);
export const methodsFor = (doc: OpenApiDoc): Method[] => METHODS.filter((m) => m !== "query" || is32(doc));

export function emptySpec(title = "My API", description = ""): OpenApiDoc {
  return { openapi: DEFAULT_VERSION, info: { title, version: "1.0.0", ...(description ? { description } : {}) }, servers: [], tags: [], paths: {}, components: { schemas: {}, securitySchemes: {} } };
}

export const opKey = (method: string, path: string) => `${method.toUpperCase()} ${path}`;

/** All operations in document order. */
export function ops(doc: OpenApiDoc | null): OpRef[] {
  const out: OpRef[] = [];
  for (const [path, item] of Object.entries(doc?.paths ?? {})) {
    if (!item || typeof item !== "object") continue;
    for (const m of METHODS) { const op = item[m]; if (op && typeof op === "object") out.push({ path, method: m, op, item, key: opKey(m, path) }); }
  }
  return out;
}

/** Groups operations by their first tag (untagged last), following the document's tag order. */
export function groupByTag(doc: OpenApiDoc, list = ops(doc)): [string, OpRef[]][] {
  const order = (doc.tags ?? []).map((t) => t.name);
  const m = new Map<string, OpRef[]>();
  for (const name of order) m.set(name, []);
  for (const o of list) { const t = o.op.tags?.[0] ?? "Other endpoints"; m.set(t, [...(m.get(t) ?? []), o]); }
  return [...m.entries()].filter(([, v]) => v.length);
}

/** Resolves a local `#/…` reference; returns undefined for external or broken references. */
export function resolveRef<T = unknown>(doc: OpenApiDoc, ref: string): T | undefined {
  if (!ref.startsWith("#/")) return undefined;
  let cur: unknown = doc;
  for (const raw of ref.slice(2).split("/")) {
    const part = decodeURIComponent(raw).replace(/~1/g, "/").replace(/~0/g, "~");
    if (!cur || typeof cur !== "object" || !Object.hasOwn(cur, part)) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur as T;
}
export function deref<T extends { $ref?: string }>(doc: OpenApiDoc, v: T | undefined, depth = 0): T | undefined {
  if (!v?.$ref || depth > 8) return v;
  return deref(doc, resolveRef<T>(doc, v.$ref), depth + 1);
}

/** Path-level + operation-level parameters (operation wins on name+in), with $refs resolved. */
export function allParams(doc: OpenApiDoc, o: OpRef): Parameter[] {
  const m = new Map<string, Parameter>();
  for (const p of [...(o.item.parameters ?? []), ...(o.op.parameters ?? [])]) { const r = deref(doc, p); if (r?.name) m.set(`${r.in}:${r.name}`, r); }
  return [...m.values()];
}

export const templateParams = (path: string) => [...path.matchAll(/\{([^}/]+)\}/g)].map((x) => x[1]);

/** Security that applies to an operation: its own list, else the document default. */
export function effectiveSecurity(doc: OpenApiDoc, op: Operation): { reqs: SecurityRequirement[]; source: "operation" | "document" | "none" } {
  if (op.security) return { reqs: op.security, source: "operation" };
  if (doc.security?.length) return { reqs: doc.security, source: "document" };
  return { reqs: [], source: "none" };
}

export function schemeLabel(s: SecurityScheme | undefined): string {
  if (!s) return "Unknown scheme";
  if (s.type === "http") return s.scheme?.toLowerCase() === "bearer" ? `Bearer token${s.bearerFormat ? ` (${s.bearerFormat})` : ""}` : s.scheme?.toLowerCase() === "basic" ? "Basic auth (username + password)" : `HTTP ${s.scheme ?? ""}`;
  if (s.type === "apiKey") return `API key in ${s.in ?? "header"} "${s.name ?? ""}"`;
  if (s.type === "oauth2") return "OAuth 2.0";
  if (s.type === "openIdConnect") return "OpenID Connect";
  return "Mutual TLS (client certificate)";
}

// ---- immutable edits ----------------------------------------------------------------------
export function setOp(doc: OpenApiDoc, path: string, method: Method, op: Operation | null): OpenApiDoc {
  const paths = { ...(doc.paths ?? {}) };
  const item: PathItem = { ...(paths[path] ?? {}) };
  if (op) item[method] = op; else delete item[method];
  if (METHODS.some((m) => item[m])) paths[path] = item; else delete paths[path];
  return { ...doc, paths };
}
export function moveOp(doc: OpenApiDoc, from: { path: string; method: Method }, to: { path: string; method: Method }): OpenApiDoc {
  const op = doc.paths?.[from.path]?.[from.method];
  if (!op || (from.path === to.path && from.method === to.method)) return doc;
  return setOp(setOp(doc, from.path, from.method, null), to.path, to.method, op);
}
export function uniqueOpId(doc: OpenApiDoc, base: string, except?: string): string {
  const used = new Set(ops(doc).map((o) => o.op.operationId).filter((x) => x && x !== except));
  let id = base || "operation", n = 2;
  while (used.has(id)) id = `${base}${n++}`;
  return id;
}
export function suggestOpId(method: string, path: string): string {
  const words = path.split("/").filter(Boolean).map((s) => s.startsWith("{") ? `by ${s.slice(1, -1)}` : s).join(" ").split(/[^a-zA-Z0-9]+/).filter(Boolean);
  return method.toLowerCase() + words.map((w) => w[0].toUpperCase() + w.slice(1)).join("");
}

// ---- examples → schemas -------------------------------------------------------------------
const SENSITIVE = /pass(word)?|secret|token|api[-_]?key|auth|session|cookie|credential|private|ssn|card|cvv|otp|pin$/i;
export const isSensitive = (name: string) => SENSITIVE.test(name);
export const REDACTED = "<redacted>";

/** Copies an example with values under sensitive-looking keys replaced, so secrets never reach docs. */
export function redact(v: unknown, depth = 0): unknown {
  if (depth > 12) return null;
  if (Array.isArray(v)) return v.slice(0, 5).map((x) => redact(x, depth + 1));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).slice(0, 60).map(([k, x]) => [k, isSensitive(k) && (typeof x === "string" || typeof x === "number") ? REDACTED : redact(x, depth + 1)]));
  if (typeof v === "string" && /^eyJ[\w-]+\.[\w-]+\.[\w-]*$/.test(v)) return REDACTED; // looks like a JWT
  return v;
}

export function inferSchema(v: unknown, depth = 0): Schema {
  if (depth > 6) return {};
  if (v === null) return { type: "null" };
  if (Array.isArray(v)) return { type: "array", items: v.length ? inferSchema(v[0], depth + 1) : {} };
  if (typeof v === "object") {
    const entries = Object.entries(v as object).slice(0, 60);
    return { type: "object", properties: Object.fromEntries(entries.map(([k, x]) => [k, inferSchema(x, depth + 1)])) };
  }
  if (typeof v === "number") return { type: Number.isInteger(v) ? "integer" : "number" };
  if (typeof v === "boolean") return { type: "boolean" };
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return { type: "string", format: "date-time" };
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return { type: "string", format: "date" };
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return { type: "string", format: "email" };
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return { type: "string", format: "uuid" };
  if (/^https?:\/\//.test(s)) return { type: "string", format: "uri" };
  return { type: "string" };
}
export function scalarType(value: string): string {
  if (/^-?\d+$/.test(value)) return "integer";
  if (/^-?\d+\.\d+$/.test(value)) return "number";
  if (/^(true|false)$/i.test(value)) return "boolean";
  return "string";
}
export const typeText = (s: Schema | undefined): string => !s ? "any" : s.$ref ? s.$ref.split("/").pop()! : Array.isArray(s.type) ? s.type.join(" | ") : s.type === "array" ? `array of ${typeText(s.items)}` : `${s.type ?? (s.properties ? "object" : "any")}${s.format ? ` (${s.format})` : ""}`;

/** Builds an example value from a schema (used by Try-it and code samples). */
export function exampleFor(doc: OpenApiDoc, s: Schema | undefined, depth = 0): unknown {
  const r = deref(doc, s);
  if (!r || depth > 6) return null;
  if (r.example !== undefined) return r.example;
  if (r.examples?.length) return r.examples[0];
  if (r.default !== undefined) return r.default;
  if (r.enum?.length) return r.enum[0];
  if (r.allOf?.length) return Object.assign({}, ...r.allOf.map((x) => exampleFor(doc, x, depth + 1) ?? {}));
  if (r.oneOf?.length || r.anyOf?.length) return exampleFor(doc, (r.oneOf ?? r.anyOf)![0], depth + 1);
  const t = Array.isArray(r.type) ? r.type.find((x) => x !== "null") : r.type;
  if (t === "object" || r.properties) return Object.fromEntries(Object.entries(r.properties ?? {}).map(([k, x]) => [k, exampleFor(doc, x, depth + 1)]));
  if (t === "array") return [exampleFor(doc, r.items, depth + 1)];
  if (t === "integer" || t === "number") return 0;
  if (t === "boolean") return true;
  if (r.format === "date-time") return new Date(0).toISOString();
  if (r.format === "email") return "user@example.com";
  if (r.format === "uuid") return "00000000-0000-0000-0000-000000000000";
  return "string";
}

/** Tag groups in tree order (OpenAPI 3.2 `parent`), with depth, display label and kind. */
export type TagNode = { name: string; label: string; depth: number; kind?: string; description?: string; ops: OpRef[] };
export function tagTree(doc: OpenApiDoc, list = ops(doc)): TagNode[] {
  const groups = new Map(groupByTag(doc, list));
  const tags = doc.tags ?? [];
  const known = new Set(tags.map((t) => t.name));
  const kids = (parent: string | undefined) => tags.filter((t) => (parent ? t.parent === parent : !t.parent || !known.has(t.parent)));
  const out: TagNode[] = [];
  const hasOps = (name: string, d = 0): boolean => (groups.get(name)?.length ?? 0) > 0 || (d < 8 && kids(name).some((k) => hasOps(k.name, d + 1)));
  const walk = (parent: string | undefined, depth: number, seen: Set<string>) => {
    for (const t of kids(parent)) {
      if (seen.has(t.name) || depth > 6 || !hasOps(t.name)) continue;
      seen.add(t.name);
      out.push({ name: t.name, label: t.summary || t.name, depth, kind: t.kind, description: t.description, ops: groups.get(t.name) ?? [] });
      walk(t.name, depth + 1, seen);
    }
  };
  walk(undefined, 0, new Set());
  for (const [name, o] of groups) if (!out.some((x) => x.name === name)) out.push({ name, label: name, depth: 0, ops: o });
  return out;
}
