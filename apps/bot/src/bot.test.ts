import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Update } from "grammy/types";
import { avisar, caracterControl, estadoStock, leerAjustes, resumenCaja, tablas, type DB } from "@nfc/core";
import { bdDeTest, vaciar } from "@nfc/core/testing";
import { crearBot } from "./bot";
import { configFromEnv } from "./config";
import { crearFake } from "./ia/fake";
import { enviarAvisos, tick } from "./programador";
import { eq } from "drizzle-orm";

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
    expect(textos(await escribir(ANA, ANA, "/start malo"))[0]).toContain("Aún no eres socio");
    expect(textos(await escribir(ANA, ANA, "/start secreto"))[0]).toContain("primer socio");
    // el código ya no sirve una segunda vez
    expect(textos(await escribir(BEA, BEA, "/start secreto"))[0]).toContain("Aún no eres socio");
    expect(await db.select().from(tablas.socios)).toHaveLength(1);
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

describe("bienvenida", () => {
  it("al entrar alguien: bienvenida con botones; «Quiero ser socio» pide el alta una sola vez; al aprobar, chuleta en el grupo y guía por privado", async () => {
    await montar();
    llamadas = [];
    await bot.handleUpdate({
      update_id: uid++,
      message: { message_id: uid++, date: 0, chat: chatDe(GRUPO, ANA), from: usuario(ANA, "Ana"), new_chat_members: [usuario(EXTRA, "Carlos"), { ...usuario(77), is_bot: true }] },
    } as Update);
    expect(textos(llamadas)).toHaveLength(1);
    expect(textos(llamadas)[0]).toContain("¡Bienvenido/a, <b>Carlos</b>!");
    expect(textos(llamadas)[0]).toContain("/venta Bar Pepe 3 pagado bizum");
    expect(botones(llamadas).map((x) => x.text)).toEqual(["🙋 Quiero ser socio", "💬 Abrir chat privado"]);

    let r = await pulsar(EXTRA, GRUPO, "unirme");
    const aprobar = botones(r).find((x) => x.text.includes("Aprobar"))!;
    expect(aprobar).toBeDefined();
    expect(textos(await pulsar(EXTRA, GRUPO, "unirme"))[0]).toContain("ya está hecha");
    expect(textos(await escribir(EXTRA, GRUPO, "/unirme"))[0]).toContain("ya está hecha");

    r = await pulsar(ANA, GRUPO, aprobar.callback_data);
    expect(textos(r)[0]).toContain("ya es socio");
    expect(textos(r)[0]).toContain("Lo básico");
    expect(textos(r)[0]).toContain("@nfc_bot hemos vendido");
    const dm = r.find((l) => l.payload.chat_id === EXTRA);
    expect(dm?.payload.text).toContain("¡Ya eres socio");
  });
  it("un socio que vuelve a entrar recibe un saludo sin botón de alta; un desconocido por privado recibe instrucciones", async () => {
    await montar();
    llamadas = [];
    await bot.handleUpdate({ update_id: uid++, message: { message_id: uid++, date: 0, chat: chatDe(GRUPO, BEA), from: usuario(BEA, "Bea"), new_chat_members: [usuario(BEA, "Bea")] } } as Update);
    expect(textos(llamadas)[0]).toContain("Hola otra vez");
    expect(botones(llamadas).map((x) => x.text)).toEqual(["💬 Abrir chat privado"]);
    expect(textos(await escribir(EXTRA, EXTRA, "/start hola"))[0]).toContain("Aún no eres socio");
    expect(await escribir(EXTRA, EXTRA, "/caja")).toHaveLength(0);
  });
  it("el admin cambia el texto de bienvenida (y lo vuelve a dejar por defecto)", async () => {
    await montar();
    expect(textos(await escribir(ANA, GRUPO, "/config bienvenida Ey {nombre}, bienvenido a <Billetes>"))[0]).toContain("Ey <b>Ana</b>, bienvenido a &lt;Billetes&gt;");
    llamadas = [];
    await bot.handleUpdate({ update_id: uid++, message: { message_id: uid++, date: 0, chat: chatDe(GRUPO, ANA), from: usuario(ANA), new_chat_members: [usuario(EXTRA, "Carlos")] } } as Update);
    expect(textos(llamadas)[0]).toMatch(/^Ey <b>Carlos<\/b>/);
    expect(textos(await escribir(BEA, GRUPO, "/config bienvenida hola"))[0]).toContain("solo lo puede hacer un admin");
    expect(textos(await escribir(ANA, GRUPO, "/config bienvenida"))[0]).toContain("Bienvenida por defecto");
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
    // El aviso de stock bajo va al grupo por el buzón
    const salida: { chat_id: number; text: string }[] = [];
    await enviarAvisos(db, { sendMessage: async (chat_id: number, text: string) => (salida.push({ chat_id, text }), {} as never) } as never);
    expect(salida).toEqual([{ chat_id: GRUPO, text: expect.stringContaining("Quedan <b>8 paneles</b>") }]);
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
    const dm = r.find((l) => l.payload.chat_id === BEA)?.payload.text as string;
    expect(dm).toMatch(/\/entrar#[\w-]{40,}/);
    expect(dm).toMatch(/<code>\d{4} \d{4}<\/code>/);
    expect(textos(r)).toContain("Te lo he mandado por privado. 📬");
    expect(await db.select().from(tablas.enlacesPanel)).toHaveLength(1);
    expect(textos(await escribir(BEA, BEA, "/panel cerrar"))[0]).toContain("No tenías ninguna sesión");
  });
  it("/config avisos: lista y silencia tipos (solo admin)", async () => {
    await montar();
    expect(textos(await escribir(ANA, GRUPO, "/config avisos"))[0]).toContain("🔔 panel");
    expect(textos(await escribir(ANA, GRUPO, "/config avisos panel no"))[0]).toContain("🔕 panel");
    expect((await leerAjustes(db)).avisosSilenciados).toEqual(["panel"]);
    expect(textos(await escribir(ANA, GRUPO, "/config avisos panel si"))[0]).toContain("🔔 panel");
    expect(textos(await escribir(ANA, GRUPO, "/config avisos nada no"))[0]).toContain("Así:");
    expect(textos(await escribir(BEA, GRUPO, "/config avisos panel no"))[0]).toContain("solo lo puede hacer un admin");
  });
});

describe("buzón de avisos", () => {
  it("envía al grupo, a los admins y a un socio; un silencioso no se envía; si falla, reintenta hasta 5 veces", async () => {
    await montar();
    const [bea] = await db.select().from(tablas.socios).where(eq(tablas.socios.telegramId, BEA));
    await avisar(db, { tipo: "panel", texto: "al grupo" });
    await avisar(db, { tipo: "copia", texto: "a los admins", destino: "admins" });
    await avisar(db, { tipo: "cobro", texto: "a Bea", destino: "socio", socioId: bea!.id });
    await avisar(db, { tipo: "copia", texto: "silencioso", silencioso: true });
    const salida: [number, string][] = [];
    const api = { sendMessage: async (c: number, t: string) => (salida.push([c, t]), {} as never) };
    expect(await enviarAvisos(db, api as never)).toBe(3);
    expect(salida).toEqual([[GRUPO, "al grupo"], [ANA, "a los admins"], [BEA, "a Bea"]]);
    expect(await enviarAvisos(db, api as never)).toBe(0);
    await avisar(db, { tipo: "panel", texto: "falla" });
    const rota = { sendMessage: async () => { throw new Error("caído"); } };
    for (let i = 0; i < 6; i++) await enviarAvisos(db, rota as never);
    const [f] = await db.select().from(tablas.avisos).where(eq(tablas.avisos.texto, "falla"));
    expect(f).toMatchObject({ intentos: 5, enviadoAt: null });
  });
});

describe("avisos programados", () => {
  it("ofertas: aviso 3 días antes de terminar y al día siguiente de terminar", async () => {
    await montar();
    await escribir(ANA, GRUPO, "/oferta pack 2 35€ hasta 25/10");
    const api = { sendMessage: async () => ({}) as never };
    await tick(db, api as never, new Date("2026-10-22T08:00:00Z"));
    await tick(db, api as never, new Date("2026-10-22T09:00:00Z"));
    await tick(db, api as never, new Date("2026-10-26T08:00:00Z"));
    const textosAvisos = (await db.select().from(tablas.avisos)).filter((a) => a.tipo === "oferta").map((a) => a.texto);
    expect(textosAvisos).toEqual([expect.stringContaining("termina el 25 oct"), expect.stringContaining("Ha terminado la oferta")]);
  });
  it("ventas sin cobrar hace más de 7 días: se lo recuerda al vendedor por la mañana", async () => {
    await montar();
    await escribir(BEA, GRUPO, "/nuevo Bar Pepe");
    await escribir(BEA, GRUPO, "/venta Bar Pepe 1 pendiente");
    const salida: { chat_id: number; text: string }[] = [];
    const api = { sendMessage: async (chat_id: number, text: string) => (salida.push({ chat_id, text }), {} as never) };
    await tick(db, api as never, new Date("2026-10-27T08:00:00Z"));
    expect(salida).toHaveLength(0);
    await tick(db, api as never, new Date("2026-10-28T08:00:00Z"));
    expect(salida).toEqual([{ chat_id: BEA, text: expect.stringContaining("#1 Bar Pepe: 25,00 € desde el 21 oct") }]);
  });
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

describe("placas", () => {
  it("asignar con el comercio por crear, enlace de reseñas, ver, listar y quitar", async () => {
    await montar();
    const codigo = "K7M2" + caracterControl("K7M2");
    const mal = codigo.slice(0, 4) + (codigo[4] === "Z" ? "Y" : "Z");
    expect(textos(await escribir(BEA, GRUPO, `/placa ${mal} Bar Pepe`))[0]).toContain("no es un código de placa válido");
    expect(textos(await escribir(BEA, GRUPO, `/placa ${codigo}`))[0]).toContain("está libre");

    const r = await escribir(BEA, GRUPO, `/placa ${codigo.toLowerCase()} Bar Pepe`);
    const crear = botones(r).find((x) => x.text.includes("Crear"))!;
    expect(textos(await pulsar(BEA, GRUPO, crear.callback_data))[0]).toContain("Falta su enlace de reseñas");

    expect(textos(await escribir(BEA, GRUPO, "/dato Bar Pepe | resenas | https://g.page/r/pepe/review"))[0]).toContain("resenas actualizado");
    expect(textos(await escribir(BEA, GRUPO, `/placa ${codigo}`))[0]).toContain("Lleva a: https://g.page/r/pepe/review");
    expect(textos(await escribir(BEA, GRUPO, "/placas"))[0]).toContain(`${codigo} Bar Pepe: 0`);
    expect(textos(await escribir(BEA, GRUPO, "/ficha Bar Pepe"))[0]).toContain(`Placas: ${codigo} (0 escaneos)`);

    expect(textos(await escribir(BEA, GRUPO, `/placa ${codigo} quitar`))[0]).toContain("quitada de <b>Bar Pepe</b>");
    expect(textos(await escribir(BEA, GRUPO, "/placas"))[0]).toContain("Aún no hay placas asignadas");
  });
});

describe("personalización del chat", () => {
  const programados = () => db.select().from(tablas.efimeros);

  it("tono, nombre y emojis: cambian lo que dice el bot (solo admin)", async () => {
    await montar();
    expect(textos(await escribir(ANA, GRUPO, "/config tono serio"))[0]).toContain("Tono: <b>Serio</b>");
    expect(textos(await escribir(ANA, ANA, "/pendientes"))[0]).toBe("Sin pendientes en los próximos 7 días.");
    await escribir(ANA, GRUPO, "/config nombre Billetes");
    expect(textos(await escribir(ANA, ANA, "/start"))[0]).toMatch(/^Hola, Ana\. Soy Billetes\./);
    await escribir(ANA, GRUPO, "/config tono gracioso");
    expect(textos(await escribir(ANA, GRUPO, "/venta Bar Pepe 1 pagado bizum"))[0]).toContain("¿Lo creo y sigo?");
    expect(textos(await escribir(ANA, GRUPO, "/config emojis no"))[0]).toBe("Sin emojis a partir de ahora.");
    const r = await escribir(ANA, ANA, "/precio 3");
    expect(textos(r)[0]).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(textos(await escribir(BEA, GRUPO, "/config tono cercano"))[0]).toContain("solo lo puede hacer un admin");
    expect((await leerAjustes(db)).tono).toBe("gracioso");
    expect(textos(await escribir(ANA, GRUPO, "/config tono pirata"))[0]).toContain("Tonos:");
  });

  it("limpieza: consultas del grupo se programan para borrarse (con el mensaje del socio); en privado no", async () => {
    await montar();
    await vaciarEfimeros();
    expect(textos(await escribir(ANA, GRUPO, "/config limpieza consultas 10"))[0]).toContain("se borran a los 10 minutos");
    await vaciarEfimeros();
    await escribir(BEA, BEA, "/caja");
    expect(await programados()).toHaveLength(0);
    await escribir(BEA, GRUPO, "/caja");
    expect(await programados()).toHaveLength(1);
    await escribir(ANA, GRUPO, "/config limpieza comandos si");
    await vaciarEfimeros();
    await escribir(BEA, GRUPO, "/caja");
    expect(await programados()).toHaveLength(2);
    // Los apuntes no (apuntesMin = 0)
    await vaciarEfimeros();
    await escribir(BEA, GRUPO, "/nuevo Bar Pepe");
    expect(await programados()).toHaveLength(0);
    expect(textos(await escribir(ANA, GRUPO, "/config limpieza errores 3000"))[0]).toContain("como mucho");
  });

  it("modo privado: la consulta va por privado y en el grupo solo queda el aviso", async () => {
    await montar();
    await escribir(ANA, GRUPO, "/config limpieza privado si");
    const r = await escribir(BEA, GRUPO, "/caja");
    const envios = r.filter((l) => l.method === "sendMessage");
    expect(envios[0]!.payload.chat_id).toBe(BEA);
    expect(envios[0]!.payload.text).toContain("Caja");
    expect(envios[1]!.payload).toMatchObject({ chat_id: GRUPO });
    expect(envios[1]!.payload.text).toContain("por privado");
    // Lo apuntado sigue en el grupo
    expect((await escribir(BEA, GRUPO, "/nuevo Bar Pepe")).find((l) => l.method === "sendMessage")!.payload.chat_id).toBe(GRUPO);
  });

  it("/limpiar borra ya lo pendiente (solo admin, en el grupo); el resumen de los lunes no se programa nunca", async () => {
    await montar();
    await escribir(ANA, GRUPO, "/config limpieza consultas 60");
    await escribir(BEA, GRUPO, "/caja");
    await escribir(BEA, GRUPO, "/stock");
    expect(textos(await escribir(BEA, GRUPO, "/limpiar"))[0]).toContain("solo lo puede hacer un admin");
    const antes = (await programados()).filter((e) => e.chatId === GRUPO).length;
    const r = await escribir(ANA, GRUPO, "/limpiar");
    expect(r.filter((l) => l.method === "deleteMessage").length).toBeGreaterThanOrEqual(antes);
    expect(textos(r)[0]).toMatch(/He borrado \d+ mensajes/);
    expect((await programados()).filter((e) => e.chatId === GRUPO && e.borrarAt.getTime() > Date.now() + 60_000)).toHaveLength(0);
    await vaciarEfimeros();
    const api = { sendMessage: async () => ({ message_id: 5 }) as never };
    await tick(db, api as never, new Date("2026-10-26T08:00:00Z"));
    expect(await programados()).toHaveLength(0);
  });

  async function vaciarEfimeros() {
    await db.delete(tablas.efimeros);
  }
});
