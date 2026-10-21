import { Bot, GrammyError, InlineKeyboard, type Context } from "grammy";
import type { InlineKeyboardButton, UserFromGetMe } from "grammy/types";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import {
  altaSocio, cerrarSesionesDe, crearEnlacePanel, deshacerUltima, olvidarEfimero, programarBorrado, ErrorNegocio, guardarAjuste, haySocios, hoy as hoyMadrid, html, leerAjustes,
  listarProductos, marcarHecho, aplicarEstilo, estiloDe, frase, vaciarEfimeros, type Ajustes, nombresComercios, recientesDeSocio, socioPorTelegram, tablas, plural, MINUTOS_ENLACE, type DB, type Socio,
} from "@nfc/core";
import type { BotConfig } from "./config";
import type { Accion } from "./acciones";
import { parseComando } from "./comandos";
import { bienvenida, chuleta } from "./ayuda";
import { ejecutar, proponer, resolverPendiente, MINUTOS_PENDIENTE, type Respuesta } from "./ejecutor";
import { ErrorIa, type Interprete } from "./ia/interpretar";

export interface Deps {
  db: DB;
  config: BotConfig;
  interprete?: Interprete;
  now?: () => Date;
}

type Ctx = Context & { socio: Socio | null; grupoId: number | null; ajustes: Ajustes };

/** Comandos que no son una Accion (los gestiona el propio bot). */
const ESPECIALES = new Set(["start", "vincular", "unirme", "deshacer", "panel", "ia", "id", "limpiar"]);

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

const teclado = (r: Respuesta, estilo: (t: string) => string) =>
  r.botones?.length ? InlineKeyboard.from(r.botones.map((fila) => fila.map((x) => InlineKeyboard.text(estilo(x.texto).slice(0, 60) || x.texto.slice(0, 60), x.data)))) : undefined;

export function crearBot(deps: Deps, botInfo?: UserFromGetMe) {
  const { db, config } = deps;
  const ahora = () => deps.now?.() ?? new Date();
  const bot = new Bot<Ctx>(config.botToken || "0:test", botInfo ? { botInfo } : undefined);

  /** Programa el borrado de un mensaje del bot; con `clave`, borra ya los anteriores con esa clave. */
  async function borrarLuego(chatId: number, messageId: number, enMs: number, clave?: string) {
    const anteriores = await programarBorrado(db, { chatId, messageId, enMs, clave });
    for (const m of anteriores) await bot.api.deleteMessage(m.chatId, m.messageId).catch(() => {});
  }

  async function enviar(ctx: Ctx, r: Respuesta) {
    const aj = ctx.ajustes;
    const estilo = (t: string) => aplicarEstilo(t, aj);
    const lim = aj.limpieza;
    const enGrupo = ctx.chat?.type !== "private";
    // Modo silencioso: las consultas hechas en el grupo, por privado (si nunca ha abierto el privado, aquí como siempre)
    if (enGrupo && lim.consultasPorPrivado && r.clase === "consulta" && ctx.from) {
      const ok = await mandar(ctx.from.id, { ...r, efimero: undefined }, estilo).then(() => true, () => false);
      if (ok) {
        await enviar(ctx, { texto: frase(estiloDe(aj), "privado"), efimero: 60_000 });
        return;
      }
    }
    // Las preguntas con «Confirmar/Cancelar» que nadie contesta se borran al caducar
    const conPregunta = r.botones?.some((f) => f.some((b) => /^(ok|no):/.test(b.data)));
    const porClase = r.clase === "error" ? lim.erroresMin : !enGrupo ? 0 : r.clase === "consulta" ? lim.consultasMin : r.clase === "apunte" ? lim.apuntesMin : 0;
    const efimero = r.efimero ?? (conPregunta ? MINUTOS_PENDIENTE * 60_000 : porClase ? porClase * 60_000 : undefined);
    const trozos = trocear(estilo(r.texto));
    for (const [i, t] of trozos.entries()) {
      const m = await ctx.reply(t, {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
        reply_markup: i === trozos.length - 1 ? teclado(r, estilo) : undefined,
        reply_parameters: enGrupo && ctx.msg?.message_id && i === 0 ? { message_id: ctx.msg.message_id, allow_sending_without_reply: true } : undefined,
      });
      if (efimero && m?.chat) await borrarLuego(m.chat.id, m.message_id, efimero);
    }
    // El mensaje del socio se va con la respuesta (solo mensajes escritos, no botones; hace falta que el bot sea admin)
    if (enGrupo && efimero && lim.borrarComandos && ctx.message && ctx.chat) await borrarLuego(ctx.chat.id, ctx.message.message_id, efimero);
    if (r.grupo && ctx.grupoId) await ctx.api.sendMessage(ctx.grupoId, estilo(r.grupo), { parse_mode: "HTML" });
    // Si nunca ha abierto el chat privado con el bot, Telegram no deja escribirle: no pasa nada
    if (r.privado) await ctx.api.sendMessage(r.privado.telegramId, estilo(r.privado.texto), { parse_mode: "HTML", link_preview_options: { is_disabled: true } }).catch(() => {});
  }

  /** Respuesta entera por privado (falla si esa persona no ha abierto nunca el chat con el bot). */
  async function mandar(chatId: number, r: Respuesta, estilo: (t: string) => string) {
    const trozos = trocear(estilo(r.texto));
    for (const [i, t] of trozos.entries()) {
      await bot.api.sendMessage(chatId, t, { parse_mode: "HTML", link_preview_options: { is_disabled: true }, reply_markup: i === trozos.length - 1 ? teclado(r, estilo) : undefined });
    }
  }

  async function correr(ctx: Ctx, f: () => Promise<Respuesta>) {
    try {
      await enviar(ctx, await f());
    } catch (e) {
      if (e instanceof ErrorNegocio || e instanceof ErrorIa) return enviar(ctx, { texto: `⚠️ ${html(e.message)}`, clase: "error" });
      console.error("Error en el bot", e);
      await enviar(ctx, { texto: frase(estiloDe(ctx.ajustes), "fallo") }).catch(() => {});
    }
  }

  const contexto = (ctx: Ctx, origen: "bot" | "ia" = "bot") => ({ db, socio: ctx.socio!, hoy: hoyMadrid(ahora()), origen, botUsername: ctx.me.username, estilo: estiloDe(ctx.ajustes) });

  // ── Quién escribe y desde dónde ──
  bot.use(async (ctx, next) => {
    const from = ctx.from;
    if (!from || from.is_bot) return;
    ctx.socio = await socioPorTelegram(db, from.id);
    ctx.ajustes = await leerAjustes(db);
    ctx.grupoId = ctx.ajustes.grupoChatId;
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
    if (ctx.socio) {
      return correr(ctx, async () => {
        const r = await ejecutar(contexto(ctx), { t: "ayuda" });
        return { ...r, texto: `${frase(estiloDe(ctx.ajustes), "saludo", { nombre: html(ctx.socio!.nombre) })}\n\n${r.texto}` };
      });
    }
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
    if (abierta) return enviar(ctx, { texto: `${html(nombre)}, tu petición ya está hecha: falta que un admin la apruebe.`, efimero: 60_000 });
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
    if (ctx.socio) return enviar(ctx, { texto: frase(estiloDe(ctx.ajustes), "yaSocio"), efimero: 60_000 });
    await pedirAlta(ctx);
  });

  bot.callbackQuery("unirme", async (ctx) => {
    if (ctx.socio) return ctx.answerCallbackQuery({ text: aplicarEstilo(frase(estiloDe(ctx.ajustes), "yaSocio"), ctx.ajustes), show_alert: true });
    await ctx.answerCallbackQuery();
    await pedirAlta(ctx);
  });

  // ── Bienvenida al entrar en el grupo ──
  bot.on("message:new_chat_members", async (ctx) => {
    if (ctx.chat.id !== ctx.grupoId) return;
    const { bienvenida: plantilla, nombreAsistente } = ctx.ajustes;
    for (const u of ctx.message.new_chat_members) {
      if (u.is_bot) continue;
      const nombre = [u.first_name, u.last_name].filter(Boolean).join(" ");
      const yaSocio = await socioPorTelegram(db, u.id);
      const texto = yaSocio
        ? `👋 ¡Hola otra vez, <b>${html(nombre)}</b>! Sigues siendo socio.\n\n${chuleta(ctx.me.username)}`
        : [
            bienvenida(plantilla, nombre, nombreAsistente),
            "",
            "Para empezar:",
            "1. Pulsa «Quiero ser socio» y un admin te aprueba.",
            "2. Ábreme por privado y pulsa Iniciar: así te aviso cada mañana de a quién te toca volver y te mando el enlace al panel.",
            "",
            chuleta(ctx.me.username),
          ].join("\n");
      const botones: InlineKeyboardButton[][] = yaSocio ? [] : [[{ text: "🙋 Quiero ser socio", callback_data: "unirme" }]];
      botones.push([{ text: "💬 Abrir chat privado", url: `https://t.me/${ctx.me.username}?start=hola` }]);
      await ctx.reply(aplicarEstilo(texto, ctx.ajustes), { parse_mode: "HTML", link_preview_options: { is_disabled: true }, reply_markup: { inline_keyboard: botones } });
    }
  });

  bot.command("deshacer", (ctx) =>
    correr(ctx, async () => ({ texto: `↩️ Deshecho: ${html(await deshacerUltima(db, ctx.socio!.id))}` })),
  );

  bot.command("panel", async (ctx) => {
    if (/^cerrar/i.test(ctx.match.trim())) {
      const n = await cerrarSesionesDe(db, ctx.socio!.id);
      return enviar(ctx, { texto: n ? `🔒 He cerrado ${n === 1 ? "tu sesión" : `tus ${n} sesiones`} del panel en todos tus dispositivos. Para volver a entrar: /panel` : "No tenías ninguna sesión abierta en el panel.", efimero: 10 * 60_000 });
    }
    const { token, codigo } = await crearEnlacePanel(db, ctx.socio!.id);
    const url = `${config.publicUrl}/entrar#${token}`;
    const texto = [
      "🔐 <b>Entrar al panel</b>",
      "",
      `👉 Abre este enlace: ${html(url)}`,
      `📱 O, si lo tienes instalado como app, escribe el código <code>${codigo.slice(0, 4)} ${codigo.slice(4)}</code>`,
      "",
      `⏱ Tienes <b>${MINUTOS_ENLACE} minutos</b> para usarlo y sirve <b>una sola vez</b>. Si se te pasa, pide otro con /panel.`,
      "✅ <b>Una vez dentro no tienes que volver a entrar</b>: la sesión se queda abierta en ese móvil u ordenador hasta que cierres sesión (o pase un año sin usarlo).",
      "💻 Cada dispositivo entra una vez: para otro móvil, el ordenador o la app instalada, pide otro /panel.",
      "",
      "🔒 No lo reenvíes: quien lo abra entra como tú. ¿Has perdido el móvil? /panel cerrar cierra todas tus sesiones.",
      `<i>Este mensaje se borra solo en ${MINUTOS_ENLACE} minutos.</i>`,
    ].join("\n");
    try {
      const m = await ctx.api.sendMessage(ctx.from!.id, aplicarEstilo(texto, ctx.ajustes), { parse_mode: "HTML", link_preview_options: { is_disabled: true } });
      // Un solo mensaje de acceso a la vez: el nuevo borra los anteriores; y desaparece al caducar
      await borrarLuego(m.chat.id, m.message_id, MINUTOS_ENLACE * 60_000, `panel:${ctx.socio!.id}`);
      if (ctx.chat.type !== "private") await enviar(ctx, { texto: frase(estiloDe(ctx.ajustes), "privado"), efimero: 60_000 });
    } catch {
      await enviar(ctx, { texto: "No puedo escribirte por privado: ábreme un chat, pulsa Iniciar y vuelve a pedir /panel.", efimero: 5 * 60_000 });
    }
  });

  bot.command("ia", (ctx) => lenguajeNatural(ctx, ctx.match));

  // Borra ya los mensajes del bot que estaban pendientes de borrarse en el grupo (y el propio /limpiar)
  bot.command("limpiar", async (ctx) => {
    if (ctx.chat.type === "private") return enviar(ctx, { texto: "/limpiar se usa en el grupo.", efimero: 60_000 });
    if (ctx.socio?.rol !== "admin") return enviar(ctx, { texto: "⚠️ Eso solo lo puede hacer un admin.", clase: "error" });
    const ms = await vaciarEfimeros(db, ctx.chat.id);
    let n = 0;
    for (const m of ms) if (await bot.api.deleteMessage(m.chatId, m.messageId).then(() => true, () => false)) n++;
    await ctx.deleteMessage().catch(() => {});
    const m = await ctx.reply(aplicarEstilo(n ? `🧹 He borrado ${plural(n, "mensaje", "mensajes")}.` : "🧹 No tenía nada pendiente de borrar.", ctx.ajustes));
    await borrarLuego(m.chat.id, m.message_id, 30_000);
  });

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
        tono: ctx.ajustes.tono,
        nombreAsistente: ctx.ajustes.nombreAsistente,
        instruccionesIa: ctx.ajustes.instruccionesIa,
      });
      if (!r.ok) return { texto: `🤔 ${html(r.respuesta)}`, clase: "consulta" };
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
      if (tipo === "hecho") {
        await marcarHecho(db, id, ctx.socio!.id);
        await ctx.answerCallbackQuery({ text: "✅ Hecho" });
        // Fuera ese botón; el resto de la lista se queda
        const filas = (ctx.callbackQuery.message?.reply_markup?.inline_keyboard ?? []).filter((f) => !f.some((b) => "callback_data" in b && b.callback_data === ctx.callbackQuery.data));
        await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: filas } }).catch(() => {});
        return;
      }
      if (tipo !== "ok" && tipo !== "no") return ctx.answerCallbackQuery();
      const r = await resolverPendiente({ db, socio: ctx.socio!, hoy: hoyMadrid(ahora()), botUsername: ctx.me.username, estilo: estiloDe(ctx.ajustes) }, id, tipo === "ok");
      await ctx.answerCallbackQuery(tipo === "no" ? { text: aplicarEstilo(r.texto, ctx.ajustes).replace(/\.$/, "") } : undefined);
      // La pregunta ya no sirve: se borra (si Telegram no deja, al menos se le quitan los botones)
      const msg = ctx.callbackQuery.message;
      const borrada = msg ? await ctx.deleteMessage().then(() => true, () => false) : false;
      if (msg && borrada) await olvidarEfimero(db, msg.chat.id, msg.message_id);
      if (!borrada) await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
      if (tipo === "ok") await enviar(ctx, r);
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
