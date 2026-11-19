"use client";
/** Login / registration form. Posts to the Next.js auth route handlers, which set the session cookie. */
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Wordmark } from "./Logo";

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
    router.replace(next?.startsWith("/dashboard") ? next : "/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="panel w-full max-w-sm space-y-4 p-7">
        <Link href="/"><Wordmark /></Link>
        <div>
          <h1 className="text-xl font-semibold">{mode === "login" ? "Sign in" : "Create your account"}</h1>
          <p className="text-sm text-muted">{mode === "login" ? "Access your environments and tools." : "You need an account before you can use the dashboard."}</p>
        </div>
        {mode === "login" ? (
          <>
            <div><label className="label" htmlFor="identifier">Username or email</label><input id="identifier" name="identifier" className="input" autoComplete="username" required /></div>
            <div><label className="label" htmlFor="password">Password</label><input id="password" name="password" type="password" className="input" autoComplete="current-password" required /></div>
          </>
        ) : (
          <>
            <div><label className="label" htmlFor="username">Username</label><input id="username" name="username" className="input" pattern="[A-Za-z0-9_.\-]{3,32}" title="3-32 letters, numbers, _ . -" required /></div>
            <div><label className="label" htmlFor="display_name">Display name</label><input id="display_name" name="display_name" className="input" /></div>
            <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" className="input" autoComplete="email" required /></div>
            <div><label className="label" htmlFor="password">Password</label><input id="password" name="password" type="password" minLength={8} className="input" autoComplete="new-password" required /></div>
            <div><label className="label" htmlFor="confirm">Confirm password</label><input id="confirm" name="confirm" type="password" minLength={8} className="input" autoComplete="new-password" required /></div>
          </>
        )}
        {error && <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <button className="btn-primary w-full justify-center py-2" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</button>
        <p className="text-center text-sm text-muted">
          {mode === "login" ? <>No account? <Link className="text-fin" href="/register">Register</Link></> : <>Already registered? <Link className="text-fin" href="/login">Sign in</Link></>}
        </p>
      </form>
    </div>
  );
}
