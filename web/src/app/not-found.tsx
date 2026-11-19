import Link from "next/link";
import { Wordmark } from "@/components/Logo";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-6 text-center">
      <div className="max-w-md space-y-4">
        <div className="flex justify-center"><Wordmark /></div>
        <h1 className="text-2xl font-semibold">We couldn&apos;t find that page</h1>
        <p className="text-muted">The link may be old, or the project was moved or deleted.</p>
        <div className="flex justify-center gap-2"><Link className="btn-primary" href="/dashboard">Go to dashboard</Link><Link className="btn" href="/dashboard/workspaces">Browse workspaces</Link></div>
      </div>
    </main>
  );
}
