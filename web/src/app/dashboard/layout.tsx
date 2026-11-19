/** Protected dashboard layout. `src/proxy.ts` redirects signed-out visitors to /login. */
import type { Metadata } from "next";
import { Suspense } from "react";
import { Shell } from "@/components/Shell";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted">Loading…</div>}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}
