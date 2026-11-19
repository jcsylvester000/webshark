/** GET/PUT /api/settings — per-user JSON settings (e.g. API client variables). */
import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/server/auth";
import { sql } from "@/server/db";
import { badRequest, handle, readJson } from "@/server/http";

export const GET = handle(async (req: NextRequest) => {
  const u = await requireUser(req);
  const [row] = await sql<{ settings: Record<string, unknown> }[]>`SELECT settings FROM user_settings WHERE user_id = ${u.id}`;
  return NextResponse.json(row?.settings ?? {});
});

export const PUT = handle(async (req: NextRequest) => {
  const u = await requireUser(req);
  const s = await readJson<Record<string, unknown>>(req);
  if (!s || typeof s !== "object" || Array.isArray(s)) throw badRequest("Settings must be a JSON object");
  await sql`INSERT INTO user_settings (user_id, settings, updated_at) VALUES (${u.id}, ${sql.json(s as never)}, now())
            ON CONFLICT (user_id) DO UPDATE SET settings = EXCLUDED.settings, updated_at = now()`;
  return NextResponse.json(s);
});
