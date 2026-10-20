import type { Api } from "grammy";
import {
  euros, fechaCorta, html, leerAjustes, listarSocios, lunes, pct, plural, purgarCaducados, reclamarEnvio, recordatoriosPendientes,
  relojMadrid, resumenPeriodo, sumarDias, type DB,
} from "@nfc/core";

const HORA_AVISOS = 9;

/**
 * Avisos programados (se llama cada minuto). Desde las 9:00 hasta las 12:00 de Madrid:
 * a cada socio, por privado, sus recordatorios del día; los lunes, el resumen de la semana anterior en el grupo.
 * Cada aviso se marca como enviado en la BD: un reinicio no lo repite y si el bot arranca por la tarde no llega tarde.
 */
export async function tick(db: DB, api: Pick<Api, "sendMessage">, now = new Date()) {
  const { fecha, hora, diaSemana } = relojMadrid(now);
  const enviados: string[] = [];
  if (hora < HORA_AVISOS || hora >= 12) return enviados;
  const { grupoChatId } = await leerAjustes(db);

  const rs = await recordatoriosPendientes(db, fecha);
  const porSocio = new Map<number, typeof rs>();
  for (const r of rs) porSocio.set(r.socioId, [...(porSocio.get(r.socioId) ?? []), r]);
  for (const [socioId, lista] of porSocio) {
    if (!(await reclamarEnvio(db, `dia:${fecha}:${socioId}`))) continue;
    const texto = [
      `☀️ <b>Hoy te toca</b> (${plural(lista.length, "comercio", "comercios")}):`,
      ...lista.map((r) => `• ${html(r.comercio)}${r.zona ? ` (${html(r.zona)})` : ""}${r.fecha < fecha ? ` — atrasado desde el ${fechaCorta(r.fecha)}` : ""}${r.nota ? ` — ${html(r.nota)}` : ""}`),
      "",
      "Cuando pases, apunta la visita (/visita …) o pulsa «Hecho».",
    ].join("\n");
    const reply_markup = { inline_keyboard: lista.slice(0, 8).map((r) => [{ text: `✅ Hecho: ${r.comercio}`.slice(0, 60), callback_data: `hecho:${r.id}` }]) };
    try {
      await api.sendMessage(lista[0]!.telegramId, texto, { parse_mode: "HTML", reply_markup });
    } catch {
      // No ha abierto nunca el chat privado con el bot: se le avisa en el grupo
      if (grupoChatId) await api.sendMessage(grupoChatId, `${html(lista[0]!.socio)}, ${texto}\n\n(Ábreme un chat privado para recibir esto solo tú.)`, { parse_mode: "HTML" }).catch(() => {});
    }
    enviados.push(`dia:${socioId}`);
  }

  if (diaSemana === 1 && grupoChatId && (await reclamarEnvio(db, `semana:${fecha}`))) {
    const desde = sumarDias(lunes(fecha), -7);
    const hasta = sumarDias(desde, 6);
    await api.sendMessage(grupoChatId, await textoResumenSemanal(db, desde, hasta, fecha), { parse_mode: "HTML" });
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
    r.ranking.forEach((x, i) => l.push(`${medallas[i] ?? "•"} ${html(x.socio)}: ${x.ventas} ventas (${euros(x.vendidoCent)}), ${x.visitas} visitas`));
  }
  const sinNada = socios.filter((s) => !r.ranking.some((x) => x.socio === s.nombre));
  if (sinNada.length && r.ranking.length) l.push(`😴 Sin actividad: ${sinNada.map((s) => html(s.nombre)).join(", ")}`);
  if (pendientes.length) l.push("", `⏰ Esta semana hay ${plural(pendientes.length, "comercio", "comercios")} a los que volver.`);
  return l.join("\n");
}

export function arrancarProgramador(db: DB, api: Api) {
  const correr = () => tick(db, api).catch((e) => console.error("Error en los avisos programados", e));
  void correr();
  return setInterval(correr, 60_000);
}
