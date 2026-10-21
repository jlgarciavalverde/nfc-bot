import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { Tx } from "../db/client";
import { comercios, placas } from "../db/schema";
import { comercioPorId } from "./comercios";
import { ErrorNegocio } from "./errores";
import { registrarOperacion } from "./operaciones";

/**
 * Códigos de placa: 4 caracteres al azar + 1 de control. Sin 0/O, 1/I/L para que se lean bien en la tapa.
 * El de control es Σ (posición+1) · valor mod 31: detecta cualquier carácter cambiado y dos contiguos intercambiados.
 * El generador de lotes (`hardware/soporte-nfc/generar_lote.py`) usa el mismo cálculo.
 */
export const ALFABETO_PLACA = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function caracterControl(base: string) {
  let s = 0;
  for (let i = 0; i < base.length; i++) s += (i + 1) * ALFABETO_PLACA.indexOf(base[i]!);
  return ALFABETO_PLACA[s % ALFABETO_PLACA.length]!;
}

/** «k7m2q», «K7M2-Q» → «K7M2Q», o null si no es un código válido (incluido el de control). */
export function normalizarCodigo(texto: string): string | null {
  const c = texto.toUpperCase().replace(/[\s-]/g, "");
  if (!/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/.test(c)) return null;
  return caracterControl(c.slice(0, 4)) === c[4] ? c : null;
}

function codigoOError(texto: string) {
  const c = normalizarCodigo(texto);
  if (!c) throw new ErrorNegocio(`«${texto}» no es un código de placa válido. Son 5 letras y números (está en la tapa de detrás); revisa que no falte ni sobre ninguno.`);
  return c;
}

/** Valida el enlace de reseñas (https). */
export function validarEnlaceResenas(url: string) {
  if (!/^https:\/\/\S+$/.test(url)) throw new ErrorNegocio("El enlace de reseñas tiene que empezar por https:// (en Google: tu perfil → «Pedir reseñas»).");
}

export type Placa = typeof placas.$inferSelect;

/** Asigna (o reasigna) una placa a un comercio. */
export async function asignarPlaca(db: Tx, codigoTexto: string, comercioId: number, socioId: number, origen = "bot") {
  const codigo = codigoOError(codigoTexto);
  const c = await comercioPorId(db, comercioId);
  const [previa] = await db.select().from(placas).where(eq(placas.codigo, codigo)).for("update");
  if (previa?.comercioId === c.id) throw new ErrorNegocio(`La placa ${codigo} ya es de ${c.nombre}.`);
  const ahora = new Date();
  const [p] = previa
    ? await db.update(placas).set({ comercioId: c.id, asignadaPor: socioId, asignadaAt: ahora }).where(eq(placas.id, previa.id)).returning()
    : await db.insert(placas).values({ codigo, comercioId: c.id, asignadaPor: socioId, asignadaAt: ahora }).returning();
  const antes = previa?.comercioId ? await comercioPorId(db, previa.comercioId).catch(() => null) : null;
  await registrarOperacion(db, {
    socioId,
    tipo: "placa",
    resumen: `Placa ${codigo} → ${c.nombre}${antes ? ` (antes ${antes.nombre})` : ""}`,
    deshacer: { t: "placa", placaId: p!.id, comercioPrevio: previa?.comercioId ?? null, asignadaPorPrevio: previa?.asignadaPor ?? null, asignadaAtPrevio: previa?.asignadaAt?.toISOString() ?? null },
    origen,
  });
  return { placa: p!, comercio: c, antes };
}

/** Deja la placa sin comercio (deja de redirigir). */
export async function quitarPlaca(db: Tx, codigoTexto: string, socioId: number, origen = "bot") {
  const codigo = codigoOError(codigoTexto);
  const [p] = await db.select().from(placas).where(eq(placas.codigo, codigo)).for("update");
  if (!p?.comercioId) throw new ErrorNegocio(`La placa ${codigo} no está asignada a ningún comercio.`);
  const c = await comercioPorId(db, p.comercioId).catch(() => null);
  await db.update(placas).set({ comercioId: null, asignadaPor: null, asignadaAt: null }).where(eq(placas.id, p.id));
  await registrarOperacion(db, {
    socioId,
    tipo: "placa",
    resumen: `Placa ${codigo} quitada${c ? ` de ${c.nombre}` : ""}`,
    deshacer: { t: "placa", placaId: p.id, comercioPrevio: p.comercioId, asignadaPorPrevio: p.asignadaPor, asignadaAtPrevio: p.asignadaAt?.toISOString() ?? null },
    origen,
  });
  return { codigo, comercio: c };
}

/** Datos de una placa (o null si nunca se ha asignado). */
export async function infoPlaca(db: Tx, codigoTexto: string) {
  const codigo = codigoOError(codigoTexto);
  const [p] = await db
    .select({ placa: placas, comercio: comercios.nombre, resenasUrl: comercios.resenasUrl })
    .from(placas)
    .leftJoin(comercios, and(eq(comercios.id, placas.comercioId), isNull(comercios.anuladoAt)))
    .where(eq(placas.codigo, codigo));
  return { codigo, ...(p ?? { placa: null, comercio: null, resenasUrl: null }) };
}

/** Placas asignadas con su comercio, las más escaneadas primero. */
export async function listarPlacas(db: Tx) {
  return db
    .select({ codigo: placas.codigo, escaneos: placas.escaneos, ultimoEscaneoAt: placas.ultimoEscaneoAt, comercio: comercios.nombre, comercioId: comercios.id, resenasUrl: comercios.resenasUrl })
    .from(placas)
    .innerJoin(comercios, and(eq(comercios.id, placas.comercioId), isNull(comercios.anuladoAt)))
    .orderBy(desc(placas.escaneos), asc(comercios.nombre));
}

/**
 * Lo que pasa al escanear una placa: adónde redirigir (y cuenta el escaneo) o por qué no.
 * Los códigos que nunca se han asignado no crean filas (el tráfico público no escribe nada nuevo).
 */
export async function escanearPlaca(db: Tx, codigoTexto: string): Promise<{ url: string } | { motivo: "invalida" | "sin_asignar" | "sin_enlace"; comercio?: string }> {
  const codigo = normalizarCodigo(codigoTexto);
  if (!codigo) return { motivo: "invalida" };
  const [p] = await db
    .select({ id: placas.id, comercio: comercios.nombre, url: comercios.resenasUrl })
    .from(placas)
    .leftJoin(comercios, and(eq(comercios.id, placas.comercioId), isNull(comercios.anuladoAt)))
    .where(eq(placas.codigo, codigo));
  if (!p?.comercio) return { motivo: "sin_asignar" };
  await db.update(placas).set({ escaneos: sql`${placas.escaneos} + 1`, ultimoEscaneoAt: new Date() }).where(eq(placas.id, p.id));
  if (!p.url) return { motivo: "sin_enlace", comercio: p.comercio };
  return { url: p.url };
}
