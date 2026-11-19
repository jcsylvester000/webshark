/**
 * Batched port scanning. Large scans are split into batches so each serverless request
 * finishes well inside the host's function time limit (Netlify: 10 s by default).
 */
import { api } from "./api";
import { parsePorts } from "./ports";
import type { ScanResponse } from "./types";

const BATCH = 200;

export async function scanPorts(target: string, spec: string, opts: { banners?: boolean; onProgress?: (done: number, total: number) => void } = {}): Promise<ScanResponse> {
  const ports = parsePorts(spec || "common");
  const batches: number[][] = [];
  for (let i = 0; i < ports.length; i += BATCH) batches.push(ports.slice(i, i + BATCH));
  const merged: ScanResponse = { target, address: "", scanned: 0, open: [], closed_count: 0, filtered_count: 0, duration_ms: 0, results: [] };
  const started = performance.now();
  let done = 0;
  // Two batches in flight at a time keeps scans fast without flooding the function host.
  for (let i = 0; i < batches.length; i += 2) {
    const chunk = batches.slice(i, i + 2);
    const res = await Promise.all(chunk.map((b, j) => api<ScanResponse>("/tools/portscan", {
      method: "POST", json: { target, ports: b.join(","), banners: opts.banners ?? true, authorized: true, batch: { index: i + j, total: batches.length } },
    })));
    for (const r of res) {
      merged.target = r.target;
      merged.address = r.address;
      merged.scanned += r.scanned;
      merged.open.push(...r.open);
      merged.closed_count += r.closed_count;
      merged.filtered_count += r.filtered_count;
      merged.results.push(...r.results);
      done += r.scanned;
    }
    opts.onProgress?.(done, ports.length);
  }
  merged.open.sort((a, b) => a.port - b.port);
  merged.results.sort((a, b) => a.port - b.port);
  merged.duration_ms = Math.round(performance.now() - started);
  return merged;
}
