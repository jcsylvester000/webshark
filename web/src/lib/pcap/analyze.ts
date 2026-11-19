/** Loads a capture in the browser and computes Wireshark-style statistics and stream views. */
import type { CaptureLoad, Frame, TreeNode } from "../types";
import { Dissector, LINKTYPES, tcpPayload } from "./dissect";
import { readCapture, type RawPacket } from "./reader";

export type LocalCapture = CaptureLoad & { packets: RawPacket[]; dissector: Dissector };

export function analyzeCapture(name: string, buf: ArrayBuffer): LocalCapture {
  const cap = readCapture(buf);
  const first = cap.packets[0]?.ts ?? 0;
  const dissector = new Dissector();
  const frames: Frame[] = cap.packets.map((p, i) => dissector.dissect(i + 1, p, p.ts - first).frame);
  const protocols = new Map<string, [number, number]>(), convs = new Map<string, [string, string, number, number]>(), eps = new Map<string, [number, number]>();
  let bytes = 0;
  for (const f of frames) {
    bytes += f.length;
    const pr = protocols.get(f.protocol) ?? [0, 0]; pr[0]++; pr[1] += f.length; protocols.set(f.protocol, pr);
    if (f.src) {
      const [a, b] = f.src <= f.dst ? [f.src, f.dst] : [f.dst, f.src];
      const cv = convs.get(`${a}|${b}`) ?? [a, b, 0, 0]; cv[2]++; cv[3] += f.length; convs.set(`${a}|${b}`, cv);
      for (const e of [f.src, f.dst]) { const x = eps.get(e) ?? [0, 0]; x[0]++; x[1] += f.length; eps.set(e, x); }
    }
  }
  return {
    id: crypto.randomUUID(), name, format: cap.format, count: frames.length, truncated: cap.truncated,
    linktype: LINKTYPES[cap.packets[0]?.linktype ?? 1] ?? "Other", duration_s: cap.packets.length ? cap.packets[cap.packets.length - 1].ts - first : 0, bytes, first_ts: first, frames,
    stats: {
      protocols: [...protocols].map(([protocol, [packets, b]]) => ({ protocol, packets, bytes: b })).sort((x, y) => y.packets - x.packets),
      conversations: [...convs.values()].map(([a, b, packets, by]) => ({ a, b, packets, bytes: by })).sort((x, y) => y.bytes - x.bytes).slice(0, 500),
      endpoints: [...eps].map(([address, [packets, b]]) => ({ address, packets, bytes: b })).sort((x, y) => y.bytes - x.bytes).slice(0, 500),
    },
    packets: cap.packets, dissector,
  };
}

export function frameDetail(cap: LocalCapture, no: number): { summary: Frame; tree: TreeNode[]; bytes: Uint8Array } {
  const p = cap.packets[no - 1];
  const { frame, tree } = cap.dissector.dissect(no, p, p.ts - cap.first_ts);
  return { summary: frame, tree, bytes: p.data };
}

export function followStream(cap: LocalCapture, stream: number) {
  const dec = new TextDecoder("utf-8", { fatal: false });
  const idx = cap.frames.findIndex((f) => f.stream === stream);
  if (idx < 0) return null;
  const first = cap.frames[idx];
  const client = `${first.src}:${first.sport}`;
  const segments: { no: number; from_client: boolean; text: string }[] = [];
  let cb = 0, sb = 0;
  for (let i = idx; i < cap.frames.length && segments.length < 5000; i++) {
    const f = cap.frames[i];
    if (f.stream !== stream) continue;
    const pay = tcpPayload(cap.packets[i].data, cap.packets[i].linktype);
    if (!pay.length) continue;
    const fromClient = `${f.src}:${f.sport}` === client;
    if (fromClient) cb += pay.length; else sb += pay.length;
    segments.push({ no: f.no, from_client: fromClient, text: dec.decode(pay) });
  }
  return { stream, client, server: `${first.dst}:${first.dport}`, client_bytes: cb, server_bytes: sb, segments };
}
