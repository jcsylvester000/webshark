/**
 * CSV and PDF exports, generated entirely in the browser (no server round trip, no storage).
 * PDF uses jsPDF + jspdf-autotable, loaded on demand so they never weigh down page loads.
 */
// Rows are heterogeneous records (scan results, findings, packets); columns read them by key or getter.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;
export type Column = { key: string; label: string; value?: (row: Row) => unknown };
export type ReportSection = { heading: string; columns: Column[]; rows: Row[]; note?: string };
export type Report = { title: string; subtitle?: string; meta?: [string, string][]; sections: ReportSection[] };

const cell = (c: Column, r: Row): string => {
  const v = c.value ? c.value(r) : r[c.key];
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

const esc = (s: string) => (/[",\r\n]/.test(s) || /^[=+\-@\t]/.test(s) ? `"${(/^[=+\-@\t]/.test(s) ? "'" : "") + s.replace(/"/g, '""')}"` : s);

function save(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const fileSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "slyshark";
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");

/** One CSV per report: sections are stacked, separated by a heading row and a blank line. */
export function exportCsv(report: Report, filename = `${fileSlug(report.title)}-${stamp()}.csv`) {
  const lines: string[] = [];
  lines.push(esc(report.title));
  for (const [k, v] of report.meta ?? []) lines.push(`${esc(k)},${esc(v)}`);
  for (const s of report.sections) {
    lines.push("", esc(s.heading));
    lines.push(s.columns.map((c) => esc(c.label)).join(","));
    for (const r of s.rows) lines.push(s.columns.map((c) => esc(cell(c, r))).join(","));
  }
  // BOM so Excel opens UTF-8 (arrows, ≤) correctly.
  save(filename, new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
}

export async function exportPdf(report: Report, filename = `${fileSlug(report.title)}-${stamp()}.pdf`) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const teal: [number, number, number] = [26, 143, 124];
  doc.setFillColor(7, 11, 16);
  doc.rect(0, 0, W, 58, "F");
  doc.setTextColor(46, 230, 197);
  doc.setFontSize(18);
  doc.text("Slyshark", 36, 36);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.text(report.title.slice(0, 90), 130, 36);
  let y = 82;
  doc.setTextColor(40, 40, 40);
  doc.setFontSize(10);
  if (report.subtitle) { doc.text(report.subtitle, 36, y); y += 16; }
  for (const [k, v] of [...(report.meta ?? []), ["Generated", new Date().toLocaleString()] as [string, string]]) {
    doc.setFont("helvetica", "bold"); doc.text(`${k}:`, 36, y);
    doc.setFont("helvetica", "normal"); doc.text(String(v).slice(0, 140), 140, y);
    y += 14;
  }
  for (const s of report.sections) {
    y += 10;
    if (y > doc.internal.pageSize.getHeight() - 80) { doc.addPage(); y = 50; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text(s.heading, 36, y);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    if (s.note) { y += 13; doc.text(s.note, 36, y); }
    autoTable(doc, {
      startY: y + 8,
      head: [s.columns.map((c) => c.label)],
      body: s.rows.slice(0, 5000).map((r) => s.columns.map((c) => cell(c, r).replace(/[^\x09\x0a\x0d\x20-\x7e -ÿ]/g, (ch) => ({ "→": "->", "≤": "<=", "≥": ">=", "✓": "v", "⚠": "!" } as Record<string, string>)[ch] ?? "?").slice(0, 400))),
      styles: { fontSize: 8, cellPadding: 3, overflow: "linebreak" },
      headStyles: { fillColor: teal, textColor: 255 },
      alternateRowStyles: { fillColor: [244, 247, 249] },
      margin: { left: 36, right: 36 },
      didParseCell: (d) => {
        if (d.section !== "body") return;
        const t = String(d.cell.raw ?? "").toLowerCase();
        if (["fail", "error", "high"].includes(t)) d.cell.styles.textColor = [200, 40, 40];
        else if (["pass", "open"].includes(t)) d.cell.styles.textColor = [20, 130, 80];
      },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  }
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8); doc.setTextColor(120);
    doc.text(`Slyshark report · page ${i} of ${pages}`, W - 36, doc.internal.pageSize.getHeight() - 20, { align: "right" });
  }
  doc.save(filename);
}
