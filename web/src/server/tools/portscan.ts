/** TCP connect port scanner with a passive banner read and HTTP HEAD probe on web ports. */
import "server-only";
import type { Socket } from "node:net";
import { riskNote, serviceName } from "@/lib/ports";
import type { PortResult } from "@/lib/types";
import { tcpConnect } from "./ping";

const HTTP_PROBE = new Set([80, 3000, 5000, 8000, 8080, 8081, 8888, 9000]);

function clean(buf: Buffer): string {
  return buf.toString("utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 4).join(" | ").replace(/[\x00-\x1f\x7f]/g, "").slice(0, 160);
}

function readOnce(s: Socket, ms: number): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => { s.removeAllListeners("data"); resolve(null); }, ms);
    s.once("data", (d: Buffer) => { clearTimeout(t); resolve(d); });
    s.once("error", () => { clearTimeout(t); resolve(null); });
  });
}

async function grab(s: Socket, port: number): Promise<string | null> {
  const first = await readOnce(s, 600);
  if (first?.length) return clean(first);
  if (HTTP_PROBE.has(port)) {
    s.write("HEAD / HTTP/1.0\r\nUser-Agent: Slyshark\r\n\r\n");
    const r = await readOnce(s, 800);
    if (r?.length) {
      const parts = clean(r).split(" | ");
      return parts.find((l) => l.toLowerCase().startsWith("server:")) ?? parts[0];
    }
  }
  return null;
}

export async function scan(ip: string, ports: number[], timeoutMs: number, concurrency: number, banners: boolean): Promise<PortResult[]> {
  const results: PortResult[] = [];
  let i = 0;
  async function worker() {
    while (i < ports.length) {
      const port = ports[i++];
      const r = await tcpConnect(ip, port, timeoutMs);
      let banner: string | null = null;
      if (r.state === "open" && r.socket) {
        if (banners) banner = await grab(r.socket, port).catch(() => null);
        r.socket.destroy();
      }
      results.push({ port, state: r.state, service: serviceName(port), rtt_ms: r.state === "open" ? r.rtt : null, banner, note: riskNote(port) });
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, ports.length) }, worker));
  return results.sort((a, b) => a.port - b.port);
}
