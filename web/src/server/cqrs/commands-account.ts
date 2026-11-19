/** COMMANDS: profile, password, preferences, sessions, account deletion. */
import "server-only";
import { hashPassword, verifyPassword } from "../auth";
import { sql } from "../db";
import { badRequest, conflict, notFound } from "../http";
import { validEmail } from "../validate";
import type { CommandCtx, Handler } from "./types";

const THEMES = ["dark", "light", "system"], SIZES = ["sm", "md", "lg"], CLOCKS = ["12", "24"], STARTS = ["/dashboard", "/dashboard/workspaces", "last-project"];

export const accountCommands: Record<string, Handler> = {
  "profile.update": async (ctx: CommandCtx, p) => {
    const display = typeof p.displayName === "string" ? p.displayName.trim().slice(0, 60) : undefined;
    const email = typeof p.email === "string" ? p.email.trim().toLowerCase() : undefined;
    if (email !== undefined && !validEmail(email)) throw badRequest("Enter a valid email address");
    try {
      await sql`UPDATE users SET display_name = COALESCE(${display === undefined ? null : display || null}, display_name),
                email = COALESCE(${email ?? null}, email) WHERE id = ${ctx.userId}`;
    } catch (e) {
      if ((e as { code?: string }).code === "23505") throw conflict("That email is already used by another account");
      throw e;
    }
    return { ok: true };
  },
  "profile.changePassword": async (ctx, p) => {
    const cur = String(p.currentPassword ?? ""), next = String(p.newPassword ?? "");
    if (next.length < 8) throw badRequest("New password must be at least 8 characters");
    const [u] = await sql<{ password_hash: string }[]>`SELECT password_hash FROM users WHERE id = ${ctx.userId}`;
    if (!u || !(await verifyPassword(cur, u.password_hash))) throw badRequest("Current password is incorrect");
    await sql`UPDATE users SET password_hash = ${await hashPassword(next)} WHERE id = ${ctx.userId}`;
    // Changing the password signs out every other device.
    const r = await sql`DELETE FROM sessions WHERE user_id = ${ctx.userId} AND token_hash <> ${ctx.sessionHash}`;
    return { ok: true, otherSessionsSignedOut: r.count };
  },
  "profile.savePreferences": async (ctx, p) => {
    const prefs = {
      theme: THEMES.includes(String(p.theme)) ? p.theme : "dark",
      textSize: SIZES.includes(String(p.textSize)) ? p.textSize : "md",
      clock: CLOCKS.includes(String(p.clock)) ? p.clock : "12",
      relativeTimes: p.relativeTimes !== false,
      learningTips: p.learningTips !== false,
      reduceMotion: p.reduceMotion === true,
      startPage: STARTS.includes(String(p.startPage)) ? p.startPage : "/dashboard",
      onboardingDismissed: p.onboardingDismissed === true,
    };
    await sql`UPDATE users SET preferences = ${sql.json(prefs)} WHERE id = ${ctx.userId}`;
    return { ok: true, preferences: prefs };
  },
  "session.revoke": async (ctx, p) => {
    const id = String(p.id ?? "");
    const r = await sql`DELETE FROM sessions WHERE id::text = ${id} AND user_id = ${ctx.userId} AND token_hash <> ${ctx.sessionHash}`;
    if (!r.count) throw notFound();
    return { ok: true };
  },
  "session.revokeOthers": async (ctx) => {
    const r = await sql`DELETE FROM sessions WHERE user_id = ${ctx.userId} AND token_hash <> ${ctx.sessionHash}`;
    return { ok: true, count: r.count };
  },
  "account.delete": async (ctx, p) => {
    const [u] = await sql<{ username: string; password_hash: string }[]>`SELECT username, password_hash FROM users WHERE id = ${ctx.userId}`;
    if (!u) throw notFound();
    if (String(p.confirmUsername ?? "").trim().toLowerCase() !== u.username) throw badRequest("Type your username exactly to confirm");
    if (!(await verifyPassword(String(p.password ?? ""), u.password_hash))) throw badRequest("Password is incorrect");
    await sql`DELETE FROM users WHERE id = ${ctx.userId}`; // cascades to every owned row
    return { ok: true };
  },
};
