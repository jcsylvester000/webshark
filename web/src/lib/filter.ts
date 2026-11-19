/**
 * Wireshark-style display filter compiler (a small subset of epan/dfilter).
 * Examples: `tcp`, `dns || icmp`, `ip.addr == 10.0.0.5`, `tcp.port == 443 && !tls`,
 * `frame.len > 100`, `http.request`, `info contains "SNI"`, `tcp.flags.syn == 1`, `tcp.stream == 3`.
 */
import type { Frame } from "./types";

type Tok = { t: "id" | "op" | "val" | "lp" | "rp" | "and" | "or" | "not"; v: string };
type Pred = (f: Frame) => boolean;

function lex(src: string): Tok[] {
  const out: Tok[] = [];
  const re = /\s*(?:(\(|\))|(&&|\|\||and\b|or\b|not\b|!(?!=))|(==|!=|>=|<=|>|<|eq\b|ne\b|gt\b|lt\b|ge\b|le\b|contains\b|matches\b)|"([^"]*)"|([A-Za-z0-9_.:\-\/]+))/gy;
  let m: RegExpExecArray | null;
  let pos = 0;
  while (pos < src.length && (m = re.exec(src))) {
    if (m[0].length === 0) break;
    pos = re.lastIndex;
    if (m[1]) out.push({ t: m[1] === "(" ? "lp" : "rp", v: m[1] });
    else if (m[2]) out.push({ t: m[2] === "&&" || m[2] === "and" ? "and" : m[2] === "||" || m[2] === "or" ? "or" : "not", v: m[2] });
    else if (m[3]) out.push({ t: "op", v: m[3] });
    else if (m[4] !== undefined) out.push({ t: "val", v: m[4] });
    else if (m[5]) out.push({ t: "id", v: m[5] });
  }
  if (src.slice(pos).trim()) throw new Error(`Unexpected input near "${src.slice(pos, pos + 12)}"`);
  return out;
}

const OPS: Record<string, string> = { eq: "==", ne: "!=", gt: ">", lt: "<", ge: ">=", le: "<=" };

function field(name: string, f: Frame): (string | number | null)[] {
  const n = name.toLowerCase();
  const proto = n.split(".")[0];
  const onProto = (vals: (string | number | null)[]) => (f.stack.split(":").includes(proto) ? vals : []);
  switch (n) {
    case "ip.addr": case "ipv6.addr": case "addr": case "host": case "eth.addr": return [f.src, f.dst];
    case "ip.src": case "ipv6.src": case "eth.src": case "src": return [f.src];
    case "ip.dst": case "ipv6.dst": case "eth.dst": case "dst": return [f.dst];
    case "tcp.port": case "udp.port": return onProto([f.sport, f.dport]);
    case "port": return [f.sport, f.dport];
    case "tcp.srcport": case "udp.srcport": return onProto([f.sport]);
    case "tcp.dstport": case "udp.dstport": return onProto([f.dport]);
    case "frame.len": case "len": return [f.length];
    case "frame.number": return [f.no];
    case "frame.time_relative": return [f.time];
    case "tcp.stream": return [f.stream];
    case "info": return [f.info];
    case "protocol": case "_ws.col.protocol": return [f.protocol];
  }
  const flag = n.match(/^tcp\.flags\.(syn|ack|fin|rst|reset|push|psh|urg)$/);
  if (flag) {
    const want = { reset: "RST", push: "PSH" }[flag[1]] ?? flag[1].toUpperCase();
    return [f.flags?.split(",").includes(want) ? 1 : 0];
  }
  throw new Error(`Unknown field "${name}"`);
}

function presence(name: string): Pred {
  const n = name.toLowerCase();
  if (n === "http.request") return (f) => f.stack.includes("http") && !f.info.startsWith("HTTP/");
  if (n === "http.response") return (f) => f.stack.includes("http") && f.info.startsWith("HTTP/");
  if (n === "dns.flags.response") return (f) => f.stack.includes("dns") && f.info.includes("response");
  if (n === "tls.handshake") return (f) => f.stack.includes("tls") && /Hello|Certificate|Key Exchange/.test(f.info);
  if (n === "ip") return (f) => f.stack.split(":").includes("ip");
  if (/^[a-z0-9]+$/.test(n)) return (f) => f.stack.split(":").includes(n) || f.protocol.toLowerCase() === n;
  if (n.startsWith("tcp.flags.")) return (f) => field(n, f)[0] === 1;
  return (f) => field(n, f).some((v) => v !== null && v !== "");
}

function compare(a: string | number | null, op: string, b: string): boolean {
  if (a === null) return false;
  if (op === "contains") return String(a).toLowerCase().includes(b.toLowerCase());
  if (op === "matches") { try { return new RegExp(b, "i").test(String(a)); } catch { return false; } }
  const na = typeof a === "number" ? a : Number(a);
  const nb = Number(b);
  const numeric = !Number.isNaN(na) && !Number.isNaN(nb) && b.trim() !== "";
  const x = numeric ? na : String(a).toLowerCase();
  const y = numeric ? nb : b.toLowerCase();
  switch (op) {
    case "==": return x === y;
    case "!=": return x !== y;
    case ">": return x > y;
    case "<": return x < y;
    case ">=": return x >= y;
    case "<=": return x <= y;
  }
  return false;
}

export function compileFilter(src: string): Pred {
  if (!src.trim()) return () => true;
  const toks = lex(src);
  let i = 0;
  const peek = () => toks[i];
  const expr = (): Pred => {
    let left = term();
    while (peek()?.t === "or") { i++; const r = term(); const l = left; left = (f) => l(f) || r(f); }
    return left;
  };
  const term = (): Pred => {
    let left = unary();
    while (peek()?.t === "and") { i++; const r = unary(); const l = left; left = (f) => l(f) && r(f); }
    return left;
  };
  const unary = (): Pred => {
    if (peek()?.t === "not") { i++; const p = unary(); return (f) => !p(f); }
    if (peek()?.t === "lp") {
      i++;
      const p = expr();
      if (peek()?.t !== "rp") throw new Error("Missing closing parenthesis");
      i++;
      return p;
    }
    const id = toks[i++];
    if (!id || id.t !== "id") throw new Error("Expected a field or protocol name");
    if (peek()?.t === "op") {
      const op = OPS[toks[i].v] ?? toks[i].v;
      i++;
      const val = toks[i++];
      if (!val || (val.t !== "val" && val.t !== "id")) throw new Error(`Expected a value after ${op}`);
      field(id.v, { no: 0, time: 0, src: "", dst: "", sport: 0, dport: 0, protocol: "", length: 0, info: "", stack: id.v.split(".")[0], stream: 0, flags: "" });
      return (f) => {
        const vals = field(id.v, f);
        return op === "!=" ? vals.length > 0 && vals.every((v) => compare(v, "!=", val.v)) : vals.some((v) => compare(v, op, val.v));
      };
    }
    return presence(id.v);
  };
  const p = expr();
  if (i < toks.length) throw new Error(`Unexpected "${toks[i].v}"`);
  return p;
}

/** Wireshark-like default colouring rules (classes defined per theme in globals.css). */
export function rowColor(f: Frame): string {
  if (f.flags?.includes("RST")) return "pk-rst";
  if (f.flags?.includes("SYN") || f.flags?.includes("FIN")) return "pk-syn";
  const s = f.stack;
  if (s.includes("http")) return "pk-http";
  if (s.includes("tls")) return "pk-tls";
  if (s.includes("dns")) return "pk-dns";
  if (s.includes("arp")) return "pk-arp";
  if (s.includes("icmp")) return "pk-icmp";
  if (s.includes("udp")) return "pk-udp";
  if (s.includes("tcp")) return "pk-tcp";
  return "pk-other";
}
