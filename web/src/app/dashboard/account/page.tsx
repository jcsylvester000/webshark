"use client";
/** Account: profile, display settings, password, active sessions, and account deletion. */
import { Laptop, LogOut, Monitor, Moon, Smartphone, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { dialogs } from "@/components/Dialogs";
import { PageHeader } from "@/components/PageHeader";
import { PasswordInput } from "@/components/PasswordInput";
import { Avatar } from "@/components/Shell";
import { Time } from "@/components/Time";
import { errMsg } from "@/lib/api";
import { command, query } from "@/lib/cqrs";
import { usePrefs, type Prefs } from "@/lib/prefs";

type Profile = { id: string; username: string; email: string; display_name: string | null; role: string; created_at: string; last_login_at: string | null; workspace_count: number; project_count: number; run_count: number };
type Session = { id: string; user_agent: string | null; created_at: string; expires_at: string; current: boolean };

function device(ua: string | null) {
  const u = ua ?? "";
  const browser = /Edg\//.test(u) ? "Edge" : /Chrome\//.test(u) ? "Chrome" : /Firefox\//.test(u) ? "Firefox" : /Safari\//.test(u) ? "Safari" : "Browser";
  const os = /Windows/.test(u) ? "Windows" : /Mac OS X/.test(u) ? "macOS" : /Android/.test(u) ? "Android" : /iPhone|iPad/.test(u) ? "iOS" : /Linux/.test(u) ? "Linux" : "Unknown OS";
  return { label: `${browser} on ${os}`, mobile: /Android|iPhone|iPad/.test(u) };
}

function Section({ title, desc, children, tour }: { title: string; desc?: string; children: React.ReactNode; tour?: string }) {
  return <section className="panel p-5" data-tour={tour}><h2 className="font-medium">{title}</h2>{desc && <p className="mt-0.5 text-sm text-muted">{desc}</p>}<div className="mt-4">{children}</div></section>;
}
function Choice<T extends string>({ value, options, onChange, label }: { value: T; options: { v: T; label: string; icon?: React.ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-line p-0.5">
      {options.map((o) => <button key={o.v} type="button" role="radio" aria-checked={value === o.v} onClick={() => onChange(o.v)} className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm ${value === o.v ? "bg-fin/15 text-fin" : "text-muted hover:text-ink"}`}>{o.icon}{o.label}</button>)}
    </div>
  );
}

export default function AccountPage() {
  const router = useRouter();
  const prefs = usePrefs((s) => s.prefs);
  const setPrefs = usePrefs((s) => s.set);
  const [me, setMe] = useState<Profile | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [msg, setMsg] = useState<Record<string, { ok: boolean; text: string } | undefined>>({});
  const flash = (k: string, ok: boolean, text: string) => { setMsg((m) => ({ ...m, [k]: { ok, text } })); if (ok) setTimeout(() => setMsg((m) => ({ ...m, [k]: undefined })), 3000); };

  const load = useCallback(async () => {
    const p = await query<Profile>("profile");
    setMe(p); setDisplayName(p.display_name ?? ""); setEmail(p.email);
    setSessions(await query<Session[]>("sessions"));
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch; state is set after the request resolves
  useEffect(() => { load().catch(() => null); }, [load]);

  async function savePrefs(patch: Partial<Prefs>) {
    const next = { ...prefs, ...patch };
    setPrefs(patch);
    try { await command("profile.savePreferences", next); flash("display", true, "Display settings saved"); } catch (e) { flash("display", false, errMsg(e)); }
  }

  if (!me) return <div><PageHeader title="Account & settings" subtitle="Your profile, how Slyshark looks, and how your account is protected." /><p className="p-6 text-sm text-muted">Loading your account…</p></div>;
  const name = me.display_name || me.username;

  return (
    <div>
      <PageHeader title="Account & settings" subtitle="Your profile, how Slyshark looks, and how your account is protected." />
      <div className="mx-auto max-w-3xl space-y-5 p-6">
        <div className="flex items-center gap-4">
          <Avatar name={name} size={56} />
          <div>
            <div className="text-lg font-semibold">{name}</div>
            <div className="text-sm text-muted">@{me.username} · member since <Time value={me.created_at} /> · {me.workspace_count} workspaces · {me.project_count} projects · {me.run_count} saved runs</div>
          </div>
        </div>

        <Section title="Profile" desc="Your name is used to greet you and appears on shared links.">
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={async (e) => {
            e.preventDefault();
            try { await command("profile.update", { displayName, email }); flash("profile", true, "Profile saved"); load(); } catch (er) { flash("profile", false, errMsg(er)); }
          }}>
            <div><label className="label" htmlFor="acc-name">Display name</label><input id="acc-name" className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} /></div>
            <div><label className="label" htmlFor="acc-email">Email</label><input id="acc-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
            <div className="flex items-center gap-3 sm:col-span-2"><button className="btn-primary">Save profile</button>{msg.profile && <span role="status" className={`text-sm ${msg.profile.ok ? "text-emerald-300" : "text-danger"}`}>{msg.profile.text}</span>}</div>
          </form>
        </Section>

        <Section title="Display" desc="Changes apply instantly and are saved to your account, so they follow you to any device.">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm">Theme</span>
              <Choice label="Theme" value={prefs.theme} onChange={(v) => savePrefs({ theme: v })} options={[{ v: "dark", label: "Dark", icon: <Moon size={14} /> }, { v: "light", label: "Light", icon: <Sun size={14} /> }, { v: "system", label: "System", icon: <Monitor size={14} /> }]} /></div>
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm">Text size</span>
              <Choice label="Text size" value={prefs.textSize} onChange={(v) => savePrefs({ textSize: v })} options={[{ v: "sm", label: "Small" }, { v: "md", label: "Default" }, { v: "lg", label: "Large" }]} /></div>
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm">Clock</span>
              <Choice label="Clock" value={prefs.clock} onChange={(v) => savePrefs({ clock: v })} options={[{ v: "12", label: "12-hour" }, { v: "24", label: "24-hour" }]} /></div>
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm">After signing in, open</span>
              <select aria-label="Start page" className="input w-60" value={prefs.startPage} onChange={(e) => savePrefs({ startPage: e.target.value as Prefs["startPage"] })}>
                <option value="/dashboard">Overview</option><option value="/dashboard/workspaces">Workspaces & projects</option><option value="last-project">The last project I opened</option>
              </select></div>
            {([["relativeTimes", "Show relative times (\"5 min ago\")", "Hover any time to see the exact date."], ["learningTips", "Learning tips", "Shows ⓘ explanations of networking and security terms. Turn off once you know them."], ["reduceMotion", "Reduce motion", "Stops animated attack paths and transitions."]] as const).map(([k, label, hint]) => (
              <label key={k} className="flex items-start justify-between gap-4 text-sm"><span>{label}<span className="block text-xs text-muted">{hint}</span></span>
                <input type="checkbox" className="mt-1 h-4 w-4" checked={prefs[k]} onChange={(e) => savePrefs({ [k]: e.target.checked })} /></label>
            ))}
            {prefs.onboardingDismissed && <button className="btn text-xs" onClick={() => savePrefs({ onboardingDismissed: false })}>Show the getting-started checklist again</button>}
            {msg.display && <p role="status" className={`text-sm ${msg.display.ok ? "text-emerald-300" : "text-danger"}`}>{msg.display.text}</p>}
          </div>
        </Section>

        <Section title="Password" desc="Changing your password signs out your other devices.">
          <form className="grid gap-3 sm:grid-cols-3" onSubmit={async (e) => {
            e.preventDefault();
            if (pw.next !== pw.confirm) return flash("pw", false, "New passwords do not match");
            try { const r = await command<{ otherSessionsSignedOut: number }>("profile.changePassword", { currentPassword: pw.current, newPassword: pw.next }); setPw({ current: "", next: "", confirm: "" }); flash("pw", true, `Password changed${r.otherSessionsSignedOut ? `; ${r.otherSessionsSignedOut} other session(s) signed out` : ""}`); load(); }
            catch (er) { flash("pw", false, errMsg(er)); }
          }}>
            <div><label className="label" htmlFor="pw-cur">Current</label><PasswordInput id="pw-cur" autoComplete="current-password" value={pw.current} onChange={(v) => setPw({ ...pw, current: v })} /></div>
            <div><label className="label" htmlFor="pw-new">New</label><PasswordInput id="pw-new" autoComplete="new-password" minLength={8} meter value={pw.next} onChange={(v) => setPw({ ...pw, next: v })} /></div>
            <div><label className="label" htmlFor="pw-conf">Confirm new</label><PasswordInput id="pw-conf" autoComplete="new-password" minLength={8} value={pw.confirm} onChange={(v) => setPw({ ...pw, confirm: v })} /></div>
            <div className="flex items-center gap-3 sm:col-span-3"><button className="btn-primary">Change password</button>{msg.pw && <span role="status" className={`text-sm ${msg.pw.ok ? "text-emerald-300" : "text-danger"}`}>{msg.pw.text}</span>}</div>
          </form>
        </Section>

        <Section tour="sessions" title="Where you're signed in" desc="Sign out of devices you don't recognise or no longer use.">
          <ul className="divide-y divide-line/60">
            {sessions.map((s) => {
              const d = device(s.user_agent);
              return (
                <li key={s.id} className="flex items-center gap-3 py-2.5 text-sm">
                  {d.mobile ? <Smartphone size={18} className="text-muted" /> : <Laptop size={18} className="text-muted" />}
                  <span className="flex-1">{d.label}{s.current && <span className="chip ml-2 text-fin">This device</span>}<span className="block text-xs text-muted">Signed in <Time value={s.created_at} /> · expires <Time value={s.expires_at} /></span></span>
                  {!s.current && <button className="btn text-xs" onClick={async () => { await command("session.revoke", { id: s.id }).catch(() => null); load(); }}><LogOut size={13} />Sign out</button>}
                </li>
              );
            })}
          </ul>
          {sessions.length > 1 && <button className="btn mt-3" onClick={async () => { const r = await command<{ count: number }>("session.revokeOthers", {}); flash("sess", true, `Signed out ${r.count} other session(s)`); load(); }}>Sign out all other devices</button>}
          {msg.sess && <p role="status" className="mt-2 text-sm text-emerald-300">{msg.sess.text}</p>}
        </Section>

        <section className="panel border-danger/40 p-5" data-tour="delete-account">
          <h2 className="font-medium text-danger">Delete account</h2>
          <p className="mt-0.5 text-sm text-muted">Permanently deletes your account, workspaces, projects, saved runs and share links. This cannot be undone. Export anything you want to keep first.</p>
          <button className="btn-danger mt-4" onClick={async () => {
            const ok = await dialogs.confirm({ title: "Delete your account?", message: "Everything you created in Slyshark will be erased.", danger: true, typeToConfirm: me.username, confirmText: "Continue" });
            if (!ok) return;
            const password = await dialogs.prompt({ title: "Confirm with your password", label: "Password", type: "password", confirmText: "Delete my account" });
            if (password === null) return;
            try { await command("account.delete", { confirmUsername: me.username, password }); await fetch("/api/auth/logout", { method: "POST" }); router.replace("/?deleted=1"); }
            catch (e) { flash("del", false, errMsg(e)); }
          }}>Delete my account…</button>
          {msg.del && <p role="alert" className="mt-2 text-sm text-danger">{msg.del.text}</p>}
        </section>
      </div>
    </div>
  );
}
