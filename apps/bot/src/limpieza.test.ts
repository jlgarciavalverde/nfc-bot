import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Update } from "grammy/types";
import { tablas, type DB } from "@nfc/core";
import { bdDeTest, vaciar } from "@nfc/core/testing";
import { crearBot } from "./bot";
import { configFromEnv } from "./config";
import { borrarVencidos, tick } from "./programador";

// Mensajes que se borran solos: /panel, preguntas contestadas o caducadas, errores, el «Hoy te toca» de ayer.
let db: DB;
let cerrar: () => Promise<void>;
beforeAll(async () => ({ db, cerrar } = await bdDeTest()));
afterAll(() => cerrar());

const GRUPO = -100123, ANA = 111, BEA = 222;
const BOT = { id: 42, is_bot: true as const, first_name: "NFC", username: "nfc_bot", can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false, can_connect_to_business: false, has_main_web_app: false, has_topics_enabled: false, allows_users_to_create_topics: false, can_manage_bots: false, supports_join_request_queries: false };

interface Llamada { method: string; payload: Record<string, any> }
let llamadas: Llamada[];
let bot: ReturnType<typeof crearBot>;
let uid = 1;
beforeEach(async () => {
  await vaciar(db);
  llamadas = [];
  bot = crearBot({ db, config: { ...configFromEnv({}), botToken: "1:x", setupCode: "secreto" } }, BOT);
  bot.api.config.use(async (_prev, method, payload) => {
    llamadas.push({ method, payload: payload as Record<string, any> });
    if (method === "sendMessage") return { ok: true, result: { message_id: uid++, date: 0, chat: { id: (payload as any).chat_id, type: "private" }, text: "" } } as any;
    return { ok: true, result: true } as any;
  });
  await escribir(ANA, ANA, "/start secreto");
  await escribir(ANA, GRUPO, "/vincular");
  const r = await escribir(BEA, GRUPO, "/unirme");
  await pulsar(ANA, GRUPO, botones(r).find((b) => b.text.includes("Aprobar"))!.callback_data, 9);
  await db.delete(tablas.efimeros);
});

const chatDe = (chat: number, from: number) => (chat === from ? { id: chat, type: "private" as const, first_name: "x" } : { id: chat, type: "supergroup" as const, title: "Socios" });
async function escribir(from: number, chat: number, text: string) {
  llamadas = [];
  const ents = text.startsWith("/") ? [{ type: "bot_command" as const, offset: 0, length: text.split(/\s/)[0]!.length }] : undefined;
  await bot.handleUpdate({ update_id: uid++, message: { message_id: uid++, date: 0, chat: chatDe(chat, from), from: { id: from, is_bot: false, first_name: from === ANA ? "Ana" : "Bea" }, text, entities: ents } } as Update);
  return llamadas;
}
async function pulsar(from: number, chat: number, data: string, messageId: number) {
  llamadas = [];
  await bot.handleUpdate({ update_id: uid++, callback_query: { id: String(uid++), from: { id: from, is_bot: false, first_name: "x" }, chat_instance: "x", data, message: { message_id: messageId, date: 0, chat: chatDe(chat, from), text: "?" } } } as Update);
  return llamadas;
}
const botones = (ls: Llamada[]) => ls.flatMap((l) => l.payload.reply_markup?.inline_keyboard?.flat() ?? []) as { text: string; callback_data: string }[];
const borrados = (ls: Llamada[]) => ls.filter((l) => l.method === "deleteMessage").map((l) => l.payload.message_id as number);
const efimeros = () => db.select().from(tablas.efimeros);

describe("mensajes que se borran solos", () => {
  it("/panel: explica qué caduca; el nuevo borra el anterior y caduca a los 15 min", async () => {
    let r = await escribir(BEA, BEA, "/panel");
    const primero = r.find((l) => l.method === "sendMessage")!;
    expect(primero.payload.text).toContain("Una vez dentro no tienes que volver a entrar");
    expect(primero.payload.text).toContain("15 minutos");
    const [e] = await efimeros();
    expect(e!.clave).toMatch(/^panel:/);
    expect(e!.borrarAt.getTime() - Date.now()).toBeGreaterThan(14 * 60_000);

    r = await escribir(BEA, BEA, "/panel");
    expect(borrados(r)).toEqual([e!.messageId]);
    expect(await efimeros()).toHaveLength(1);
    // Desde el grupo: el «te lo he mandado por privado» se borra al minuto
    await escribir(BEA, GRUPO, "/panel");
    expect((await efimeros()).filter((x) => x.chatId === GRUPO)).toHaveLength(1);
  });
  it("preguntas: cancelar la borra sin dejar «Cancelado»; confirmar la borra y deja el resultado; sin contestar caduca a los 30 min", async () => {
    let r = await escribir(BEA, GRUPO, "/visita Bar Nuevo si");
    const crear = botones(r)[0]!;
    const pregunta = r.find((l) => l.method === "sendMessage")!;
    expect(await efimeros()).toHaveLength(1);
    r = await pulsar(BEA, GRUPO, botones(r).find((b) => b.text.includes("Cancelar"))!.callback_data, 77);
    expect(r.map((l) => l.method)).toEqual(["answerCallbackQuery", "deleteMessage"]);
    expect(r[0]!.payload.text).toBe("Cancelado");

    r = await escribir(BEA, GRUPO, "/visita Bar Nuevo si");
    r = await pulsar(BEA, GRUPO, botones(r)[0]!.callback_data, 78);
    expect(r.map((l) => l.method)).toEqual(["answerCallbackQuery", "deleteMessage", "sendMessage"]);
    expect(crear).toBeDefined();
    expect(pregunta).toBeDefined();
  });
  it("los errores se borran a los 5 minutos y borrarVencidos los quita", async () => {
    await escribir(BEA, GRUPO, "/cobrado 99");
    const [e] = await efimeros();
    expect(Math.round((e!.borrarAt.getTime() - Date.now()) / 60_000)).toBe(5);
    await db.update(tablas.efimeros).set({ borrarAt: new Date(Date.now() - 1000) });
    const api = { deleteMessage: async (c: number, m: number) => (llamadas.push({ method: "deleteMessage", payload: { chat_id: c, message_id: m } }), true as never) };
    llamadas = [];
    expect(await borrarVencidos(db, api as never)).toBe(1);
    expect(borrados(llamadas)).toEqual([e!.messageId]);
    expect(await efimeros()).toHaveLength(0);
  });
  it("el «Hoy te toca» de un día borra el del día anterior", async () => {
    await escribir(BEA, GRUPO, "/nuevo Bar Pepe");
    await escribir(BEA, GRUPO, "/recordar Bar Pepe 2099-01-01");
    await db.update(tablas.recordatorios).set({ fecha: "2026-10-20" });
    let n = 500;
    const del: number[] = [];
    const api = { sendMessage: async () => ({ message_id: n++, chat: { id: BEA } }) as never, deleteMessage: async (_c: number, m: number) => (del.push(m), true as never) };
    await tick(db, api as never, new Date("2026-10-21T08:00:00Z"));
    await tick(db, api as never, new Date("2026-10-22T08:00:00Z"));
    expect(del).toEqual([500]);
  });
});
