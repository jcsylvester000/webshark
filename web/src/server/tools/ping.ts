/**
 * TCP-connect ping. ICMP needs raw sockets, which serverless hosts (Netlify/AWS Lambda) do not
 * allow, so reachability and latency are measured with a TCP handshake (like `tcping`/`nping`).
 */
import "server-only";
import { Socket } from "node:net";

export type Attempt = { seq: number; ok: boolean; rtt_ms: number | null; error: string | null };

export function tcpConnect(ip: string, port: number, timeoutMs: number): Promise<{ state: "open" | "closed" | "filtered"; rtt: number; socket?: Socket; error?: string }> {
  return new Promise((resolve) => {
    const start = performance.now();
    const s = new Socket();
    let done = false;
    const finish = (r: { state: "open" | "closed" | "filtered"; error?: string }, keep = false) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (!keep) s.destroy();
      resolve({ ...r, rtt: Math.round((performance.now() - start) * 100) / 100, socket: keep ? s : undefined });
    };
    const timer = setTimeout(() => finish({ state: "filtered", error: "timeout" }), timeoutMs);
    s.once("connect", () => finish({ state: "open" }, true));
    s.once("error", (e: NodeJS.ErrnoException) => finish(e.code === "ECONNREFUSED" ? { state: "closed", error: "port closed (RST) - host reachable" } : { state: "filtered", error: e.code ?? e.message }));
    s.connect(port, ip);
  });
}

export async function tcpPing(ip: string, port: number, count: number, timeoutMs: number): Promise<Attempt[]> {
  const out: Attempt[] = [];
  for (let seq = 1; seq <= count; seq++) {
    const r = await tcpConnect(ip, port, timeoutMs);
    r.socket?.destroy();
    out.push(r.state === "filtered" ? { seq, ok: false, rtt_ms: null, error: r.error ?? "timeout" } : { seq, ok: true, rtt_ms: r.rtt, error: r.state === "closed" ? r.error ?? null : null });
    if (seq < count) await new Promise((res) => setTimeout(res, 250));
  }
  return out;
}

export function summarize(host: string, ip: string, port: number, attempts: Attempt[]) {
  const rtts = attempts.map((a) => a.rtt_ms).filter((x): x is number => x !== null);
  const received = attempts.filter((a) => a.ok).length;
  const r2 = (v: number) => Math.round(v * 100) / 100;
  return {
    host, address: ip, mode: "tcp", port, attempts, sent: attempts.length, received,
    loss_pct: attempts.length ? r2((100 * (attempts.length - received)) / attempts.length) : 100,
    min_ms: rtts.length ? Math.min(...rtts) : null,
    avg_ms: rtts.length ? r2(rtts.reduce((a, b) => a + b, 0) / rtts.length) : null,
    max_ms: rtts.length ? Math.max(...rtts) : null,
    raw: [] as string[],
  };
}
