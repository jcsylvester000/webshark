/**
 * Checks an OpenAPI description against the parts of the specification that matter most and
 * explains each problem in plain language. Errors break tools; warnings are likely mistakes;
 * tips make the documentation more useful.
 */
import { allParams, is32, ops, resolveRef, templateParams } from "./spec";
import { METHODS, type Issue, type OpenApiDoc } from "./types";

const STATUS = /^([1-5](\d\d|XX)|default)$/;
const PARAM_IN: string[] = ["query", "header", "path", "cookie"];
const SCHEME_TYPES = ["http", "apiKey", "oauth2", "openIdConnect", "mutualTLS"];

export function validate(raw: unknown): Issue[] {
  const out: Issue[] = [];
  const add = (level: Issue["level"], where: string, message: string, key?: string) => out.push({ level, where, message, key });
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [{ level: "error", where: "document", message: "The document must be an object (a YAML mapping or JSON object)." }];
  const doc = raw as OpenApiDoc & { swagger?: string };
  if (doc.swagger) { add("error", "swagger", `This is a Swagger ${doc.swagger} document. Use “Convert to OpenAPI 3.1” above (or Import the file) and Slyshark converts it for you.`); return out; }
  if (typeof doc.openapi !== "string" || !/^3\.[012]\.\d+$/.test(doc.openapi)) add("error", "openapi", "Set `openapi` to a version such as 3.1.0 (or 3.2.0) so tools know how to read the document.");
  const v32 = typeof doc.openapi === "string" && is32(doc);
  const v30 = typeof doc.openapi === "string" && /^3\.0\./.test(doc.openapi);
  if (!doc.info || typeof doc.info !== "object") add("error", "info", "The `info` section is required (title and version).");
  else {
    if (!doc.info.title?.toString().trim()) add("error", "info.title", "Give the API a title.");
    if (!doc.info.version?.toString().trim()) add("error", "info.version", "Give the API a version, such as 1.0.0 (this is your API's version, not the OpenAPI version).");
    if (!doc.info.description) add("tip", "info.description", "Add a short description: what the API is for and who uses it.");
  }
  if (!doc.paths || typeof doc.paths !== "object") { if (v30) add("error", "paths", "OpenAPI 3.0 requires a `paths` section."); }

  if (!doc.servers?.length) add("tip", "servers", "Add at least one server URL so readers (and Try it) know where the API lives.");
  for (const [i, s] of (doc.servers ?? []).entries()) {
    if (!s?.url) add("error", `servers[${i}]`, "Each server needs a `url`.");
    else if (/^http:\/\//.test(s.url) && !/localhost|127\.0\.0\.1/.test(s.url)) add("warning", `servers[${i}]`, `${s.url} uses plain HTTP: traffic, tokens and passwords travel unencrypted. Document an HTTPS URL if one exists.`);
  }

  const schemes = doc.components?.securitySchemes ?? {};
  for (const [name, s] of Object.entries(schemes)) {
    const where = `components.securitySchemes.${name}`;
    if (!s || !SCHEME_TYPES.includes(s.type)) { add("error", where, `Security scheme “${name}” needs a type: http, apiKey, oauth2, openIdConnect or mutualTLS.`); continue; }
    if (s.type === "http" && !s.scheme) add("error", where, `“${name}” is an http scheme: set \`scheme\` to bearer or basic.`);
    if (s.type === "apiKey" && (!s.name || !["query", "header", "cookie"].includes(s.in ?? ""))) add("error", where, `“${name}” is an API key: set \`name\` (the header or parameter name) and \`in\` (header, query or cookie).`);
    if (s.type === "apiKey" && s.in === "query") add("warning", where, `“${name}” sends the key in the URL, where it ends up in logs and browser history. A header is safer.`);
    if (s.type === "http" && s.scheme?.toLowerCase() === "basic") add("tip", where, `“${name}” uses Basic auth: make sure every server is HTTPS, because the password is only Base64-encoded.`);
    if (s.type === "oauth2" && !s.flows) add("error", where, `“${name}” is OAuth 2.0: describe at least one flow (authorizationCode, clientCredentials…).`);
    if (s.type === "openIdConnect" && !s.openIdConnectUrl) add("error", where, `“${name}” needs an \`openIdConnectUrl\`.`);
  }
  const checkReqs = (reqs: unknown, where: string, key?: string) => {
    if (!Array.isArray(reqs)) return;
    for (const r of reqs) for (const n of Object.keys(r ?? {})) if (!Object.hasOwn(schemes, n)) add("error", where, `Security refers to “${n}”, which isn't defined under Authentication (components.securitySchemes).`, key);
  };
  checkReqs(doc.security, "security");

  for (const [i, t] of (doc.tags ?? []).entries()) {
    if (!t?.name) add("error", `tags[${i}]`, "Each tag needs a name.");
    if (!v32 && (t?.parent || t?.kind || t?.summary)) add("warning", `tags.${t?.name ?? i}`, `Tag “${t?.name}” uses parent/kind/summary, which are OpenAPI 3.2 fields. Switch the document to 3.2 or remove them.`);
  }

  const opIds = new Map<string, string>();
  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    if (!path.startsWith("/")) add("error", `paths.${path}`, `Path “${path}” must start with “/”.`);
    if (/\?/.test(path)) add("error", `paths.${path}`, `Path “${path}” contains “?”. Put query strings in parameters (in: query) instead.`);
    if (!item || typeof item !== "object") continue;
    if (Object.hasOwn(item, "query") && !v32) add("error", `paths.${path}`, `The QUERY method needs OpenAPI 3.2. Switch the version or change the method.`, `QUERY ${path}`);
    for (const k of Object.keys(item)) if (!METHODS.includes(k as never) && !["summary", "description", "parameters", "servers", "$ref", "additionalOperations"].includes(k) && !k.startsWith("x-")) add("warning", `paths.${path}.${k}`, `“${k}” isn't an HTTP method OpenAPI recognises, so tools will ignore it.`);
  }
  const list = ops(doc);
  for (const o of list) {
    const where = o.key;
    const { op } = o;
    if (op.operationId) {
      if (opIds.has(op.operationId)) add("error", where, `operationId “${op.operationId}” is also used by ${opIds.get(op.operationId)}. Each must be unique.`, o.key);
      opIds.set(op.operationId, o.key);
    }
    if (!op.summary) add("tip", where, "Add a one-line summary so the endpoint is easy to find.", o.key);
    const params = allParams(doc, o);
    for (const p of [...(o.item.parameters ?? []), ...(op.parameters ?? [])]) {
      if (p.$ref && !resolveRef(doc, p.$ref)) continue; // reported by the $ref pass
      const r = p.$ref ? resolveRef<typeof p>(doc, p.$ref)! : p;
      if (!r.name || !PARAM_IN.includes(r.in)) add("error", where, "Every parameter needs a name and where it goes (in: query, header, path or cookie).", o.key);
      if (r.in === "path" && r.required !== true) add("error", where, `Path parameter “${r.name}” must be marked required.`, o.key);
      if (r.in === "header" && ["accept", "content-type", "authorization"].includes(String(r.name).toLowerCase())) add("warning", where, `Header “${r.name}” is described elsewhere in OpenAPI (media types or security) and is ignored as a parameter.`, o.key);
      if (r.name && isNamedSecret(r.name) && r.in !== "path") add("tip", where, `“${r.name}” looks like a credential. Describe it under Authentication instead, so readers know it's a secret.`, o.key);
    }
    for (const t of templateParams(o.path)) if (!params.some((p) => p.in === "path" && p.name === t)) add("error", where, `The path has {${t}} but no matching path parameter is described.`, o.key);
    for (const p of params) if (p.in === "path" && !templateParams(o.path).includes(p.name)) add("error", where, `Path parameter “${p.name}” isn't in the path. Add {${p.name}} to the path or remove the parameter.`, o.key);
    const responses = op.responses ?? {};
    if (!Object.keys(responses).length) add(v30 ? "error" : "warning", where, "Describe at least one response (for example 200 with what comes back).", o.key);
    for (const [code, r] of Object.entries(responses)) {
      if (!STATUS.test(code)) add("error", where, `“${code}” isn't a valid response code. Use a status such as 200, a range such as 4XX, or default.`, o.key);
      if (!r?.$ref && !r?.description && !v32) add("error", where, `Response ${code} needs a description.`, o.key);
    }
    if (["get", "head", "delete"].includes(o.method) && op.requestBody) add("warning", where, `${o.method.toUpperCase()} requests with a body are ignored by many servers and proxies.`, o.key);
    checkReqs(op.security, where, o.key);
  }

  // Every local $ref must point at something.
  const walk = (v: unknown, path: string, depth: number) => {
    if (depth > 40 || !v || typeof v !== "object") return;
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}[${i}]`, depth + 1)); return; }
    const ref = (v as { $ref?: unknown }).$ref;
    if (typeof ref === "string") {
      if (!ref.startsWith("#")) add("warning", path, `External reference “${ref}” isn't loaded by Slyshark, so it can't be checked or shown.`);
      else if (resolveRef(doc, ref) === undefined) add("error", path, `Reference “${ref}” points at nothing. Check the spelling or add the missing component.`);
    }
    for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k, depth + 1);
  };
  walk(doc, "", 0);
  if (list.length === 0) add("tip", "paths", "No endpoints yet. Add one, or generate a draft from your API client requests.");
  return out;
}
const isNamedSecret = (n: string) => /^(x-)?(api[-_]?key|token|access[-_]?token|secret)$/i.test(n);

export function summarize(issues: Issue[]) {
  return { errors: issues.filter((i) => i.level === "error").length, warnings: issues.filter((i) => i.level === "warning").length, tips: issues.filter((i) => i.level === "tip").length };
}
