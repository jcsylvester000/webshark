/**
 * Converts a Swagger 2.0 description to OpenAPI 3.1. Covers what real-world 2.0 files use:
 * host/basePath/schemes → servers; body and formData parameters → requestBody (consumes);
 * response schemas/examples/headers → content (produces); definitions/parameters/responses/
 * securityDefinitions → components; $ref rewriting; x-nullable, type: file, discriminator and
 * collectionFormat. Returns notes describing anything the user should double-check.
 */
import { METHODS, type OpenApiDoc, type Operation, type Parameter, type PathItem, type RequestBody, type ResponseObj, type Schema, type SecurityScheme } from "./types";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const SCHEMA_KEYS = ["type", "format", "items", "enum", "default", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "minLength", "maxLength", "pattern", "minItems", "maxItems", "uniqueItems", "multipleOf"];

export const isSwagger2 = (v: unknown) => obj(v).swagger === "2.0";

export function convertSwagger2(raw: unknown): { doc: OpenApiDoc; notes: string[] } {
  const s = obj(raw);
  const notes: string[] = [];
  const bodyParamNames = new Set(Object.entries(obj(s.parameters)).filter(([, p]) => ["body", "formData"].includes(String(obj(p).in))).map(([k]) => k));

  // ---- $ref + schema rewriting (deep) ----
  const ref = (r: string) => r.replace(/^#\/definitions\//, "#/components/schemas/").replace(/^#\/responses\//, "#/components/responses/")
    .replace(/^#\/parameters\/(.+)$/, (_m, n) => (bodyParamNames.has(decodeURIComponent(n)) ? `#/components/requestBodies/${n}` : `#/components/parameters/${n}`));
  const schema = (v: unknown, depth = 0): Schema => {
    if (depth > 40 || !v || typeof v !== "object") return v as Schema;
    if (Array.isArray(v)) return v.map((x) => schema(x, depth + 1)) as unknown as Schema;
    const out: Obj = {};
    for (const [k, x] of Object.entries(v as Obj)) {
      if (k === "$ref" && typeof x === "string") out.$ref = ref(x);
      else if (k === "x-nullable") continue;
      else if (k === "discriminator" && typeof x === "string") out.discriminator = { propertyName: x };
      else if (["properties", "definitions", "patternProperties"].includes(k)) out[k] = Object.fromEntries(Object.entries(obj(x)).map(([p, y]) => [p, schema(y, depth + 1)]));
      else if (typeof x === "object" && x !== null) out[k] = schema(x, depth + 1);
      else out[k] = x;
    }
    if (out.type === "file") { out.type = "string"; out.format = "binary"; }
    if ((v as Obj)["x-nullable"] === true && typeof out.type === "string") out.type = [out.type, "null"];
    return out as Schema;
  };
  const paramSchema = (p: Obj): Schema => {
    const sc: Obj = {};
    for (const k of SCHEMA_KEYS) if (p[k] !== undefined) sc[k] = k === "items" ? schema(p[k]) : p[k];
    if (sc.type === "file") { sc.type = "string"; sc.format = "binary"; }
    return schema(sc);
  };

  // ---- parameters / bodies ----
  const globalConsumes = arr(s.consumes).map(String);
  const globalProduces = arr(s.produces).map(String);
  const convParam = (p: Obj): Parameter => {
    if (typeof p.$ref === "string") return { $ref: ref(p.$ref) } as Parameter;
    const out: Obj = { name: p.name, in: p.in, ...(p.description ? { description: p.description } : {}), ...(p.required ? { required: true } : {}), schema: paramSchema(p) };
    const cf = String(p.collectionFormat ?? "");
    if (p.type === "array" && cf) {
      if (cf === "multi") { out.style = "form"; out.explode = true; }
      else if (cf === "csv") { out.style = p.in === "query" ? "form" : "simple"; out.explode = false; }
      else if (cf === "ssv") out.style = "spaceDelimited";
      else if (cf === "pipes") out.style = "pipeDelimited";
      else notes.push(`Parameter “${p.name}” used collectionFormat ${cf}, which has no OpenAPI 3 equivalent.`);
    }
    if (p["x-example"] !== undefined) out.example = p["x-example"];
    for (const [k, v] of Object.entries(p)) if (k.startsWith("x-") && k !== "x-example") out[k] = v;
    return out as Parameter;
  };
  const bodyFrom = (params: Obj[], consumes: string[], where: string): RequestBody | undefined => {
    const body = params.find((p) => p.in === "body");
    const form = params.filter((p) => p.in === "formData");
    if (body) {
      const types = consumes.length ? consumes : ["application/json"];
      return { ...(body.description ? { description: String(body.description) } : {}), ...(body.required ? { required: true } : {}), content: Object.fromEntries(types.map((t) => [t, { schema: schema(body.schema) }])) };
    }
    if (form.length) {
      const hasFile = form.some((p) => p.type === "file");
      const types = consumes.filter((t) => /form/.test(t));
      const ct = types.length ? types : [hasFile ? "multipart/form-data" : "application/x-www-form-urlencoded"];
      if (hasFile) notes.push(`${where}: file upload converted to multipart/form-data with format: binary.`);
      const sc: Schema = { type: "object", properties: Object.fromEntries(form.map((p) => [String(p.name), { ...paramSchema(p), ...(p.description ? { description: String(p.description) } : {}) }])), ...(form.some((p) => p.required) ? { required: form.filter((p) => p.required).map((p) => String(p.name)) } : {}) };
      return { required: form.some((p) => p.required), content: Object.fromEntries(ct.map((t) => [t, { schema: sc }])) };
    }
    return undefined;
  };
  const response = (r: Obj, produces: string[]): ResponseObj => {
    if (typeof r.$ref === "string") return { $ref: ref(r.$ref) };
    const out: ResponseObj = { description: String(r.description ?? "") };
    const ex = obj(r.examples);
    const types = produces.length ? produces : Object.keys(ex).length ? Object.keys(ex) : ["application/json"];
    if (r.schema) out.content = Object.fromEntries(types.map((t) => [t, { schema: schema(r.schema), ...(ex[t] !== undefined ? { example: ex[t] } : {}) }]));
    else if (Object.keys(ex).length) out.content = Object.fromEntries(Object.entries(ex).map(([t, e]) => [t, { example: e }]));
    if (r.headers) out.headers = Object.fromEntries(Object.entries(obj(r.headers)).map(([h, v]) => [h, { ...(obj(v).description ? { description: obj(v).description } : {}), schema: paramSchema(obj(v)) }]));
    return out;
  };

  // ---- document ----
  const host = typeof s.host === "string" ? s.host : "";
  const basePath = typeof s.basePath === "string" ? s.basePath.replace(/\/$/, "") : "";
  const schemes = arr(s.schemes).map(String).filter(Boolean);
  const servers = host ? (schemes.length ? schemes : ["https"]).map((sc) => ({ url: `${sc}://${host}${basePath}` })) : basePath ? [{ url: basePath }] : [];
  if (!host) notes.push("No host was set, so servers is relative (or empty). Add your server URL in Edit → Servers.");
  if (!schemes.length && host) notes.push("No schemes were listed; https was assumed.");

  const paths: Record<string, PathItem> = {};
  for (const [p, rawItem] of Object.entries(obj(s.paths))) {
    const item = obj(rawItem);
    const out: PathItem = {};
    if (typeof item.$ref === "string") { notes.push(`Path ${p} uses an external path $ref; check it after import.`); out.$ref = item.$ref; }
    const shared = arr(item.parameters).map(obj);
    const sharedNonBody = shared.filter((x) => !["body", "formData"].includes(String(x.in)));
    if (sharedNonBody.length) out.parameters = sharedNonBody.map(convParam);
    for (const m of METHODS) {
      const op = obj(item[m]);
      if (!Object.keys(op).length) continue;
      const params = [...shared.filter((x) => ["body", "formData"].includes(String(x.in))), ...arr(op.parameters).map(obj)];
      const refBody = params.find((x) => typeof x.$ref === "string" && bodyParamNames.has(decodeURIComponent(String(x.$ref).split("/").pop()!)));
      const plain = params.filter((x) => x !== refBody && !["body", "formData"].includes(String(x.in)));
      const consumes = arr(op.consumes).map(String).length ? arr(op.consumes).map(String) : globalConsumes;
      const produces = arr(op.produces).map(String).length ? arr(op.produces).map(String) : globalProduces;
      const o: Operation = {};
      for (const [k, v] of Object.entries(op)) {
        if (["parameters", "responses", "consumes", "produces", "schemes"].includes(k)) continue;
        o[k] = v;
      }
      if (plain.length) o.parameters = plain.map(convParam);
      const rb = refBody ? ({ $ref: ref(String(refBody.$ref)) } as RequestBody) : bodyFrom(params, consumes, `${m.toUpperCase()} ${p}`);
      if (rb) o.requestBody = rb;
      o.responses = Object.fromEntries(Object.entries(obj(op.responses)).map(([c, r]) => [c, response(obj(r), produces)]));
      if (arr(op.schemes).length) notes.push(`${m.toUpperCase()} ${p} had its own schemes; OpenAPI 3 uses servers instead, so check the server list.`);
      out[m] = o;
    }
    for (const [k, v] of Object.entries(item)) if (k.startsWith("x-")) out[k] = v;
    paths[p] = out;
  }

  const securitySchemes: Record<string, SecurityScheme> = {};
  for (const [n, d] of Object.entries(obj(s.securityDefinitions))) {
    const x = obj(d);
    const desc = x.description ? { description: String(x.description) } : {};
    if (x.type === "basic") securitySchemes[n] = { type: "http", scheme: "basic", ...desc };
    else if (x.type === "apiKey") securitySchemes[n] = { type: "apiKey", name: String(x.name ?? ""), in: (x.in as "header") ?? "header", ...desc };
    else if (x.type === "oauth2") {
      const flow = { implicit: "implicit", password: "password", application: "clientCredentials", accessCode: "authorizationCode" }[String(x.flow)] ?? "clientCredentials";
      securitySchemes[n] = { type: "oauth2", flows: { [flow]: { ...(x.authorizationUrl ? { authorizationUrl: String(x.authorizationUrl) } : {}), ...(x.tokenUrl ? { tokenUrl: String(x.tokenUrl) } : {}), scopes: obj(x.scopes) as Record<string, string> } }, ...desc };
    }
  }

  const components: OpenApiDoc["components"] = {
    schemas: Object.fromEntries(Object.entries(obj(s.definitions)).map(([k, v]) => [k, schema(v)])),
    ...(Object.keys(securitySchemes).length ? { securitySchemes } : {}),
  };
  const params = Object.entries(obj(s.parameters));
  const nonBody = params.filter(([k]) => !bodyParamNames.has(k));
  if (nonBody.length) components.parameters = Object.fromEntries(nonBody.map(([k, v]) => [k, convParam(obj(v))]));
  const bodies = params.filter(([k]) => bodyParamNames.has(k));
  if (bodies.length) components.requestBodies = Object.fromEntries(bodies.map(([k, v]) => [k, bodyFrom([obj(v)], globalConsumes, `Shared parameter ${k}`)!]));
  if (s.responses) components.responses = Object.fromEntries(Object.entries(obj(s.responses)).map(([k, v]) => [k, response(obj(v), globalProduces)]));

  const doc: OpenApiDoc = { openapi: "3.1.0", info: { ...(obj(s.info) as OpenApiDoc["info"]), title: String(obj(s.info).title ?? "Untitled API"), version: String(obj(s.info).version ?? "1.0.0") }, ...(servers.length ? { servers } : {}), ...(s.tags ? { tags: s.tags as OpenApiDoc["tags"] } : {}), paths, components, ...(s.security ? { security: s.security as OpenApiDoc["security"] } : {}), ...(s.externalDocs ? { externalDocs: s.externalDocs } : {}) };
  for (const [k, v] of Object.entries(s)) if (k.startsWith("x-")) doc[k] = v;
  return { doc, notes: [...new Set(notes)] };
}
