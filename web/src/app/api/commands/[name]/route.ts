/**
 * POST /api/commands/{name} — the single write endpoint (CQRS command bus).
 * Body: the command payload. Response: the command's small result, e.g. `{ id, version }`.
 */
import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/server/auth";
import { commands } from "@/server/cqrs/commands";
import { handle, notFound, readJson } from "@/server/http";

export const POST = handle(async (req: NextRequest, ctx: RouteContext<"/api/commands/[name]">) => {
  const user = await requireUser(req);
  const { name } = await ctx.params;
  const run = Object.hasOwn(commands, name) ? commands[name] : undefined;
  if (!run) throw notFound();
  return NextResponse.json(await run(user.id, await readJson<Record<string, unknown>>(req)));
});
