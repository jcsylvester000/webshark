"use client";
/** Login / registration form. Posts to the Next.js auth route handlers, which set the session cookie. */
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Wordmark } from "./Logo";
import { PasswordInput } from "./PasswordInput";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    if (mode === "register" && form.password !== form.confirm) {
      setError("Passwords do not match");
      setBusy(false);
      return;
    }
    const body = mode === "login"
      ? { identifier: form.identifier, password: form.password }
      : { username: form.username, email: form.email, password: form.password, display_name: form.display_name };
    const res = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.message ?? "Something went wrong");
      setBusy(false);
      return;
    }
    const next = params.get("next");
    let dest = next?.startsWith("/dashboard") ? next : "/dashboard";
    if (!next && mode === "login") {
      // Honour the "start page" display preference.
      const start = data.user?.preferences?.startPage;
      if (start === "/dashboard/workspaces") dest = start;
      if (start === "last-project") { try { const last = JSON.parse(localStorage.getItem("slyshark.lastProject") ?? "null"); if (last?.id) dest = `/dashboard/projects/${last.id}`; } catch { /* ignore */ } }
    }
    router.replace(dest);
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <h1 className="sr-only">{mode === "login" ? "Sign in to Slyshark" : "Create a Slyshark account"}</h1>
      <form onSubmit={submit} className="panel w-full max-w-sm space-y-4 p-7">
        <Link href="/"><Wordmark /></Link>
        <div>
          <h2 className="text-xl font-semibold">{mode === "login" ? "Sign in" : "Create your account"}</h2>
          <p className="text-sm text-muted">{mode === "login" ? "Welcome back. Pick up your projects where you left off." : "Free account. Your projects stay private unless you share them."}</p>
        </div>
        {mode === "login" ? (
          <>
            <div><label className="label" htmlFor="identifier">Username or email</label><input id="identifier" name="identifier" className="input" autoComplete="username" required /></div>
            <div><label className="label" htmlFor="password">Password</label><PasswordInput id="password" autoComplete="current-password" /></div>
          </>
        ) : (
          <>
            <div><label className="label" htmlFor="display_name">Your name</label><input id="display_name" name="display_name" className="input" placeholder="How we greet you, e.g. Bea" autoComplete="name" /></div>
            <div><label className="label" htmlFor="username">Username</label><input id="username" name="username" className="input" pattern="[A-Za-z0-9_.\-]{3,32}" title="3-32 letters, numbers, _ . -" required autoComplete="username" aria-describedby="username-hint" /><p id="username-hint" className="mt-1 text-xs text-muted">3–32 letters, numbers, dots, dashes or underscores. You can sign in with it or your email.</p></div>
            <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" className="input" autoComplete="email" required /></div>
            <div><label className="label" htmlFor="password">Password</label><PasswordInput id="password" autoComplete="new-password" minLength={8} meter /></div>
            <div><label className="label" htmlFor="confirm">Confirm password</label><PasswordInput id="confirm" autoComplete="new-password" minLength={8} /></div>
          </>
        )}
        {mode === "login" && params.get("expired") && !error && <p role="status" className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">Your session expired. Sign in again to continue where you were.</p>}
        {error && <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <button className="btn-primary w-full justify-center py-2" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</button>
        {mode === "login" && <p className="text-center text-xs text-muted">Forgot your password? Ask your Slyshark administrator to reset it.</p>}
        <p className="text-center text-sm text-muted">
          {mode === "login" ? <>No account? <Link className="link" href="/register">Register</Link></> : <>Already registered? <Link className="link" href="/login">Sign in</Link></>}
        </p>
      </form>
    </main>
  );
}
