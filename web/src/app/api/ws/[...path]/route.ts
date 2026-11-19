/**
 * /api/ws/* — authenticated pass-through to the Rust API.
 * Reads (GET) and writes (POST/PUT/DELETE) are forwarded unchanged with the session
 * token attached. Only an allow-listed set of top-level API paths can be reached.
 */
import { NextResponse, type NextRequest } from "next/server";
import { API_URL, SESSION_COOKIE } from "@/lib/server";

const ALLOWED = new Set(["auth", "settings", "environments", "requests", "tools", "captures"]);

async function forward(req: NextRequest, ctx: RouteContext<"/api/ws/[...path]">) {
  const { path } = await ctx.params;
  if (!path?.length || !ALLOWED.has(path[0]) || path.some((p) => p === ".." || p.includes("/"))) {
    return NextResponse.json({ error: "not_found", message: "Unknown API route" }, { status: 404 });
  }
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "unauthorized", message: "Please sign in" }, { status: 401 });

  const headers = new Headers({ authorization: `Bearer ${token}` });
  const ct = req.headers.get("content-type");
  if (ct) headers.set("content-type", ct);
  const hasBody = !["GET", "HEAD"].includes(req.method);
  try {
    const upstream = await fetch(`${API_URL}/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`, {
      method: req.method,
      headers,
      body: hasBody ? await req.arrayBuffer() : undefined,
      cache: "no-store",
    });
    const res = new NextResponse(upstream.body, {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
    });
    if (upstream.status === 401) res.cookies.delete(SESSION_COOKIE);
    return res;
  } catch {
    return NextResponse.json({ error: "api_unreachable", message: "Slyshark API is not reachable. Is it running?" }, { status: 502 });
  }
}

export { forward as GET, forward as POST, forward as PUT, forward as DELETE };
