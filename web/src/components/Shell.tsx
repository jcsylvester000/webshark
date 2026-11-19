"use client";
/** Dashboard chrome: sidebar navigation, signed-in user, and sign-out. */
import { Activity, Cable, FileSearch, LayoutDashboard, LogOut, Radar, Send, SquareTerminal } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { User } from "@/lib/types";
import { Logo, Wordmark } from "./Logo";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/environments", label: "Environments", icon: Cable },
  { href: "/dashboard/terminal", label: "Console", icon: SquareTerminal },
  { href: "/dashboard/api-client", label: "API Client", icon: Send },
  { href: "/dashboard/scanner", label: "Scanner & Audit", icon: Radar },
  { href: "/dashboard/captures", label: "Packet Captures", icon: FileSearch },
  { href: "/dashboard/activity", label: "Activity Log", icon: Activity },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => { api<User>("/auth/me").then(setUser).catch(() => null); }, []);
  const designer = /^\/dashboard\/environments\/[^/]+$/.test(path);

  async function logout() {
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
      <main className="min-w-0 flex-1 overflow-auto">{children}</main>
    </div>
  );
}
