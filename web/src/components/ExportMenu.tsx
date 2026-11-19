"use client";
/** "Export" buttons: CSV and PDF for any report built by the caller. */
import { FileDown, FileSpreadsheet } from "lucide-react";
import { useState } from "react";
import { exportCsv, exportPdf, type Report } from "@/lib/export";

export function ExportMenu({ build, disabled, small }: { build: () => Report; disabled?: boolean; small?: boolean }) {
  const [busy, setBusy] = useState(false);
  const cls = `btn ${small ? "px-2 py-1 text-xs" : ""}`;
  return (
    <div className="flex gap-1.5">
      <button className={cls} disabled={disabled} onClick={() => exportCsv(build())} title="Export CSV"><FileSpreadsheet size={14} />CSV</button>
      <button className={cls} disabled={disabled || busy} title="Export PDF"
        onClick={async () => { setBusy(true); try { await exportPdf(build()); } finally { setBusy(false); } }}>
        <FileDown size={14} />{busy ? "PDF…" : "PDF"}
      </button>
    </div>
  );
}
