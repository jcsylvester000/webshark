/**
 * Non-destructive web security audit (misconfiguration checks only, no exploit payloads):
 * security headers, cookie flags, HTTPS redirect, CORS reflection, risky methods, version
 * disclosure, and content-verified exposure of well-known sensitive files.
 * Secondary checks run concurrently inside the tool time budget.
 */
import "server-only";
import type { AuditReport, Finding, HttpRequestSpec, HttpResponse, KeyValue } from "@/lib/types";
import { execute } from "./httpClient";

const spec = (method: string, url: string, headers: KeyValue[], follow: boolean, timeout: number): HttpRequestSpec => ({
  method, url, headers, params: [], auth: { type: "none" }, body: { mode: "none", raw: "", fields: [] }, timeout_ms: timeout, follow_redirects: follow,
});
const header = (r: HttpResponse, n: string) => r.headers.find((h) => h.key.toLowerCase() === n)?.value;
const allHeaders = (r: HttpResponse, n: string) => r.headers.filter((h) => h.key.toLowerCase() === n).map((h) => h.value);
const F = (id: string, title: string, severity: Finding["severity"], detail: string, recommendation: string): Finding => ({ id, title, severity, detail, recommendation });

const PROBES: [string, Finding["severity"], (b: string) => boolean, string][] = [
  ["/.git/HEAD", "high", (b) => b.trimStart().startsWith("ref:"), "Block access to /.git; it exposes your source code"],
  ["/.env", "high", (b) => !b.includes("<html") && b.split("\n").some((l) => /^[A-Z][A-Z0-9_]*=/.test(l)), "Move .env outside the web root and block dotfiles"],
  ["/server-status", "medium", (b) => b.includes("Apache Server Status"), "Restrict mod_status to localhost"],
  ["/phpinfo.php", "medium", (b) => b.includes("phpinfo()") || b.includes("PHP Version"), "Delete phpinfo files from production"],
  ["/.DS_Store", "low", (b) => b.includes("Bud1"), "Remove .DS_Store files from deployments"],
  ["/.well-known/security.txt", "pass", (b) => b.toLowerCase().includes("contact:"), "Publish a security.txt so researchers can reach you"],
];

export async function runAudit(rawUrl: string, allowPrivate: boolean, checkFiles: boolean, budgetMs: number): Promise<AuditReport> {
  const started = Date.now();
  const url = rawUrl.includes("://") ? rawUrl : `https://${rawUrl}`;
  const main = await execute(spec("GET", url, [], true, Math.floor(budgetMs * 0.5)), allowPrivate, budgetMs);
  const f: Finding[] = [];
  const https = main.url.startsWith("https://");
  const check = (id: string, name: string, sev: Finding["severity"], rec: string, v: string | undefined) =>
    f.push(v ? F(id, `${name} present`, "pass", v.slice(0, 200), rec) : F(id, `${name} missing`, sev, `Response has no ${name} header`, rec));

  if (https) check("hsts", "Strict-Transport-Security", "medium", "Add `Strict-Transport-Security: max-age=31536000; includeSubDomains`", header(main, "strict-transport-security"));
  check("csp", "Content-Security-Policy", "medium", "Define a Content-Security-Policy to limit script sources (mitigates XSS)", header(main, "content-security-policy"));
  const csp = header(main, "content-security-policy");
  check("clickjacking", "X-Frame-Options / frame-ancestors", "low", "Send `X-Frame-Options: DENY` or CSP `frame-ancestors 'none'`", header(main, "x-frame-options") ?? (csp?.includes("frame-ancestors") ? csp : undefined));
  check("nosniff", "X-Content-Type-Options", "low", "Send `X-Content-Type-Options: nosniff`", header(main, "x-content-type-options"));
  check("referrer", "Referrer-Policy", "low", "Send `Referrer-Policy: strict-origin-when-cross-origin`", header(main, "referrer-policy"));
  check("permissions", "Permissions-Policy", "info", "Restrict browser features with Permissions-Policy", header(main, "permissions-policy"));
  if (!https) f.push(F("tls", "Site served over plain HTTP", "high", `Final URL ${main.url} is not HTTPS`, "Serve all traffic over HTTPS and redirect HTTP to HTTPS"));

  for (const [name, id] of [["server", "server-banner"], ["x-powered-by", "powered-by"], ["x-aspnet-version", "aspnet-version"]]) {
    const v = header(main, name);
    if (v) f.push(F(id, `${name} header discloses technology`, /\d/.test(v) ? "low" : "info", v, "Remove or genericize technology/version headers"));
  }
  for (const c of allHeaders(main, "set-cookie")) {
    const lc = c.toLowerCase();
    const name = c.split("=")[0];
    const missing = [https && !lc.includes("secure") && "Secure", !lc.includes("httponly") && "HttpOnly", !lc.includes("samesite") && "SameSite"].filter(Boolean);
    f.push(missing.length ? F("cookie", `Cookie \`${name}\` missing ${missing.join(", ")}`, "low", c.slice(0, 160), "Set Secure, HttpOnly and SameSite on session cookies") : F("cookie", `Cookie \`${name}\` has secure flags`, "pass", "", ""));
  }

  const remaining = Math.max(1500, budgetMs - (Date.now() - started) - 300);
  const req = (m: string, u: string, h: KeyValue[] = [], follow = false) => execute(spec(m, u, h, follow, remaining), allowPrivate, remaining).catch(() => null);
  const u = new URL(main.url);
  const base = `${u.protocol}//${u.host}`;
  const secondary = Promise.all([
    https ? req("GET", `http://${u.hostname}/`) : Promise.resolve(null),
    req("GET", main.url, [{ key: "Origin", value: "https://slyshark-cors-probe.example", enabled: true }]),
    req("OPTIONS", main.url),
    checkFiles ? Promise.all(PROBES.map(([p]) => req("GET", `${base}${p}`))) : Promise.resolve([]),
  ]);
  const timeout = new Promise<null>((res) => setTimeout(() => res(null), remaining));
  const out = await Promise.race([secondary, timeout]);
  if (!out) {
    f.push(F("budget", "Secondary checks skipped (time budget)", "info", `Limit ${budgetMs} ms`, "Re-run the audit or raise TOOL_BUDGET_MS on a host with longer timeouts"));
  } else {
    const [redir, cors, opts, files] = out;
    if (https && redir) {
      const loc = header(redir, "location") ?? "";
      f.push(redir.status >= 300 && redir.status < 400 && loc.startsWith("https://")
        ? F("https-redirect", "HTTP redirects to HTTPS", "pass", `${redir.status} -> ${loc}`, "Keep the redirect (301/308)")
        : F("https-redirect", "HTTP does not redirect to HTTPS", "medium", `http://${u.hostname}/ returned ${redir.status}`, "Redirect all HTTP requests to HTTPS with 301/308"));
    }
    if (cors) {
      const acao = header(cors, "access-control-allow-origin") ?? "";
      const creds = header(cors, "access-control-allow-credentials") === "true";
      if (acao.includes("slyshark-cors-probe")) f.push(F("cors", "CORS reflects arbitrary Origin", creds ? "high" : "medium", `ACAO: ${acao}, credentials: ${creds}`, "Allow-list trusted origins only; never reflect Origin with credentials"));
      else if (acao === "*") f.push(F("cors", "CORS allows any origin (*)", "info", "Fine for public, unauthenticated content", "Restrict origins if the endpoint returns user data"));
    }
    if (opts) {
      const allow = (header(opts, "allow") ?? header(opts, "access-control-allow-methods") ?? "").toUpperCase();
      const risky = ["TRACE", "PUT", "DELETE", "CONNECT"].filter((m) => allow.includes(m));
      if (risky.length) f.push(F("methods", `Risky methods advertised: ${risky.join(", ")}`, risky.includes("TRACE") ? "medium" : "low", `Allow: ${allow}`, "Disable TRACE and expose write methods only on authenticated API routes"));
    }
    files.forEach((r, i) => {
      const [path, sev, match, rec] = PROBES[i];
      const hit = !!r && r.status === 200 && match(r.body);
      if (path.includes("security.txt")) f.push(F("security-txt", hit ? "security.txt published" : "No security.txt", hit ? "pass" : "info", path, rec));
      else if (hit) f.push(F("exposed-file", `Sensitive file exposed: ${path}`, sev, `${base}${path} returned 200 with matching content`, rec));
    });
  }
  const weights: Record<string, number> = { high: 25, medium: 10, low: 4 };
  const penalty = f.reduce((s, x) => s + (weights[x.severity] ?? 0), 0);
  return { url, final_url: main.url, status: main.status, score: Math.max(0, 100 - penalty), findings: f };
}
