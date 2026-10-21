import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";
import type { DB, Tx } from "../db/client";
import { comercios, consumos, lotes, movimientos, productos, socios, ventas } from "../db/schema";
import { hoy as hoyMadrid } from "../fechas";
import { euros } from "../texto";
import { comercioPorId } from "./comercios";
import { llevaStock, presupuesto, type Producto } from "./catalogo";
import { ErrorNegocio } from "./errores";
import { registrarOperacion } from "./operaciones";

export type Venta = typeof ventas.$inferSelect;
export type MetodoPago = NonNullable<Venta["metodo"]>;
export const METODOS: MetodoPago[] = ["efectivo", "bizum", "transferencia", "tarjeta", "otro"];

export interface NuevaVenta {
  comercioId: number;
  producto: Producto;
  uds: number;
  /** Precio pactado: si viene, sustituye al de tramos y ofertas. */
  totalPactadoCent?: number | null;
  cobrada: boolean;
  metodo?: MetodoPago | null;
  nota?: string | null;
  fecha?: string;
}

/** Saca `uds` del stock empezando por el lote más antiguo. Devuelve el coste de lo que sale. */
async function consumirFifo(tx: Tx, productoId: number, ventaId: number, uds: number) {
  const disponibles = await tx
    .select()
    .from(lotes)
    .where(and(eq(lotes.productoId, productoId), isNull(lotes.anuladoAt), gt(lotes.udsRestantes, 0)))
    .orderBy(asc(lotes.fecha), asc(lotes.id))
    .for("update");
  const total = disponibles.reduce((a, l) => a + l.udsRestantes, 0);
  if (total < uds) throw new ErrorNegocio(`Solo quedan ${total} paneles en stock y quieres vender ${uds}. Registra antes la compra con /compra.`);
  let falta = uds;
  let coste = 0;
  for (const l of disponibles) {
    if (!falta) break;
    const n = Math.min(falta, l.udsRestantes);
    const c = Math.round((l.costeCent * n) / l.uds);
    await tx.update(lotes).set({ udsRestantes: l.udsRestantes - n }).where(eq(lotes.id, l.id));
    await tx.insert(consumos).values({ ventaId, loteId: l.id, uds: n, costeCent: c });
    coste += c;
    falta -= n;
  }
  return coste;
}

/** Venta completa en una transacción: precio, stock, ingreso (si está cobrada) y el comercio pasa a cliente. */
export async function registrarVenta(db: DB, v: NuevaVenta, socioId: number, origen = "bot") {
  if (!Number.isInteger(v.uds) || v.uds <= 0 || v.uds > 10_000) throw new ErrorNegocio("Las unidades tienen que ser un número entero entre 1 y 10 000.");
  return db.transaction(async (tx) => {
    const c = await comercioPorId(tx, v.comercioId);
    const fecha = v.fecha ?? hoyMadrid();
    const p = await presupuesto(tx, v.uds, v.producto, fecha);
    const pactado = v.totalPactadoCent != null;
    const totalCent = pactado ? v.totalPactadoCent! : p.totalCent;
    const [venta] = await tx
      .insert(ventas)
      .values({
        comercioId: c.id,
        socioId,
        productoId: v.producto.id,
        fecha,
        uds: v.uds,
        totalCent,
        precioListaCent: p.listaCent,
        aplicado: pactado ? "Precio pactado" : p.aplicado,
        cobrada: v.cobrada,
        metodo: v.cobrada ? (v.metodo ?? null) : null,
        nota: v.nota ?? null,
      })
      .returning();
    let costeCent: number | null = null;
    if (await llevaStock(tx, v.producto.id)) {
      costeCent = await consumirFifo(tx, v.producto.id, venta!.id, v.uds);
      await tx.update(ventas).set({ costeCent }).where(eq(ventas.id, venta!.id));
    }
    if (v.cobrada && totalCent > 0) {
      await tx.insert(movimientos).values({ tipo: "ingreso", importeCent: totalCent, fecha, socioId, categoria: "venta", ventaId: venta!.id, nota: `${c.nombre} (${v.uds} uds)` });
    }
    await tx.update(comercios).set({ estado: "cliente", responsableId: c.responsableId ?? socioId, actualizadoAt: new Date() }).where(eq(comercios.id, c.id));
    await registrarOperacion(tx, {
      socioId,
      tipo: "venta",
      resumen: `Venta #${venta!.id} a ${c.nombre}: ${v.uds} ${v.uds === 1 ? "ud" : "uds"} por ${euros(totalCent)}`,
      deshacer: { t: "venta", ventaId: venta!.id, comercioId: c.id, estadoPrevio: c.estado, responsablePrevio: c.responsableId },
      origen,
    });
    return { venta: { ...venta!, costeCent }, comercio: c, presupuesto: p };
  });
}

export async function ventaPorId(db: Tx, id: number) {
  const [v] = await db.select().from(ventas).where(and(eq(ventas.id, id), isNull(ventas.anuladoAt)));
  if (!v) throw new ErrorNegocio(`No hay ninguna venta #${id}.`);
  return v;
}

export async function marcarCobrada(db: DB, ventaId: number, metodo: MetodoPago | null, socioId: number, origen = "bot") {
  return db.transaction(async (tx) => {
    const [v] = await tx.select().from(ventas).where(and(eq(ventas.id, ventaId), isNull(ventas.anuladoAt))).for("update");
    if (!v) throw new ErrorNegocio(`No hay ninguna venta #${ventaId}.`);
    if (v.cobrada) throw new ErrorNegocio(`La venta #${ventaId} ya estaba cobrada.`);
    const [c] = await tx.select({ nombre: comercios.nombre }).from(comercios).where(eq(comercios.id, v.comercioId));
    await tx.update(ventas).set({ cobrada: true, metodo }).where(eq(ventas.id, v.id));
    const [m] = await tx
      .insert(movimientos)
      .values({ tipo: "ingreso", importeCent: v.totalCent, fecha: hoyMadrid(), socioId, categoria: "venta", ventaId: v.id, nota: `${c?.nombre} (${v.uds} uds)` })
      .returning();
    await registrarOperacion(tx, { socioId, tipo: "cobro", resumen: `Cobrada la venta #${v.id} de ${c?.nombre ?? ""} (${euros(v.totalCent)})`, deshacer: { t: "cobro", ventaId: v.id, movimientoId: m!.id }, origen });
    return { venta: { ...v, cobrada: true }, comercio: c?.nombre ?? "" };
  });
}

export async function listarVentas(db: Tx, f: { limite?: number; pendientes?: boolean; desde?: string; hasta?: string } = {}) {
  const conds = [isNull(ventas.anuladoAt)];
  if (f.pendientes) conds.push(eq(ventas.cobrada, false));
  if (f.desde) conds.push(sql`${ventas.fecha} >= ${f.desde}`);
  if (f.hasta) conds.push(sql`${ventas.fecha} <= ${f.hasta}`);
  return db
    .select({
      id: ventas.id,
      fecha: ventas.fecha,
      comercio: comercios.nombre,
      comercioId: ventas.comercioId,
      socio: socios.nombre,
      socioId: ventas.socioId,
      producto: productos.nombre,
      uds: ventas.uds,
      totalCent: ventas.totalCent,
      precioListaCent: ventas.precioListaCent,
      costeCent: ventas.costeCent,
      aplicado: ventas.aplicado,
      cobrada: ventas.cobrada,
      metodo: ventas.metodo,
      nota: ventas.nota,
    })
    .from(ventas)
    .innerJoin(comercios, eq(comercios.id, ventas.comercioId))
    .innerJoin(socios, eq(socios.id, ventas.socioId))
    .innerJoin(productos, eq(productos.id, ventas.productoId))
    .where(and(...conds))
    .orderBy(desc(ventas.fecha), desc(ventas.id))
    .limit(f.limite ?? 1000);
}
