/**
 * Accounts and sessions. Passwords: scrypt (N=16384, r=8, p=1) with a random salt, using
 * Node's built-in crypto. Sessions: random 32-byte token in an httpOnly cookie; only its
 * SHA-256 hash is stored in the `sessions` table.
 */
import "server-only";
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { NextRequest } from "next/server";
import { config } from "./config";
import { sql } from "./db";
import { unauthorized } from "./http";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export const SESSION_COOKIE = "ws_session";

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 32, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts[0] !== "scrypt" || parts.length !== 6) return false;
  const [, N, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, "base64");
  const key = await scrypt(pw, Buffer.from(salt, "base64"), expected.length, { N: Number(N), r: Number(r), p: Number(p), maxmem: PARAMS.maxmem });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

export const newToken = () => randomBytes(32).toString("hex");
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export type AuthUser = { id: string; username: string; role: string; sessionHash: string };

export async function currentUser(req: NextRequest): Promise<AuthUser | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const h = hashToken(token);
  const rows = await sql<Omit<AuthUser, "sessionHash">[]>`
    SELECT u.id, u.username, u.role FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${h} AND s.expires_at > now()`;
  return rows[0] ? { ...rows[0], sessionHash: h } : null;
}

export async function requireUser(req: NextRequest): Promise<AuthUser> {
  const u = await currentUser(req);
  if (!u) throw unauthorized();
  return u;
}

export async function createSession(userId: string, userAgent: string | null): Promise<string> {
  const token = newToken();
  const ua = userAgent?.slice(0, 255) ?? null;
  await sql`INSERT INTO sessions (user_id, token_hash, user_agent, expires_at)
            VALUES (${userId}, ${hashToken(token)}, ${ua}, now() + make_interval(hours => ${config.sessionTtlHours}))`;
  await sql`DELETE FROM sessions WHERE user_id = ${userId} AND expires_at < now()`;
  return token;
}

export const cookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax" as const,
  // Secure cookies need HTTPS. Running the production build on a local PC over http://<LAN-IP>
  // needs COOKIE_SECURE=false (localhost itself works either way).
  secure: process.env.COOKIE_SECURE ? !["0", "false", "no"].includes(process.env.COOKIE_SECURE.toLowerCase()) : process.env.NODE_ENV === "production",
  path: "/",
  maxAge: config.sessionTtlHours * 3600,
});
