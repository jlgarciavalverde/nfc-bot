import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "./schema";

export type DB = ReturnType<typeof createDb>["db"];
/** Una transacción de Drizzle o la conexión normal: los servicios aceptan cualquiera. */
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0] | DB;

export function createDb(url: string) {
  const sql = postgres(url, { max: 10, onnotice: () => {} });
  const db = drizzle(sql, { schema, casing: "snake_case" });
  return { db, sql };
}

/** Carpeta de migraciones: junto al código en desarrollo, junto al bundle en la imagen de Docker. */
function migrationsFolder() {
  for (const rel of ["../../drizzle", "../drizzle", "./drizzle"]) {
    const p = fileURLToPath(new URL(rel, import.meta.url));
    if (existsSync(p)) return p;
  }
  throw new Error("No encuentro la carpeta de migraciones (drizzle/)");
}

export async function runMigrations(db: DB) {
  await migrate(db, { migrationsFolder: migrationsFolder() });
}
