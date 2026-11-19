/** Small input validators shared by route handlers. */
import "server-only";
import { badRequest } from "./http";

export const validUsername = (u: string) => /^[a-z0-9_.-]{3,32}$/.test(u);
export const validEmail = (e: string) => e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export function checkCanvas(c: unknown) {
  const v = c as { nodes?: unknown; edges?: unknown } | null;
  if (!v || !Array.isArray(v.nodes) || !Array.isArray(v.edges)) throw badRequest("canvas must contain 'nodes' and 'edges' arrays");
  if (JSON.stringify(v).length > 5 * 1024 * 1024) throw badRequest("canvas is larger than 5 MB");
}
