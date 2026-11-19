/** POST /api/share/{token}/unlock — check the link password and set a 12-hour unlock cookie. */
import { NextResponse, type NextRequest } from "next/server";
import { badRequest, handle, readJson } from "@/server/http";
import { findShare, tryUnlock, unlockCookie, unlockValue } from "@/server/share";

export const POST = handle(async (req: NextRequest, ctx: RouteContext<"/api/share/[token]/unlock">) => {
  const { token } = await ctx.params;
  const s = await findShare(token);
  const { password } = await readJson<{ password?: string }>(req);
  if (!(await tryUnlock(s, String(password ?? "")))) throw badRequest("That password is not correct.");
  const res = NextResponse.json({ ok: true });
  res.cookies.set(unlockCookie(s.id), unlockValue(s), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 12 * 3600 });
  return res;
});
