/**
 * Protocol dissectors — Slyshark's take on Wireshark's `epan/dissectors/`. Each layer adds a
 * tree node with byte offsets so the hex pane can highlight the bytes of the hovered field.
 */
import type { Frame, TreeNode } from "../types";
import type { RawPacket } from "./reader";

type Ctx = { s: Frame; stack: string[]; tree: TreeNode[] };
const node = (label: string, start: number, len: number, children: TreeNode[] = []): TreeNode => ({ label, start, len, children });
const leaf = (label: string, start: number, len: number) => node(label, start, len);
const be16 = (d: Uint8Array, o: number) => (d[o] << 8) | d[o + 1];
const be32 = (d: Uint8Array, o: number) => ((d[o] << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3]) >>> 0;
const has = (d: Uint8Array, o: number, n: number) => o >= 0 && o + n <= d.length;
const mac = (d: Uint8Array, o: number) => Array.from(d.subarray(o, o + 6), (x) => x.toString(16).padStart(2, "0")).join(":");
const ip4 = (d: Uint8Array, o: number) => `${d[o]}.${d[o + 1]}.${d[o + 2]}.${d[o + 3]}`;
function ip6(d: Uint8Array, o: number): string {
  const g = Array.from({ length: 8 }, (_, i) => be16(d, o + i * 2).toString(16));
  let best = [-1, 0], cur = [-1, 0];
  g.forEach((x, i) => { if (x === "0") { if (cur[0] < 0) cur = [i, 0]; cur[1]++; if (cur[1] > best[1]) best = [...cur]; } else cur = [-1, 0]; });
  if (best[1] < 2) return g.join(":");
  return `${g.slice(0, best[0]).join(":")}::${g.slice(best[0] + best[1]).join(":")}`;
}
const text = (d: Uint8Array) => new TextDecoder("utf-8", { fatal: false }).decode(d);
const firstLine = (d: Uint8Array) => text(d.subarray(0, 300)).split(/\r?\n/)[0].slice(0, 120);
const proto = (c: Ctx, name: string, display: string) => { c.stack.push(name); c.s.protocol = display; };

export const LINKTYPES: Record<number, string> = { 0: "Null/Loopback", 1: "Ethernet", 12: "Raw IP", 14: "Raw IP", 101: "Raw IP", 113: "Linux cooked", 228: "Raw IPv4", 229: "Raw IPv6", 105: "802.11", 127: "802.11 radiotap" };
const ETHERTYPES: Record<number, string> = { 0x0800: "IPv4", 0x86dd: "IPv6", 0x0806: "ARP", 0x8100: "802.1Q", 0x88cc: "LLDP", 0x888e: "EAPOL" };
export const IPPROTO: Record<number, string> = { 1: "ICMP", 2: "IGMP", 6: "TCP", 17: "UDP", 41: "IPv6", 47: "GRE", 50: "ESP", 58: "ICMPv6", 89: "OSPF", 132: "SCTP" };
const RR: Record<number, string> = { 1: "A", 2: "NS", 5: "CNAME", 6: "SOA", 12: "PTR", 15: "MX", 16: "TXT", 28: "AAAA", 33: "SRV", 65: "HTTPS", 255: "ANY" };
const rr = (t: number) => RR[t] ?? `TYPE${t}`;

export class Dissector {
  private streams = new Map<string, number>();
  private isn = new Map<string, number>();
  private next = 0;

  dissect(no: number, p: RawPacket, rel: number): { frame: Frame; tree: TreeNode[] } {
    const d = p.data;
    const c: Ctx = { s: { no, time: Math.round(rel * 1e6) / 1e6, src: "", dst: "", sport: null, dport: null, protocol: "", length: p.origLen, info: "", stack: "", stream: null, flags: null }, stack: ["frame"], tree: [] };
    c.tree.push(node(`Frame ${no}: ${p.origLen} bytes on wire, ${d.length} bytes captured`, 0, d.length, [
      leaf(`Arrival time (epoch): ${p.ts.toFixed(6)}`, 0, 0), leaf(`Time since first frame: ${rel.toFixed(6)} s`, 0, 0), leaf(`Link type: ${p.linktype} (${LINKTYPES[p.linktype] ?? "Other"})`, 0, 0),
    ]));
    switch (p.linktype) {
      case 1: this.ethernet(c, d, 0); break;
      case 113: if (has(d, 0, 16)) { const t = be16(d, 14); c.tree.push(node(`Linux cooked capture v1, Protocol: 0x${t.toString(16).padStart(4, "0")}`, 0, 16)); proto(c, "sll", "SLL"); this.ethertype(c, d, 16, t); } break;
      case 0: if (has(d, 0, 4)) { const fam = d[0] | (d[1] << 8); c.tree.push(node(`Null/Loopback, Family: ${fam}`, 0, 4)); if (fam === 2) this.ipv4(c, d, 4); else this.ipv6(c, d, 4); } break;
      case 12: case 14: case 101: case 228: case 229: if (d[0] >> 4 === 4) this.ipv4(c, d, 0); else if (d[0] >> 4 === 6) this.ipv6(c, d, 0); else proto(c, "data", "RAW"); break;
      default: proto(c, "data", "UNKNOWN");
    }
    if (!c.s.info) c.s.info = `${d.length} bytes`;
    c.s.stack = c.stack.join(":");
    return { frame: c.s, tree: c.tree };
  }

  private ethernet(c: Ctx, d: Uint8Array, o: number) {
    proto(c, "eth", "Ethernet");
    if (!has(d, o, 14)) return;
    const t = be16(d, o + 12);
    c.tree.push(node(`Ethernet II, Src: ${mac(d, o + 6)}, Dst: ${mac(d, o)}`, o, 14, [leaf(`Destination: ${mac(d, o)}`, o, 6), leaf(`Source: ${mac(d, o + 6)}`, o + 6, 6), leaf(`Type: ${ETHERTYPES[t] ?? "Unknown"} (0x${t.toString(16).padStart(4, "0")})`, o + 12, 2)]));
    c.s.src = mac(d, o + 6);
    c.s.dst = mac(d, o);
    this.ethertype(c, d, o + 14, t);
  }

  private ethertype(c: Ctx, d: Uint8Array, o: number, t: number): void {
    if (t === 0x0800) return this.ipv4(c, d, o);
    if (t === 0x86dd) return this.ipv6(c, d, o);
    if (t === 0x0806) return this.arp(c, d, o);
    if ((t === 0x8100 || t === 0x88a8) && has(d, o, 4)) {
      const inner = be16(d, o + 2);
      c.tree.push(node(`802.1Q Virtual LAN, ID: ${be16(d, o) & 0x0fff}`, o, 4, [leaf(`Type: 0x${inner.toString(16).padStart(4, "0")}`, o + 2, 2)]));
      c.stack.push("vlan");
      return this.ethertype(c, d, o + 4, inner);
    }
    c.s.info = `Ethertype 0x${t.toString(16).padStart(4, "0")}`;
  }

  private arp(c: Ctx, d: Uint8Array, o: number) {
    proto(c, "arp", "ARP");
    if (!has(d, o, 28)) return;
    const op = be16(d, o + 6), smac = mac(d, o + 8), sip = ip4(d, o + 14), tip = ip4(d, o + 24);
    c.s.info = op === 1 ? `Who has ${tip}? Tell ${sip}` : `${sip} is at ${smac}`;
    c.tree.push(node(`Address Resolution Protocol (${op === 1 ? "request" : "reply"})`, o, 28, [leaf(`Opcode: ${op}`, o + 6, 2), leaf(`Sender MAC: ${smac}`, o + 8, 6), leaf(`Sender IP: ${sip}`, o + 14, 4), leaf(`Target MAC: ${mac(d, o + 18)}`, o + 18, 6), leaf(`Target IP: ${tip}`, o + 24, 4)]));
  }

  private ipv4(c: Ctx, d: Uint8Array, o: number) {
    proto(c, "ip", "IPv4");
    if (!has(d, o, 20)) return;
    const ihl = (d[o] & 0x0f) * 4, total = be16(d, o + 2), p = d[o + 9], frag = be16(d, o + 6), src = ip4(d, o + 12), dst = ip4(d, o + 16);
    c.tree.push(node(`Internet Protocol Version 4, Src: ${src}, Dst: ${dst}`, o, Math.max(ihl, 20), [
      leaf(`Header length: ${ihl} bytes`, o, 1), leaf(`Total length: ${total}`, o + 2, 2), leaf(`Identification: 0x${be16(d, o + 4).toString(16).padStart(4, "0")}`, o + 4, 2),
      leaf(`Flags: ${frag & 0x4000 ? "DF " : ""}${frag & 0x2000 ? "MF" : ""}  Fragment offset: ${(frag & 0x1fff) * 8}`, o + 6, 2),
      leaf(`Time to live: ${d[o + 8]}`, o + 8, 1), leaf(`Protocol: ${IPPROTO[p] ?? "Unknown"} (${p})`, o + 9, 1), leaf(`Source: ${src}`, o + 12, 4), leaf(`Destination: ${dst}`, o + 16, 4),
    ]));
    c.s.src = src;
    c.s.dst = dst;
    if (frag & 0x1fff) { c.s.info = `Fragmented IP protocol (proto=${IPPROTO[p] ?? p})`; return; }
    const end = total >= ihl ? Math.min(o + total, d.length) : d.length;
    this.transport(c, d, o + ihl, end, p);
  }

  private ipv6(c: Ctx, d: Uint8Array, o: number) {
    proto(c, "ipv6", "IPv6");
    if (!has(d, o, 40)) return;
    let nh = d[o + 6];
    const plen = be16(d, o + 4), src = ip6(d, o + 8), dst = ip6(d, o + 24);
    c.tree.push(node(`Internet Protocol Version 6, Src: ${src}, Dst: ${dst}`, o, 40, [leaf(`Payload length: ${plen}`, o + 4, 2), leaf(`Next header: ${IPPROTO[nh] ?? "Unknown"} (${nh})`, o + 6, 1), leaf(`Hop limit: ${d[o + 7]}`, o + 7, 1), leaf(`Source: ${src}`, o + 8, 16), leaf(`Destination: ${dst}`, o + 24, 16)]));
    c.s.src = src;
    c.s.dst = dst;
    let p = o + 40;
    for (let i = 0; i < 6; i++) {
      if ([0, 43, 60].includes(nh)) { if (!has(d, p, 2)) return; const n = d[p]; p += (d[p + 1] + 1) * 8; nh = n; }
      else if (nh === 44) { if (!has(d, p, 8)) return; nh = d[p]; p += 8; }
      else break;
    }
    this.transport(c, d, p, Math.max(Math.min(o + 40 + plen, d.length), p), nh);
  }

  private transport(c: Ctx, d: Uint8Array, o: number, end: number, p: number) {
    if (p === 6) return this.tcp(c, d, o, end);
    if (p === 17) return this.udp(c, d, o, end);
    if (p === 1) return this.icmp(c, d, o, end);
    if (p === 58) return this.icmpv6(c, d, o);
    c.s.info = `IP protocol ${IPPROTO[p] ?? "Unknown"} (${p})`;
  }

  private icmp(c: Ctx, d: Uint8Array, o: number, end: number) {
    proto(c, "icmp", "ICMP");
    if (!has(d, o, 8)) return;
    const t = d[o], code = d[o + 1];
    const name = ({ 0: "Echo (ping) reply", 3: "Destination unreachable", 5: "Redirect", 8: "Echo (ping) request", 11: "Time-to-live exceeded" } as Record<number, string>)[t] ?? "ICMP";
    c.s.info = t === 0 || t === 8 ? `${name} id=0x${be16(d, o + 4).toString(16).padStart(4, "0")}, seq=${be16(d, o + 6)}` : `${name} (type=${t}, code=${code})`;
    c.tree.push(node("Internet Control Message Protocol", o, Math.max(end - o, 8), [leaf(`Type: ${t} (${name})`, o, 1), leaf(`Code: ${code}`, o + 1, 1), leaf(`Checksum: 0x${be16(d, o + 2).toString(16).padStart(4, "0")}`, o + 2, 2)]));
  }

  private icmpv6(c: Ctx, d: Uint8Array, o: number) {
    proto(c, "icmpv6", "ICMPv6");
    if (!has(d, o, 4)) return;
    const name = ({ 1: "Destination Unreachable", 3: "Time Exceeded", 128: "Echo (ping) request", 129: "Echo (ping) reply", 133: "Router Solicitation", 134: "Router Advertisement", 135: "Neighbor Solicitation", 136: "Neighbor Advertisement", 143: "Multicast Listener Report v2" } as Record<number, string>)[d[o]] ?? "ICMPv6";
    c.s.info = name;
    c.tree.push(node("Internet Control Message Protocol v6", o, d.length - o, [leaf(`Type: ${d[o]} (${name})`, o, 1), leaf(`Code: ${d[o + 1]}`, o + 1, 1)]));
  }

  private udp(c: Ctx, d: Uint8Array, o: number, end: number) {
    proto(c, "udp", "UDP");
    if (!has(d, o, 8)) return;
    const sp = be16(d, o), dp = be16(d, o + 2), len = be16(d, o + 4);
    c.s.sport = sp;
    c.s.dport = dp;
    c.tree.push(node(`User Datagram Protocol, Src Port: ${sp}, Dst Port: ${dp}`, o, 8, [leaf(`Source Port: ${sp}`, o, 2), leaf(`Destination Port: ${dp}`, o + 2, 2), leaf(`Length: ${len}`, o + 4, 2)]));
    const pay = o + 8, plen = Math.max(0, end - pay);
    c.s.info = `${sp} → ${dp} Len=${plen}`;
    const on = (p: number) => sp === p || dp === p;
    if (!plen) return;
    if (on(53) || on(5353) || on(5355)) this.dns(c, d, pay, end, on(5353) ? "mdns" : "dns");
    else if (on(67) || on(68)) { proto(c, "dhcp", "DHCP"); c.s.info = `DHCP ${d[pay] === 1 ? "Request/Discover" : "Reply/Offer/ACK"}`; c.tree.push(node("Dynamic Host Configuration Protocol", pay, plen)); }
    else if (on(123)) { proto(c, "ntp", "NTP"); c.s.info = "NTP"; c.tree.push(node("Network Time Protocol", pay, plen)); }
    else if (on(1900)) { proto(c, "ssdp", "SSDP"); c.s.info = firstLine(d.subarray(pay, end)); c.tree.push(node("Simple Service Discovery Protocol", pay, plen)); }
    else if (on(443) && (d[pay] & 0xc0)) { proto(c, "quic", "QUIC"); c.s.info = `QUIC ${d[pay] & 0x80 ? "long" : "short"} header, Len=${plen}`; c.tree.push(node("QUIC IETF", pay, plen)); }
  }

  private tcp(c: Ctx, d: Uint8Array, o: number, end: number) {
    proto(c, "tcp", "TCP");
    if (!has(d, o, 20)) return;
    const sp = be16(d, o), dp = be16(d, o + 2), seq = be32(d, o + 4), ack = be32(d, o + 8), hl = (d[o + 12] >> 4) * 4, fl = d[o + 13], win = be16(d, o + 14);
    const flags = ([[0x02, "SYN"], [0x10, "ACK"], [0x01, "FIN"], [0x04, "RST"], [0x08, "PSH"], [0x20, "URG"]] as [number, string][]).filter(([b]) => fl & b).map(([, n]) => n);
    const fwd = `${c.s.src}|${sp}|${c.s.dst}|${dp}`, rev = `${c.s.dst}|${dp}|${c.s.src}|${sp}`;
    let stream = this.streams.get(fwd) ?? this.streams.get(rev);
    if (stream === undefined) { stream = this.next++; this.streams.set(fwd, stream); }
    if (!this.isn.has(fwd)) this.isn.set(fwd, seq);
    const rseq = (seq - this.isn.get(fwd)! + 2 ** 32) % 2 ** 32;
    const rack = this.isn.has(rev) ? (ack - this.isn.get(rev)! + 2 ** 32) % 2 ** 32 : ack;
    const pay = o + hl, plen = Math.max(0, end - pay);
    Object.assign(c.s, { sport: sp, dport: dp, stream, flags: flags.join(",") });
    c.s.info = `${sp} → ${dp} [${flags.join(", ")}] Seq=${rseq}${fl & 0x10 ? ` Ack=${rack}` : ""} Win=${win} Len=${plen}`;
    c.tree.push(node(`Transmission Control Protocol, Src Port: ${sp}, Dst Port: ${dp}, Seq: ${rseq}, Len: ${plen}`, o, Math.max(hl, 20), [
      leaf(`Source Port: ${sp}`, o, 2), leaf(`Destination Port: ${dp}`, o + 2, 2), leaf(`[Stream index: ${stream}]`, o, 0),
      leaf(`Sequence number: ${rseq} (relative), raw ${seq}`, o + 4, 4), leaf(`Acknowledgment number: ${rack} (relative)`, o + 8, 4),
      leaf(`Header length: ${hl} bytes`, o + 12, 1), leaf(`Flags: 0x${fl.toString(16).padStart(3, "0")} (${flags.join(", ")})`, o + 13, 1), leaf(`Window: ${win}`, o + 14, 2),
    ]));
    if (!plen || pay >= d.length) return;
    const payload = d.subarray(pay, Math.min(end, d.length));
    const on = (p: number) => sp === p || dp === p;
    if (/^(GET|POST|PUT|DELETE|HEAD|OPTIONS|PATCH|CONNECT) |^HTTP\/1\./.test(text(payload.subarray(0, 9)))) this.http(c, payload, pay);
    else if (payload.length >= 6 && payload[0] >= 20 && payload[0] <= 23 && payload[1] === 3) this.tls(c, payload, pay);
    else if (text(payload.subarray(0, 4)) === "SSH-") { proto(c, "ssh", "SSH"); c.s.info = `Protocol (${firstLine(payload)})`; c.tree.push(node(`SSH Protocol: ${firstLine(payload)}`, pay, payload.length)); }
    else if (on(53) && payload.length > 2) this.dns(c, d, pay + 2, end, "dns");
    else if (on(22)) { proto(c, "ssh", "SSH"); c.s.info = `Encrypted packet (len=${plen})`; c.tree.push(node("SSH Protocol (encrypted)", pay, plen)); }
    else c.tree.push(node(`Data (${plen} bytes)`, pay, plen));
  }

  private http(c: Ctx, p: Uint8Array, o: number) {
    proto(c, "http", "HTTP");
    const t = text(p);
    const headEnd = t.indexOf("\r\n\r\n") >= 0 ? t.indexOf("\r\n\r\n") + 4 : t.length;
    const kids: TreeNode[] = [];
    let at = o;
    for (const line of t.slice(0, headEnd).split("\r\n").filter(Boolean)) { kids.push(leaf(line, at, line.length + 2)); at += line.length + 2; }
    if (headEnd < p.length) kids.push(leaf(`Body: ${p.length - headEnd} bytes`, o + headEnd, p.length - headEnd));
    c.s.info = t.split(/\r?\n/)[0];
    c.tree.push(node("Hypertext Transfer Protocol", o, p.length, kids));
  }

  private tls(c: Ctx, p: Uint8Array, o: number) {
    proto(c, "tls", "TLS");
    const ver = ({ 0x0300: "SSLv3", 0x0301: "TLSv1.0", 0x0302: "TLSv1.1", 0x0303: "TLSv1.2" } as Record<number, string>)[be16(p, 1)] ?? "TLS";
    const kind = ({ 20: "Change Cipher Spec", 21: "Alert", 22: "Handshake", 23: "Application Data" } as Record<number, string>)[p[0]] ?? "Record";
    const kids = [leaf(`Content Type: ${kind} (${p[0]})`, o, 1), leaf(`Version: ${ver}`, o + 1, 2), leaf(`Length: ${be16(p, 3)}`, o + 3, 2)];
    let info = `${ver} ${kind}`;
    if (p[0] === 22 && p.length > 9) {
      const hs = ({ 1: "Client Hello", 2: "Server Hello", 4: "New Session Ticket", 11: "Certificate", 12: "Server Key Exchange", 14: "Server Hello Done", 16: "Client Key Exchange" } as Record<number, string>)[p[5]] ?? "Handshake";
      info = `${ver} ${hs}`;
      kids.push(leaf(`Handshake Type: ${hs} (${p[5]})`, o + 5, 1));
      const sni = p[5] === 1 ? clientHelloSni(p) : null;
      if (sni) { kids.push(leaf(`Server Name Indication: ${sni.name}`, o + sni.at, sni.name.length)); info += ` (SNI=${sni.name})`; }
    }
    c.s.info = info;
    c.tree.push(node(`Transport Layer Security: ${ver} Record Layer: ${kind}`, o, p.length, kids));
  }

  private dns(c: Ctx, d: Uint8Array, o: number, end: number, name: "dns" | "mdns") {
    proto(c, name, name === "mdns" ? "MDNS" : "DNS");
    const msg = d.subarray(o, Math.min(end, d.length));
    if (msg.length < 12) return;
    const id = be16(msg, 0), flags = be16(msg, 2), qd = be16(msg, 4), an = be16(msg, 6), resp = !!(flags & 0x8000);
    const hex = `0x${id.toString(16).padStart(4, "0")}`;
    const kids = [leaf(`Transaction ID: ${hex}`, o, 2), leaf(`Flags: 0x${flags.toString(16).padStart(4, "0")} ${resp ? "Standard query response" : "Standard query"}`, o + 2, 2), leaf(`Questions: ${qd}  Answer RRs: ${an}`, o + 4, 4)];
    let p = 12, q = "";
    for (let i = 0; i < Math.min(qd, 4); i++) {
      const r = readName(msg, p);
      if (!r || r.next + 4 > msg.length) break;
      const qt = rr(be16(msg, r.next));
      kids.push(leaf(`Query: ${r.name} type ${qt}`, o + p, r.next + 4 - p));
      q = `${qt} ${r.name}`;
      p = r.next + 4;
    }
    const answers: string[] = [];
    for (let i = 0; i < Math.min(an, 16); i++) {
      const r = readName(msg, p);
      if (!r || r.next + 10 > msg.length) break;
      const ty = be16(msg, r.next), rdlen = be16(msg, r.next + 8), rd = r.next + 10;
      if (rd + rdlen > msg.length) break;
      const val = ty === 1 && rdlen === 4 ? ip4(msg, rd) : ty === 28 && rdlen === 16 ? ip6(msg, rd) : [2, 5, 12].includes(ty) ? readName(msg, rd)?.name ?? "" : `${rdlen} bytes`;
      kids.push(leaf(`Answer: ${r.name} type ${rr(ty)} ${val}`, o + p, rd + rdlen - p));
      answers.push(`${rr(ty)} ${val}`);
      p = rd + rdlen;
    }
    c.s.info = resp ? `Standard query response ${hex} ${q} ${answers.join(" ")}`.trim() : `Standard query ${hex} ${q}`;
    c.tree.push(node(`Domain Name System (${resp ? "response" : "query"})`, o, msg.length, kids));
  }
}

function readName(msg: Uint8Array, p: number): { name: string; next: number } | null {
  const labels: string[] = [];
  let jumped = false, next = 0;
  for (let i = 0; i < 64; i++) {
    if (p >= msg.length) return null;
    const len = msg[p];
    if (len === 0) { if (!jumped) next = p + 1; return { name: labels.length ? labels.join(".") : "<Root>", next }; }
    if ((len & 0xc0) === 0xc0) { if (p + 1 >= msg.length) return null; if (!jumped) next = p + 2; jumped = true; p = ((len & 0x3f) << 8) | msg[p + 1]; continue; }
    if (p + 1 + len > msg.length) return null;
    labels.push(text(msg.subarray(p + 1, p + 1 + len)));
    p += len + 1;
  }
  return null;
}

function clientHelloSni(p: Uint8Array): { name: string; at: number } | null {
  let o = 5 + 4 + 2 + 32;
  if (!has(p, o, 1)) return null;
  o += 1 + p[o];
  if (!has(p, o, 2)) return null;
  o += 2 + be16(p, o);
  if (!has(p, o, 1)) return null;
  o += 1 + p[o];
  if (!has(p, o, 2)) return null;
  const extEnd = Math.min(o + 2 + be16(p, o), p.length);
  o += 2;
  while (o + 4 <= extEnd) {
    const ty = be16(p, o), len = be16(p, o + 2);
    if (ty === 0 && has(p, o + 7, 2)) {
      const n = be16(p, o + 7);
      if (!has(p, o + 9, n)) return null;
      return { name: text(p.subarray(o + 9, o + 9 + n)), at: o + 9 };
    }
    o += 4 + len;
  }
  return null;
}

/** Locates the TCP payload in a frame (for Follow TCP Stream). */
export function tcpPayload(d: Uint8Array, linktype: number): Uint8Array {
  let o = linktype === 1 ? 14 : linktype === 113 ? 16 : linktype === 0 ? 4 : 0;
  if (linktype === 1 && d.length > 14 && d[12] === 0x81 && d[13] === 0) o += 4;
  if (o >= d.length) return new Uint8Array();
  let proto: number, ipEnd: number, l4: number;
  if (d[o] >> 4 === 4) { if (!has(d, o, 20)) return new Uint8Array(); proto = d[o + 9]; ipEnd = Math.min(o + be16(d, o + 2), d.length); l4 = o + (d[o] & 0x0f) * 4; }
  else if (d[o] >> 4 === 6) { if (!has(d, o, 40)) return new Uint8Array(); proto = d[o + 6]; ipEnd = Math.min(o + 40 + be16(d, o + 4), d.length); l4 = o + 40; }
  else return new Uint8Array();
  if (proto !== 6 || !has(d, l4, 13)) return new Uint8Array();
  const start = l4 + (d[l4 + 12] >> 4) * 4;
  return start < ipEnd ? d.subarray(start, ipEnd) : new Uint8Array();
}
