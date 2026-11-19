/**
 * OWASP API Security Top 10 (2023) checks for an OpenAPI description. The rules follow the ideas of
 * the Spectral OWASP ruleset, reimplemented here so they run in the browser with plain-language
 * explanations. They check what the DOCUMENT says; they can't prove what the live API does.
 */
import { allParams, deref, effectiveSecurity, ops } from "../openapi/spec";
import type { OpenApiDoc, Schema } from "../openapi/types";
import type { SecFinding, Severity } from "./types";

const WRITE = new Set(["post", "put", "patch", "delete"]);
const SECRET_PARAM = /^(x-)?(api[-_]?key|apikey|key|token|access[-_]?token|auth|password|passwd|secret|session(id)?|jwt)$/i;
const URL_PARAM = /(^|_|-)(url|uri|link|callback|webhook|redirect|return[-_]?to|next|dest(ination)?|target|image[-_]?url|feed)$/i;
const ADMIN_PATH = /\/(admin|internal|manage(ment)?|debug|actuator|system|ops|config|settings|users\/\{[^}]+\}\/roles)(\/|$)/i;
const RATE_HEADERS = ["x-ratelimit-limit", "x-rate-limit-limit", "ratelimit-limit", "ratelimit", "ratelimit-policy", "retry-after"];

type Add = (rule: string, owasp: string, severity: Severity, title: string, location: string, detail: string, fix: string) => void;

/** Walks a schema (resolving local $refs, guarding cycles) and reports weak constraints. */
function weakSpots(doc: OpenApiDoc, root: Schema | undefined) {
  const out = { strings: [] as string[], arrays: [] as string[], integers: [] as string[], openObjects: [] as string[] };
  const seen = new Set<unknown>();
  const visit = (s: Schema | undefined, path: string, depth: number) => {
    const r = deref(doc, s);
    if (!r || depth > 8 || seen.has(r)) return;
    seen.add(r);
    const t = Array.isArray(r.type) ? r.type.find((x) => x !== "null") : r.type;
    if (t === "string" && r.maxLength === undefined && !r.enum && r.const === undefined && !r.format && !r.pattern) out.strings.push(path || "(value)");
    if (t === "array") { if (r.maxItems === undefined) out.arrays.push(path || "(list)"); visit(r.items, `${path}[]`, depth + 1); }
    if ((t === "integer" || t === "number") && (r.maximum === undefined && r.exclusiveMaximum === undefined)) out.integers.push(path || "(number)");
    if ((t === "object" || r.properties) && r.additionalProperties === undefined && r.unevaluatedProperties === undefined && r.properties) out.openObjects.push(path || "(object)");
    for (const [k, p] of Object.entries(r.properties ?? {})) visit(p, path ? `${path}.${k}` : k, depth + 1);
    for (const x of [...(r.allOf ?? []), ...(r.oneOf ?? []), ...(r.anyOf ?? [])]) visit(x, path, depth + 1);
  };
  visit(root, "", 0);
  return out;
}
const few = (xs: string[]) => xs.slice(0, 4).join(", ") + (xs.length > 4 ? ` and ${xs.length - 4} more` : "");

export function owaspCheck(doc: OpenApiDoc): SecFinding[] {
  const out: SecFinding[] = [];
  const add: Add = (rule, owasp, severity, title, location, detail, fix) => out.push({ key: `${rule}|${location}`, rule, owasp, severity, title, location, detail, fix, source: "api" });
  const schemes = doc.components?.securitySchemes ?? {};
  const list = ops(doc);

  // ---- API2: authentication ----
  for (const [n, s] of Object.entries(schemes)) {
    if (s.type === "http" && s.scheme?.toLowerCase() === "basic") add("no-http-basic", "API2:2023", "medium", "Basic auth sends a reusable password on every request", `Auth: ${n}`, "With Basic auth, every request carries the user's password (only Base64-encoded). One leaked log line exposes it.", "Prefer short-lived tokens (OAuth 2.0 / OpenID Connect or signed session tokens); if Basic must stay, require HTTPS everywhere and rotate credentials.");
    if (s.type === "http" && ["negotiate", "oauth", "digest"].includes(s.scheme?.toLowerCase() ?? "")) add("auth-insecure-scheme", "API2:2023", "medium", `“${s.scheme}” is an outdated HTTP auth scheme`, `Auth: ${n}`, "Digest, Negotiate and OAuth 1 schemes have known weaknesses and poor tooling support.", "Move to bearer tokens issued by OAuth 2.0 / OpenID Connect.");
    if (s.type === "apiKey" && (s.in === "query")) add("no-api-key-in-url", "API2:2023", "high", "API key is sent in the URL", `Auth: ${n}`, "URLs are stored in server logs, proxy logs, browser history and Referer headers, so the key leaks easily.", "Send the key in a header (e.g. X-API-Key) instead of the query string.");
    if (s.type === "http" && s.scheme?.toLowerCase() === "bearer" && /jwt/i.test(s.bearerFormat ?? "") && !/8725|algorithm|alg|expir|exp\b/i.test(s.description ?? "")) add("jwt-best-practices", "API2:2023", "low", "JWT rules aren't documented", `Auth: ${n}`, "JWTs are safe only when the server pins the signing algorithm, checks expiry, issuer and audience (RFC 8725).", "Describe how tokens are validated (algorithm, lifetime, audience) in the scheme's description.");
  }
  for (const o of list) {
    const sec = effectiveSecurity(doc, o.op);
    const isPublic = sec.source !== "none" && (!sec.reqs.length || sec.reqs.some((r) => !Object.keys(r).length));
    const none = sec.source === "none";
    if (WRITE.has(o.method) && (none || isPublic)) add("protection-unsafe", "API2:2023", "high", `${o.method.toUpperCase()} endpoint has no authentication${none ? " documented" : ""}`, o.key, `${none ? "No authentication is described for this endpoint." : "This endpoint is marked public."} It changes data, so anyone who can reach it could create, change or delete records.`, none ? "Choose the authentication it needs in Edit → endpoint → Authentication, or mark it Public on purpose." : "Require authentication, or document why it is safe to be public (e.g. sign-up) and how abuse is limited.");
    else if (none && Object.keys(schemes).length) add("protection-unstated", "API2:2023", "low", "Authentication isn't stated for this endpoint", o.key, "Other endpoints require authentication, but this one says nothing. Readers can't tell whether it's public or forgotten.", "Pick its authentication, or mark it Public: no authentication.");
    for (const p of allParams(doc, o)) {
      if (SECRET_PARAM.test(p.name) && (p.in === "query" || p.in === "path")) add("no-credentials-in-url", "API2:2023", "high", `Credential “${p.name}” travels in the URL`, o.key, "Values in the path or query string end up in logs and browser history.", "Move it to a header or the request body, and describe it under Authentication.");
    }
    // ---- API1: object level authorization ----
    for (const p of allParams(doc, o).filter((p) => p.in === "path")) {
      const t = deref(doc, p.schema)?.type;
      if (t === "integer" || t === "number") add("no-numeric-ids", "API1:2023", "low", `Guessable numeric ID {${p.name}}`, o.key, "Sequential numbers let a caller try 1, 2, 3… to reach other people's records. The server must check ownership on every request (the #1 API risk).", "Check that the caller owns the object on every request; prefer random IDs (UUID) so they can't be guessed.");
    }
    // ---- API5: function level authorization ----
    if (ADMIN_PATH.test(o.path) && (none || isPublic)) add("admin-unprotected", "API5:2023", "high", "Admin-style endpoint without authentication", o.key, "The path looks like an administrative or internal function, but no authentication is documented.", "Require authentication and a role/scope check (e.g. OAuth scope admin:write), and document it.");
    if (ADMIN_PATH.test(o.path) && !none && !isPublic && sec.reqs.every((r) => Object.values(r).every((scopes) => !scopes.length))) add("admin-no-scope", "API5:2023", "low", "Admin endpoint doesn't say which role or scope is needed", o.key, "Any signed-in user may be able to call it if roles aren't enforced.", "Document the required role or OAuth scope in the description or security requirement.");
    // ---- API7: SSRF ----
    for (const p of allParams(doc, o)) if (URL_PARAM.test(p.name) || deref(doc, p.schema)?.format === "uri") add("ssrf-url-param", "API7:2023", "medium", `“${p.name}” takes a URL`, o.key, "If the server fetches this URL, an attacker can point it at internal services (cloud metadata, databases).", "Allow only known hosts/schemes, block private and link-local addresses, and document the rule.");
    const body = deref(doc, o.op.requestBody);
    for (const [, m] of Object.entries(body?.content ?? {})) {
      const urlProps = Object.entries(deref(doc, m.schema)?.properties ?? {}).filter(([k, s]) => URL_PARAM.test(k) || deref(doc, s)?.format === "uri").map(([k]) => k);
      if (urlProps.length) add("ssrf-url-body", "API7:2023", "medium", `Body field${urlProps.length > 1 ? "s" : ""} ${urlProps.join(", ")} take a URL`, o.key, "Fields that hold URLs are a common Server-Side Request Forgery entry point.", "Validate against an allow-list and block internal addresses before fetching.");
      // ---- API3 / API4 on the request body ----
      const w = weakSpots(doc, m.schema);
      if (w.openObjects.length) add("no-additional-properties", "API3:2023", "low", "Request body accepts extra fields", o.key, `Objects (${few(w.openObjects)}) don't set additionalProperties: false, so callers may send fields like "role" or "isAdmin" (mass assignment).`, "Set additionalProperties: false on request objects and list exactly the fields a caller may set.");
      if (w.strings.length) add("string-limit", "API4:2023", "low", "Text fields have no length limit", o.key, `${few(w.strings)} accept any length, which allows very large payloads.`, "Add maxLength (or an enum/format/pattern) to each text field.");
      if (w.arrays.length) add("array-limit", "API4:2023", "low", "Lists have no size limit", o.key, `${few(w.arrays)} accept any number of items.`, "Add maxItems to each array.");
    }
    // ---- API4: rate limiting ----
    const resp = o.op.responses ?? {};
    if (!resp["429"] && !resp["4XX"]) add("rate-limit-429", "API4:2023", "info", "No 429 Too Many Requests response", o.key, "Callers aren't told what happens when they exceed a rate limit.", "Document a 429 response (and ideally a Retry-After header).");
    const ok = Object.entries(resp).filter(([c]) => c.startsWith("2")).map(([, r]) => deref(doc, r));
    if (ok.length && !ok.some((r) => Object.keys(r?.headers ?? {}).some((h) => RATE_HEADERS.includes(h.toLowerCase())))) add("rate-limit-headers", "API4:2023", "info", "Rate-limit headers aren't documented", o.key, "Without RateLimit headers, clients can't slow down before they're blocked.", "Document RateLimit-Limit / RateLimit-Remaining (or X-RateLimit-*) headers on successful responses.");
    for (const p of allParams(doc, o)) {
      const s = deref(doc, p.schema);
      if (p.in === "query" && /^(limit|page[-_]?size|per[-_]?page|size|count|top|take)$/i.test(p.name) && s?.maximum === undefined) add("pagination-limit", "API4:2023", "medium", `“${p.name}” has no maximum`, o.key, "A caller can ask for millions of records in one request.", "Set a maximum (e.g. 100) on paging parameters.");
    }
    // ---- API8: misconfiguration / error handling ----
    if (!none && !isPublic && !resp["401"] && !resp["4XX"] && !resp.default) add("define-401", "API8:2023", "low", "No 401 response for a protected endpoint", o.key, "Readers don't know what a missing or expired credential returns.", "Document a 401 Unauthorized response.");
    if ((o.op.requestBody || allParams(doc, o).length) && !resp["400"] && !resp["422"] && !resp["4XX"] && !resp.default) add("define-validation-error", "API8:2023", "info", "No validation error response", o.key, "Inputs can be wrong, but no 400/422 response is documented.", "Document a 400 or 422 response with the error format.");
  }
  // ---- API8 / API9: servers and inventory ----
  for (const s of doc.servers ?? []) {
    if (/^http:\/\//.test(s.url) && !/localhost|127\.0\.0\.1/.test(s.url)) add("no-server-http", "API8:2023", "high", "Server uses plain HTTP", `Server: ${s.url}`, "Tokens, passwords and data travel unencrypted and can be read or changed on the network.", "Serve the API over HTTPS only and redirect HTTP.");
    if (!s.description) add("inventory-environment", "API9:2023", "info", "Server environment isn't labelled", `Server: ${s.url}`, "Unlabelled servers make it hard to know which environment (production, staging, test) is exposed.", "Describe each server, e.g. “Production” or “Staging (internal)”.");
  }
  if (!doc.servers?.length) add("inventory-servers", "API9:2023", "low", "No servers listed", "Document", "An API inventory should say where each version runs.", "Add the server URLs for every environment.");
  const deprecated = list.filter((o) => o.op.deprecated);
  if (deprecated.length) add("inventory-deprecated", "API9:2023", "info", `${deprecated.length} deprecated endpoint${deprecated.length === 1 ? "" : "s"} still documented`, "Document", "Old endpoints often miss newer security fixes and are forgotten in reviews.", "Set a removal date in each description and remove them when it passes.");
  if (!/^\d+\.\d+/.test(doc.info?.version ?? "")) add("inventory-version", "API9:2023", "info", "API version isn't a clear number", "Document", "A clear version (e.g. 1.4.0) helps track which release is deployed where.", "Use semantic versioning in info.version.");
  if (!doc.info?.contact?.email && !doc.info?.contact?.url) add("inventory-contact", "API9:2023", "info", "No security contact", "Document", "Researchers and consumers need a way to report problems.", "Add a contact email or URL (Overview → Contact).");
  return collapse(out);
}

/** Endpoint-level low/info findings that repeat on many endpoints become one summary finding. */
function collapse(list: SecFinding[]): SecFinding[] {
  const groups = new Map<string, SecFinding[]>();
  for (const f of list) groups.set(f.rule, [...(groups.get(f.rule) ?? []), f]);
  return [...groups.values()].flatMap((g) => {
    if (g.length <= 3 || !["low", "info"].includes(g[0].severity) || g[0].location === "Document") return g;
    const f = g[0];
    return [{ ...f, key: `${f.rule}|*`, title: `${f.title} (${g.length} endpoints)`, location: `${g.length} endpoints`, detail: `${f.detail} Affects: ${g.map((x) => x.location).slice(0, 8).join(", ")}${g.length > 8 ? ` and ${g.length - 8} more` : ""}.` }];
  });
}
