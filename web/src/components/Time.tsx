"use client";
/** Renders a timestamp as "5 min ago" (or absolute, per preference) with the exact time on hover. */
import { useEffect, useState } from "react";
import { usePrefs } from "@/lib/prefs";

export function absolute(d: Date, clock: "12" | "24") {
  return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: clock === "12" });
}

export function relative(d: Date, now = Date.now()) {
  const s = Math.round((now - d.getTime()) / 1000);
  if (s < 0) {
    const f = -s;
    if (f < 3600) return `in ${Math.max(1, Math.round(f / 60))} min`;
    if (f < 86400) return `in ${Math.round(f / 3600)} h`;
    return `in ${Math.round(f / 86400)} days`;
  }
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 2) return "yesterday";
  if (s < 86400 * 30) return `${Math.round(s / 86400)} days ago`;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function Time({ value, prefix = "" }: { value: string | Date | null | undefined; prefix?: string }) {
  const { relativeTimes, clock } = usePrefs((s) => s.prefs);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30_000); return () => clearInterval(t); }, []);
  if (!value) return <span>—</span>;
  const d = new Date(value);
  const abs = absolute(d, clock);
  return <time dateTime={d.toISOString()} title={abs}>{prefix}{relativeTimes ? relative(d) : abs}</time>;
}
