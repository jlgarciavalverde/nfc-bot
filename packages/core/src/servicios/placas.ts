import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { DB, Tx } from "../db/client";
import { comercios, placas, socios, tandasPlacas } from "../db/schema";
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

// ── Lotes (tandas) de placas: reservar códigos desde el panel ──

/** Código nuevo al azar (4 caracteres + control). Sin garantía de unicidad: la da la restricción `unique` al insertar. */
export function codigoAlAzar() {
  const bytes = randomBytes(4);
  const base = Array.from(bytes, (b) => ALFABETO_PLACA[b % ALFABETO_PLACA.length]).join("");
  return base + caracterControl(base);
}

export const MAX_TANDA = 200;

/** Reserva `n` códigos nuevos en un lote. Ninguno se repite nunca (ni con los del bot ni con lotes anteriores). */
export async function crearTanda(db: DB, n: number, socioId: number, nota?: string | null) {
  if (!Number.isInteger(n) || n < 1 || n > MAX_TANDA) throw new ErrorNegocio(`Un lote es de 1 a ${MAX_TANDA} placas.`);
  return db.transaction(async (tx) => {
    const [t] = await tx.insert(tandasPlacas).values({ n, nota: nota?.trim() || null, creadoPor: socioId }).returning();
    const codigos = new Set<string>();
    let intentos = 0;
    while (codigos.size < n) {
      if (++intentos > n * 20) throw new Error("No consigo generar códigos libres");
      const faltan = Array.from({ length: n - codigos.size }, codigoAlAzar).filter((c) => !codigos.has(c));
      const r = await tx.insert(placas).values(faltan.map((codigo) => ({ codigo, tandaId: t!.id }))).onConflictDoNothing().returning({ codigo: placas.codigo });
      for (const x of r) codigos.add(x.codigo);
    }
    await registrarOperacion(tx, { socioId, tipo: "lote_placas", resumen: `Lote ${t!.id} de ${n} placas` });
    return { tanda: t!, codigos: [...codigos].sort() };
  });
}

/** Da de alta códigos ya impresos fuera del panel (p. ej. los de `hardware/soporte-nfc/lotes/codigos.txt`). */
export async function importarCodigos(db: DB, textos: string[], socioId: number, nota = "Importados") {
  const validos = [...new Set(textos.map((t) => normalizarCodigo(t)).filter((c): c is string => !!c))];
  if (!validos.length) throw new ErrorNegocio("No hay ningún código válido.");
  return db.transaction(async (tx) => {
    const [t] = await tx.insert(tandasPlacas).values({ n: validos.length, nota, creadoPor: socioId }).returning();
    await tx.insert(placas).values(validos.map((codigo) => ({ codigo, tandaId: t!.id }))).onConflictDoNothing();
    await tx.update(placas).set({ tandaId: t!.id }).where(and(inArray(placas.codigo, validos), isNull(placas.tandaId)));
    return { tanda: t!, codigos: validos };
  });
}

export async function listarTandas(db: Tx) {
  return db
    .select({
      id: tandasPlacas.id,
      n: tandasPlacas.n,
      nota: tandasPlacas.nota,
      creadoAt: tandasPlacas.creadoAt,
      creadoPor: socios.nombre,
      asignadas: sql<number>`(select count(*) from ${placas} p where p.tanda_id = "tandas_placas"."id" and p.comercio_id is not null)::int`,
    })
    .from(tandasPlacas)
    .leftJoin(socios, eq(socios.id, tandasPlacas.creadoPor))
    .orderBy(desc(tandasPlacas.id));
}

export async function codigosDeTanda(db: Tx, tandaId: number) {
  const r = await db.select({ codigo: placas.codigo }).from(placas).where(eq(placas.tandaId, tandaId)).orderBy(asc(placas.codigo));
  if (!r.length) throw new ErrorNegocio("Ese lote no existe.");
  return r.map((x) => x.codigo);
}

/** Todas las placas (también las reservadas sin asignar) para el panel. */
export async function placasPanel(db: Tx) {
  return db
    .select({
      codigo: placas.codigo,
      tandaId: placas.tandaId,
      comercioId: comercios.id,
      comercio: comercios.nombre,
      resenasUrl: comercios.resenasUrl,
      escaneos: placas.escaneos,
      ultimoEscaneoAt: placas.ultimoEscaneoAt,
      asignadaAt: placas.asignadaAt,
      nfcGrabadaAt: placas.nfcGrabadaAt,
      nfcBloqueadaAt: placas.nfcBloqueadaAt,
    })
    .from(placas)
    .leftJoin(comercios, and(eq(comercios.id, placas.comercioId), isNull(comercios.anuladoAt)))
    .orderBy(desc(placas.escaneos), asc(placas.codigo));
}

/** Apunta que la pegatina NFC de la placa se ha grabado (y, si `bloqueada`, bloqueado) desde el panel. */
export async function marcarNfc(db: Tx, codigoTexto: string, bloqueada: boolean, socioId: number) {
  const codigo = codigoOError(codigoTexto);
  const ahora = new Date();
  const r = await db
    .insert(placas)
    .values({ codigo, nfcGrabadaAt: ahora, nfcBloqueadaAt: bloqueada ? ahora : null })
    .onConflictDoUpdate({ target: placas.codigo, set: { nfcGrabadaAt: ahora, ...(bloqueada ? { nfcBloqueadaAt: ahora } : {}) } })
    .returning();
  await registrarOperacion(db, { socioId, tipo: "placa_nfc", resumen: `Pegatina de la placa ${codigo} ${bloqueada ? "grabada y bloqueada" : "grabada"}`, origen: "panel" });
  return r[0]!;
}
