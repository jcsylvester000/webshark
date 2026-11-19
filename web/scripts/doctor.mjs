#!/usr/bin/env node
/**
 * Local health check: Node version, .env.local, database connection, migrations and port.
 * Usage: npm run doctor   (exit code 1 if something blocks Slyshark from starting)
 */
import { existsSync, readdirSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 3000);
let blocking = 0;
const ok = (m) => console.log(`  [ok]   ${m}`);
const warn = (m) => console.log(`  [warn] ${m}`);
const fail = (m, fix) => { blocking++; console.log(`  [fail] ${m}${fix ? `\n         Fix: ${fix}` : ""}`); };

console.log("Slyshark doctor\n");
const [maj, min] = process.versions.node.split(".").map(Number);
if (maj > 20 || (maj === 20 && min >= 9)) ok(`Node.js ${process.versions.node}`);
else fail(`Node.js ${process.versions.node} is too old (need 20.9 or newer)`, "install the LTS from https://nodejs.org or run: winget install OpenJS.NodeJS.LTS");

if (existsSync(path.join(root, "node_modules", "next"))) ok("Dependencies installed");
else fail("Dependencies are not installed", "run: npm install   (inside the web folder)");

if (existsSync(path.join(root, ".env.local"))) ok(".env.local found");
else warn(".env.local not found (using environment variables only). Run local\\setup.ps1 to create it.");

const url = process.env.DATABASE_URL;
if (!url) fail("DATABASE_URL is not set", "run local\\setup.ps1, or copy web/.env.local.example to web/.env.local and fill it in");
else {
  const safe = url.replace(/\/\/([^:@/]+):[^@/]*@/, "//$1:•••@");
  const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 8, onnotice: () => {} });
  try {
    await sql`SELECT 1`;
    ok(`Database reachable (${safe})`);
    const files = readdirSync(path.join(root, "db", "migrations")).filter((f) => f.endsWith(".sql"));
    const done = await sql`SELECT name FROM schema_migrations`.catch(() => []);
    const missing = files.filter((f) => !done.some((r) => r.name === f));
    if (missing.length) fail(`${missing.length} migration(s) not applied: ${missing.join(", ")}`, "run: npm run db:migrate");
    else ok(`Database schema up to date (${files.length} migrations)`);
  } catch (e) {
    const local = /localhost|127\.0\.0\.1/.test(url);
    fail(`Can't connect to the database: ${e.message}`, local ? "start the local database: docker compose up -d   (repo root), or run local\\db.ps1 up" : "check the Neon connection string and your internet connection");
  } finally { await sql.end({ timeout: 1 }).catch(() => {}); }
}

const flag = (v) => ["1", "true", "yes"].includes(String(v ?? "").toLowerCase());
if (flag(process.env.ALLOW_PRIVATE_TARGETS)) ok("Private/LAN targets allowed (local testing of 192.168.x.x, 10.x, localhost)");
else warn("ALLOW_PRIVATE_TARGETS is off: the production build will refuse localhost and LAN targets");

await new Promise((resolve) => {
  const s = net.createServer().once("error", () => { warn(`Port ${port} is already in use (Slyshark may already be running, or set PORT to another number)`); resolve(); })
    .once("listening", () => { s.close(); ok(`Port ${port} is free`); resolve(); }).listen(port, "0.0.0.0");
});

console.log(blocking ? `\n${blocking} problem(s) to fix before starting.` : "\nReady. Start with local\\start.ps1 (or npm run dev).");
process.exit(blocking ? 1 : 0);
