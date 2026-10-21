import { Bot, GrammyError, InlineKeyboard, type Context } from "grammy";
import type { InlineKeyboardButton, UserFromGetMe } from "grammy/types";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import {
  altaSocio, crearEnlacePanel, deshacerUltima, ErrorNegocio, guardarAjuste, haySocios, hoy as hoyMadrid, html, leerAjustes,
  listarProductos, marcarHecho, nombresComercios, recientesDeSocio, socioPorTelegram, tablas, MINUTOS_ENLACE, type DB, type Socio,
} from "@nfc/core";
import type { BotConfig } from "./config";
import type { Accion } from "./acciones";
import { parseComando } from "./comandos";
import { bienvenida, chuleta } from "./ayuda";
import { ejecutar, proponer, resolverPendiente, type Respuesta } from "./ejecutor";
import { ErrorIa, type Interprete } from "./ia/interpretar";

export interface Deps {
  db: DB;
  config: BotConfig;
  interprete?: Interprete;
  now?: () => Date;
}

type Ctx = Context & { socio: Socio | null; grupoId: number | null };

/** Comandos que no son una Accion (los gestiona el propio bot). */
const ESPECIALES = new Set(["start", "vincular", "unirme", "deshacer", "panel", "ia", "id"]);

const MAX = 4000;
/** Telegram admite 4096 caracteres por mensaje: se corta por líneas. */
export function trocear(texto: string) {
  if (texto.length <= MAX) return [texto];
  const out: string[] = [];
  let actual = "";
  for (const l of texto.split("\n")) {
    if (actual.length + l.length + 1 > MAX) {
      out.push(actual);
      actual = "";
    }
    actual += (actual ? "\n" : "") + l.slice(0, MAX);
  }
  if (actual) out.push(actual);
  return out;
}

const teclado = (r: Respuesta) => (r.botones?.length ? InlineKeyboard.from(r.botones.map((fila) => fila.map((x) => InlineKeyboard.text(x.texto.slice(0, 60), x.data)))) : undefined);

export function crearBot(deps: Deps, botInfo?: UserFromGetMe) {
  const { db, config } = deps;
  const ahora = () => deps.now?.() ?? new Date();
  const bot = new Bot<Ctx>(config.botToken || "0:test", botInfo ? { botInfo } : undefined);

  async function enviar(ctx: Ctx, r: Respuesta) {
    const trozos = trocear(r.texto);
    for (const [i, t] of trozos.entries()) {
      await ctx.reply(t, {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
        reply_markup: i === trozos.length - 1 ? teclado(r) : undefined,
        reply_parameters: ctx.chat?.type !== "private" && ctx.msg?.message_id && i === 0 ? { message_id: ctx.msg.message_id, allow_sending_without_reply: true } : undefined,
      });
    }
    if (r.grupo && ctx.grupoId) await ctx.api.sendMessage(ctx.grupoId, r.grupo, { parse_mode: "HTML" });
    // Si nunca ha abierto el chat privado con el bot, Telegram no deja escribirle: no pasa nada
    if (r.privado) await ctx.api.sendMessage(r.privado.telegramId, r.privado.texto, { parse_mode: "HTML", link_preview_options: { is_disabled: true } }).catch(() => {});
  }

  async function correr(ctx: Ctx, f: () => Promise<Respuesta>) {
    try {
      await enviar(ctx, await f());
    } catch (e) {
      if (e instanceof ErrorNegocio || e instanceof ErrorIa) return enviar(ctx, { texto: `⚠️ ${html(e.message)}` });
      console.error("Error en el bot", e);
      await enviar(ctx, { texto: "😵 Algo ha fallado por mi parte. Si se repite, avisa a quien mantiene el bot." }).catch(() => {});
    }
  }

  const contexto = (ctx: Ctx, origen: "bot" | "ia" = "bot") => ({ db, socio: ctx.socio!, hoy: hoyMadrid(ahora()), origen, botUsername: ctx.me.username });

  // ── Quién escribe y desde dónde ──
  bot.use(async (ctx, next) => {
    const from = ctx.from;
    if (!from || from.is_bot) return;
    ctx.socio = await socioPorTelegram(db, from.id);
    ctx.grupoId = (await leerAjustes(db)).grupoChatId;
    const chat = ctx.chat;
    // «Quiero ser socio» de la bienvenida: lo puede pulsar cualquiera del grupo vinculado
    if (ctx.callbackQuery?.data === "unirme" && chat?.id === ctx.grupoId) return next();
    // Botón pulsado por alguien que no es socio (p. ej. «Aprobar» en su propia petición de alta)
    if (ctx.callbackQuery && !ctx.socio) return void (await ctx.answerCallbackQuery({ text: "Esto es solo para socios.", show_alert: true }).catch(() => {}));
    const texto = ctx.message?.text ?? "";
    const cmd = /^\/(\w+)/.exec(texto)?.[1]?.toLowerCase();
    if (chat?.type === "private") {
      // Por privado solo socios, salvo /start (alta inicial con el código o explicar cómo entrar).
      if (ctx.socio || cmd === "start") return next();
      return;
    }
    if (chat?.type === "group" || chat?.type === "supergroup") {
      if (chat.id === ctx.grupoId) return ctx.socio || cmd === "unirme" || ctx.message?.new_chat_members ? next() : undefined;
      // Otro grupo: solo un admin puede vincularlo; si no, silencio.
      if (cmd === "vincular" && ctx.socio?.rol === "admin") return next();
      return;
    }
    // Botones: el mensaje es del grupo o de un privado ya filtrado al enviarlo; basta con que sea socio.
    if (ctx.callbackQuery && ctx.socio) return next();
  });

  bot.command("start", async (ctx) => {
    if (ctx.chat.type !== "private") return;
    if (ctx.socio) return correr(ctx, () => ejecutar(contexto(ctx), { t: "ayuda" }));
    const codigo = ctx.match.trim();
    if (!config.setupCode || codigo !== config.setupCode || (await haySocios(db))) {
      // Alguien del grupo que abre el chat privado antes de que le aprueben
      return ctx.reply("👋 Hola. Aún no eres socio: pulsa «Quiero ser socio» en el grupo (o escribe /unirme allí) y, cuando un admin te apruebe, te escribo por aquí.");
    }
    const s = await altaSocio(db, { telegramId: ctx.from!.id, nombre: nombreDe(ctx), username: ctx.from!.username }, null);
    await ctx.reply(
      `👑 Hola, ${html(s.nombre)}. Eres el primer socio y admin.\n\n1. Añádeme al grupo de socios y escribe allí /vincular.\n2. Los demás escriben /unirme en el grupo y tú los apruebas.\n3. Crea el producto: /producto nuevo Panel NFC 25€\n\nDesactiva el modo privacidad en @BotFather (/setprivacy → Disable) si quieres hablarme normal en el grupo.`,
      { parse_mode: "HTML" },
    );
  });

  bot.command("vincular", async (ctx) => {
    if (ctx.chat.type === "private" || ctx.socio?.rol !== "admin") return;
    await guardarAjuste(db, "grupoChatId", ctx.chat.id);
    ctx.grupoId = ctx.chat.id;
    await ctx.reply("🔗 Grupo vinculado: a partir de ahora trabajo aquí (y en privado con cada socio). Los demás: /unirme");
  });

  /** Petición de alta: un mensaje en el grupo con «Aprobar» para los admins (una sola petición abierta por persona). */
  async function pedirAlta(ctx: Ctx) {
    const u = ctx.from!;
    const nombre = nombreDe(ctx);
    const [admin] = await db.select().from(tablas.socios).where(and(eq(tablas.socios.rol, "admin"), eq(tablas.socios.activo, true))).limit(1);
    if (!admin) return;
    const [abierta] = await db
      .select({ id: tablas.pendientes.id })
      .from(tablas.pendientes)
      .where(and(eq(tablas.pendientes.telegramId, u.id), isNull(tablas.pendientes.resueltaAt), gt(tablas.pendientes.expiraAt, new Date())))
      .limit(1);
    if (abierta) return enviar(ctx, { texto: `${html(nombre)}, tu petición ya está hecha: falta que un admin la apruebe.` });
    // La propuesta la «firma» un admin cualquiera; la puede aprobar cualquier admin.
    const r = await proponer(
      { db, socio: admin, hoy: hoyMadrid(ahora()), origen: "bot" },
      `🙋 ${html(nombre)}${u.username ? ` (@${html(u.username)})` : ""} quiere unirse como socio. Un admin tiene que aprobarlo.`,
      [{ etiqueta: "✅ Aprobar", p: { a: { t: "alta", telegramId: u.id, nombre, username: u.username ?? null } } }],
      u.id,
    );
    await enviar(ctx, r);
  }

  bot.command("unirme", async (ctx) => {
    if (ctx.chat.id !== ctx.grupoId) return;
    if (ctx.socio) return ctx.reply("Ya eres socio. 😉");
    await pedirAlta(ctx);
  });

  bot.callbackQuery("unirme", async (ctx) => {
    if (ctx.socio) return ctx.answerCallbackQuery({ text: "Ya eres socio. 😉", show_alert: true });
    await ctx.answerCallbackQuery();
    await pedirAlta(ctx);
  });

  // ── Bienvenida al entrar en el grupo ──
  bot.on("message:new_chat_members", async (ctx) => {
    if (ctx.chat.id !== ctx.grupoId) return;
    const { bienvenida: plantilla } = await leerAjustes(db);
    for (const u of ctx.message.new_chat_members) {
      if (u.is_bot) continue;
      const nombre = [u.first_name, u.last_name].filter(Boolean).join(" ");
      const yaSocio = await socioPorTelegram(db, u.id);
      const texto = yaSocio
        ? `👋 ¡Hola otra vez, <b>${html(nombre)}</b>! Sigues siendo socio.\n\n${chuleta(ctx.me.username)}`
        : [
            bienvenida(plantilla, nombre),
            "",
            "Para empezar:",
            "1. Pulsa «Quiero ser socio» y un admin te aprueba.",
            "2. Ábreme por privado y pulsa Iniciar: así te aviso cada mañana de a quién te toca volver y te mando el enlace al panel.",
            "",
            chuleta(ctx.me.username),
          ].join("\n");
      const botones: InlineKeyboardButton[][] = yaSocio ? [] : [[{ text: "🙋 Quiero ser socio", callback_data: "unirme" }]];
      botones.push([{ text: "💬 Abrir chat privado", url: `https://t.me/${ctx.me.username}?start=hola` }]);
      await ctx.reply(texto, { parse_mode: "HTML", link_preview_options: { is_disabled: true }, reply_markup: { inline_keyboard: botones } });
    }
  });

  bot.command("deshacer", (ctx) =>
    correr(ctx, async () => ({ texto: `↩️ Deshecho: ${html(await deshacerUltima(db, ctx.socio!.id))}` })),
  );

  bot.command("panel", async (ctx) => {
    const token = await crearEnlacePanel(db, ctx.socio!.id);
    const url = `${config.publicUrl}/entrar#${token}`;
    const texto = `🔐 Tu enlace al panel (sirve una vez y caduca en ${MINUTOS_ENLACE} min):\n${url}\n\nNo lo reenvíes: quien lo abra entra como tú.`;
    try {
      await ctx.api.sendMessage(ctx.from!.id, texto, { link_preview_options: { is_disabled: true } });
      if (ctx.chat.type !== "private") await ctx.reply("Te lo he mandado por privado. 📬");
    } catch {
      await ctx.reply("No puedo escribirte por privado: ábreme un chat y pulsa Iniciar, y vuelve a pedir /panel.");
    }
  });

  bot.command("ia", (ctx) => lenguajeNatural(ctx, ctx.match));

  // ── Resto de comandos ──
  bot.on("message:text", async (ctx, next) => {
    const m = /^\/(\w+)(?:@(\w+))?\s*([\s\S]*)$/.exec(ctx.message.text);
    if (!m) return next();
    if (m[2] && m[2].toLowerCase() !== ctx.me.username.toLowerCase()) return; // comando para otro bot
    const cmd = m[1]!.toLowerCase();
    if (ESPECIALES.has(cmd)) return;
    return correr(ctx, async () => {
      const a = parseComando(cmd, m[3] ?? "", hoyMadrid(ahora()));
      if (!a) return { texto: `No conozco /${html(cmd)}. Mira /ayuda.` };
      return ejecutar(contexto(ctx), a);
    });
  });

  // ── Lenguaje natural ──
  bot.on("message:text", async (ctx) => {
    const t = ctx.message.text;
    if (ctx.chat.type !== "private") {
      const mencion = `@${ctx.me.username}`.toLowerCase();
      const aMi = t.toLowerCase().includes(mencion) || ctx.message.reply_to_message?.from?.id === ctx.me.id;
      if (!aMi) return;
      return lenguajeNatural(ctx, t.replace(new RegExp(`@${ctx.me.username}`, "ig"), "").trim());
    }
    return lenguajeNatural(ctx, t);
  });

  async function lenguajeNatural(ctx: Ctx, texto: string) {
    if (!texto.trim()) return enviar(ctx, { texto: "Dime qué apunto, p. ej. «hemos vendido 3 paneles al Bar Pepe, pagado por bizum»." });
    if (!deps.interprete) return enviar(ctx, { texto: "La IA no está activada: usa los comandos (/ayuda)." });
    return correr(ctx, async () => {
      const fecha = hoyMadrid(ahora());
      const [uso] = await db
        .insert(tablas.usoIa)
        .values({ fecha, peticiones: 1 })
        .onConflictDoUpdate({ target: tablas.usoIa.fecha, set: { peticiones: sql`${tablas.usoIa.peticiones} + 1` } })
        .returning();
      if (uso!.peticiones > config.aiDailyLimit) return { texto: "Hoy ya he usado la IA todo lo que podía. Usa los comandos (/ayuda); mañana vuelvo a entender frases." };
      await ctx.replyWithChatAction("typing").catch(() => {});
      const r = await deps.interprete!.interpretar(texto, {
        hoy: fecha,
        socio: ctx.socio!.nombre,
        comercios: await nombresComercios(db),
        productos: (await listarProductos(db)).map((p) => p.nombre),
      });
      if (!r.ok) return { texto: `🤔 ${html(r.respuesta)}` };
      return ejecutar(contexto(ctx, "ia"), r.accion);
    });
  }

  // ── Ubicaciones ──
  bot.on("message:location", (ctx) =>
    correr(ctx, async () => {
      const { latitude: lat, longitude: lon } = ctx.message.location;
      const recientes = await recientesDeSocio(db, ctx.socio!.id);
      if (!recientes.length) return { texto: "Para guardar una ubicación, apunta antes la visita al comercio (/visita …) y vuelve a mandármela." };
      return proponer(
        contexto(ctx),
        "📍 ¿De qué comercio es esta ubicación?",
        recientes.map((c) => ({ etiqueta: c.nombre, p: { a: { t: "ubicacion", comercio: c.id, lat, lon } satisfies Accion } })),
      );
    }),
  );

  // ── Botones ──
  bot.on("callback_query:data", async (ctx) => {
    const [tipo, idTxt] = ctx.callbackQuery.data.split(":");
    const id = Number(idTxt);
    try {
      let r: Respuesta;
      if (tipo === "ok" || tipo === "no") r = await resolverPendiente({ db, socio: ctx.socio!, hoy: hoyMadrid(ahora()), botUsername: ctx.me.username }, id, tipo === "ok");
      else if (tipo === "hecho") {
        const rec = await marcarHecho(db, id, ctx.socio!.id);
        r = { texto: `✅ Hecho (recordatorio del ${rec.fecha}).` };
      } else return ctx.answerCallbackQuery();
      await ctx.answerCallbackQuery();
      // La pregunta se queda sin botones (salvo la lista de recordatorios, que puede tener más); la respuesta va aparte
      if (tipo !== "hecho") await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
      await enviar(ctx, r);
    } catch (e) {
      if (e instanceof ErrorNegocio) return ctx.answerCallbackQuery({ text: e.message, show_alert: true });
      console.error("Error en un botón", e);
      await ctx.answerCallbackQuery({ text: "Algo ha fallado. Inténtalo de nuevo.", show_alert: true }).catch(() => {});
    }
  });

  bot.catch((err) => {
    if (err.error instanceof GrammyError) console.error("Telegram:", err.error.description);
    else console.error("Error sin capturar", err.error);
  });

  return bot;
}

function nombreDe(ctx: Context) {
  const u = ctx.from!;
  return [u.first_name, u.last_name].filter(Boolean).join(" ").slice(0, 120) || u.username || String(u.id);
}
