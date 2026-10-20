import { sql } from "drizzle-orm";
import { createDb, runMigrations, type DB } from "./db/client";

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://nfc:nfc@127.0.0.1:5434/nfc_test";

/** Conexión a la BD de test con las migraciones aplicadas. */
export async function bdDeTest() {
  const { db, sql: conn } = createDb(TEST_DATABASE_URL);
  await runMigrations(db);
  return { db, cerrar: () => conn.end() };
}

/** Vacía todas las tablas (entre tests). */
export async function vaciar(db: DB) {
  const r = await db.execute<{ tablename: string }>(sql`select tablename from pg_tables where schemaname = 'public'`);
  const tablas = r.map((x) => `"${x.tablename}"`).join(", ");
  if (tablas) await db.execute(sql.raw(`truncate ${tablas} restart identity cascade`));
}
