import { createServer } from "node:http";
import { sql } from "drizzle-orm";
import { createDb } from "@nfc/core";
import { configFromEnv } from "./config";
import { crearBot } from "./bot";
import { crearGemini } from "./ia/gemini";
import { crearFake } from "./ia/fake";
import { arrancarProgramador } from "./programador";

const config = configFromEnv();
if (!config.botToken) {
  console.error("Falta BOT_TOKEN (el token que da @BotFather).");
  process.exit(1);
}
// Las migraciones las aplica la API al arrancar (Compose arranca el bot cuando la API está sana).
const { db, sql: conn } = createDb(config.databaseUrl);
const interprete = config.aiFake ? crearFake() : config.geminiApiKey ? crearGemini({ apiKey: config.geminiApiKey, models: config.geminiModels }) : undefined;
const bot = crearBot({ db, config, interprete });

try {
  await bot.init();
} catch (e) {
  console.error(`No puedo conectar con Telegram: ${(e as Error).message}. ¿Es correcto BOT_TOKEN?`);
  process.exit(1);
}
await bot.api.setMyCommands([
  { command: "ayuda", description: "Qué puedo hacer" },
  { command: "visita", description: "Apuntar una visita: /visita Bar Pepe si|no|luego" },
  { command: "venta", description: "Apuntar una venta: /venta Bar Pepe 3 pagado bizum" },
  { command: "precio", description: "Precio para N paneles" },
  { command: "precios", description: "Tabla de precios y ofertas" },
  { command: "ficha", description: "Ficha de un comercio" },
  { command: "placa", description: "Asignar una placa: /placa K7M2Q Bar Pepe" },
  { command: "embudo", description: "Comercios por estado" },
  { command: "caja", description: "Resumen de caja" },
  { command: "stock", description: "Paneles en stock" },
  { command: "pendientes", description: "A quién volver" },
  { command: "reparto", description: "Lo que le toca a cada socio" },
  { command: "deshacer", description: "Anular lo último que apuntaste" },
  { command: "panel", description: "Enlace al panel web" },
]);

let ultimoOk = Date.now();
bot.api.config.use(async (prev, method, payload, signal) => {
  const r = await prev(method, payload, signal);
  if (r.ok) ultimoOk = Date.now();
  return r;
});

const pararProgramador = arrancarProgramador(db, bot.api);

// Salud para Docker: BD accesible y Telegram respondiendo en los últimos 5 minutos (getUpdates hace long polling cada 30 s).
const health = createServer(async (_req, res) => {
  let dbOk = "ok";
  try {
    await db.execute(sql`select 1`);
  } catch {
    dbOk = "error";
  }
  const telegram = Date.now() - ultimoOk < 5 * 60_000 ? "ok" : "sin respuesta";
  res.writeHead(dbOk === "ok" && telegram === "ok" ? 200 : 503, { "content-type": "application/json" });
  res.end(JSON.stringify({ version: config.version, db: dbOk, telegram, ia: interprete?.nombre ?? "desactivada" }));
}).listen(3001, "127.0.0.1");

const parar = async () => {
  pararProgramador();
  health.close();
  await bot.stop();
  await conn.end();
  process.exit(0);
};
process.once("SIGTERM", parar);
process.once("SIGINT", parar);

console.log(`Bot ${config.version} en marcha (IA: ${interprete?.nombre ?? "desactivada"})`);
await bot.start({ drop_pending_updates: false, allowed_updates: ["message", "callback_query"] });
