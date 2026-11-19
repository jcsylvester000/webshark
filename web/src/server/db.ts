/**
 * Postgres client (postgres.js). Works with Neon (pooled URL, sslmode=require) and with local
 * Postgres. One small pool per server instance; `prepare: false` keeps it compatible with
 * Neon's PgBouncer transaction pooling used by serverless functions.
 */
import "server-only";
import postgres from "postgres";
import { config } from "./config";

declare global {
  var __slysharkSql: ReturnType<typeof postgres> | undefined;
}

export const sql =
  globalThis.__slysharkSql ??
  (globalThis.__slysharkSql = postgres(config.databaseUrl || "postgres://invalid", {
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  }));
