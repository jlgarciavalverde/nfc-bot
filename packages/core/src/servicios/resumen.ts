import { and, gte, isNull, lte, sql, eq } from "drizzle-orm";
import type { Tx } from "../db/client";
import { comercios, socios, ventas, visitas } from "../db/schema";
import { resumenCaja } from "./caja";
import { embudo } from "./comercios";

/** Actividad de un periodo (para el resumen del lunes y el panel). */
export async function resumenPeriodo(db: Tx, desde: string, hasta: string) {
  const [vis, ven, nuevos, ranking, caja, emb] = await Promise.all([
    db
      .select({ resultado: visitas.resultado, n: sql<number>`count(*)::int` })
      .from(visitas)
      .where(and(isNull(visitas.anuladoAt), gte(visitas.fecha, desde), lte(visitas.fecha, hasta)))
      .groupBy(visitas.resultado),
    db
      .select({ n: sql<number>`count(*)::int`, uds: sql<number>`coalesce(sum(${ventas.uds}),0)::int`, cent: sql<number>`coalesce(sum(${ventas.totalCent}),0)::int` })
      .from(ventas)
      .where(and(isNull(ventas.anuladoAt), gte(ventas.fecha, desde), lte(ventas.fecha, hasta))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(comercios)
      .where(and(isNull(comercios.anuladoAt), sql`(${comercios.creadoAt} at time zone 'Europe/Madrid')::date between ${desde} and ${hasta}`)),
    Promise.all([
      db
        .select({ socioId: visitas.socioId, n: sql<number>`count(*)::int` })
        .from(visitas)
        .where(and(isNull(visitas.anuladoAt), gte(visitas.fecha, desde), lte(visitas.fecha, hasta)))
        .groupBy(visitas.socioId),
      db
        .select({ socioId: ventas.socioId, n: sql<number>`count(*)::int`, cent: sql<number>`sum(${ventas.totalCent})::int` })
        .from(ventas)
        .where(and(isNull(ventas.anuladoAt), gte(ventas.fecha, desde), lte(ventas.fecha, hasta)))
        .groupBy(ventas.socioId),
      db.select({ id: socios.id, nombre: socios.nombre }).from(socios).where(eq(socios.activo, true)),
    ]).then(([vs, vts, ss]) =>
      ss.map((s) => {
        const v = vts.find((x) => x.socioId === s.id);
        return { socio: s.nombre, visitas: vs.find((x) => x.socioId === s.id)?.n ?? 0, ventas: v?.n ?? 0, vendidoCent: v?.cent ?? 0 };
      }),
    ),
    resumenCaja(db, desde, hasta),
    embudo(db),
  ]);
  const visitasPorResultado = Object.fromEntries(vis.map((v) => [v.resultado, v.n])) as Record<string, number>;
  return {
    desde,
    hasta,
    visitas: vis.reduce((a, v) => a + v.n, 0),
    visitasPorResultado,
    ventas: ven[0]?.n ?? 0,
    uds: ven[0]?.uds ?? 0,
    vendidoCent: ven[0]?.cent ?? 0,
    comerciosNuevos: nuevos[0]?.n ?? 0,
    ranking: ranking.filter((r) => r.visitas || r.ventas).sort((a, b) => b.vendidoCent - a.vendidoCent || b.visitas - a.visitas),
    caja,
    embudo: emb,
  };
}
