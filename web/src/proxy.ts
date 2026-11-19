/**
 * Optimistic auth gate: visitors without a session cookie are sent to /login before they
 * reach the dashboard. The Rust API still validates the token on every request.
 */
import { NextResponse, type NextRequest } from "next/server";

export function proxy(req: NextRequest) {
  const hasSession = Boolean(req.cookies.get("ws_session")?.value);
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/dashboard") && !hasSession) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if ((pathname === "/login" || pathname === "/register") && hasSession) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/dashboard/:path*", "/login", "/register"] };
