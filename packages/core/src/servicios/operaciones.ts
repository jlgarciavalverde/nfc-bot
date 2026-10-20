import { and, desc, eq, gt, inArray, isNull, ne } from "drizzle-orm";
import type { DB, Tx } from "../db/client";
import { comercios, consumos, lotes, movimientos, operaciones, recordatorios, ventas, visitas } from "../db/schema";
import { ErrorNegocio } from "./errores";

type EstadoComercio = (typeof comercios.$inferSelect)["estado"];

/** Lo que hace falta guardar para poder deshacer cada tipo de operación. */
export type Deshacer =
  | { t: "venta"; ventaId: number; comercioId: number; estadoPrevio: EstadoComercio; responsablePrevio: number | null }
  | { t: "cobro"; ventaId: number; movimientoId: number }
  | { t: "movimiento"; movimientoId: number }
  | { t: "visita"; visitaId: number; comercioId: number; estadoPrevio: EstadoComercio; motivoPrevio: string | null; responsablePrevio: number | null; recordatoriosCerrados?: number[] }
  | { t: "lote"; loteId: number; movimientoId: number }
  | { t: "comercio"; comercioId: number };

export async function registrarOperacion(tx: Tx, o: { socioId: number | null; tipo: string; resumen: string; deshacer?: Deshacer; origen?: string }) {
  await tx.insert(operaciones).values({ socioId: o.socioId, tipo: o.tipo, resumen: o.resumen, deshacer: o.deshacer ?? null, origen: o.origen ?? "bot" });
}

export const MINUTOS_DESHACER = 10;

/** Deshace la última operación del socio si tiene menos de 10 minutos. Devuelve su resumen. */
export async function deshacerUltima(db: DB, socioId: number, now = new Date()) {
  return db.transaction(async (tx) => {
    const desde = new Date(now.getTime() - MINUTOS_DESHACER * 60_000);
    const [op] = await tx
      .select()
      .from(operaciones)
      .where(and(eq(operaciones.socioId, socioId), ne(operaciones.tipo, "deshacer"), isNull(operaciones.deshechaAt), gt(operaciones.creadoAt, desde)))
      .orderBy(desc(operaciones.id))
      .limit(1)
      .for("update");
    if (!op) throw new ErrorNegocio(`No tienes nada que deshacer de los últimos ${MINUTOS_DESHACER} minutos.`);
    if (!op.deshacer) throw new ErrorNegocio(`Lo último que hiciste («${op.resumen}») no se puede deshacer desde el bot: cámbialo a mano.`);
    const d = op.deshacer as Deshacer;
    const ahora = new Date();
    switch (d.t) {
      case "venta": {
        await tx.update(ventas).set({ anuladoAt: ahora }).where(eq(ventas.id, d.ventaId));
        await tx.update(movimientos).set({ anuladoAt: ahora }).where(and(eq(movimientos.ventaId, d.ventaId), isNull(movimientos.anuladoAt)));
        for (const c of await tx.select().from(consumos).where(eq(consumos.ventaId, d.ventaId))) {
          const [l] = await tx.select().from(lotes).where(eq(lotes.id, c.loteId)).for("update");
          if (l) await tx.update(lotes).set({ udsRestantes: l.udsRestantes + c.uds }).where(eq(lotes.id, l.id));
        }
        await tx.delete(consumos).where(eq(consumos.ventaId, d.ventaId));
        await tx.update(comercios).set({ estado: d.estadoPrevio, responsableId: d.responsablePrevio, actualizadoAt: ahora }).where(eq(comercios.id, d.comercioId));
        break;
      }
      case "cobro":
        await tx.update(ventas).set({ cobrada: false, metodo: null }).where(eq(ventas.id, d.ventaId));
        await tx.update(movimientos).set({ anuladoAt: ahora }).where(eq(movimientos.id, d.movimientoId));
        break;
      case "movimiento":
        await tx.update(movimientos).set({ anuladoAt: ahora }).where(eq(movimientos.id, d.movimientoId));
        break;
      case "visita":
        await tx.update(visitas).set({ anuladoAt: ahora }).where(eq(visitas.id, d.visitaId));
        await tx.update(recordatorios).set({ anuladoAt: ahora }).where(and(eq(recordatorios.visitaId, d.visitaId), isNull(recordatorios.anuladoAt)));
        if (d.recordatoriosCerrados?.length) await tx.update(recordatorios).set({ hechoAt: null }).where(inArray(recordatorios.id, d.recordatoriosCerrados));
        await tx.update(comercios).set({ estado: d.estadoPrevio, motivoNo: d.motivoPrevio, responsableId: d.responsablePrevio, actualizadoAt: ahora }).where(eq(comercios.id, d.comercioId));
        break;
      case "lote": {
        const [l] = await tx.select().from(lotes).where(eq(lotes.id, d.loteId)).for("update");
        if (l && l.udsRestantes !== l.uds) throw new ErrorNegocio("Ya se han vendido paneles de ese lote: no se puede deshacer la compra.");
        await tx.update(lotes).set({ anuladoAt: ahora }).where(eq(lotes.id, d.loteId));
        await tx.update(movimientos).set({ anuladoAt: ahora }).where(eq(movimientos.id, d.movimientoId));
        break;
      }
      case "comercio": {
        const v = await tx.select({ id: visitas.id }).from(visitas).where(and(eq(visitas.comercioId, d.comercioId), isNull(visitas.anuladoAt))).limit(1);
        const s = await tx.select({ id: ventas.id }).from(ventas).where(and(eq(ventas.comercioId, d.comercioId), isNull(ventas.anuladoAt))).limit(1);
        if (v.length || s.length) throw new ErrorNegocio("Ese comercio ya tiene visitas o ventas: deshaz antes esas.");
        await tx.update(comercios).set({ anuladoAt: ahora }).where(eq(comercios.id, d.comercioId));
        break;
      }
    }
    await tx.update(operaciones).set({ deshechaAt: ahora }).where(eq(operaciones.id, op.id));
    await registrarOperacion(tx, { socioId, tipo: "deshacer", resumen: `Deshecho: ${op.resumen}` });
    return op.resumen;
  });
}
