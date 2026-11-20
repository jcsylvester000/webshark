/** COMMANDS: follow-along tutorial progress (step reached, completed, reset). */
import "server-only";
import { sql } from "../db";
import { badRequest } from "../http";
import type { Handler } from "./types";

const tutorialId = (v: unknown) => {
  const id = String(v ?? "");
  if (!/^[A-Z][0-9]{2}$/.test(id)) throw badRequest("tutorialId must look like T00");
  return id;
};

export const tutorialCommands: Record<string, Handler> = {
  /** Records the step reached; `completed: true` marks the tutorial finished (it stays finished). */
  "tutorial.progress": async (ctx, p) => {
    const id = tutorialId(p.tutorialId);
    const step = Math.max(0, Math.min(99, Math.trunc(Number(p.step) || 0)));
    const done = p.completed === true;
    await sql`INSERT INTO tutorial_progress (user_id, tutorial_id, step, status, completed_at)
              VALUES (${ctx.userId}, ${id}, ${step}, ${done ? "completed" : "started"}, ${done ? sql`now()` : null})
              ON CONFLICT (user_id, tutorial_id) DO UPDATE SET step = EXCLUDED.step, updated_at = now(),
                status = CASE WHEN tutorial_progress.status = 'completed' OR EXCLUDED.status = 'completed' THEN 'completed' ELSE 'started' END,
                completed_at = COALESCE(tutorial_progress.completed_at, EXCLUDED.completed_at)`;
    return { ok: true };
  },
  /** Forgets progress for one tutorial (or all of them when `tutorialId` is "all"). */
  "tutorial.reset": async (ctx, p) => {
    if (p.tutorialId === "all") await sql`DELETE FROM tutorial_progress WHERE user_id = ${ctx.userId}`;
    else await sql`DELETE FROM tutorial_progress WHERE user_id = ${ctx.userId} AND tutorial_id = ${tutorialId(p.tutorialId)}`;
    return { ok: true };
  },
};
