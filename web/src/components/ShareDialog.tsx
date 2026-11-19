"use client";
/** Share a read-only link to the project's last saved version, with optional password and expiry. */
import { Check, Copy, Link2, Lock, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { errMsg } from "@/lib/api";
import { command, query } from "@/lib/cqrs";
import { dialogs } from "./Dialogs";
import { HelpTip } from "./HelpTip";
import { PasswordInput } from "./PasswordInput";
import { Time } from "./Time";

type Share = { id: string; label: string; has_password: boolean; include_notes: boolean; include_runs: boolean; include_api_docs: boolean; include_report: boolean; expires_at: string | null; revoked_at: string | null; view_count: number; last_viewed_at: string | null; created_at: string; active: boolean };

export function ShareDialog({ projectId, dirty, onClose }: { projectId: string; dirty: boolean; onClose: () => void }) {
  const [shares, setShares] = useState<Share[]>([]);
  const [label, setLabel] = useState("");
  const [protect, setProtect] = useState(true);
  const [password, setPassword] = useState("");
  const [expires, setExpires] = useState("7");
  const [notes, setNotes] = useState(true);
  const [runs, setRuns] = useState(true);
  const [apiDocs, setApiDocs] = useState(true);
  const [report, setReport] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => query<Share[]>(`projects/${projectId}/shares`).then(setShares).catch((e) => setError(errMsg(e))), [projectId]);
  useEffect(() => { load(); }, [load]);

  async function create() {
    setError(null);
    if (protect && password.length < 6) return setError("Choose a password of at least 6 characters, or turn off password protection.");
    try {
      const r = await command<{ path: string }>("share.create", { projectId, label, password: protect ? password : "", expiresInDays: expires === "never" ? null : Number(expires), includeNotes: notes, includeRuns: runs, includeApiDocs: apiDocs, includeReport: report });
      setCreated(`${window.location.origin}${r.path}`); setPassword(""); setLabel(""); load();
    } catch (e) { setError(errMsg(e)); }
  }
  const copy = async (text: string) => { await navigator.clipboard.writeText(text).catch(() => null); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Share project" className="panel max-h-[90vh] w-full max-w-xl overflow-y-auto p-5" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === "Escape" && onClose()}>
        <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 font-semibold"><Link2 size={17} />Share a read-only link</h2><button onClick={onClose} aria-label="Close"><X size={16} /></button></div>
        <p className="mt-1 text-sm text-muted">Anyone with the link (and password, if set) can view the <b className="text-ink">last saved</b> diagram, inventory{notes ? ", notes" : ""}{apiDocs ? ", API reference" : ""}{report ? ", security report" : ""}{runs ? " and saved test runs" : ""}. API client requests, tokens and variables are never shared.</p>
        {dirty && <p className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">You have unsaved changes. Save the project first if you want them included.</p>}

        {created ? (
          <div className="mt-4 space-y-2 rounded-md border border-fin/40 bg-fin/5 p-3">
            <div className="text-sm font-medium">Link created. Copy it now: for security it is shown only once.</div>
            <div className="flex gap-2"><input readOnly aria-label="Share link" className="input font-mono text-xs" value={created} onFocus={(e) => e.target.select()} /><button className="btn" onClick={() => copy(created)}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy"}</button></div>
            <p className="text-xs text-muted">Send the password separately (e.g. by chat, not in the same email as the link).</p>
            <button className="text-sm text-fin" onClick={() => setCreated(null)}>Create another link</button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div><label className="label" htmlFor="sh-label">Label (only you see this)</label><input id="sh-label" className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. For instructor, Client review" maxLength={80} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={protect} onChange={(e) => setProtect(e.target.checked)} /><Lock size={14} />Require a password <HelpTip>Viewers must enter this password before seeing anything. After 10 wrong attempts the link locks for 15 minutes.</HelpTip></label>
            {report && <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">The security report lists weaknesses and how to reach them. Share it only with people who should fix or review them{protect ? "" : ", and keep a password on the link"}.</p>}
            {protect && <div><label className="label" htmlFor="sh-pw">Password</label><PasswordInput id="sh-pw" autoComplete="new-password" minLength={6} meter value={password} onChange={setPassword} /></div>}
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label" htmlFor="sh-exp">Link expires</label><select id="sh-exp" className="input" value={expires} onChange={(e) => setExpires(e.target.value)}><option value="1">After 1 day</option><option value="7">After 7 days</option><option value="30">After 30 days</option><option value="90">After 90 days</option><option value="never">Never</option></select></div>
              <div className="space-y-1.5 pt-5 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={notes} onChange={(e) => setNotes(e.target.checked)} />Include notes</label><label className="flex items-center gap-2"><input type="checkbox" checked={runs} onChange={(e) => setRuns(e.target.checked)} />Include saved test runs</label><label className="flex items-center gap-2"><input type="checkbox" checked={apiDocs} onChange={(e) => setApiDocs(e.target.checked)} />Include API reference</label><label className="flex items-center gap-2"><input type="checkbox" checked={report} onChange={(e) => setReport(e.target.checked)} />Include security report</label></div>
            </div>
            {error && <p role="alert" className="text-sm text-danger">{error}</p>}
            <button className="btn-primary" onClick={create}><Link2 size={14} />Create link</button>
          </div>
        )}

        <h3 className="mt-6 text-sm font-medium">Links for this project</h3>
        <ul className="mt-2 divide-y divide-line/60 text-sm">
          {shares.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">{s.has_password && <Lock size={12} className="text-fin" aria-label="Password protected" />}<span className="truncate">{s.label || "Untitled link"}</span>
                  {s.include_api_docs && <span className="chip">API docs</span>}{s.include_report && <span className="chip">Security report</span>}{!s.active && <span className="chip">{s.revoked_at ? "Turned off" : "Expired"}</span>}</span>
                <span className="block text-xs text-muted">Created <Time value={s.created_at} /> · {s.revoked_at ? <>turned off <Time value={s.revoked_at} /></> : s.expires_at ? <>{s.active ? "expires" : "expired"} <Time value={s.expires_at} /></> : "never expires"} · {s.view_count} view{s.view_count === 1 ? "" : "s"}{s.last_viewed_at ? <>, last <Time value={s.last_viewed_at} /></> : ""}</span>
              </span>
              {s.active && <button className="btn-danger px-2 py-1 text-xs" onClick={async () => { if (await dialogs.confirm({ title: "Turn off this link?", message: "People with the link will no longer be able to open it.", confirmText: "Turn off", danger: true })) { await command("share.revoke", { id: s.id }).catch((e) => setError(errMsg(e))); load(); } }}>Turn off</button>}
            </li>
          ))}
          {!shares.length && <li className="py-2 text-muted">No links yet.</li>}
        </ul>
      </div>
    </div>
  );
}
