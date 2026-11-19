"use client";
/** Dashboard chrome: sidebar navigation, signed-in user, and sign-out. */
import { FileSearch, FlaskConical, FolderKanban, LayoutDashboard, LogOut, Radar, Send, SquareTerminal, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { anyDirty, useProjects } from "@/lib/store";
import type { User } from "@/lib/types";
import { Logo, Wordmark } from "./Logo";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/workspaces", label: "Workspaces", icon: FolderKanban },
  { href: "/dashboard/terminal", label: "Console", icon: SquareTerminal },
  { href: "/dashboard/api-client", label: "API Client", icon: Send },
  { href: "/dashboard/scanner", label: "Scanner & Audit", icon: Radar },
  { href: "/dashboard/captures", label: "Packet Captures", icon: FileSearch },
  { href: "/dashboard/runs", label: "Test Runs", icon: FlaskConical },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const tabs = useProjects((s) => s.tabs);
  const loaded = useProjects((s) => s.loaded);
  const closeProject = useProjects((s) => s.close);
  useEffect(() => { api<User>("/auth/me").then(setUser).catch(() => null); useProjects.getState().restoreTabs(); }, []);
  // Warn before leaving the app with unsaved project changes.
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => { if (anyDirty()) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);
  const designer = /^\/dashboard\/projects\/[^/]+$/.test(path);

  function closeTab(id: string) {
    if (loaded[id]?.dirty && !confirm("This project has unsaved changes. Close it and discard them?")) return;
    closeProject(id);
    if (path === `/dashboard/projects/${id}`) router.push("/dashboard/workspaces");
  }

  async function logout() {
    if (anyDirty() && !confirm("You have unsaved project changes. Sign out anyway?")) return;
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className={`${designer ? "w-14" : "w-56"} flex shrink-0 flex-col border-r border-line bg-panel transition-all`}>
        <div className="flex h-14 items-center px-3">{designer ? <Link href="/dashboard" className="mx-auto" aria-label="Slyshark home"><Logo /></Link> : <Link href="/dashboard"><Wordmark /></Link>}</div>
        <nav className="flex-1 space-y-0.5 px-2 py-2">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/dashboard" ? path === href : path.startsWith(href);
            return (
              <Link key={href} href={href} title={label}
                className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm ${active ? "bg-fin/10 text-fin" : "text-muted hover:bg-panel-2 hover:text-ink"}`}>
                <Icon size={17} className="shrink-0" />{!designer && label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-line p-2">
          {!designer && user && <div className="truncate px-2 pb-2 text-xs text-muted">{user.display_name ?? user.username}<br /><span className="text-muted/70">{user.email}</span></div>}
          <button onClick={logout} title="Sign out" className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-muted hover:bg-panel-2 hover:text-ink">
            <LogOut size={16} />{!designer && "Sign out"}
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        {tabs.length > 0 && (
          <div className="flex h-9 shrink-0 items-end gap-0.5 overflow-x-auto border-b border-line bg-bg px-2" aria-label="Open projects">
            {tabs.map((t) => {
              const active = path === `/dashboard/projects/${t.id}`;
              const p = loaded[t.id];
              return (
                <div key={t.id} className={`group flex max-w-56 items-center gap-1.5 rounded-t-md border border-b-0 px-2.5 py-1 text-xs ${active ? "border-line bg-panel text-ink" : "border-transparent text-muted hover:text-ink"}`}>
                  <Link href={`/dashboard/projects/${t.id}`} className="flex min-w-0 items-center gap-1.5" title={p ? "Loaded" : "Not loaded: opens on click"}>
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${p?.dirty ? "bg-amber-400" : p ? "bg-fin" : "bg-line"}`} />
                    <span className="truncate">{p?.meta.name ?? t.name}</span>
                  </Link>
                  <button onClick={() => closeTab(t.id)} aria-label={`Close ${t.name}`} className="opacity-50 hover:opacity-100"><X size={12} /></button>
                </div>
              );
            })}
          </div>
        )}
        <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
