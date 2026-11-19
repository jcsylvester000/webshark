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
      return await fn(...args);
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

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw badRequest("Request body must be valid JSON");
  }
}
