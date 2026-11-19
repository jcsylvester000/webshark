/**
 * Capture file reader for libpcap (.pcap) and pcapng (.pcapng) — Slyshark's take on
 * Wireshark's `wiretap/`. Runs in the browser: capture bytes never leave the user's machine.
 */
export type RawPacket = { ts: number; linktype: number; origLen: number; data: Uint8Array };
export type CaptureFile = { format: "pcap" | "pcapng"; packets: RawPacket[]; truncated: boolean };

export function readCapture(buf: ArrayBuffer, maxPackets = 200_000): CaptureFile {
  const b = new Uint8Array(buf);
  if (b.length < 24) throw new Error("File is too small to be a capture");
  if (b[0] === 0x0a && b[1] === 0x0d && b[2] === 0x0d && b[3] === 0x0a) return readPcapng(b, maxPackets);
  return readPcap(b, maxPackets);
}

function readPcap(b: Uint8Array, max: number): CaptureFile {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const magic = dv.getUint32(0, false);
  const kinds: Record<number, [boolean, boolean]> = { 0xd4c3b2a1: [true, false], 0xa1b2c3d4: [false, false], 0x4d3cb2a1: [true, true], 0xa1b23c4d: [false, true] };
  const k = kinds[magic];
  if (!k) throw new Error("Not a pcap or pcapng file (unknown magic number)");
  const [le, nanos] = k;
  const linktype = dv.getUint32(20, le) & 0x0fffffff;
  const packets: RawPacket[] = [];
  let off = 24;
  let truncated = false;
  while (off + 16 <= b.length) {
    if (packets.length >= max) { truncated = true; break; }
    const sec = dv.getUint32(off, le), frac = dv.getUint32(off + 4, le), incl = dv.getUint32(off + 8, le), orig = dv.getUint32(off + 12, le);
    off += 16;
    if (incl > 262_144 || off + incl > b.length) { truncated = true; break; }
    packets.push({ ts: sec + frac / (nanos ? 1e9 : 1e6), linktype, origLen: orig, data: b.subarray(off, off + incl) });
    off += incl;
  }
  return { format: "pcap", packets, truncated };
}

function readPcapng(b: Uint8Array, max: number): CaptureFile {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let off = 0;
  let le = true;
  let ifaces: { linktype: number; tsdiv: number }[] = [];
  const packets: RawPacket[] = [];
  let truncated = false;
  while (off + 12 <= b.length) {
    if (b[off] === 0x0a && b[off + 1] === 0x0d && b[off + 2] === 0x0d && b[off + 3] === 0x0a) {
      const bom = dv.getUint32(off + 8, true);
      if (bom === 0x1a2b3c4d) le = true; else if (bom === 0x4d3c2b1a) le = false; else throw new Error("Corrupt pcapng section header");
      ifaces = [];
    }
    const type = dv.getUint32(off, le), len = dv.getUint32(off + 4, le);
    if (len < 12 || off + len > b.length) { truncated = true; break; }
    const body = off + 8, bodyLen = len - 12;
    if (type === 1 && bodyLen >= 8) {
      const linktype = dv.getUint16(body, le);
      let tsdiv = 1e6;
      let o = body + 8;
      while (o + 4 <= body + bodyLen) {
        const code = dv.getUint16(o, le), olen = dv.getUint16(o + 2, le);
        if (code === 0) break;
        if (code === 9 && olen >= 1) { const r = b[o + 4]; tsdiv = r & 0x80 ? 2 ** (r & 0x7f) : 10 ** r; }
        o += 4 + Math.ceil(olen / 4) * 4;
      }
      ifaces.push({ linktype, tsdiv });
    } else if (type === 6 && bodyLen >= 20) {
      if (packets.length >= max) { truncated = true; break; }
      const ifid = dv.getUint32(body, le);
      const ts = dv.getUint32(body + 4, le) * 2 ** 32 + dv.getUint32(body + 8, le);
      const cap = Math.min(dv.getUint32(body + 12, le), bodyLen - 20);
      const iface = ifaces[ifid] ?? { linktype: 1, tsdiv: 1e6 };
      packets.push({ ts: ts / iface.tsdiv, linktype: iface.linktype, origLen: dv.getUint32(body + 16, le), data: b.subarray(body + 20, body + 20 + cap) });
    } else if (type === 3 && bodyLen >= 4) {
      if (packets.length >= max) { truncated = true; break; }
      const orig = dv.getUint32(body, le);
      const cap = Math.min(orig, bodyLen - 4);
      packets.push({ ts: 0, linktype: ifaces[0]?.linktype ?? 1, origLen: orig, data: b.subarray(body + 4, body + 4 + cap) });
    }
    off += len;
  }
  return { format: "pcapng", packets, truncated };
}
