import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Update } from "grammy/types";
import { estadoStock, leerAjustes, resumenCaja, tablas, type DB } from "@nfc/core";
import { bdDeTest, vaciar } from "@nfc/core/testing";
import { crearBot } from "./bot";
import { configFromEnv } from "./config";
import { crearFake } from "./ia/fake";
import { tick } from "./programador";

let db: DB;
let cerrar: () => Promise<void>;
beforeAll(async () => ({ db, cerrar } = await bdDeTest()));
afterAll(() => cerrar());

const GRUPO = -100123;
const ANA = 111, BEA = 222, EXTRA = 999;
const BOT = { id: 42, is_bot: true as const, first_name: "NFC", username: "nfc_bot", can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false, can_connect_to_business: false, has_main_web_app: false, has_topics_enabled: false, allows_users_to_create_topics: false, can_manage_bots: false, supports_join_request_queries: false };

interface Llamada { method: string; payload: Record<string, any> }
let llamadas: Llamada[];
let bot: ReturnType<typeof crearBot>;
let uid = 1;
const ahora = new Date("2026-10-21T10:00:00Z");

beforeEach(async () => {
  await vaciar(db);
  llamadas = [];
  bot = crearBot({ db, config: { ...configFromEnv({}), botToken: "1:x", setupCode: "secreto", aiDailyLimit: 3 }, interprete: crearFake(), now: () => ahora }, BOT);
  bot.api.config.use(async (_prev, method, payload) => {
    llamadas.push({ method, payload: payload as Record<string, any> });
    if (method === "sendMessage") return { ok: true, result: { message_id: uid++, date: 0, chat: { id: (payload as any).chat_id, type: "private" }, text: (payload as any).text } } as any;
    return { ok: true, result: true } as any;
  });
});

const usuario = (id: number, nombre = `U${id}`) => ({ id, is_bot: false, first_name: nombre });
const chatDe = (chat: number, from: number) => (chat === from ? { id: chat, type: "private" as const, first_name: "x" } : { id: chat, type: "supergroup" as const, title: "Socios" });

async function escribir(from: number, chat: number, text: string, extra: Record<string, unknown> = {}) {
  const ents = text.startsWith("/") ? [{ type: "bot_command" as const, offset: 0, length: text.split(/\s/)[0]!.length }] : undefined;
  llamadas = [];
  await bot.handleUpdate({ update_id: uid++, message: { message_id: uid++, date: 0, chat: chatDe(chat, from), from: usuario(from, from === ANA ? "Ana" : from === BEA ? "Bea" : "Extra"), text, entities: ents, ...extra } } as Update);
  return llamadas;
}
async function pulsar(from: number, chat: number, data: string) {
  llamadas = [];
  await bot.handleUpdate({ update_id: uid++, callback_query: { id: String(uid++), from: usuario(from), chat_instance: "x", data, message: { message_id: 1, date: 0, chat: chatDe(chat, from), text: "?" } } } as Update);
  return llamadas;
}
const textos = (ls: Llamada[]) => ls.filter((l) => l.method === "sendMessage").map((l) => l.payload.text as string);
const botones = (ls: Llamada[]) => ls.flatMap((l) => l.payload.reply_markup?.inline_keyboard?.flat() ?? []) as { text: string; callback_data: string }[];

/** Ana admin, grupo vinculado, Bea socia y producto creado. */
async function montar() {
  await escribir(ANA, ANA, "/start secreto");
  await escribir(ANA, GRUPO, "/vincular");
  const r = await escribir(BEA, GRUPO, "/unirme");
  const aprobar = botones(r).find((x) => x.text.includes("Aprobar"))!;
  await pulsar(ANA, GRUPO, aprobar.callback_data);
  await escribir(ANA, GRUPO, "/producto nuevo Panel NFC 25€");
}

describe("acceso", () => {
  it("alta inicial con código, vincular grupo y aprobar socios", async () => {
    expect(textos(await escribir(ANA, ANA, "/start malo"))).toHaveLength(0);
    expect(textos(await escribir(ANA, ANA, "/start secreto"))[0]).toContain("primer socio");
    // el código ya no sirve una segunda vez
    expect(textos(await escribir(BEA, BEA, "/start secreto"))).toHaveLength(0);
    await escribir(ANA, GRUPO, "/vincular");
    expect((await leerAjustes(db)).grupoChatId).toBe(GRUPO);
    const r = await escribir(BEA, GRUPO, "/unirme");
    const aprobar = botones(r).find((x) => x.text.includes("Aprobar"))!;
    // Un no admin no puede aprobar
    expect((await pulsar(BEA, GRUPO, aprobar.callback_data)).some((l) => l.method === "answerCallbackQuery")).toBe(true);
    expect(await db.select().from(tablas.socios)).toHaveLength(1);
    expect(textos(await pulsar(ANA, GRUPO, aprobar.callback_data))[0]).toContain("ya es socio");
    expect(await db.select().from(tablas.socios)).toHaveLength(2);
  });
  it("silencio con desconocidos, en otros grupos y comandos de admin denegados", async () => {
    await montar();
    expect(await escribir(EXTRA, EXTRA, "/caja")).toHaveLength(0);
    expect(await escribir(EXTRA, GRUPO, "/caja")).toHaveLength(0);
    expect(await escribir(ANA, -555, "/caja")).toHaveLength(0);
    expect(textos(await escribir(BEA, GRUPO, "/tramo 5 20€"))[0]).toContain("solo lo puede hacer un admin");
  });
});

describe("flujo de negocio", () => {
  it("visita a comercio nuevo → confirmar creación → venta → stock → caja → deshacer", async () => {
    await montar();
    let r = await escribir(BEA, GRUPO, "/visita Bar Pepe luego volver el lunes");
    expect(textos(r)[0]).toContain("No tengo apuntado");
    r = await pulsar(BEA, GRUPO, botones(r)[0]!.callback_data);
    expect(textos(r)[0]).toContain("Visita a <b>Bar Pepe</b> apuntada");
    expect(textos(r)[0]).toContain("26 oct");

    await escribir(ANA, GRUPO, "/compra 10 50€ Ali");
    await escribir(ANA, GRUPO, "/config stock 9");
    r = await escribir(BEA, GRUPO, "/venta bar pepe 2 pagado bizum");
    expect(textos(r)[0]).toContain("Venta <b>#1</b>");
    expect(textos(r)[0]).toContain("50,00 €");
    expect(textos(r).some((t) => t.includes("Quedan <b>8 paneles</b>"))).toBe(true);
    expect((await estadoStock(db))[0]!.uds).toBe(8);
    expect(textos(await escribir(ANA, GRUPO, "/caja"))[0]).toContain("Beneficio: <b>0,00 €</b>");

    // Ana no puede deshacer la venta de Bea; Bea sí
    expect(textos(await escribir(ANA, GRUPO, "/deshacer"))[0]).toContain("no se puede deshacer");
    expect(textos(await escribir(BEA, GRUPO, "/deshacer"))[0]).toContain("Venta #1");
    expect((await estadoStock(db))[0]!.uds).toBe(10);
  });
  it("nombre ambiguo: botones para elegir", async () => {
    await montar();
    await escribir(ANA, GRUPO, "/nuevo Bar Pepe");
    await escribir(ANA, GRUPO, "/nuevo Bar Paco");
    const r = await escribir(ANA, GRUPO, "/visita bar si");
    expect(botones(r).map((x) => x.text)).toEqual(["⚪ Bar Paco", "⚪ Bar Pepe", "✖ Cancelar"]);
    const r2 = await pulsar(ANA, GRUPO, botones(r)[1]!.callback_data);
    expect(textos(r2)[0]).toContain("Bar Pepe");
    // el otro botón del mismo grupo ya no vale
    await pulsar(ANA, GRUPO, botones(r)[0]!.callback_data);
    expect(llamadas.find((l) => l.method === "answerCallbackQuery")?.payload.text).toContain("ya no está pendiente");
  });
  it("lenguaje natural: propone y solo apunta al confirmar; solo confirma quien lo pidió", async () => {
    await montar();
    await escribir(ANA, GRUPO, "/nuevo Bar Pepe");
    // En el grupo, sin mencionar al bot, no hace nada
    expect(await escribir(BEA, GRUPO, "hemos vendido 3 paneles al Bar Pepe pagado por bizum")).toHaveLength(0);
    const r = await escribir(BEA, GRUPO, "@nfc_bot hemos vendido 3 paneles al Bar Pepe pagado por bizum");
    expect(textos(r)[0]).toContain("Apuntar venta");
    expect(textos(r)[0]).toContain("75,00 €");
    expect((await resumenCaja(db)).ventas).toBe(0);
    await pulsar(ANA, GRUPO, botones(r)[0]!.callback_data);
    expect((await resumenCaja(db)).ventas).toBe(0);
    await pulsar(BEA, GRUPO, botones(r)[0]!.callback_data);
    expect((await resumenCaja(db)).ventas).toBe(1);
    // Consultas: se responden sin confirmar (por privado no hace falta mencionar)
    expect(textos(await escribir(BEA, BEA, "como va la caja"))[0]).toContain("Caja desde el principio");
    // Frase incompleta
    expect(textos(await escribir(BEA, BEA, "hemos vendido"))[0]).toContain("¿Cuántos paneles");
    // Límite diario (3 en este test)
    expect(textos(await escribir(BEA, BEA, "hola"))[0]).toContain("todo lo que podía");
  });
  it("precios con tramos y ofertas", async () => {
    await montar();
    await escribir(ANA, GRUPO, "/tramo 5 20€");
    await escribir(ANA, GRUPO, "/oferta 3x2");
    expect(textos(await escribir(BEA, GRUPO, "/precio 3"))[0]).toContain("50,00 €");
    const t = textos(await escribir(BEA, GRUPO, "/precios"))[0]!;
    expect(t).toContain("desde 5 uds a 20,00 €/ud");
    expect(t).toContain("3x2");
  });
  it("errores de uso se explican", async () => {
    await montar();
    expect(textos(await escribir(ANA, GRUPO, "/venta Bar Pepe"))[0]).toContain("Así: /venta");
    expect(textos(await escribir(ANA, GRUPO, "/inventado"))[0]).toContain("No conozco /inventado");
    expect(textos(await escribir(ANA, GRUPO, "/cobrado 99"))[0]).toContain("No hay ninguna venta #99");
  });
  it("panel: enlace por privado", async () => {
    await montar();
    const r = await escribir(BEA, GRUPO, "/panel");
    expect(r.find((l) => l.payload.chat_id === BEA)?.payload.text).toMatch(/\/entrar#[\w-]{40,}/);
    expect(textos(r)).toContain("Te lo he mandado por privado. 📬");
  });
});

describe("avisos programados", () => {
  it("recordatorios del día por privado, una sola vez, y resumen del lunes en el grupo", async () => {
    await montar();
    await escribir(BEA, GRUPO, "/nuevo Bar Pepe");
    await escribir(BEA, GRUPO, "/visita Bar Pepe luego mañana");
    const enviados: { chat_id: number; text: string }[] = [];
    const api = { sendMessage: async (chat_id: number, text: string) => (enviados.push({ chat_id, text }), {} as never) };
    // 8:00 en Madrid: aún no
    expect(await tick(db, api as never, new Date("2026-10-22T06:00:00Z"))).toEqual([]);
    expect(await tick(db, api as never, new Date("2026-10-22T07:30:00Z"))).toHaveLength(1);
    expect(enviados[0]).toMatchObject({ chat_id: BEA });
    expect(enviados[0]!.text).toContain("Bar Pepe");
    expect(await tick(db, api as never, new Date("2026-10-22T08:30:00Z"))).toEqual([]);
    // Lunes 26: resumen de la semana del 19 al 25 (+ el recordatorio sigue atrasado)
    const r = await tick(db, api as never, new Date("2026-10-26T08:00:00Z"));
    expect(r).toContain("semana");
    const resumen = enviados.find((e) => e.chat_id === GRUPO)!;
    expect(resumen.text).toContain("Semana del 19 oct al 25 oct");
    expect(resumen.text).toContain("Visitas: <b>1</b>");
  });
});
