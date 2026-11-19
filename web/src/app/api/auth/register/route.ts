/** POST /api/auth/register — forwards to the Rust API and stores the session cookie. */
import type { NextRequest } from "next/server";
import { authenticate } from "@/lib/auth-forward";

export async function POST(req: NextRequest) {
  return authenticate(req, "/auth/register");
}
