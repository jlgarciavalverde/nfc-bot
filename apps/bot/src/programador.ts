import type { Api } from "grammy";
import { and, asc, eq, isNotNull, isNull, lte } from "drizzle-orm";
import {
  aplicarEstilo, avisar, avisosPorEnviar, efimerosVencidos, programarBorrado, describirOferta, euros, fechaCorta, html, leerAjustes, listarSocios, lunes, marcarAviso, pct, plural,
  purgarCaducados, reclamarEnvio, recordatoriosPendientes, relojMadrid, resumenPeriodo, sumarDias, tablas, ultimoAviso, type DB,
} from "@nfc/core";

const { ventas, comercios, ofertas, productos } = tablas;
export const DIAS_COBRO_ATRASADO = 7;

const HORA_AVISOS = 9;

/**
 * Avisos programados (se llama cada minuto). Desde las 9:00 hasta las 12:00 de Madrid:
 * a cada socio, por privado, sus recordatorios del día y sus ventas sin cobrar hace más de 7 días; ofertas que terminan
 * (3 días antes y al terminar, al buzón de avisos); los lunes, el resumen de la semana anterior en el grupo.
 * Cada aviso se marca como enviado en la BD: un reinicio no lo repite y si el bot arranca por la tarde no llega tarde.
 */
export async function tick(db: DB, api: Pick<Api, "sendMessage"> & Partial<Pick<Api, "deleteMessage">>, now = new Date()) {
  const { fecha, hora, diaSemana } = relojMadrid(now);
  const enviados: string[] = [];
  if (hora < HORA_AVISOS || hora >= 12) return enviados;
  const aj = await leerAjustes(db);
  const { grupoChatId, avisosSilenciados } = aj;
  const rs = await recordatoriosPendientes(db, fecha);
  const atrasadas = avisosSilenciados.includes("cobro")
    ? []
    : await db
        .select({ id: ventas.id, fecha: ventas.fecha, totalCent: ventas.totalCent, socioId: ventas.socioId, comercio: comercios.nombre })
        .from(ventas)
        .innerJoin(comercios, eq(comercios.id, ventas.comercioId))
        .where(and(isNull(ventas.anuladoAt), eq(ventas.cobrada, false), lte(ventas.fecha, sumarDias(fecha, -DIAS_COBRO_ATRASADO))))
        .orderBy(asc(ventas.fecha));
  const socios = await listarSocios(db);
  for (const socio of socios) {
    const lista = rs.filter((r) => r.socioId === socio.id);
    const cobros = atrasadas.filter((v) => v.socioId === socio.id);
    if (!lista.length && !cobros.length) continue;
    if (!(await reclamarEnvio(db, `dia:${fecha}:${socio.id}`))) continue;
    const partes: string[] = [];
    if (lista.length) {
      partes.push(
        `☀️ <b>Hoy te toca</b> (${plural(lista.length, "comercio", "comercios")}):`,
        ...lista.map((r) => `• ${html(r.comercio)}${r.zona ? ` (${html(r.zona)})` : ""}${r.fecha < fecha ? ` — atrasado desde el ${fechaCorta(r.fecha)}` : ""}${r.nota ? ` — ${html(r.nota)}` : ""}`),
        "",
        "Cuando pases, apunta la visita (/visita …) o pulsa «Hecho».",
      );
    }
    if (cobros.length) {
      if (partes.length) partes.push("");
      partes.push(
        `💸 <b>Ventas tuyas sin cobrar</b> (más de ${DIAS_COBRO_ATRASADO} días):`,
        ...cobros.map((v) => `• #${v.id} ${html(v.comercio)}: ${euros(v.totalCent)} desde el ${fechaCorta(v.fecha)}`),
        "",
        "Cuando paguen: /cobrado <número> bizum",
      );
    }
    const reply_markup = { inline_keyboard: lista.slice(0, 8).map((r) => [{ text: `✅ Hecho: ${r.comercio}`.slice(0, 60), callback_data: `hecho:${r.id}` }]) };
    const texto = aplicarEstilo(partes.join("\n"), aj);
    try {
      const m = await api.sendMessage(socio.telegramId, texto, { parse_mode: "HTML", reply_markup });
      // El de mañana sustituye a este (no se van acumulando «Hoy te toca» de días pasados)
      if (m?.message_id) {
        const viejos = await programarBorrado(db, { chatId: socio.telegramId, messageId: m.message_id, enMs: 47 * 3600_000, clave: `dia:${socio.id}` });
        for (const v of viejos) await api.deleteMessage?.(v.chatId, v.messageId).catch(() => {});
      }
    } catch {
      // No ha abierto nunca el chat privado con el bot: se le avisa en el grupo
      if (grupoChatId) await api.sendMessage(grupoChatId, `${html(socio.nombre)}, ${texto}\n\n(Ábreme un chat privado para recibir esto solo tú.)`, { parse_mode: "HTML" }).catch(() => {});
    }
    enviados.push(`dia:${socio.id}`);
  }

  // Ofertas que terminan en 3 días o que terminaron ayer
  const conFin = await db
    .select({ o: ofertas, producto: productos.nombre })
    .from(ofertas)
    .innerJoin(productos, eq(productos.id, ofertas.productoId))
    .where(and(eq(ofertas.activa, true), isNotNull(ofertas.hasta)));
  for (const { o, producto } of conFin) {
    const desc = `${describirOferta(o)} (${producto})`;
    if (o.hasta === sumarDias(fecha, 3) && (await reclamarEnvio(db, `oferta-pronto:${o.id}`))) {
      await avisar(db, { tipo: "oferta", texto: `⏳ La oferta <b>${html(desc)}</b> termina el ${fechaCorta(o.hasta)}. Si queréis alargarla: /oferta quitar ${o.id} y créala de nuevo con otra fecha.` });
      enviados.push(`oferta-pronto:${o.id}`);
    }
    if (o.hasta === sumarDias(fecha, -1) && (await reclamarEnvio(db, `oferta-fin:${o.id}`))) {
      await avisar(db, { tipo: "oferta", texto: `🏁 Ha terminado la oferta <b>${html(desc)}</b>. Desde hoy se aplican los precios normales (/precios).` });
      enviados.push(`oferta-fin:${o.id}`);
    }
  }

  if (diaSemana === 1 && grupoChatId && (await reclamarEnvio(db, `semana:${fecha}`))) {
    const desde = sumarDias(lunes(fecha), -7);
    const hasta = sumarDias(desde, 6);
    await api.sendMessage(grupoChatId, aplicarEstilo(await textoResumenSemanal(db, desde, hasta, fecha), aj), { parse_mode: "HTML" });
    enviados.push("semana");
  }
  if (await reclamarEnvio(db, `purga:${fecha}`)) await purgarCaducados(db);
  return enviados;
}

export async function textoResumenSemanal(db: DB, desde: string, hasta: string, hoy: string) {
  const r = await resumenPeriodo(db, desde, hasta);
  const pendientes = await recordatoriosPendientes(db, sumarDias(hoy, 6));
  const socios = await listarSocios(db);
  const l = [
    `📊 <b>Semana del ${fechaCorta(desde)} al ${fechaCorta(hasta)}</b>`,
    `🚶 Visitas: <b>${r.visitas}</b>${r.visitas ? ` (🟢 ${r.visitasPorResultado.si ?? 0} · 🟡 ${(r.visitasPorResultado.luego ?? 0) + (r.visitasPorResultado.interesado ?? 0)} · 🔴 ${r.visitasPorResultado.no ?? 0})` : ""}`,
    `⭐ Ventas: <b>${r.ventas}</b> (${plural(r.uds, "panel", "paneles")}, ${euros(r.vendidoCent)})`,
    `➕ Comercios nuevos: ${r.comerciosNuevos}`,
    `💶 Ingresos ${euros(r.caja.ingresosCent)} · gastos ${euros(r.caja.gastosCent)}`,
    "",
    `Embudo total: ${r.embudo.total.cliente} clientes de ${r.embudo.visitados} visitados (${pct(r.embudo.conversionBp)}) · ${r.embudo.total.pendiente} por visitar`,
  ];
  if (r.ranking.length) {
    l.push("", "<b>Quién ha hecho qué</b>");
    const medallas = ["🥇", "🥈", "🥉"];
    r.ranking.forEach((x, i) => l.push(`${medallas[i] ?? "•"} ${html(x.socio)}: ${plural(x.ventas, "venta", "ventas")} (${euros(x.vendidoCent)}), ${plural(x.visitas, "visita", "visitas")}`));
  }
  const sinNada = socios.filter((s) => !r.ranking.some((x) => x.socio === s.nombre));
  if (sinNada.length && r.ranking.length) l.push(`😴 Sin actividad: ${sinNada.map((s) => html(s.nombre)).join(", ")}`);
  if (pendientes.length) l.push("", `⏰ Esta semana hay ${plural(pendientes.length, "comercio", "comercios")} a los que volver.`);
  const copia = await ultimoAviso(db, "copia");
  if (copia) l.push("", `💾 Última copia de seguridad: ${copia.texto.startsWith("✅") ? "✅ bien" : "❌ falló"} (${fechaCorta(copia.creadoAt.toISOString().slice(0, 10))})`);
  return l.join("\n");
}

/**
 * Envía lo que haya en el buzón de avisos. Grupo → el grupo vinculado; admins → cada admin por privado;
 * socio → ese socio por privado (si no ha abierto el chat con el bot, en el grupo mencionándolo).
 */
export async function enviarAvisos(db: DB, api: Pick<Api, "sendMessage">) {
  const pendientes = await avisosPorEnviar(db);
  if (!pendientes.length) return 0;
  const aj = await leerAjustes(db);
  const { grupoChatId } = aj;
  const socios = await listarSocios(db);
  let enviados = 0;
  for (const aviso of pendientes) {
    const a = { ...aviso, texto: aplicarEstilo(aviso.texto, aj) };
    const opts = { parse_mode: "HTML" as const, link_preview_options: { is_disabled: true } };
    let ok = false;
    try {
      if (a.destino === "grupo") {
        if (grupoChatId) ok = !!(await api.sendMessage(grupoChatId, a.texto, opts));
      } else {
        const dest = a.destino === "admins" ? socios.filter((x) => x.rol === "admin") : socios.filter((x) => x.id === a.socioId);
        for (const d of dest) {
          try {
            await api.sendMessage(d.telegramId, a.texto, opts);
            ok = true;
          } catch {
            if (grupoChatId) ok = !!(await api.sendMessage(grupoChatId, `${html(d.nombre)}: ${a.texto}`, opts).catch(() => null)) || ok;
          }
        }
      }
    } catch (e) {
      console.error(`No he podido enviar el aviso ${a.id}`, e);
    }
    await marcarAviso(db, a.id, ok);
    if (ok) enviados++;
  }
  return enviados;
}

/** Borra los mensajes del bot cuyo momento ha llegado (enlaces del panel caducados, errores, preguntas sin contestar…). */
export async function borrarVencidos(db: DB, api: Pick<Api, "deleteMessage">) {
  const vencidos = await efimerosVencidos(db).catch(() => []);
  for (const m of vencidos) await api.deleteMessage(m.chatId, m.messageId).catch(() => {});
  return vencidos.length;
}

export function arrancarProgramador(db: DB, api: Api) {
  const correr = () => tick(db, api).catch((e) => console.error("Error en los avisos programados", e));
  void correr();
  const t1 = setInterval(correr, 60_000);
  // El buzón se mira cada 10 s: los avisos del panel o del stock llegan casi al momento
  let enCurso = false;
  const buzon = async () => {
    if (enCurso) return;
    enCurso = true;
    await enviarAvisos(db, api).catch((e) => console.error("Error enviando avisos", e));
    enCurso = false;
  };
  const t2 = setInterval(() => void buzon().then(() => borrarVencidos(db, api)), 10_000);
  return () => (clearInterval(t1), clearInterval(t2));
}
