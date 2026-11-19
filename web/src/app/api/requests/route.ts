/** GET / POST /api/requests — Postman-style saved requests. */
import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/server/auth";
import { sql } from "@/server/db";
import { badRequest, handle, readJson } from "@/server/http";

export const GET = handle(async (req: NextRequest) => {
  const u = await requireUser(req);
  return NextResponse.json(await sql`SELECT id, collection, name, request, updated_at FROM saved_requests WHERE owner_id = ${u.id} ORDER BY collection, name`);
});

export const POST = handle(async (req: NextRequest) => {
  const u = await requireUser(req);
  const b = await readJson<{ collection?: string; name?: string; request?: unknown }>(req);
  const name = (b.name ?? "").trim();
  if (!name) throw badRequest("name is required");
  if (!b.request || typeof b.request !== "object") throw badRequest("request is required");
  const [row] = await sql`INSERT INTO saved_requests (owner_id, collection, name, request)
    VALUES (${u.id}, ${b.collection?.trim() || "Default"}, ${name}, ${sql.json(b.request as never)})
    RETURNING id, collection, name, request, updated_at`;
  return NextResponse.json(row);
});
