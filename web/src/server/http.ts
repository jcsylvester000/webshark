/** Route-handler helpers: typed errors -> `{ error, message }` JSON with the right status. */
import "server-only";
import { unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";

export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}
export const badRequest = (m: string) => new AppError(400, "bad_request", m);
export const unauthorized = () => new AppError(401, "unauthorized", "Please sign in");
export const forbidden = (m: string) => new AppError(403, "forbidden", m);
export const notFound = () => new AppError(404, "not_found", "Not found");
export const conflict = (m: string) => new AppError(409, "conflict", m);

export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      const req = args[0];
      if (req instanceof Request && !["GET", "HEAD", "OPTIONS"].includes(req.method)) assertSameOrigin(req);
      const res = await fn(...args);
      // API data is per-user: never let browsers or proxies cache it.
      if (!res.headers.has("cache-control")) res.headers.set("cache-control", "no-store");
      return res;
    } catch (e) {
      // Let Next.js internal control-flow errors (dynamic bail-out, redirects) propagate.
      unstable_rethrow(e);
      if (e instanceof AppError) return NextResponse.json({ error: e.code, message: e.message }, { status: e.status });
      console.error("[slyshark] unhandled error", e);
      const dbDown = e instanceof Error && /ECONNREFUSED|ENOTFOUND|getaddrinfo|password authentication|invalid/i.test(e.message);
      return NextResponse.json(
        { error: "internal_error", message: dbDown ? "Database is not reachable. Check DATABASE_URL." : "Something went wrong" },
        { status: 500 },
      );
    }
  };
}

/**
 * CSRF defence in depth (on top of SameSite=Lax cookies): state-changing requests must come from
 * this site. Browsers always send Origin on cross-site POSTs; same-origin fetches send a matching one.
 */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return; // non-browser clients (curl, scripts) don't send Origin and don't carry a victim's cookie
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let o: string;
  try { o = new URL(origin).host; } catch { throw forbidden("Cross-site request blocked"); }
  if (!host || o !== host) throw forbidden("Cross-site request blocked");
}

export async function readJson<T>(req: Request): Promise<T> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().includes("application/json")) throw new AppError(415, "unsupported_media_type", "Send the request body as application/json");
  try {
    return (await req.json()) as T;
  } catch {
    throw badRequest("Request body must be valid JSON");
  }
}
