import { defineConfig } from "@playwright/test";

// e2e contra la build de producción de la web servida por la API, con la BD nfc_e2e (se vacía y se siembra al arrancar).
const DB = "postgres://nfc:nfc@127.0.0.1:5434/nfc_e2e";
export default defineConfig({
  testDir: "e2e",
  workers: 1,
  fullyParallel: false,
  use: { baseURL: "http://localhost:4320", acceptDownloads: true },
  webServer: {
    command: `DATABASE_URL=${DB} pnpm tsx tools/sembrar.ts && DATABASE_URL=${DB} PUBLIC_URL=http://localhost:4320 PORT=4320 WEB_DIR=apps/web/dist LOG_LEVEL=warn LOGIN_RATE_LIMIT=100 pnpm tsx apps/api/src/server.ts`,
    url: "http://localhost:4320/health",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
