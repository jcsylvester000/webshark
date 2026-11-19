"use client";
/** ⓘ learning tip. Shown when "Learning tips" is on; click/hover reveals a short explanation. */
import { Info } from "lucide-react";
import { useId, useState } from "react";
import { usePrefs } from "@/lib/prefs";

export function HelpTip({ children, label = "What is this?" }: { children: React.ReactNode; label?: string }) {
  const on = usePrefs((s) => s.prefs.learningTips);
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!on) return null;
  return (
    <span className="relative inline-flex align-middle" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-label={label} aria-describedby={open ? id : undefined} aria-expanded={open} onClick={() => setOpen(!open)} onBlur={() => setOpen(false)}
        className="ml-1 text-fin/70 hover:text-fin"><Info size={13} /></button>
      {open && <span role="tooltip" id={id} className="absolute left-1/2 top-full z-50 mt-1 w-72 -translate-x-1/2 rounded-md border border-line bg-panel-2 p-2.5 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-ink shadow-xl">{children}</span>}
    </span>
  );
}
