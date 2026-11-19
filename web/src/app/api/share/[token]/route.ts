/** GET /api/share/{token} — public read-only project view (requires unlock cookie when password-protected). */
import { NextResponse, type NextRequest } from "next/server";
import { handle } from "@/server/http";
import { findShare, shareContent, unlockCookie, unlockValue } from "@/server/share";

export const GET = handle(async (req: NextRequest, ctx: RouteContext<"/api/share/[token]">) => {
  const { token } = await ctx.params;
  const s = await findShare(token);
  if (s.password_hash && req.cookies.get(unlockCookie(s.id))?.value !== unlockValue(s)) {
    return NextResponse.json({ locked: true, label: s.label }, { headers: { "cache-control": "no-store" } });
  }
  return NextResponse.json({ locked: false, ...(await shareContent(s)) }, { headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } });
});
