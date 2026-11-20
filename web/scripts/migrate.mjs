#!/usr/bin/env node
/**
 * Applies db/migrations/*.sql in order (tracked in `schema_migrations`) and, when
 * SEED_TEST_USER=true, creates/resets the development account testuser / password123.
 * Usage: npm run db:migrate   (Netlify runs it before every build via `npm run netlify-build`)
 */
import { randomBytes, scrypt as scryptCb } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[migrate] DATABASE_URL is not set. Add your Neon connection string (see .env.example).");
  process.exit(1);
}
const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");

// Slyshark's tables use common names (users, sessions…). If the database already has a "users"
// table from another app, CREATE TABLE IF NOT EXISTS would silently keep the foreign one, so stop.
async function assertOwnUsersTable() {
  const cols = (await sql`SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'users'`).map((r) => r.column_name);
  const need = ["id", "username", "email", "password_hash", "role"];
  if (cols.length && need.some((c) => !cols.includes(c))) {
    throw new Error(`this database already has a "users" table that isn't Slyshark's (columns: ${cols.join(", ")}). ` +
      "Use an empty database: in Neon open Databases → New database (e.g. slyshark), then change the database name at the end of DATABASE_URL to it and redeploy. Nothing was changed in your existing tables.");
  }
}

try {
  await assertOwnUsersTable();
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  const done = new Set((await sql`SELECT name FROM schema_migrations`).map((r) => r.name));
  for (const file of (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(file)) continue;
    const body = await readFile(path.join(dir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`INSERT INTO schema_migrations (name) VALUES (${file})`;
    });
    console.log(`[migrate] applied ${file}`);
  }
  if (["1", "true", "yes"].includes(String(process.env.SEED_TEST_USER ?? "").toLowerCase())) {
    const salt = randomBytes(16);
    const key = await promisify(scryptCb)("password123", salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    const hash = `scrypt$16384$8$1$${salt.toString("base64")}$${key.toString("base64")}`;
    await sql`INSERT INTO users (username, email, display_name, password_hash, role)
              VALUES ('testuser', 'testuser@slyshark.local', 'Test User', ${hash}, 'admin')
              ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash`;
    // Same starter workspace a normal sign-up gets, so a fresh install isn't empty.
    await sql`INSERT INTO workspaces (owner_id, name, description)
              SELECT u.id, 'My Workspace', 'Your first workspace. Rename it or add more anytime.' FROM users u
              WHERE u.username = 'testuser' AND NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.owner_id = u.id)`;
    console.warn("[migrate] SEED_TEST_USER is on: testuser / password123 is active (turn off for real users)");
  }
  console.log("[migrate] database is up to date");
} catch (e) {
  console.error("[migrate] failed:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
