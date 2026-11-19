/** Shared login/register forwarding: calls the Rust API and sets the httpOnly session cookie. */
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { API_URL, SESSION_COOKIE, cookieOptions } from "@/lib/server";

export async function authenticate(req: NextRequest, path: "/auth/login" | "/auth/register") {
  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": req.headers.get("user-agent") ?? "" },
      body: await req.text(),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "api_unreachable", message: "Slyshark API is not reachable. Is it running?" }, { status: 502 });
  }
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) return NextResponse.json(data, { status: upstream.status });
  const res = NextResponse.json({ user: data.user });
  res.cookies.set(SESSION_COOKIE, data.token, cookieOptions(data.expires_in_hours ?? 168));
  return res;
}
