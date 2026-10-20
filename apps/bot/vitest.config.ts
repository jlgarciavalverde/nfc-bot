import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Los ficheros comparten la base de datos de test: uno detrás de otro.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
