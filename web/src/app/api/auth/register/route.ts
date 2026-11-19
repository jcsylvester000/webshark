/** POST /api/auth/register — create an account, then sign in (session cookie). */
import { NextResponse, type NextRequest } from "next/server";
import { cookieOptions, createSession, hashPassword, SESSION_COOKIE } from "@/server/auth";
import { sql } from "@/server/db";
import { badRequest, conflict, handle, readJson } from "@/server/http";
import { validEmail, validUsername } from "@/server/validate";
import { userJson } from "@/server/users";

export const POST = handle(async (req: NextRequest) => {
  const b = await readJson<{ username?: string; email?: string; password?: string; display_name?: string }>(req);
  const username = (b.username ?? "").trim().toLowerCase();
  const email = (b.email ?? "").trim().toLowerCase();
  const password = b.password ?? "";
  if (!validUsername(username)) throw badRequest("Username must be 3-32 characters: letters, numbers, _ . -");
  if (!validEmail(email)) throw badRequest("Enter a valid email address");
  if (password.length < 8) throw badRequest("Password must be at least 8 characters");
  const exists = await sql`SELECT id FROM users WHERE username = ${username} OR email = ${email}`;
  if (exists.length) throw conflict("That username or email is already registered");
  const display = b.display_name?.trim() || null;
  const [u] = await sql<{ id: string }[]>`INSERT INTO users (username, email, display_name, password_hash)
    VALUES (${username}, ${email}, ${display}, ${await hashPassword(password)}) RETURNING id`;
  const token = await createSession(u.id, req.headers.get("user-agent"));
  const res = NextResponse.json({ user: await userJson(u.id) });
  res.cookies.set(SESSION_COOKIE, token, cookieOptions());
  return res;
});
