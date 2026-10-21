export interface BotConfig {
  databaseUrl: string;
  botToken: string;
  /** Código para que el primer socio (admin) se dé de alta con /start <código>. */
  setupCode?: string;
  /** URL del panel web (para los enlaces de /panel). */
  publicUrl: string;
  geminiApiKey?: string;
  /** Modelos en orden de preferencia (si uno está saturado se usa el siguiente). */
  geminiModels: string[];
  aiDailyLimit: number;
  aiFake: boolean;
  version: string;
}

export function configFromEnv(env = process.env): BotConfig {
  return {
    databaseUrl: env.DATABASE_URL ?? "postgres://nfc:nfc@127.0.0.1:5434/nfc",
    botToken: env.BOT_TOKEN ?? "",
    setupCode: env.SETUP_CODE || undefined,
    publicUrl: (env.PUBLIC_URL ?? "http://localhost:5173").replace(/\/$/, ""),
    geminiApiKey: env.GEMINI_API_KEY || undefined,
    geminiModels: (env.GEMINI_MODELS || "gemini-flash-latest,gemini-flash-lite-latest").split(",").map((m) => m.trim()).filter(Boolean),
    aiDailyLimit: Number(env.AI_DAILY_LIMIT ?? 200),
    aiFake: env.AI_FAKE === "1",
    version: env.APP_VERSION ?? "0.0.0-dev",
  };
}
