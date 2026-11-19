/** GET (read model: environment_summaries view) / POST (write) /api/environments */
import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/server/auth";
import { sql } from "@/server/db";
import { badRequest, handle, readJson } from "@/server/http";
import { checkCanvas } from "@/server/validate";

export const GET = handle(async (req: NextRequest) => {
  const u = await requireUser(req);
  const rows = await sql`SELECT id, name, description, template, node_count, edge_count, created_at, updated_at
                         FROM environment_summaries WHERE owner_id = ${u.id} ORDER BY updated_at DESC`;
  return NextResponse.json(rows);
});

export const POST = handle(async (req: NextRequest) => {
  const u = await requireUser(req);
  const b = await readJson<{ name?: string; description?: string; template?: string; canvas?: unknown }>(req);
  const name = (b.name ?? "").trim();
  if (!name || name.length > 120) throw badRequest("Name is required (max 120 characters)");
  const canvas = b.canvas ?? { nodes: [], edges: [] };
  checkCanvas(canvas);
  const [row] = await sql`INSERT INTO environments (owner_id, name, description, template, canvas)
    VALUES (${u.id}, ${name}, ${b.description ?? ""}, ${b.template ?? null}, ${sql.json(canvas as never)})
    RETURNING id, name, description, template, canvas, created_at, updated_at`;
  return NextResponse.json(row);
});
