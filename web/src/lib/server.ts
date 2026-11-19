/**
 * Server-only helpers for talking to the Rust API (Backend-for-Frontend pattern).
 * The browser never sees the session token: it lives in an httpOnly cookie and is
 * attached as a Bearer token by the Next.js route handlers.
 */
import "server-only";

export const SESSION_COOKIE = "ws_session";
export const API_URL = (process.env.API_URL ?? "http://127.0.0.1:8080").replace(/\/$/, "");

export const cookieOptions = (maxAgeHours: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: maxAgeHours * 3600,
});
