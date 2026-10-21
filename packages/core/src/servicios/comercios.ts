import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { Tx } from "../db/client";
import { comercios, placas, recordatorios, socios, ventas, visitas } from "../db/schema";
import { hoy as hoyMadrid, sumarDias } from "../fechas";
import { normalizar } from "../texto";
import { ErrorNegocio } from "./errores";
import { registrarOperacion } from "./operaciones";
import { validarEnlaceResenas } from "./placas";

export type Comercio = typeof comercios.$inferSelect;
export type EstadoComercio = Comercio["estado"];
export type ResultadoVisita = (typeof visitas.$inferSelect)["resultado"];

export const ESTADOS: Record<EstadoComercio, string> = {
  pendiente: "Pendiente de visitar",
  interesado: "Interesado / volver",
  si: "Ha dicho que sí",
  no: "Ha dicho que no",
  cliente: "Cliente",
};

/** Días hasta el recordatorio cuando el comercio dice «luego» sin fecha. */
export const DIAS_LUEGO = 14;

const vivos = isNull(comercios.anuladoAt);

/**
 * Busca un comercio por nombre. Exacto (sin tildes ni mayúsculas) primero; si no, los que contienen el texto.
 * Devuelve `unico` solo cuando no hay duda.
 */
export async function buscarComercio(db: Tx, texto: string) {
  const t = normalizar(texto);
  if (!t) return { unico: null, opciones: [] as Comercio[] };
  const exactos = await db.select().from(comercios).where(and(vivos, eq(comercios.nombreNorm, t)));
  if (exactos.length === 1) return { unico: exactos[0]!, opciones: exactos };
  if (exactos.length > 1) return { unico: null, opciones: exactos };
  const like = `%${t.replace(/[%_\\]/g, "\\$&")}%`;
  const parecidos = await db.select().from(comercios).where(and(vivos, sql`${comercios.nombreNorm} like ${like}`)).orderBy(asc(comercios.nombre)).limit(10);
  return { unico: parecidos.length === 1 ? parecidos[0]! : null, opciones: parecidos };
}

export async function comercioPorId(db: Tx, id: number) {
  const [c] = await db.select().from(comercios).where(and(vivos, eq(comercios.id, id)));
  if (!c) throw new ErrorNegocio("Ese comercio ya no existe.");
  return c;
}

export interface DatosComercio {
  nombre: string;
  tipo?: string | null;
  zona?: string | null;
  direccion?: string | null;
  contacto?: string | null;
  mapsUrl?: string | null;
  nota?: string | null;
  lat?: number | null;
  lon?: number | null;
}

export async function crearComercio(db: Tx, d: DatosComercio, socioId: number, origen = "bot") {
  const nombreNorm = normalizar(d.nombre);
  if (!nombreNorm) throw new ErrorNegocio("Falta el nombre del comercio.");
  if (d.nombre.length > 120) throw new ErrorNegocio("El nombre es demasiado largo.");
  const [dup] = await db.select().from(comercios).where(and(vivos, eq(comercios.nombreNorm, nombreNorm)));
  if (dup) throw new ErrorNegocio(`Ya existe «${dup.nombre}».`);
  const [c] = await db.insert(comercios).values({ ...d, nombre: d.nombre.trim(), nombreNorm, creadoPor: socioId }).returning();
  await registrarOperacion(db, { socioId, tipo: "comercio", resumen: `Nuevo comercio ${c!.nombre}`, deshacer: { t: "comercio", comercioId: c!.id }, origen });
  return c!;
}

export const CAMPOS_COMERCIO = { tipo: "tipo", zona: "zona", direccion: "direccion", contacto: "contacto", maps: "mapsUrl", resenas: "resenasUrl", nota: "nota", nombre: "nombre" } as const;
export type CampoComercio = keyof typeof CAMPOS_COMERCIO;

export async function cambiarDatoComercio(db: Tx, comercioId: number, campo: CampoComercio, valor: string, socioId: number, origen = "bot") {
  const col = CAMPOS_COMERCIO[campo];
  const v = valor.trim() || null;
  if (v && v.length > 500) throw new ErrorNegocio("Ese texto es demasiado largo.");
  if (col === "mapsUrl" && v && !/^https:\/\//.test(v)) throw new ErrorNegocio("El enlace de Google Maps tiene que empezar por https://");
  if (col === "resenasUrl" && v) validarEnlaceResenas(v);
  const set: Partial<Comercio> = { [col]: v, actualizadoAt: new Date() };
  if (col === "nombre") {
    if (!v) throw new ErrorNegocio("El nombre no puede quedar vacío.");
    set.nombreNorm = normalizar(v);
  }
  const [c] = await db.update(comercios).set(set).where(and(vivos, eq(comercios.id, comercioId))).returning();
  const etiqueta = { tipo: "tipo", zona: "zona", direccion: "dirección", contacto: "contacto", maps: "enlace de Maps", resenas: "enlace de reseñas", nota: "nota", nombre: "nombre" }[campo];
  const corto = campo === "maps" || campo === "resenas" ? (v ? "puesto" : "quitado") : `«${v ?? ""}»`;
  await registrarOperacion(db, { socioId, tipo: "comercio_dato", resumen: v ? `${c!.nombre}: ${etiqueta} ${corto}` : `${c!.nombre}: ${etiqueta} borrado`, origen });
  return c!;
}

export async function ponerUbicacion(db: Tx, comercioId: number, lat: number, lon: number, socioId: number) {
  const [c] = await db.update(comercios).set({ lat, lon, actualizadoAt: new Date() }).where(and(vivos, eq(comercios.id, comercioId))).returning();
  await registrarOperacion(db, { socioId, tipo: "comercio_dato", resumen: `${c!.nombre}: ubicación guardada` });
  return c!;
}

/** Estado del comercio tras una visita. Un cliente sigue siendo cliente aunque luego diga que no a algo. */
function estadoTrasVisita(actual: EstadoComercio, r: ResultadoVisita): EstadoComercio {
  if (actual === "cliente") return "cliente";
  if (r === "luego") return "interesado";
  return r;
}

export async function registrarVisita(
  db: Tx,
  d: { comercioId: number; resultado: ResultadoVisita; nota?: string | null; proximaFecha?: string | null; fecha?: string },
  socioId: number,
  origen = "bot",
) {
  const c = await comercioPorId(db, d.comercioId);
  const fecha = d.fecha ?? hoyMadrid();
  const proxima = d.proximaFecha ?? (d.resultado === "luego" || d.resultado === "interesado" ? sumarDias(fecha, DIAS_LUEGO) : null);
  if (proxima && proxima <= fecha) throw new ErrorNegocio("La fecha para volver tiene que ser posterior a hoy.");
  const [v] = await db.insert(visitas).values({ comercioId: c.id, socioId, fecha, resultado: d.resultado, nota: d.nota ?? null, proximaFecha: proxima }).returning();
  const estado = estadoTrasVisita(c.estado, d.resultado);
  await db
    .update(comercios)
    .set({
      estado,
      motivoNo: d.resultado === "no" ? (d.nota ?? null) : c.motivoNo,
      responsableId: c.responsableId ?? socioId,
      actualizadoAt: new Date(),
    })
    .where(eq(comercios.id, c.id));
  // Un recordatorio nuevo sustituye a los pendientes del mismo comercio
  const cerrados = await db
    .update(recordatorios)
    .set({ hechoAt: new Date() })
    .where(and(eq(recordatorios.comercioId, c.id), isNull(recordatorios.hechoAt), isNull(recordatorios.anuladoAt)))
    .returning({ id: recordatorios.id });
  if (proxima) await db.insert(recordatorios).values({ comercioId: c.id, socioId, visitaId: v!.id, fecha: proxima, nota: d.nota ?? null });
  await registrarOperacion(db, {
    socioId,
    tipo: "visita",
    resumen: `Visita a ${c.nombre}: ${{ si: "sí", no: "no", luego: "volver", interesado: "interesado" }[d.resultado]}`,
    deshacer: { t: "visita", visitaId: v!.id, comercioId: c.id, estadoPrevio: c.estado, motivoPrevio: c.motivoNo, responsablePrevio: c.responsableId, recordatoriosCerrados: cerrados.map((r) => r.id) },
    origen,
  });
  return { visita: v!, comercio: { ...c, estado }, proxima };
}

export async function fichaComercio(db: Tx, comercioId: number) {
  const c = await comercioPorId(db, comercioId);
  const [vs, vts, recs, resp, pls] = await Promise.all([
    db
      .select({ fecha: visitas.fecha, resultado: visitas.resultado, nota: visitas.nota, socio: socios.nombre })
      .from(visitas)
      .innerJoin(socios, eq(socios.id, visitas.socioId))
      .where(and(eq(visitas.comercioId, c.id), isNull(visitas.anuladoAt)))
      .orderBy(desc(visitas.fecha), desc(visitas.id))
      .limit(10),
    db.select().from(ventas).where(and(eq(ventas.comercioId, c.id), isNull(ventas.anuladoAt))).orderBy(desc(ventas.id)),
    db.select().from(recordatorios).where(and(eq(recordatorios.comercioId, c.id), isNull(recordatorios.hechoAt), isNull(recordatorios.anuladoAt))),
    c.responsableId ? db.select({ nombre: socios.nombre }).from(socios).where(eq(socios.id, c.responsableId)) : Promise.resolve([]),
    db.select({ codigo: placas.codigo, escaneos: placas.escaneos, ultimoEscaneoAt: placas.ultimoEscaneoAt }).from(placas).where(eq(placas.comercioId, c.id)).orderBy(asc(placas.codigo)),
  ]);
  return { comercio: c, visitas: vs, ventas: vts, recordatorios: recs, responsable: resp[0]?.nombre ?? null, placas: pls };
}

export async function listarComercios(db: Tx, f: { estado?: EstadoComercio; zona?: string } = {}) {
  const conds = [vivos];
  if (f.estado) conds.push(eq(comercios.estado, f.estado));
  if (f.zona) conds.push(sql`lower(${comercios.zona}) like ${`%${f.zona.toLowerCase().replace(/[%_\\]/g, "\\$&")}%`}`);
  return db.select().from(comercios).where(and(...conds)).orderBy(asc(comercios.nombre));
}

/** Cuántos comercios hay en cada estado, en total y por socio responsable. */
export async function embudo(db: Tx) {
  const filas = await db
    .select({ estado: comercios.estado, socio: socios.nombre, n: sql<number>`count(*)::int` })
    .from(comercios)
    .leftJoin(socios, eq(socios.id, comercios.responsableId))
    .where(vivos)
    .groupBy(comercios.estado, socios.nombre);
  const total = { pendiente: 0, interesado: 0, si: 0, no: 0, cliente: 0 } as Record<EstadoComercio, number>;
  const porSocio = new Map<string, Record<EstadoComercio, number>>();
  for (const f of filas) {
    total[f.estado] += f.n;
    if (!f.socio) continue;
    const s = porSocio.get(f.socio) ?? { pendiente: 0, interesado: 0, si: 0, no: 0, cliente: 0 };
    s[f.estado] += f.n;
    porSocio.set(f.socio, s);
  }
  return { total, porSocio: [...porSocio.entries()].map(([socio, e]) => ({ socio, ...e, ...conversion(e) })), ...conversion(total) };
}

/** Visitados = todo lo que no está pendiente. Conversión = clientes / visitados. */
export function conversion(e: Record<EstadoComercio, number>) {
  const visitados = e.interesado + e.si + e.no + e.cliente;
  return { visitados, conversionBp: visitados ? Math.round((e.cliente * 10_000) / visitados) : 0 };
}

/** Últimos comercios que ha tocado un socio (para asignar una ubicación enviada por Telegram). */
export async function recientesDeSocio(db: Tx, socioId: number, limite = 5) {
  return db
    .select({ id: comercios.id, nombre: comercios.nombre, ultima: sql<string>`max(${visitas.creadoAt})` })
    .from(visitas)
    .innerJoin(comercios, eq(comercios.id, visitas.comercioId))
    .where(and(eq(visitas.socioId, socioId), isNull(visitas.anuladoAt), vivos))
    .groupBy(comercios.id, comercios.nombre)
    .orderBy(desc(sql`max(${visitas.creadoAt})`))
    .limit(limite);
}

/** Nombres de todos los comercios (para que la IA reconozca de cuál se habla). */
export async function nombresComercios(db: Tx, limite = 300) {
  return (await db.select({ nombre: comercios.nombre }).from(comercios).where(vivos).orderBy(desc(comercios.actualizadoAt)).limit(limite)).map((r) => r.nombre);
}
