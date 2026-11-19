"use client";
/** Edit a project's organization details: name, description, tags, stage, pin (command project.updateDetails). */
import { X } from "lucide-react";
import { useState } from "react";
import { errMsg } from "@/lib/api";
import { command, STAGES } from "@/lib/cqrs";
import { HelpTip } from "./HelpTip";

export type Details = { id: string; name: string; description: string; tags: string[]; stage: string; pinned: boolean };

export function TagInput({ value, onChange }: { value: string[]; onChange: (t: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const t = raw.trim().toLowerCase().replace(/\s+/g, "-").replace(/^#/, "").slice(0, 32);
    if (t && !value.includes(t) && value.length < 12) onChange([...value, t]);
    setDraft("");
  };
  return (
    <div className="input flex flex-wrap items-center gap-1 py-1">
      {value.map((t) => <span key={t} className="chip text-ink">#{t}<button type="button" aria-label={`Remove tag ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}><X size={11} /></button></span>)}
      <input aria-label="Add tag" className="min-w-24 flex-1 bg-transparent py-0.5 text-sm outline-none" value={draft} placeholder={value.length ? "" : "e.g. client-a, pci, homelab"}
        onChange={(e) => { if (e.target.value.endsWith(",")) add(e.target.value.slice(0, -1)); else setDraft(e.target.value); }}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(draft); } if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1)); }}
        onBlur={() => draft && add(draft)} />
    </div>
  );
}

export function StageSelect({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) {
  return <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)}>{STAGES.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}</select>;
}

export function ProjectDetailsDialog({ project, onClose, onSaved }: { project: Details; onClose: () => void; onSaved: (d: Details) => void }) {
  const [d, setD] = useState<Details>(project);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true); setError(null);
    try { await command("project.updateDetails", { id: d.id, name: d.name, description: d.description, tags: d.tags, stage: d.stage, pinned: d.pinned }); onSaved(d); onClose(); }
    catch (e) { setError(errMsg(e)); setBusy(false); }
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Project details" className="panel w-full max-w-lg p-5" onMouseDown={(e) => e.stopPropagation()}><form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save(); }} onKeyDown={(e) => e.key === "Escape" && onClose()}>
        <div className="flex items-center justify-between"><h2 className="font-semibold">Project details</h2><button type="button" onClick={onClose} aria-label="Close"><X size={16} /></button></div>
        <div><label className="label" htmlFor="pd-name">Name</label><input id="pd-name" className="input" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} required maxLength={120} autoFocus /></div>
        <div><label className="label" htmlFor="pd-desc">Description</label><textarea id="pd-desc" className="input min-h-24" value={d.description} maxLength={1000} onChange={(e) => setD({ ...d, description: e.target.value })} placeholder="What is this environment? Who owns it? What is in scope for testing?" /></div>
        <div><span className="label">Tags <HelpTip>Short labels for grouping and searching, like the client, site, course or topic. Press Enter or comma after each one.</HelpTip></span><TagInput value={d.tags} onChange={(tags) => setD({ ...d, tags })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label" htmlFor="pd-stage">Stage <HelpTip>Which kind of environment this documents. Production means real users, so test it carefully.</HelpTip></label><StageSelect id="pd-stage" value={d.stage} onChange={(stage) => setD({ ...d, stage })} /></div>
          <label className="mt-6 flex items-center gap-2 text-sm"><input type="checkbox" checked={d.pinned} onChange={(e) => setD({ ...d, pinned: e.target.checked })} />Pin to the top</label>
        </div>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Save details"}</button></div>
      </form></div>
    </div>
  );
}
