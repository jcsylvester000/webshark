"use client";
/**
 * In-app confirm/prompt dialogs (replace window.confirm/prompt). Usage:
 *   if (await dialogs.confirm({ title, message, danger: true, typeToConfirm: name })) …
 *   const name = await dialogs.prompt({ title, label, defaultValue });
 */
import { AlertTriangle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { create } from "zustand";

type Field = { name: string; label: string; defaultValue?: string; placeholder?: string; type?: "text" | "password" | "url" };
let seq = 0;
type Req = { id?: number } & (
  | { kind: "confirm"; title: string; message?: string; confirmText?: string; danger?: boolean; typeToConfirm?: string; resolve: (v: boolean) => void }
  | { kind: "prompt"; title: string; message?: string; fields: Field[]; confirmText?: string; resolve: (v: Record<string, string> | null) => void });

const useDialogStore = create<{ queue: Req[]; push: (r: Req) => void; pop: () => void }>((set) => ({
  queue: [], push: (r) => set((s) => ({ queue: [...s.queue, { ...r, id: ++seq }] })), pop: () => set((s) => ({ queue: s.queue.slice(1) })),
}));

export const dialogs = {
  confirm: (o: { title: string; message?: string; confirmText?: string; danger?: boolean; typeToConfirm?: string }) =>
    new Promise<boolean>((resolve) => useDialogStore.getState().push({ kind: "confirm", ...o, resolve })),
  prompt: async (o: { title: string; message?: string; label: string; defaultValue?: string; placeholder?: string; confirmText?: string; type?: Field["type"] }) => {
    const r = await dialogs.form({ title: o.title, message: o.message, confirmText: o.confirmText, fields: [{ name: "value", label: o.label, defaultValue: o.defaultValue, placeholder: o.placeholder, type: o.type }] });
    return r ? r.value : null;
  },
  form: (o: { title: string; message?: string; fields: Field[]; confirmText?: string }) =>
    new Promise<Record<string, string> | null>((resolve) => useDialogStore.getState().push({ kind: "prompt", ...o, resolve })),
};

function Dialog({ req, done }: { req: Req; done: () => void }) {
  const [values, setValues] = useState<Record<string, string>>(() => req.kind === "prompt" ? Object.fromEntries(req.fields.map((f) => [f.name, f.defaultValue ?? ""])) : {});
  const [typed, setTyped] = useState("");
  const first = useRef<HTMLInputElement | HTMLButtonElement>(null);
  useEffect(() => { first.current?.focus(); }, []);
  const cancel = () => { if (req.kind === "confirm") req.resolve(false); else req.resolve(null); done(); };
  const ok = () => {
    if (req.kind === "confirm") { if (req.typeToConfirm && typed.trim() !== req.typeToConfirm) return; req.resolve(true); }
    else req.resolve(values);
    done();
  };
  const blocked = req.kind === "confirm" && !!req.typeToConfirm && typed.trim() !== req.typeToConfirm;
  const danger = req.kind === "confirm" && req.danger;
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4" onMouseDown={cancel}>
      <div role="dialog" aria-modal="true" aria-labelledby="dlg-title" className="panel w-full max-w-md p-5 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}><form className="space-y-4"
        onSubmit={(e) => { e.preventDefault(); ok(); }} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); cancel(); } }}>
        <div className="flex items-start gap-3">
          {danger && <AlertTriangle className="mt-0.5 shrink-0 text-danger" size={20} />}
          <div>
            <h2 id="dlg-title" className="font-semibold">{req.title}</h2>
            {req.message && <p className="mt-1 whitespace-pre-line text-sm text-muted">{req.message}</p>}
          </div>
        </div>
        {req.kind === "prompt" && req.fields.map((f, i) => (
          <div key={f.name}><label className="label" htmlFor={`dlg-${f.name}`}>{f.label}</label>
            <input id={`dlg-${f.name}`} type={f.type ?? "text"} ref={i === 0 ? (first as React.RefObject<HTMLInputElement>) : undefined} className="input" value={values[f.name]} placeholder={f.placeholder} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} /></div>
        ))}
        {req.kind === "confirm" && req.typeToConfirm && (
          <div><label className="label" htmlFor="dlg-type">Type <span className="font-mono normal-case text-ink">{req.typeToConfirm}</span> to confirm</label>
            <input id="dlg-type" ref={first as React.RefObject<HTMLInputElement>} className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" /></div>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={cancel}>Cancel</button>
          <button type="submit" ref={req.kind === "confirm" && !req.typeToConfirm ? (first as React.RefObject<HTMLButtonElement>) : undefined} disabled={blocked} className={danger ? "btn-danger" : "btn-primary"}>{req.confirmText ?? (danger ? "Delete" : "OK")}</button>
        </div>
      </form></div>
    </div>
  );
}

export function DialogHost() {
  const current = useDialogStore((s) => s.queue[0]);
  const pop = useDialogStore((s) => s.pop);
  return current ? <Dialog key={current.id} req={current} done={pop} /> : null;
}
