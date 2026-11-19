/** POST /api/auth/login — verify credentials (username or email) and set the session cookie. */
import { NextResponse, type NextRequest } from "next/server";
import { cookieOptions, createSession, SESSION_COOKIE, verifyPassword } from "@/server/auth";
import { sql } from "@/server/db";
import { badRequest, handle, readJson } from "@/server/http";
import { assertNotThrottled, clearUserFailures, recordAttempt } from "@/server/throttle";
import { userJson } from "@/server/users";

// Verified when the account doesn't exist, so both cases take the same time (no enumeration by timing).
const DUMMY_HASH = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

export const POST = handle(async (req: NextRequest) => {
  const b = await readJson<{ identifier?: string; password?: string }>(req);
  const ident = (b.identifier ?? "").trim().toLowerCase();
  await assertNotThrottled("login", req, ident);
  const [row] = await sql<{ id: string; password_hash: string }[]>`SELECT id, password_hash FROM users WHERE username = ${ident} OR email = ${ident}`;
  // Same message for unknown user and wrong password (no account enumeration).
  const valid = await verifyPassword(b.password ?? "", row?.password_hash ?? DUMMY_HASH);
  if (!row || !valid) { await recordAttempt("login", req, ident); throw badRequest("Invalid username/email or password"); }
  await clearUserFailures(ident);
  await sql`UPDATE users SET last_login_at = now() WHERE id = ${row.id}`;
  const token = await createSession(row.id, req.headers.get("user-agent"));
  const res = NextResponse.json({ user: await userJson(row.id) });
  res.cookies.set(SESSION_COOKIE, token, cookieOptions());
  return res;
});
