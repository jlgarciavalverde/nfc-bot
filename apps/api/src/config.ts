export interface ApiConfig {
  databaseUrl: string;
  version: string;
  /** URL pública del panel: es el único origen desde el que se aceptan cambios (comprobación de `Origin`). */
  publicUrl: string;
  /** Cookie `Secure` + prefijo `__Host-` (producción, HTTPS). */
  secureCookies: boolean;
  /** IP real del cliente desde `CF-Connecting-IP` (detrás del túnel de Cloudflare). */
  trustCloudflare: boolean;
  webDir?: string;
  logLevel?: string;
  port: number;
}

export function configFromEnv(env = process.env): ApiConfig {
  const prod = env.NODE_ENV === "production";
  return {
    databaseUrl: env.DATABASE_URL ?? "postgres://nfc:nfc@127.0.0.1:5434/nfc",
    version: env.APP_VERSION ?? "0.0.0-dev",
    publicUrl: (env.PUBLIC_URL ?? "http://localhost:5173").replace(/\/$/, ""),
    secureCookies: prod,
    trustCloudflare: prod,
    webDir: env.WEB_DIR,
    logLevel: env.LOG_LEVEL,
    port: Number(env.PORT ?? 3000),
  };
}
