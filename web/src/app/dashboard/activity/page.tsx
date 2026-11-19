"use client";
/** Audit trail of every ping, scan, HTTP request and audit run from this account. */
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { api } from "@/lib/api";

type Log = { id: number; kind: string; target: string; summary: Record<string, unknown>; created_at: string };

export default function ActivityPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  useEffect(() => { api<Log[]>("/tools/logs").then(setLogs).catch(() => null); }, []);
  return (
    <div>
      <PageHeader title="Activity Log" subtitle="The last 200 network actions run from your account." />
      <div className="p-6">
        <table className="panel w-full overflow-hidden text-sm">
          <thead className="bg-panel-2 text-left text-xs uppercase tracking-wider text-muted"><tr><th className="px-4 py-2">Time</th><th className="px-4 py-2">Tool</th><th className="px-4 py-2">Target</th><th className="px-4 py-2">Result</th></tr></thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-t border-line/60">
                <td className="whitespace-nowrap px-4 py-2 text-muted">{new Date(l.created_at).toLocaleString()}</td>
                <td className="px-4 py-2 font-mono text-fin">{l.kind}</td>
                <td className="px-4 py-2">{l.target}</td>
                <td className="px-4 py-2 font-mono text-xs text-muted">{JSON.stringify(l.summary)}</td>
              </tr>
            ))}
            {logs.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-muted">Nothing logged yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
