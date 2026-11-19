"use client";
/**
 * Dashboard chrome: grouped navigation (saved work vs. quick tools), account menu, open-project
 * tabs, mobile drawer, dialog host, preference loading, and the unsaved-changes guard.
 */
import { FileSearch, FlaskConical, FolderKanban, HelpCircle, LayoutDashboard, LogOut, Menu, Radar, Send, Settings, SquareTerminal, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { DEFAULT_PREFS, usePrefs, type Prefs } from "@/lib/prefs";
import { anyDirty, useProjects } from "@/lib/store";
import { DialogHost, dialogs } from "./Dialogs";
import { Logo, Wordmark } from "./Logo";

type Profile = { id: string; username: string; email: string; display_name: string | null; preferences: Partial<Prefs> };

const WORK = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/workspaces", label: "Workspaces & projects", icon: FolderKanban },
  { href: "/dashboard/runs", label: "Test runs", icon: FlaskConical },
];
const TOOLS = [
  { href: "/dashboard/terminal", label: "Console", icon: SquareTerminal },
  { href: "/dashboard/api-client", label: "API client", icon: Send },
  { href: "/dashboard/scanner", label: "Scanner & audit", icon: Radar },
  { href: "/dashboard/captures", label: "Packet captures", icon: FileSearch },
];
const HUES = ["#2ee6c5", "#60a5fa", "#a78bfa", "#f472b6", "#f59e0b", "#4ade80"];

export function Avatar({ name, size = 30 }: { name: string; size?: number }) {
  const initials = name.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
  const hue = HUES[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length];
  return <span aria-hidden="true" className="grid shrink-0 place-items-center rounded-full font-semibold text-[#070b10]" style={{ width: size, height: size, background: hue, fontSize: size * 0.4 }}>{initials}</span>;
}

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<Profile | null>(null);
  const [drawer, setDrawer] = useState(false);
  const tabs = useProjects((s) => s.tabs);
  const loaded = useProjects((s) => s.loaded);
  const closeProject = useProjects((s) => s.close);
  const setPrefs = usePrefs((s) => s.set);

  useEffect(() => {
    api<Profile>("/queries/profile").then((u) => { setUser(u); setPrefs({ ...DEFAULT_PREFS, ...u.preferences }); }).catch(() => null);
    useProjects.getState().restoreTabs();
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onScheme = () => setPrefs({});
    mq.addEventListener("change", onScheme);
    return () => mq.removeEventListener("change", onScheme);
  }, [setPrefs]);
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => { if (anyDirty()) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);
  const compact = /^\/dashboard\/projects\/[^/]+$/.test(path);
  const name = user?.display_name || user?.username || "";

  async function closeTab(id: string) {
    if (loaded[id]?.dirty && !(await dialogs.confirm({ title: "Close without saving?", message: "This project has unsaved changes. They will be lost.", confirmText: "Close and discard", danger: true }))) return;
    closeProject(id);
    if (path === `/dashboard/projects/${id}`) router.push("/dashboard/workspaces");
  }
  async function logout() {
    if (anyDirty() && !(await dialogs.confirm({ title: "Sign out with unsaved changes?", message: "Unsaved project changes will be lost.", confirmText: "Sign out", danger: true }))) return;
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const navLink = ({ href, label, icon: Icon }: (typeof WORK)[number], small: boolean) => {
    const active = href === "/dashboard" ? path === href : path.startsWith(href);
    return (
      <Link key={href} href={href} title={label} aria-current={active ? "page" : undefined} onClick={() => setDrawer(false)}
        className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm ${active ? "bg-fin/10 text-fin" : "text-muted hover:bg-panel-2 hover:text-ink"}`}>
        <Icon size={17} className="shrink-0" />{!small && label}
      </Link>
    );
  };
  const sidebar = (small: boolean) => (
    <>
      <div className="flex h-14 items-center justify-between px-3">
        <Link href="/dashboard" aria-label="Slyshark home" className={small ? "mx-auto" : ""}>{small ? <Logo /> : <Wordmark />}</Link>
        <button className="md:hidden" onClick={() => setDrawer(false)} aria-label="Close menu"><X size={18} /></button>
      </div>
      <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-2" aria-label={small ? "Main (compact)" : "Main"}>
        <div className="space-y-0.5">{!small && <div className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted">Your work</div>}{WORK.map((n) => navLink(n, small))}</div>
        <div className="space-y-0.5">
          {!small && <div className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted" title="These tools never save. Use a project to keep work.">Quick tools · not saved</div>}
          {small && <div className="mx-2 border-t border-line" />}
          {TOOLS.map((n) => navLink(n, small))}
        </div>
        <div className="space-y-0.5">{navLink({ href: "/dashboard/help", label: "Help & glossary", icon: HelpCircle }, small)}</div>
      </nav>
      <div className="border-t border-line p-2">
        <Link href="/dashboard/account" onClick={() => setDrawer(false)} title="Account & display settings" className={`flex items-center gap-2.5 rounded-md p-2 hover:bg-panel-2 ${path.startsWith("/dashboard/account") ? "bg-panel-2" : ""}`}>
          <Avatar name={name || "?"} />
          {!small && <span className="min-w-0 flex-1"><span className="block truncate text-sm">{name || "…"}</span><span className="block truncate text-xs text-muted">{user?.email}</span></span>}
          {!small && <Settings size={15} className="text-muted" />}
        </Link>
        <button onClick={logout} title="Sign out" className="mt-1 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-muted hover:bg-panel-2 hover:text-ink">
          <LogOut size={16} />{!small && "Sign out"}
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      <aside aria-label="Sidebar" className={`${compact ? "w-14" : "w-60"} hidden shrink-0 flex-col border-r border-line bg-panel md:flex`}>{sidebar(compact)}</aside>
      {drawer && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setDrawer(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <aside aria-label="Menu" className="relative flex h-full w-72 flex-col border-r border-line bg-panel" onClick={(e) => e.stopPropagation()}>{sidebar(false)}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-panel px-3 md:hidden">
          <button onClick={() => setDrawer(true)} aria-label="Open menu"><Menu size={20} /></button><Wordmark />
        </header>
        {/* On a project page the bar always ends up with at least that project: reserve its space up front (no layout shift). */}
        {tabs.length === 0 && path.startsWith("/dashboard/projects/") && <div className="h-9 shrink-0 border-b border-line bg-bg" aria-hidden />}
        {tabs.length > 0 && (
          <nav className="flex h-9 shrink-0 items-end gap-0.5 overflow-x-auto border-b border-line bg-bg px-2" aria-label="Open projects">
            {tabs.map((t) => {
              const active = path === `/dashboard/projects/${t.id}`;
              const p = loaded[t.id];
              return (
                <div key={t.id} className={`group flex max-w-56 items-center gap-1.5 rounded-t-md border border-b-0 px-2.5 py-1 text-xs ${active ? "border-line bg-panel text-ink" : "border-transparent text-muted hover:text-ink"}`}>
                  <Link href={`/dashboard/projects/${t.id}`} className="flex min-w-0 items-center gap-1.5" title={p?.dirty ? "Unsaved changes" : p ? "Open" : "Click to load"}>
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${p?.dirty ? "bg-amber-400" : p ? "bg-fin" : "bg-line"}`} />
                    <span className="truncate">{p?.meta.name ?? t.name}</span>{p?.dirty && <span className="sr-only">(unsaved)</span>}
                  </Link>
                  <button onClick={() => closeTab(t.id)} aria-label={`Close ${t.name}`} className="opacity-60 hover:opacity-100"><X size={12} /></button>
                </div>
              );
            })}
          </nav>
        )}
        <main id="main" className="min-h-0 flex-1 overflow-auto">{children}</main>
      </div>
      <DialogHost />
    </div>
  );
}
