import { defineConfig } from "tsup";

export default defineConfig({
  entry: { server: "src/server.ts" },
  format: ["esm"],
  target: "node22",
  clean: true,
  removeNodeProtocol: false,
  // El núcleo es TypeScript sin compilar: va dentro del bundle.
  noExternal: ["@nfc/core"],
});
