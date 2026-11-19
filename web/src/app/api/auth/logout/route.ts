/** POST /api/auth/logout — delete the session row and clear the cookie. */
import { NextResponse, type NextRequest } from "next/server";
import { hashToken, SESSION_COOKIE } from "@/server/auth";
import { sql } from "@/server/db";
import { handle } from "@/server/http";

export const POST = handle(async (req: NextRequest) => {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) await sql`DELETE FROM sessions WHERE token_hash = ${hashToken(token)}`;
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
});
