"use client";
/** Password field with show/hide toggle and optional strength meter. */
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

export function strength(pw: string): { score: number; label: string } {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return { score: Math.min(s, 4), label: ["Too short", "Weak", "Fair", "Good", "Strong"][Math.min(s, 4)] };
}

export function PasswordInput({ id, name, autoComplete, meter, minLength, value, onChange, required = true }: { id: string; name?: string; autoComplete: string; meter?: boolean; minLength?: number; value?: string; onChange?: (v: string) => void; required?: boolean }) {
  const [show, setShow] = useState(false);
  const [local, setLocal] = useState("");
  const v = value ?? local;
  const st = strength(v);
  return (
    <div>
      <div className="relative">
        <input id={id} name={name ?? id} type={show ? "text" : "password"} className="input pr-10" autoComplete={autoComplete} minLength={minLength} required={required}
          value={v} onChange={(e) => { setLocal(e.target.value); onChange?.(e.target.value); }} aria-describedby={meter ? `${id}-meter` : undefined} />
        <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-0.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded text-muted hover:text-ink">
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
      {meter && (
        <div id={`${id}-meter`} className="mt-1.5" aria-live="polite">
          <div className="flex gap-1">{[0, 1, 2, 3].map((i) => <span key={i} className={`h-1 flex-1 rounded ${v && i < st.score ? ["bg-red-500", "bg-orange-500", "bg-amber-400", "bg-emerald-500"][st.score - 1] : "bg-line"}`} />)}</div>
          <p className="mt-1 text-xs text-muted">{v ? `${st.label}. ` : ""}Use 8+ characters; mixing upper/lower case, numbers and symbols makes it stronger.</p>
        </div>
      )}
    </div>
  );
}
