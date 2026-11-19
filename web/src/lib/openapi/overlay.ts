/**
 * OpenAPI Overlay 1.0: repeatable changes to a description ("remove these internal endpoints",
 * "add this note"). Slyshark uses it for PUBLIC versions: endpoints and tags marked
 * `x-internal: true` are removed. Supports the JSONPath most overlays use: $, .name, ['name'],
 * [n], [*], .*, ..name and filters like [?(@.name == 'Admin')] or [?@['x-internal'] == true].
 */
import { METHODS, type OpenApiDoc } from "./types";

export type OverlayAction = { target: string; description?: string; update?: unknown; remove?: boolean };
export type OverlayDoc = { overlay: string; info: { title: string; version: string }; extends?: string; actions: OverlayAction[] };

type Hit = { parent: Record<string, unknown> | unknown[]; key: string | number };
type Seg = { kind: "key"; name: string } | { kind: "index"; i: number } | { kind: "all" } | { kind: "deep"; name: string } | { kind: "filter"; path: string[]; op: string | null; value: unknown };

function parsePath(expr: string): Seg[] {
  const s = expr.trim();
  if (!s.startsWith("$")) throw new Error(`JSONPath must start with $: ${expr}`);
  const out: Seg[] = [];
  let i = 1;
  const name = () => { const m = /^[A-Za-z0-9_$-]+/.exec(s.slice(i)); if (!m) throw new Error(`Bad JSONPath near “${s.slice(i)}”`); i += m[0].length; return m[0]; };
  while (i < s.length) {
    if (s.startsWith("..", i)) { i += 2; out.push({ kind: "deep", name: name() }); continue; }
    if (s[i] === ".") { i++; if (s[i] === "*") { i++; out.push({ kind: "all" }); } else out.push({ kind: "key", name: name() }); continue; }
    if (s[i] === "[") {
      const end = matchBracket(s, i);
      const inner = s.slice(i + 1, end).trim();
      i = end + 1;
      if (inner === "*") out.push({ kind: "all" });
      else if (/^-?\d+$/.test(inner)) out.push({ kind: "index", i: Number(inner) });
      else if (/^(['"]).*\1$/.test(inner)) out.push({ kind: "key", name: inner.slice(1, -1) });
      else if (inner.startsWith("?")) out.push(parseFilter(inner.slice(1).trim().replace(/^\((.*)\)$/, "$1")));
      else throw new Error(`Unsupported JSONPath segment [${inner}]`);
      continue;
    }
    throw new Error(`Bad JSONPath near “${s.slice(i)}”`);
  }
  return out;
}
function matchBracket(s: string, start: number) {
  let depth = 0, q: string | null = null;
  for (let j = start; j < s.length; j++) {
    const c = s[j];
    if (q) { if (c === q) q = null; continue; }
    if (c === "'" || c === '"') q = c; else if (c === "[") depth++; else if (c === "]" && --depth === 0) return j;
  }
  throw new Error("Unclosed [ in JSONPath");
}
function parseFilter(f: string): Seg {
  const m = /^@((?:\.[A-Za-z0-9_$-]+|\[['"][^'"]+['"]\])+)\s*(?:(==|!=)\s*(.+))?$/.exec(f);
  if (!m) throw new Error(`Unsupported filter ?(${f})`);
  const path = [...m[1].matchAll(/\.([A-Za-z0-9_$-]+)|\[['"]([^'"]+)['"]\]/g)].map((x) => x[1] ?? x[2]);
  let value: unknown = null;
  if (m[3] !== undefined) { const v = m[3].trim(); value = /^(['"]).*\1$/.test(v) ? v.slice(1, -1) : v === "true" ? true : v === "false" ? false : v === "null" ? null : Number(v); }
  return { kind: "filter", path, op: m[2] ?? null, value };
}

const children = (v: unknown): Hit[] => (Array.isArray(v) ? v.map((_, i) => ({ parent: v, key: i })) : v && typeof v === "object" ? Object.keys(v).map((k) => ({ parent: v as Record<string, unknown>, key: k })) : []);
const valueOf = (h: Hit) => (h.parent as Record<string | number, unknown>)[h.key];

/** Evaluates a JSONPath against `wrapper.$` (the wrapper lets "$" itself be replaced). */
export function select(wrapper: { $: unknown }, expr: string): Hit[] {
  let cur: Hit[] = [{ parent: wrapper, key: "$" }];
  for (const seg of parsePath(expr)) {
    const next: Hit[] = [];
    for (const h of cur) {
      const v = valueOf(h);
      if (seg.kind === "key") { if (v && typeof v === "object" && !Array.isArray(v) && Object.hasOwn(v, seg.name)) next.push({ parent: v as Record<string, unknown>, key: seg.name }); }
      else if (seg.kind === "index") { if (Array.isArray(v)) { const i = seg.i < 0 ? v.length + seg.i : seg.i; if (i >= 0 && i < v.length) next.push({ parent: v, key: i }); } }
      else if (seg.kind === "all") next.push(...children(v));
      else if (seg.kind === "deep") { const walk = (x: unknown, d: number) => { if (d > 40) return; for (const c of children(x)) { if (c.key === seg.name) next.push(c); walk(valueOf(c), d + 1); } }; walk(v, 0); }
      else for (const c of children(v)) {
        let x: unknown = valueOf(c);
        for (const k of seg.path) x = x && typeof x === "object" ? (x as Record<string, unknown>)[k] : undefined;
        if (seg.op === null ? x !== undefined && x !== false && x !== null : seg.op === "==" ? x === seg.value : x !== seg.value) next.push(c);
      }
    }
    cur = next;
  }
  return cur;
}

function merge(target: unknown, patch: unknown): unknown {
  if (Array.isArray(target) && Array.isArray(patch)) return [...target, ...structuredClone(patch)];
  if (target && patch && typeof target === "object" && typeof patch === "object" && !Array.isArray(target) && !Array.isArray(patch)) {
    const out: Record<string, unknown> = { ...(target as Record<string, unknown>) };
    for (const [k, v] of Object.entries(patch)) out[k] = Object.hasOwn(out, k) ? merge(out[k], v) : structuredClone(v);
    return out;
  }
  return structuredClone(patch);
}

export function isOverlay(v: unknown): v is OverlayDoc { return !!v && typeof v === "object" && typeof (v as OverlayDoc).overlay === "string" && Array.isArray((v as OverlayDoc).actions); }

export function applyOverlay(doc: OpenApiDoc, ov: OverlayDoc): { doc: OpenApiDoc; applied: number; unmatched: string[] } {
  const root = { $: structuredClone(doc) as unknown };
  let applied = 0;
  const unmatched: string[] = [];
  for (const a of ov.actions) {
    const hits = select(root, a.target);
    if (!hits.length) { unmatched.push(a.target); continue; }
    applied++;
    // Remove from the end so array indexes stay valid.
    for (const h of [...hits].reverse()) {
      if (a.remove) { if (Array.isArray(h.parent)) h.parent.splice(h.key as number, 1); else delete (h.parent as Record<string, unknown>)[h.key as string]; }
      else if (a.update !== undefined) (h.parent as Record<string | number, unknown>)[h.key] = merge(valueOf(h), a.update);
    }
  }
  return { doc: root.$ as OpenApiDoc, applied, unmatched };
}

const q = (s: string) => `'${s.replace(/'/g, "\\'")}'`;

/** Overlay that strips everything marked `x-internal: true` and labels the result as public. */
export function publicOverlay(doc: OpenApiDoc): OverlayDoc {
  const actions: OverlayAction[] = [];
  const internalTags = new Set((doc.tags ?? []).filter((t) => t["x-internal"] === true).map((t) => t.name));
  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    const methods = METHODS.filter((m) => item?.[m]);
    const internal = methods.filter((m) => item?.[m]?.["x-internal"] === true || (item?.[m]?.tags ?? []).some((t) => internalTags.has(t)));
    if (item?.["x-internal"] === true || (methods.length && internal.length === methods.length)) actions.push({ target: `$.paths[${q(path)}]`, description: `Internal path ${path}`, remove: true });
    else for (const m of internal) actions.push({ target: `$.paths[${q(path)}].${m}`, description: `Internal ${m.toUpperCase()} ${path}`, remove: true });
  }
  for (const t of doc.tags ?? []) if (t["x-internal"] === true) actions.push({ target: `$.tags[?(@.name == ${q(t.name)})]`, description: `Internal tag ${t.name}`, remove: true });
  for (const s of doc.servers ?? []) if ((s as { "x-internal"?: boolean })["x-internal"] === true) actions.push({ target: `$.servers[?(@.url == ${q(s.url)})]`, description: `Internal server ${s.url}`, remove: true });
  actions.push({ target: "$.info", description: "Mark as public version", update: { "x-audience": "public" } });
  return { overlay: "1.0.0", info: { title: `Public version of ${doc.info.title}`, version: doc.info.version }, extends: "./openapi.yaml", actions };
}

export function publicVersion(doc: OpenApiDoc): OpenApiDoc { return applyOverlay(doc, publicOverlay(doc)).doc; }
export const countInternal = (doc: OpenApiDoc) => publicOverlay(doc).actions.length - 1;
