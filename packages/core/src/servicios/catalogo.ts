import { and, asc, eq, isNull, or, gte } from "drizzle-orm";
import type { Tx } from "../db/client";
import { lotes, ofertas, productos, tramos } from "../db/schema";
import { calcularPrecio, type OfertaPrecio } from "../precios";
import { euros, normalizar, pct } from "../texto";
import { hoy as hoyMadrid } from "../fechas";
import { guardarAjuste, leerAjustes } from "./ajustes";
import { ErrorNegocio } from "./errores";
import { registrarOperacion } from "./operaciones";

export type Producto = typeof productos.$inferSelect;

export async function listarProductos(db: Tx) {
  return db.select().from(productos).where(eq(productos.activo, true)).orderBy(asc(productos.id));
}

/** Producto por nombre o, sin nombre, el de por defecto (el elegido en ajustes o el primero). */
export async function resolverProducto(db: Tx, nombre?: string | null): Promise<Producto> {
  const todos = await listarProductos(db);
  if (!todos.length) throw new ErrorNegocio("Aún no hay ningún producto. Un admin tiene que crearlo: /producto nuevo Panel NFC 25€");
  if (nombre) {
    const t = normalizar(nombre);
    const p = todos.find((x) => x.nombreNorm === t) ?? todos.filter((x) => x.nombreNorm.includes(t)).at(0);
    if (!p) throw new ErrorNegocio(`No hay ningún producto «${nombre}». Mira /precios.`);
    return p;
  }
  const { productoDefectoId } = await leerAjustes(db);
  return todos.find((x) => x.id === productoDefectoId) ?? todos[0]!;
}

/** Si el texto es exactamente el nombre de un producto, lo devuelve (para «/venta Bar Pepe 3 Panel grande»). */
export async function productoSiCoincide(db: Tx, texto: string) {
  const t = normalizar(texto);
  if (!t) return null;
  return (await listarProductos(db)).find((p) => p.nombreNorm === t) ?? null;
}

export async function crearProducto(db: Tx, nombre: string, precioCent: number, socioId: number) {
  const nombreNorm = normalizar(nombre);
  if (!nombreNorm) throw new ErrorNegocio("Falta el nombre del producto.");
  const [p] = await db
    .insert(productos)
    .values({ nombre: nombre.trim(), nombreNorm, precioCent })
    .onConflictDoUpdate({ target: productos.nombreNorm, set: { precioCent, activo: true } })
    .returning();
  if (!(await leerAjustes(db)).productoDefectoId) await guardarAjuste(db, "productoDefectoId", p!.id);
  await registrarOperacion(db, { socioId, tipo: "producto", resumen: `Producto ${p!.nombre} a ${euros(precioCent)}/ud` });
  return p!;
}

export async function cambiarPrecio(db: Tx, productoId: number, precioCent: number, socioId: number) {
  const [p] = await db.update(productos).set({ precioCent }).where(eq(productos.id, productoId)).returning();
  await registrarOperacion(db, { socioId, tipo: "producto", resumen: `Precio de ${p!.nombre} a ${euros(precioCent)}/ud` });
  return p!;
}

export async function tramosDe(db: Tx, productoId: number) {
  return db.select().from(tramos).where(eq(tramos.productoId, productoId)).orderBy(asc(tramos.desdeUds));
}

export async function guardarTramo(db: Tx, productoId: number, desdeUds: number, v: { precioCent: number } | { descuentoBp: number }, socioId: number) {
  if (!Number.isInteger(desdeUds) || desdeUds < 2) throw new ErrorNegocio("Un tramo empieza como mínimo en 2 unidades.");
  const valores = { precioCent: "precioCent" in v ? v.precioCent : null, descuentoBp: "descuentoBp" in v ? v.descuentoBp : null };
  await db.insert(tramos).values({ productoId, desdeUds, ...valores }).onConflictDoUpdate({ target: [tramos.productoId, tramos.desdeUds], set: valores });
  await registrarOperacion(db, { socioId, tipo: "tramo", resumen: `Tramo desde ${desdeUds} uds: ${valores.precioCent != null ? `${euros(valores.precioCent)}/ud` : `−${pct(valores.descuentoBp ?? 0)}`}` });
}

export async function borrarTramo(db: Tx, productoId: number, desdeUds: number, socioId: number) {
  const r = await db.delete(tramos).where(and(eq(tramos.productoId, productoId), eq(tramos.desdeUds, desdeUds))).returning();
  if (!r.length) throw new ErrorNegocio(`No hay ningún tramo que empiece en ${desdeUds} uds.`);
  await registrarOperacion(db, { socioId, tipo: "tramo", resumen: `Tramo desde ${desdeUds} uds borrado` });
}

export async function ofertasDe(db: Tx, productoId: number, fecha?: string) {
  return db
    .select()
    .from(ofertas)
    .where(and(eq(ofertas.productoId, productoId), eq(ofertas.activa, true), fecha ? or(isNull(ofertas.hasta), gte(ofertas.hasta, fecha)) : undefined))
    .orderBy(asc(ofertas.id));
}

export type NuevaOferta = Pick<OfertaPrecio, "tipo" | "n" | "m" | "precioCent" | "descuentoBp" | "desde" | "hasta"> & { nombre: string };

export async function crearOferta(db: Tx, productoId: number, o: NuevaOferta, socioId: number) {
  if (o.tipo === "nxm" && !(o.m! > 0 && o.m! < o.n)) throw new ErrorNegocio("En un NxM el segundo número tiene que ser menor que el primero (p. ej. 3x2).");
  if (o.n < 1) throw new ErrorNegocio("La oferta tiene que ser de al menos 1 unidad.");
  if (o.desde && o.hasta && o.hasta < o.desde) throw new ErrorNegocio("La oferta termina antes de empezar.");
  const [r] = await db.insert(ofertas).values({ productoId, ...o }).returning();
  await registrarOperacion(db, { socioId, tipo: "oferta", resumen: `Oferta ${o.nombre}` });
  return r!;
}

export async function quitarOferta(db: Tx, ofertaId: number, socioId: number) {
  const r = await db.update(ofertas).set({ activa: false }).where(and(eq(ofertas.id, ofertaId), eq(ofertas.activa, true))).returning();
  if (!r.length) throw new ErrorNegocio(`No hay ninguna oferta activa con el número ${ofertaId}. Mira /precios.`);
  await registrarOperacion(db, { socioId, tipo: "oferta", resumen: `Oferta ${r[0]!.nombre} retirada` });
  return r[0]!;
}

/** Mejor precio para N unidades de un producto en una fecha (hoy por defecto). */
export async function presupuesto(db: Tx, uds: number, producto: Producto, fecha = hoyMadrid()) {
  const [ts, os] = await Promise.all([tramosDe(db, producto.id), ofertasDe(db, producto.id)]);
  return calcularPrecio(uds, producto.precioCent, ts, os, fecha);
}

/** ¿Se lleva stock de este producto? Solo desde que se registra la primera compra. */
export async function llevaStock(db: Tx, productoId: number) {
  const r = await db.select({ id: lotes.id }).from(lotes).where(and(eq(lotes.productoId, productoId), isNull(lotes.anuladoAt))).limit(1);
  return r.length > 0;
}
