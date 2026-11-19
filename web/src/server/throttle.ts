/**
 * Brute-force protection backed by Postgres (works across serverless instances).
 * Login: 10 failures per account or 50 per client address in 15 minutes → 429.
 * Register: 20 sign-ups per client address per hour → 429.
 */
import "server-only";
import { createHash } from "node:crypto";
import { sql } from "./db";
import { AppError } from "./http";

const h = (s: string) => createHash("sha256").update(s).digest("hex");
export function clientIp(req: Request): string {
  return (req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for")?.split(",")[0] || req.headers.get("x-real-ip") || "local").trim();
}
const RULES = { login: { windowMin: 15, perUser: 10, perIp: 50 }, register: { windowMin: 60, perUser: 0, perIp: 20 } } as const;

export async function assertNotThrottled(kind: keyof typeof RULES, req: Request, user?: string) {
  const r = RULES[kind];
  const ip = clientIp(req);
  // Without a proxy header (local run) every client looks the same, so only per-account limits apply.
  const keys: [string, number][] = ip === "local" ? [] : [[h(`ip:${ip}`), r.perIp]];
  if (user && r.perUser) keys.push([h(`u:${user.toLowerCase()}`), r.perUser]);
  for (const [key, limit] of keys) {
    const [row] = await sql<{ n: number; oldest: Date | null }[]>`SELECT count(*)::int AS n, min(attempted_at) AS oldest FROM auth_attempts
      WHERE key_hash = ${key} AND kind = ${kind} AND attempted_at > now() - make_interval(mins => ${r.windowMin})`;
    if (row.n >= limit) {
      const wait = row.oldest ? Math.max(1, Math.ceil((row.oldest.getTime() + r.windowMin * 60_000 - Date.now()) / 60_000)) : r.windowMin;
      throw new AppError(429, "too_many_attempts", `Too many attempts. For your security, try again in ${wait} minute${wait === 1 ? "" : "s"}.`);
    }
  }
}
export async function recordAttempt(kind: keyof typeof RULES, req: Request, user?: string) {
  const ip = clientIp(req);
  const keys = [...(ip === "local" ? [] : [h(`ip:${ip}`)]), ...(user && kind === "login" ? [h(`u:${user.toLowerCase()}`)] : [])];
  for (const k of keys) await sql`INSERT INTO auth_attempts (key_hash, kind) VALUES (${k}, ${kind})`;
  await sql`DELETE FROM auth_attempts WHERE attempted_at < now() - interval '1 day'`;
}
export async function clearUserFailures(user: string) {
  await sql`DELETE FROM auth_attempts WHERE key_hash = ${h(`u:${user.toLowerCase()}`)} AND kind = 'login'`;
}
