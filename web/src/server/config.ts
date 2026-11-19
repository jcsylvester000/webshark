/** Server configuration from environment variables (see `.env.example`). */
import "server-only";

const flag = (v: string | undefined, d: boolean) => (v === undefined || v === "" ? d : ["1", "true", "yes"].includes(v.toLowerCase()));
const num = (v: string | undefined, d: number) => (v && !Number.isNaN(Number(v)) ? Number(v) : d);

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? "",
  sessionTtlHours: num(process.env.SESSION_TTL_HOURS, 168),
  /** Private/loopback targets: on by default in local dev, off in production (SSRF guard). */
  allowPrivateTargets: flag(process.env.ALLOW_PRIVATE_TARGETS, process.env.NODE_ENV !== "production"),
  maxScanPortsPerRequest: num(process.env.MAX_SCAN_PORTS, 400),
  /** Max time (ms) one tool request may take. Netlify synchronous functions stop at 10 s by default. */
  toolBudgetMs: Math.min(Math.max(num(process.env.TOOL_BUDGET_MS, 8500), 3000), 120_000),
};
