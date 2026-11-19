/** Immutable editing helpers for AsyncAPI 3.0 documents (used by the guided events editor). */
export type Obj = Record<string, unknown>;
export const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});

/** Returns a copy with `value` set at `path` (undefined deletes; empty parents are kept). */
export function setIn(doc: Obj, path: string[], value: unknown): Obj {
  if (!path.length) return obj(value);
  const [k, ...rest] = path;
  const cur = obj(doc[k]);
  const next = { ...doc };
  const v = rest.length ? setIn(cur, rest, value) : value;
  if (v === undefined) delete next[k]; else next[k] = v;
  return next;
}
export const getIn = (doc: Obj, path: string[]): unknown => path.reduce<unknown>((x, k) => obj(x)[k], doc);

/** Rewrites every $ref equal to `from` or starting with `from/` (used when renaming keys). */
export function replaceRefs(v: unknown, from: string, to: string, depth = 0): unknown {
  if (depth > 40 || !v || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map((x) => replaceRefs(x, from, to, depth + 1));
  const out: Obj = {};
  for (const [k, x] of Object.entries(v as Obj)) {
    if (k === "$ref" && typeof x === "string" && (x === from || x.startsWith(`${from}/`))) out[k] = to + x.slice(from.length);
    else out[k] = replaceRefs(x, from, to, depth + 1);
  }
  return out;
}
/** Removes array items / map entries that $ref `prefix` (or below), e.g. after deleting a channel. */
export function dropRefs(v: unknown, prefix: string, depth = 0): unknown {
  if (depth > 40 || !v || typeof v !== "object") return v;
  const hit = (x: unknown) => { const r = obj(x).$ref; return typeof r === "string" && (r === prefix || r.startsWith(`${prefix}/`)); };
  if (Array.isArray(v)) return v.filter((x) => !hit(x)).map((x) => dropRefs(x, prefix, depth + 1));
  return Object.fromEntries(Object.entries(v as Obj).filter(([, x]) => !hit(x)).map(([k, x]) => [k, dropRefs(x, prefix, depth + 1)]));
}

const esc = (k: string) => k.replace(/~/g, "~0").replace(/\//g, "~1");
export const REF_BASE = { servers: "#/servers", channels: "#/channels", operations: "#/operations", messages: "#/components/messages", securitySchemes: "#/components/securitySchemes" } as const;
export type Section = keyof typeof REF_BASE;
export const SECTION_PATH: Record<Section, string[]> = { servers: ["servers"], channels: ["channels"], operations: ["operations"], messages: ["components", "messages"], securitySchemes: ["components", "securitySchemes"] };
export const refTo = (section: Section, key: string) => `${REF_BASE[section]}/${esc(key)}`;

export function renameKey(doc: Obj, section: Section, from: string, to: string): Obj {
  const map = obj(getIn(doc, SECTION_PATH[section]));
  if (!to || to === from || Object.hasOwn(map, to)) return doc;
  const next = Object.fromEntries(Object.entries(map).map(([k, v]) => [k === from ? to : k, v]));
  return replaceRefs(setIn(doc, SECTION_PATH[section], next), refTo(section, from), refTo(section, to)) as Obj;
}
export function removeKey(doc: Obj, section: Section, key: string): Obj {
  const map = { ...obj(getIn(doc, SECTION_PATH[section])) };
  delete map[key];
  return dropRefs(setIn(doc, SECTION_PATH[section], map), refTo(section, key)) as Obj;
}
export function uniqueKey(map: Obj, base: string) { let k = base, n = 2; while (Object.hasOwn(map, k)) k = `${base}${n++}`; return k; }
export const refKey = (v: unknown) => { const r = obj(v).$ref; return typeof r === "string" ? decodeURIComponent(r.split("/").pop()!).replace(/~1/g, "/").replace(/~0/g, "~") : ""; };
