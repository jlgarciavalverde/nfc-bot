import { createDb, runMigrations } from "@nfc/core";
import { buildApp } from "./app";
import { configFromEnv } from "./config";

const config = configFromEnv();
const { db, sql } = createDb(config.databaseUrl);
await runMigrations(db);
const app = await buildApp(db, config);
await app.listen({ host: "0.0.0.0", port: config.port });

const parar = async () => {
  await app.close();
  await sql.end();
  process.exit(0);
};
process.once("SIGTERM", parar);
process.once("SIGINT", parar);
