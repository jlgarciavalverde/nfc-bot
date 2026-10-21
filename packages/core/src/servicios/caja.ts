import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import type { DB, Tx } from "../db/client";
import { lotes, movimientos, productos, socios, ventas } from "../db/schema";
import { hoy as hoyMadrid } from "../fechas";
import { euros } from "../texto";
import type { Producto } from "./catalogo";
import { ErrorNegocio } from "./errores";
import { registrarOperacion } from "./operaciones";

export type TipoMovimiento = (typeof movimientos.$inferSelect)["tipo"];

const MAX_CENT = 100_000_000; // 1 millón de euros: más es casi seguro un error al escribir

function comprobarImporte(cent: number) {
  if (!Number.isInteger(cent) || cent <= 0) throw new ErrorNegocio("El importe tiene que ser mayor que 0.");
  if (cent > MAX_CENT) throw new ErrorNegocio("Ese importe es enorme. Si es correcto, apúntalo en varias veces.");
}

const RESUMEN: Record<Exclude<TipoMovimiento, "ingreso">, string> = { aportacion: "Aportación", gasto: "Gasto", retirada: "Retirada" };

/** Aportación de un socio, gasto del negocio o retirada de un socio. Los ingresos salen de las ventas (o «ingreso» suelto). */
export async function apuntarMovimiento(
  db: Tx,
  m: { tipo: TipoMovimiento; importeCent: number; socioId: number; categoria?: string | null; nota?: string | null; fecha?: string },
  porSocioId: number,
  origen = "bot",
) {
  comprobarImporte(m.importeCent);
  const [r] = await db
    .insert(movimientos)
    .values({ tipo: m.tipo, importeCent: m.importeCent, socioId: m.socioId, categoria: m.categoria ?? null, nota: m.nota ?? null, fecha: m.fecha ?? hoyMadrid() })
    .returning();
  const nombre = m.tipo === "ingreso" ? "Ingreso" : RESUMEN[m.tipo];
  await registrarOperacion(db, { socioId: porSocioId, tipo: m.tipo, resumen: `${nombre} de ${euros(m.importeCent)}${m.categoria ? ` (${m.categoria})` : ""}${m.nota && m.nota !== m.categoria ? `: ${m.nota}` : ""}`, deshacer: { t: "movimiento", movimientoId: r!.id }, origen });
  return r!;
}

/** Compra de paneles: crea el lote (stock) y el gasto en caja. */
export async function comprarLote(db: DB, d: { producto: Producto; uds: number; costeCent: number; proveedor?: string | null; fecha?: string }, socioId: number, origen = "bot") {
  if (!Number.isInteger(d.uds) || d.uds <= 0 || d.uds > 100_000) throw new ErrorNegocio("Las unidades tienen que ser un número entero mayor que 0.");
  comprobarImporte(d.costeCent);
  return db.transaction(async (tx) => {
    const fecha = d.fecha ?? hoyMadrid();
    const [l] = await tx.insert(lotes).values({ productoId: d.producto.id, fecha, uds: d.uds, udsRestantes: d.uds, costeCent: d.costeCent, proveedor: d.proveedor ?? null, socioId }).returning();
    const [m] = await tx
      .insert(movimientos)
      .values({ tipo: "gasto", importeCent: d.costeCent, fecha, socioId, categoria: "stock", loteId: l!.id, nota: `${d.uds} × ${d.producto.nombre}${d.proveedor ? ` (${d.proveedor})` : ""}` })
      .returning();
    await registrarOperacion(tx, { socioId, tipo: "compra", resumen: `Compra de ${d.uds} ${d.producto.nombre} por ${euros(d.costeCent)}`, deshacer: { t: "lote", loteId: l!.id, movimientoId: m!.id }, origen });
    return l!;
  });
}

export async function estadoStock(db: Tx) {
  return db
    .select({
      productoId: productos.id,
      producto: productos.nombre,
      uds: sql<number>`coalesce(sum(${lotes.udsRestantes}), 0)::int`,
      valorCent: sql<number>`coalesce(round(sum(${lotes.costeCent}::numeric * ${lotes.udsRestantes} / ${lotes.uds})), 0)::int`,
      comprados: sql<number>`coalesce(sum(${lotes.uds}), 0)::int`,
      lotes: sql<number>`count(${lotes.id})::int`,
    })
    .from(productos)
    .leftJoin(lotes, and(eq(lotes.productoId, productos.id), isNull(lotes.anuladoAt)))
    .where(eq(productos.activo, true))
    .groupBy(productos.id, productos.nombre)
    .orderBy(productos.id);
}

export interface ResumenCaja {
  aportadoCent: number;
  ingresosCent: number;
  gastosCent: number;
  retiradoCent: number;
  /** Ingresos − gastos (criterio de caja: la compra de stock cuenta como gasto al pagarla). */
  beneficioCent: number;
  /** Dinero que debería haber: aportado + ingresos − gastos − retiradas. */
  cajaCent: number;
  pendienteCobroCent: number;
  ventas: number;
  uds: number;
  facturadoCent: number;
  /** Facturado − coste de los paneles vendidos (solo ventas con coste conocido). */
  margenCent: number;
  valorStockCent: number;
  gastosPorCategoria: { categoria: string; cent: number }[];
}

/** Resumen de caja en un periodo (sin fechas, desde el principio). */
export async function resumenCaja(db: Tx, desde?: string, hasta?: string): Promise<ResumenCaja> {
  const fm = [isNull(movimientos.anuladoAt), desde ? gte(movimientos.fecha, desde) : undefined, hasta ? lte(movimientos.fecha, hasta) : undefined];
  const fv = [isNull(ventas.anuladoAt), desde ? gte(ventas.fecha, desde) : undefined, hasta ? lte(ventas.fecha, hasta) : undefined];
  const [porTipo, cat, [v], stock] = await Promise.all([
    db.select({ tipo: movimientos.tipo, cent: sql<number>`sum(${movimientos.importeCent})::int` }).from(movimientos).where(and(...fm)).groupBy(movimientos.tipo),
    db
      .select({ categoria: sql<string>`coalesce(${movimientos.categoria}, 'otros')`, cent: sql<number>`sum(${movimientos.importeCent})::int` })
      .from(movimientos)
      .where(and(...fm, eq(movimientos.tipo, "gasto")))
      .groupBy(sql`1`)
      .orderBy(desc(sql`2`)),
    db
      .select({
        n: sql<number>`count(*)::int`,
        uds: sql<number>`coalesce(sum(${ventas.uds}), 0)::int`,
        facturado: sql<number>`coalesce(sum(${ventas.totalCent}), 0)::int`,
        pendiente: sql<number>`coalesce(sum(${ventas.totalCent}) filter (where not ${ventas.cobrada}), 0)::int`,
        margen: sql<number>`coalesce(sum(${ventas.totalCent} - ${ventas.costeCent}) filter (where ${ventas.costeCent} is not null), 0)::int`,
      })
      .from(ventas)
      .where(and(...fv)),
    estadoStock(db),
  ]);
  const t = Object.fromEntries(porTipo.map((r) => [r.tipo, r.cent])) as Partial<Record<TipoMovimiento, number>>;
  const aportado = t.aportacion ?? 0, ingresos = t.ingreso ?? 0, gastos = t.gasto ?? 0, retirado = t.retirada ?? 0;
  return {
    aportadoCent: aportado,
    ingresosCent: ingresos,
    gastosCent: gastos,
    retiradoCent: retirado,
    beneficioCent: ingresos - gastos,
    cajaCent: aportado + ingresos - gastos - retirado,
    pendienteCobroCent: v?.pendiente ?? 0,
    ventas: v?.n ?? 0,
    uds: v?.uds ?? 0,
    facturadoCent: v?.facturado ?? 0,
    margenCent: v?.margen ?? 0,
    valorStockCent: stock.reduce((a, s) => a + s.valorCent, 0),
    gastosPorCategoria: cat,
  };
}

export async function listarMovimientos(db: Tx, f: { limite?: number; desde?: string; hasta?: string } = {}) {
  return db
    .select({
      id: movimientos.id,
      fecha: movimientos.fecha,
      tipo: movimientos.tipo,
      importeCent: movimientos.importeCent,
      socio: socios.nombre,
      socioId: movimientos.socioId,
      categoria: movimientos.categoria,
      nota: movimientos.nota,
      ventaId: movimientos.ventaId,
    })
    .from(movimientos)
    .innerJoin(socios, eq(socios.id, movimientos.socioId))
    .where(and(isNull(movimientos.anuladoAt), f.desde ? gte(movimientos.fecha, f.desde) : undefined, f.hasta ? lte(movimientos.fecha, f.hasta) : undefined))
    .orderBy(desc(movimientos.fecha), desc(movimientos.id))
    .limit(f.limite ?? 5000);
}

export async function listarLotes(db: Tx) {
  return db
    .select({ id: lotes.id, fecha: lotes.fecha, producto: productos.nombre, uds: lotes.uds, udsRestantes: lotes.udsRestantes, costeCent: lotes.costeCent, proveedor: lotes.proveedor })
    .from(lotes)
    .innerJoin(productos, eq(productos.id, lotes.productoId))
    .where(isNull(lotes.anuladoAt))
    .orderBy(desc(lotes.fecha), desc(lotes.id));
}
