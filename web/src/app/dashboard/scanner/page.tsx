"use client";
/** Port scanner (TCP connect + banners) and web security audit (headers, TLS redirect, CORS, files). */
import { Radar, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { api, errMsg } from "@/lib/api";
import { download } from "@/lib/docs";
import { scanPorts } from "@/lib/scan";
import type { AuditReport, ScanResponse } from "@/lib/types";

const SEV: Record<string, string> = { pass: "bg-emerald-500/15 text-emerald-300", info: "bg-zinc-500/20 text-zinc-300", low: "bg-amber-500/15 text-amber-300", medium: "bg-orange-500/20 text-orange-300", high: "bg-red-500/20 text-red-300" };

export default function ScannerPage() {
  const [target, setTarget] = useState("");
  const [ports, setPorts] = useState("common");
  const [custom, setCustom] = useState("");
  const [banners, setBanners] = useState(true);
  const [showClosed, setShowClosed] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [scan, setScan] = useState<ScanResponse | null>(null);
  const [audit, setAudit] = useState<AuditReport | null>(null);
  const [checkFiles, setCheckFiles] = useState(true);
  const [busy, setBusy] = useState<"scan" | "audit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  async function runScan() {
    setBusy("scan"); setError(null);
    setProgress(null);
    try { setScan(await scanPorts(target, ports === "custom" ? custom : ports, { banners, onProgress: (d, t) => setProgress(`${d}/${t}`) })); }
    catch (e) { setError(errMsg(e)); }
    setBusy(null);
  }
  async function runAudit() {
    setBusy("audit"); setError(null);
    try { setAudit(await api<AuditReport>("/tools/audit", { method: "POST", json: { url: target, check_files: checkFiles, authorized } })); }
    catch (e) { setError(errMsg(e)); }
    setBusy(null);
  }
  function exportReport() {
    const lines = [`# Slyshark security report: ${target}`, "", `_Generated ${new Date().toISOString()}_`, ""];
    if (scan) {
      lines.push(`## Port scan (${scan.address})`, "", `${scan.scanned} ports scanned in ${scan.duration_ms} ms: ${scan.open.length} open, ${scan.closed_count} closed, ${scan.filtered_count} filtered.`, "", "| Port | Service | Banner | Note |", "|---|---|---|---|");
      scan.open.forEach((p) => lines.push(`| ${p.port}/tcp | ${p.service} | ${p.banner ?? ""} | ${p.note ?? ""} |`));
      lines.push("");
    }
    if (audit) {
      lines.push(`## Web audit (${audit.final_url})`, "", `Score: **${audit.score}/100** (HTTP ${audit.status})`, "", "| Severity | Finding | Detail | Recommendation |", "|---|---|---|---|");
      audit.findings.forEach((f) => lines.push(`| ${f.severity} | ${f.title} | ${f.detail.replace(/\|/g, "\\|")} | ${f.recommendation} |`));
    }
    download(`slyshark-report-${target.replace(/[^a-z0-9]+/gi, "-")}.md`, lines.join("\n"));
  }

  const rows = scan ? (showClosed ? scan.results : scan.open) : [];
  return (
    <div>
      <PageHeader title="Scanner & Audit" subtitle="Find open ports and common web misconfigurations on hosts you are authorized to test.">
        {(scan || audit) && <button className="btn" onClick={exportReport}>Export report (.md)</button>}
      </PageHeader>
      <div className="space-y-4 p-6">
        <div className="panel space-y-3 p-4">
          <div className="flex flex-wrap gap-2">
            <input aria-label="Target" className="input max-w-md font-mono" placeholder="example.com, 10.0.0.5, or https://app.example.com" value={target} onChange={(e) => setTarget(e.target.value)} />
            <select aria-label="Ports" className="input w-48" value={ports} onChange={(e) => setPorts(e.target.value)}>
              <option value="common">Common (52 ports)</option><option value="web">Web ports</option><option value="db">Database ports</option><option value="well-known">Well-known 1-1024</option><option value="custom">Custom…</option>
            </select>
            {ports === "custom" && <input aria-label="Custom ports" className="input w-56 font-mono" placeholder="22,80,443,8000-8100" value={custom} onChange={(e) => setCustom(e.target.value)} />}
          </div>
          <div className="flex flex-wrap gap-5 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={banners} onChange={(e) => setBanners(e.target.checked)} />Grab service banners</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={checkFiles} onChange={(e) => setCheckFiles(e.target.checked)} />Audit: check for exposed files (.git, .env, phpinfo…)</label>
          </div>
          <label className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
            <input type="checkbox" className="mt-0.5" checked={authorized} onChange={(e) => setAuthorized(e.target.checked)} />
            <span>I own this target or have written permission to test it. Scanning systems without permission may be illegal. Every run is logged to your account.</span>
          </label>
          <div className="flex gap-2">
            <button className="btn-primary" disabled={!target || !authorized || !!busy} onClick={runScan}><Radar size={15} />{busy === "scan" ? `Scanning… ${progress ?? ""}` : "Scan ports"}</button>
            <button className="btn" disabled={!target || !authorized || !!busy} onClick={runAudit}><ShieldCheck size={15} />{busy === "audit" ? "Auditing…" : "Run web audit"}</button>
          </div>
          {error && <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        </div>

        {scan && (
          <div className="panel">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
              <h2 className="font-medium">Ports on {scan.target} <span className="font-mono text-sm text-muted">({scan.address})</span></h2>
              <div className="flex items-center gap-4 font-mono text-xs text-muted">
                <span className="text-emerald-300">{scan.open.length} open</span><span>{scan.closed_count} closed</span><span>{scan.filtered_count} filtered</span><span>{scan.duration_ms} ms</span>
                <label className="flex items-center gap-1.5 font-sans"><input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />show all</label>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted"><tr><th className="px-4 py-2">Port</th><th className="px-4 py-2">State</th><th className="px-4 py-2">Service</th><th className="px-4 py-2">RTT</th><th className="px-4 py-2">Banner</th><th className="px-4 py-2">Note</th></tr></thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.port} className="border-t border-line/60">
                    <td className="px-4 py-1.5 font-mono">{p.port}/tcp</td>
                    <td className={`px-4 py-1.5 font-mono ${p.state === "open" ? "text-emerald-300" : p.state === "closed" ? "text-muted" : "text-amber-300"}`}>{p.state}</td>
                    <td className="px-4 py-1.5">{p.service}</td><td className="px-4 py-1.5 font-mono text-xs text-muted">{p.rtt_ms ? `${p.rtt_ms} ms` : ""}</td>
                    <td className="max-w-xs truncate px-4 py-1.5 font-mono text-xs" title={p.banner ?? ""}>{p.banner}</td><td className="px-4 py-1.5 text-xs text-amber-300">{p.note}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-4 text-center text-muted">No open ports found.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {audit && (
          <div className="panel">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="font-medium">Web audit · <span className="font-mono text-sm text-muted">{audit.final_url}</span></h2>
              <span className={`rounded-md px-2 py-1 font-mono text-sm font-bold ${audit.score >= 80 ? SEV.pass : audit.score >= 50 ? SEV.low : SEV.high}`}>{audit.score}/100</span>
            </div>
            <div className="divide-y divide-line/60">
              {[...audit.findings].sort((a, b) => ["high", "medium", "low", "info", "pass"].indexOf(a.severity) - ["high", "medium", "low", "info", "pass"].indexOf(b.severity)).map((f, i) => (
                <div key={i} className="flex gap-3 px-4 py-2.5">
                  <span className={`h-fit w-16 shrink-0 rounded px-1.5 py-0.5 text-center font-mono text-[11px] uppercase ${SEV[f.severity]}`}>{f.severity}</span>
                  <div className="min-w-0 text-sm"><div>{f.title}</div>{f.detail && <div className="truncate font-mono text-xs text-muted">{f.detail}</div>}{f.severity !== "pass" && f.recommendation && <div className="text-xs text-fin/80">→ {f.recommendation}</div>}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
