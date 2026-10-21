import { and, asc, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { lunes, sumarDias, tablas, type Tx } from "@nfc/core";

const { comercios, socios, visitas, ventas, movimientos } = tablas;

/** Comercios con su responsable y la última visita (para la tabla y el mapa del panel). */
export async function comerciosPanel(db: Tx) {
  const ultima = db
    .select({ comercioId: visitas.comercioId, fecha: sql<string>`max(${visitas.fecha})`.as("ultima_fecha"), n: sql<number>`count(*)::int`.as("n_visitas") })
    .from(visitas)
    .where(isNull(visitas.anuladoAt))
    .groupBy(visitas.comercioId)
    .as("ultima");
  return db
    .select({
      id: comercios.id,
      nombre: comercios.nombre,
      tipo: comercios.tipo,
      zona: comercios.zona,
      direccion: comercios.direccion,
      contacto: comercios.contacto,
      mapsUrl: comercios.mapsUrl,
      resenasUrl: comercios.resenasUrl,
      nota: comercios.nota,
      lat: comercios.lat,
      lon: comercios.lon,
      estado: comercios.estado,
      motivoNo: comercios.motivoNo,
      responsable: socios.nombre,
      ultimaVisita: ultima.fecha,
      visitas: sql<number>`coalesce(${ultima.n}, 0)`,
      creadoAt: comercios.creadoAt,
    })
    .from(comercios)
    .leftJoin(socios, eq(socios.id, comercios.responsableId))
    .leftJoin(ultima, eq(ultima.comercioId, comercios.id))
    .where(isNull(comercios.anuladoAt))
    .orderBy(asc(comercios.nombre));
}

export async function visitasPanel(db: Tx) {
  return db
    .select({ id: visitas.id, fecha: visitas.fecha, comercio: comercios.nombre, socio: socios.nombre, resultado: visitas.resultado, nota: visitas.nota, proxima: visitas.proximaFecha })
    .from(visitas)
    .innerJoin(comercios, eq(comercios.id, visitas.comercioId))
    .innerJoin(socios, eq(socios.id, visitas.socioId))
    .where(isNull(visitas.anuladoAt))
    .orderBy(desc(visitas.fecha), desc(visitas.id));
}

/** Ventas y visitas por semana (últimas `semanas`, la actual incluida), con semanas vacías a 0. */
export async function seriesSemanales(db: Tx, hoy: string, semanas = 12) {
  const desde = sumarDias(lunes(hoy), -7 * (semanas - 1));
  const [vs, vis] = await Promise.all([
    db
      .select({ semana: sql<string>`to_char(date_trunc('week', ${ventas.fecha}), 'YYYY-MM-DD')`, cent: sql<number>`sum(${ventas.totalCent})::int`, uds: sql<number>`sum(${ventas.uds})::int` })
      .from(ventas)
      .where(and(isNull(ventas.anuladoAt), gte(ventas.fecha, desde)))
      .groupBy(sql`1`),
    db
      .select({ semana: sql<string>`to_char(date_trunc('week', ${visitas.fecha}), 'YYYY-MM-DD')`, n: sql<number>`count(*)::int` })
      .from(visitas)
      .where(and(isNull(visitas.anuladoAt), gte(visitas.fecha, desde)))
      .groupBy(sql`1`),
  ]);
  return Array.from({ length: semanas }, (_, i) => {
    const semana = sumarDias(desde, 7 * i);
    const v = vs.find((x) => x.semana === semana);
    return { semana, ventasCent: v?.cent ?? 0, uds: v?.uds ?? 0, visitas: vis.find((x) => x.semana === semana)?.n ?? 0 };
  });
}

/** Caja acumulada al final de cada mes desde el primer movimiento. */
export async function cajaMensual(db: Tx) {
  const filas = await db
    .select({
      mes: sql<string>`to_char(${movimientos.fecha}, 'YYYY-MM')`,
      entra: sql<number>`coalesce(sum(${movimientos.importeCent}) filter (where ${movimientos.tipo} in ('aportacion','ingreso')), 0)::int`,
      sale: sql<number>`coalesce(sum(${movimientos.importeCent}) filter (where ${movimientos.tipo} in ('gasto','retirada')), 0)::int`,
      ingresos: sql<number>`coalesce(sum(${movimientos.importeCent}) filter (where ${movimientos.tipo} = 'ingreso'), 0)::int`,
      gastos: sql<number>`coalesce(sum(${movimientos.importeCent}) filter (where ${movimientos.tipo} = 'gasto'), 0)::int`,
    })
    .from(movimientos)
    .where(isNull(movimientos.anuladoAt))
    .groupBy(sql`1`)
    .orderBy(sql`1`);
  let acumulado = 0;
  return filas.map((f) => ({ mes: f.mes, ingresosCent: f.ingresos, gastosCent: f.gastos, cajaCent: (acumulado += f.entra - f.sale) }));
}
