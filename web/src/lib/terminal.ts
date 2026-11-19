/**
 * Slyshark console command engine. Commands are parsed in the browser and executed by
 * the Rust API (no shell access on the server). Output is a list of styled lines.
 */
import { api, errMsg } from "./api";
import { scanPorts } from "./scan";
import type { AuditReport, HttpResponse, HttpRequestSpec, PingResponse, ScanResponse } from "./types";

export type Line = { text: string; tone?: "ok" | "err" | "warn" | "dim" | "accent" | "cmd" };
export type TermContext = {
  nodes?: { id: string; label: string; target: string | null }[];
  onScan?: (target: string, res: ScanResponse) => void;
  onPing?: (target: string, res: PingResponse) => void;
  /** Records a tool result in the project's working state (saved with the project). */
  onResult?: (r: { tool: "ping" | "dns" | "portscan" | "http" | "audit"; target: string; ok: boolean; summary: string }) => void;
};

export function tokenize(input: string): string[] {
  const out: string[] = [];
  const re = /"((?:\\.|[^"\\])*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) out.push(m[1] !== undefined ? m[1].replace(/\\"/g, '"') : m[2] ?? m[3]);
  return out;
}

const HELP: Line[] = [
  { text: "Slyshark console — commands run through the Slyshark API", tone: "accent" },
  { text: "  ping <host> [-c 4] [-p 443]           TCP-connect ping (ICMP is not available on serverless hosts)" },
  { text: "  tcping <host> <port> [-c 4]           TCP connect latency to a port" },
  { text: "  scan <host> [ports] -y                Port scan. ports: common | web | db | well-known | 22,80,443 | 8000-8100" },
  { text: "  dns <host>  (alias nslookup, dig)     A, AAAA, CNAME, MX, NS, TXT records" },
  { text: "  curl [-X M] [-H 'k: v'] [-d body] [--bearer T] [-u user:pass] [-i] [-I] <url>" },
  { text: "  headers <url>                         Show response headers" },
  { text: "  audit <url> -y                        Security header / misconfiguration audit" },
  { text: "  nodes                                 List nodes on the current canvas" },
  { text: "  history | clear | whoami | date | echo <text> | help" },
  { text: "  -y confirms you own the target or have permission to test it.", tone: "dim" },
];

function flag(args: string[], name: string, fallback?: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1) return fallback;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
}
function bool(args: string[], ...names: string[]): boolean {
  let found = false;
  for (const n of names) {
    const i = args.indexOf(n);
    if (i !== -1) { args.splice(i, 1); found = true; }
  }
  return found;
}

function resolveTarget(raw: string, ctx: TermContext): string {
  const hit = ctx.nodes?.find((n) => n.label.toLowerCase() === raw.toLowerCase() || n.id === raw);
  return hit?.target ?? raw;
}

export async function runCommand(input: string, ctx: TermContext, history: string[]): Promise<Line[] | "clear"> {
  const args = tokenize(input.trim());
  const cmd = (args.shift() ?? "").toLowerCase();
  try {
    switch (cmd) {
      case "": return [];
      case "help": case "?": return HELP;
      case "clear": case "cls": return "clear";
      case "date": return [{ text: new Date().toString() }];
      case "echo": return [{ text: args.join(" ") }];
      case "history": return history.map((h, i) => ({ text: `${String(i + 1).padStart(4)}  ${h}` }));
      case "whoami": {
        const me = await api<{ username: string; email: string; role: string }>("/auth/me");
        return [{ text: `${me.username} <${me.email}> role=${me.role}` }];
      }
      case "nodes": {
        if (!ctx.nodes?.length) return [{ text: "No canvas nodes in this console context.", tone: "dim" }];
        return ctx.nodes.map((n) => ({ text: `  ${n.label.padEnd(28)} ${n.target ?? "(no host)"}` }));
      }
      case "ping": case "tcping": {
        const count = Number(flag(args, "-c", flag(args, "-n", "4")));
        let port = flag(args, "-p");
        bool(args, "--tcp", "-T");
        const host = args[0] ? resolveTarget(args[0], ctx) : "";
        if (!host) return [{ text: `usage: ${cmd} <host>${cmd === "tcping" ? " <port>" : ""}`, tone: "err" }];
        if (cmd === "tcping") port = args[1] ?? port ?? "443";
        const r = await api<PingResponse>("/tools/ping", { method: "POST", json: { host, count, port: port ? Number(port) : undefined } });
        ctx.onPing?.(host, r);
        ctx.onResult?.({ tool: "ping", target: host, ok: r.received > 0, summary: `${r.received}/${r.sent} replies, avg ${r.avg_ms ?? "-"} ms (TCP ${r.port})` });
        const out: Line[] = [{ text: `PING ${r.host} (${r.address}) via ${r.mode.toUpperCase()}${r.port ? ` port ${r.port}` : ""}`, tone: "accent" }];
        for (const a of r.attempts) {
          out.push(a.ok ? { text: `  seq=${a.seq} reply from ${r.address}${r.port ? `:${r.port}` : ""} time=${a.rtt_ms} ms${a.error ? ` (${a.error})` : ""}`, tone: "ok" } : { text: `  seq=${a.seq} ${a.error ?? "no reply"}`, tone: "err" });
        }
        out.push({ text: `--- ${r.sent} sent, ${r.received} received, ${r.loss_pct}% loss${r.avg_ms != null ? `, rtt min/avg/max = ${r.min_ms}/${r.avg_ms}/${r.max_ms} ms` : ""}`, tone: r.received ? "ok" : "err" });
        return out;
      }
      case "scan": case "nmap": case "portscan": {
        const yes = bool(args, "-y", "--yes", "--authorized");
        const host = args[0] ? resolveTarget(args[0], ctx) : "";
        if (!host) return [{ text: "usage: scan <host> [ports] -y", tone: "err" }];
        if (!yes) return [{ text: "Add -y to confirm you own this host or have written permission to scan it.", tone: "warn" }];
        const r: ScanResponse = await scanPorts(host, args[1] ?? "common");
        ctx.onScan?.(host, r);
        ctx.onResult?.({ tool: "portscan", target: host, ok: true, summary: `${r.scanned} scanned, open: ${r.open.map((p) => p.port).join(", ") || "none"}` });
        const out: Line[] = [{ text: `Scanned ${r.scanned} ports on ${r.target} (${r.address}) in ${r.duration_ms} ms`, tone: "accent" }, { text: "PORT      STATE  SERVICE               BANNER", tone: "dim" }];
        for (const p of r.open) {
          out.push({ text: `${`${p.port}/tcp`.padEnd(9)} open   ${p.service.padEnd(21)} ${p.banner ?? ""}`, tone: "ok" });
          if (p.note) out.push({ text: `          ⚠ ${p.note}`, tone: "warn" });
        }
        out.push({ text: `${r.open.length} open, ${r.closed_count} closed, ${r.filtered_count} filtered`, tone: "dim" });
        return out;
      }
      case "dns": case "nslookup": case "dig": case "host": {
        if (!args[0]) return [{ text: "usage: dns <host>", tone: "err" }];
        const r = await api<{ host: string; a: string[]; aaaa: string[]; cname: string[]; mx: string[]; ns: string[]; txt: string[]; time_ms: number }>("/tools/dns", { method: "POST", json: { host: resolveTarget(args[0], ctx) } });
        const rec = (t: string, vals: string[]) => vals.map((v) => ({ text: `  ${t.padEnd(6)}${v}` }));
        ctx.onResult?.({ tool: "dns", target: r.host, ok: r.a.length + r.aaaa.length > 0, summary: [...r.a, ...r.aaaa].join(", ") || "no A/AAAA" });
        return [{ text: `${r.host} (${r.time_ms} ms)`, tone: "accent" }, ...rec("CNAME", r.cname), ...rec("A", r.a), ...rec("AAAA", r.aaaa), ...rec("MX", r.mx), ...rec("NS", r.ns), ...rec("TXT", r.txt)];
      }
      case "curl": case "http": case "headers": {
        const method = (flag(args, "-X") ?? (bool(args, "-I", "--head") ? "HEAD" : undefined))?.toUpperCase();
        const headers: { key: string; value: string; enabled: boolean }[] = [];
        let h: string | undefined;
        while ((h = flag(args, "-H"))) { const [k, ...v] = h.split(":"); headers.push({ key: k.trim(), value: v.join(":").trim(), enabled: true }); }
        const data = flag(args, "-d") ?? flag(args, "--data");
        const bearer = flag(args, "--bearer");
        const user = flag(args, "-u");
        const showHeaders = bool(args, "-i") || cmd === "headers";
        const url = args.find((a) => /^https?:\/\//.test(a)) ?? (args[0] ? `https://${args[0]}` : "");
        if (!url) return [{ text: "usage: curl [options] <url>", tone: "err" }];
        const spec: HttpRequestSpec = {
          method: method ?? (data ? "POST" : "GET"), url, headers, params: [],
          auth: bearer ? { type: "bearer", token: bearer } : user ? { type: "basic", username: user.split(":")[0], password: user.split(":").slice(1).join(":") } : { type: "none" },
          body: data ? { mode: data.trim().startsWith("{") ? "json" : "text", raw: data, fields: [] } : { mode: "none", raw: "", fields: [] },
          timeout_ms: 30000, follow_redirects: true,
        };
        const r = await api<HttpResponse>("/tools/http", { method: "POST", json: spec });
        ctx.onResult?.({ tool: "http", target: `${spec.method} ${url}`, ok: r.status < 400, summary: `${r.status} ${r.status_text} in ${r.time_ms} ms` });
        const out: Line[] = [{ text: `${r.http_version} ${r.status} ${r.status_text}  (${r.time_ms} ms, ${r.size_bytes} B, ${r.remote_addr})`, tone: r.status < 400 ? "ok" : "err" }];
        for (const hop of r.redirects) out.push({ text: `  ↪ ${hop.status} ${hop.url} → ${hop.location}`, tone: "dim" });
        if (showHeaders || spec.method === "HEAD") for (const hh of r.headers) out.push({ text: `${hh.key}: ${hh.value}`, tone: "dim" });
        if (cmd !== "headers" && spec.method !== "HEAD") {
          const body = r.is_binary ? `[binary body, ${r.size_bytes} bytes]` : r.body;
          body.split("\n").slice(0, 200).forEach((l) => out.push({ text: l }));
          if (r.truncated || body.split("\n").length > 200) out.push({ text: "… output truncated", tone: "dim" });
        }
        return out;
      }
      case "audit": {
        const yes = bool(args, "-y", "--yes");
        if (!args[0]) return [{ text: "usage: audit <url> -y", tone: "err" }];
        if (!yes) return [{ text: "Add -y to confirm you own this site or have permission to test it.", tone: "warn" }];
        const r = await api<AuditReport>("/tools/audit", { method: "POST", json: { url: resolveTarget(args[0], ctx), authorized: true } });
        ctx.onResult?.({ tool: "audit", target: r.final_url, ok: r.score >= 70, summary: `score ${r.score}/100` });
        const tone = (s: string): Line["tone"] => (s === "pass" ? "ok" : s === "high" || s === "medium" ? "err" : s === "low" ? "warn" : "dim");
        return [{ text: `Audit ${r.final_url} — HTTP ${r.status} — score ${r.score}/100`, tone: "accent" }, ...r.findings.map((f) => ({ text: `  [${f.severity.toUpperCase().padEnd(6)}] ${f.title}`, tone: tone(f.severity) }))];
      }
      default:
        return [{ text: `${cmd}: command not found. Type "help".`, tone: "err" }];
    }
  } catch (e) {
    return [{ text: `error: ${errMsg(e)}`, tone: "err" }];
  }
}
