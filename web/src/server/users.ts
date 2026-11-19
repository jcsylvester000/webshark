import "server-only";
import { sql } from "./db";

export async function userJson(id: string) {
  const [u] = await sql`SELECT id, username, email, display_name, role, created_at FROM users WHERE id = ${id}`;
  return u;
}
