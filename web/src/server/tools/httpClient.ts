/**
 * Postman-style HTTP client on node:http/https. Redirects are followed manually so every hop is
 * re-checked against the target policy, and each connection is pinned to the IP that passed
 * the check (custom `lookup`), which prevents DNS-rebinding into private networks.
 */
import "server-only";
import http from "node:http";
import https from "node:https";
import { randomBytes } from "node:crypto";
import zlib from "node:zlib";
import type { HttpRequestSpec, HttpResponse, KeyValue } from "@/lib/types";
import { badRequest } from "../http";
import { extractHost, resolveTarget } from "./target";

const MAX_BODY = 2 * 1024 * 1024;
const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

function encodeBody(spec: HttpRequestSpec): { body?: Buffer; type?: string } {
  const fields = (spec.body?.fields ?? []).filter((f) => f.enabled && f.key);
  switch (spec.body?.mode) {
    case "json": return { body: Buffer.from(spec.body.raw ?? ""), type: "application/json" };
    case "xml": return { body: Buffer.from(spec.body.raw ?? ""), type: "application/xml" };
    case "text": return { body: Buffer.from(spec.body.raw ?? ""), type: "text/plain" };
    case "urlencoded": return { body: Buffer.from(new URLSearchParams(fields.map((f) => [f.key, f.value])).toString()), type: "application/x-www-form-urlencoded" };
    case "form": {
      const b = `----slyshark${randomBytes(8).toString("hex")}`;
      const parts = fields.map((f) => `--${b}\r\nContent-Disposition: form-data; name="${f.key.replace(/"/g, "%22")}"\r\n\r\n${f.value}\r\n`);
      return { body: Buffer.from(parts.join("") + `--${b}--\r\n`), type: `multipart/form-data; boundary=${b}` };
    }
    default: return {};
  }
}

type Raw = { status: number; statusText: string; version: string; headers: KeyValue[]; location?: string; body: Buffer; remote: string };

function send(url: URL, method: string, headers: Record<string, string>, body: Buffer | undefined, ip: string, timeoutMs: number): Promise<Raw> {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(url, {
      method, headers, timeout: timeoutMs,
      lookup: (_h, opts, cb) => {
        const family = ip.includes(":") ? 6 : 4;
        if ((opts as { all?: boolean }).all) (cb as unknown as (e: null, a: { address: string; family: number }[]) => void)(null, [{ address: ip, family }]);
        else cb(null, ip, family);
      },
    }, (res) => {
      const chunks: Buffer[] = [];
      let size = 0;
      const enc = String(res.headers["content-encoding"] ?? "").toLowerCase();
      const stream = enc === "gzip" ? res.pipe(zlib.createGunzip()) : enc === "br" ? res.pipe(zlib.createBrotliDecompress()) : enc === "deflate" ? res.pipe(zlib.createInflate()) : res;
      stream.on("data", (c: Buffer) => { size += c.length; if (size <= MAX_BODY + 1) chunks.push(c); });
      stream.on("error", (e) => reject(badRequest(`Reading body failed: ${e.message}`)));
      stream.on("end", () => {
        const hs: KeyValue[] = [];
        for (let i = 0; i < res.rawHeaders.length; i += 2) hs.push({ key: res.rawHeaders[i].toLowerCase(), value: res.rawHeaders[i + 1], enabled: true });
        resolve({ status: res.statusCode ?? 0, statusText: res.statusMessage ?? "", version: `HTTP/${res.httpVersion}`, headers: hs, location: res.headers.location, body: Buffer.concat(chunks), remote: `${ip}:${url.port || (url.protocol === "https:" ? 443 : 80)}` });
      });
    });
    req.on("timeout", () => req.destroy(new Error("timed out")));
    req.on("error", (e: NodeJS.ErrnoException) => reject(badRequest(`Request failed: ${e.code === "ECONNREFUSED" ? "could not connect (connection refused)" : e.message}`)));
    if (body) req.write(body);
    req.end();
  });
}

export async function execute(spec: HttpRequestSpec, allowPrivate: boolean, budgetMs: number): Promise<HttpResponse> {
  const method = (spec.method ?? "GET").trim().toUpperCase();
  if (!TOKEN.test(method)) throw badRequest("Invalid HTTP method");
  let url: URL;
  try { url = new URL((spec.url ?? "").trim()); } catch { throw badRequest("Invalid URL (include http:// or https://)"); }
  if (!["http:", "https:"].includes(url.protocol)) throw badRequest("Only http and https URLs are supported");
  for (const p of (spec.params ?? []).filter((p) => p.enabled && p.key)) url.searchParams.append(p.key, p.value);
  if (spec.auth?.type === "apikey" && spec.auth.in_query && spec.auth.key) url.searchParams.append(spec.auth.key, spec.auth.value);

  const headers: Record<string, string> = { "user-agent": "Slyshark/0.1 (+api-client)", "accept-encoding": "gzip, deflate, br" };
  for (const h of (spec.headers ?? []).filter((h) => h.enabled && h.key.trim())) {
    if (!TOKEN.test(h.key.trim())) throw badRequest(`Invalid header name: ${h.key}`);
    if (/[\r\n]/.test(h.value)) throw badRequest(`Invalid header value for ${h.key}`);
    headers[h.key.trim().toLowerCase()] = h.value;
  }
  const a = spec.auth;
  if (a?.type === "bearer" && a.token.trim()) headers.authorization = `Bearer ${a.token.trim()}`;
  if (a?.type === "basic") headers.authorization = `Basic ${Buffer.from(`${a.username}:${a.password}`).toString("base64")}`;
  if (a?.type === "apikey" && !a.in_query && a.key) {
    if (!TOKEN.test(a.key)) throw badRequest("Invalid API key header name");
    headers[a.key.toLowerCase()] = a.value;
  }
  const encoded = encodeBody(spec);
  let body = encoded.body;
  const type = encoded.type;
  if (type && !headers["content-type"]) headers["content-type"] = type;

  const deadline = Date.now() + Math.min(Math.max(spec.timeout_ms ?? 30000, 1000), budgetMs);
  const started = performance.now();
  const redirects: HttpResponse["redirects"] = [];
  let current = url;
  let m = method;
  for (let hop = 0; hop < 10; hop++) {
    const host = extractHost(current.toString());
    const [ip] = await resolveTarget(host, allowPrivate);
    const left = deadline - Date.now();
    if (left <= 0) throw badRequest("Request timed out");
    const hdrs = { ...headers };
    if (body) hdrs["content-length"] = String(body.length); else delete hdrs["content-type"];
    const r = await send(current, m, hdrs, body, ip, left);
    if ((spec.follow_redirects ?? true) && r.status >= 300 && r.status < 400 && r.location) {
      redirects.push({ url: current.toString(), status: r.status, location: r.location });
      try { current = new URL(r.location, current); } catch { throw badRequest("Invalid redirect Location"); }
      if ([301, 302, 303].includes(r.status) && !["GET", "HEAD"].includes(m)) { m = "GET"; body = undefined; }
      continue;
    }
    const ctype = (r.headers.find((h) => h.key === "content-type")?.value ?? "").toLowerCase();
    const truncated = r.body.length > MAX_BODY;
    const slice = r.body.subarray(0, MAX_BODY);
    const textual = !ctype || ["text", "json", "xml", "javascript", "html", "csv", "x-www-form-urlencoded", "graphql"].some((t) => ctype.includes(t));
    let isBinary = false;
    if (!textual) { try { new TextDecoder("utf-8", { fatal: true }).decode(slice); } catch { isBinary = true; } }
    return {
      status: r.status, status_text: r.statusText, http_version: r.version, url: current.toString(), remote_addr: r.remote, headers: r.headers,
      body: isBinary ? "" : slice.toString("utf8"), body_base64: isBinary ? slice.subarray(0, 256 * 1024).toString("base64") : null,
      is_binary: isBinary, truncated, size_bytes: r.body.length, time_ms: Math.round((performance.now() - started) * 100) / 100, redirects,
    };
  }
  throw badRequest("Too many redirects (10)");
}
