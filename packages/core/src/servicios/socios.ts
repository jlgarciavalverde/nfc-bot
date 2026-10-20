import { and, asc, eq, sql } from "drizzle-orm";
import type { Tx } from "../db/client";
import { socios } from "../db/schema";
import { normalizar } from "../texto";
import { ErrorNegocio } from "./errores";
import { registrarOperacion } from "./operaciones";

export type Socio = typeof socios.$inferSelect;

export async function socioPorTelegram(db: Tx, telegramId: number) {
  const [s] = await db.select().from(socios).where(and(eq(socios.telegramId, telegramId), eq(socios.activo, true)));
  return s ?? null;
}

export async function haySocios(db: Tx) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(socios);
  return (r?.n ?? 0) > 0;
}

export async function listarSocios(db: Tx) {
  return db.select().from(socios).where(eq(socios.activo, true)).orderBy(asc(socios.id));
}

/** Alta (o reactivación) de un socio. El primero de todos es admin. */
export async function altaSocio(db: Tx, d: { telegramId: number; nombre: string; username?: string | null; rol?: "admin" | "socio" }, porSocioId: number | null) {
  const primero = !(await haySocios(db));
  const rol = primero ? "admin" : (d.rol ?? "socio");
  const [s] = await db
    .insert(socios)
    .values({ telegramId: d.telegramId, nombre: d.nombre, username: d.username ?? null, rol })
    .onConflictDoUpdate({ target: socios.telegramId, set: { activo: true, nombre: d.nombre, username: d.username ?? null } })
    .returning();
  await registrarOperacion(db, { socioId: porSocioId ?? s!.id, tipo: "alta_socio", resumen: `Alta de ${d.nombre}` });
  return s!;
}

/** Busca un socio por nombre o @usuario. */
export async function socioPorNombre(db: Tx, texto: string) {
  const t = normalizar(texto.replace(/^@/, ""));
  const todos = await listarSocios(db);
  const exacto = todos.filter((s) => normalizar(s.nombre) === t || (s.username && normalizar(s.username) === t));
  const parecidos = exacto.length ? exacto : todos.filter((s) => normalizar(s.nombre).includes(t) || (s.username && normalizar(s.username).includes(t)));
  if (parecidos.length === 1) return parecidos[0]!;
  if (!parecidos.length) throw new ErrorNegocio(`No encuentro a ningún socio «${texto}». Mira /socios.`);
  throw new ErrorNegocio(`Hay varios socios que encajan con «${texto}»: ${parecidos.map((s) => s.nombre).join(", ")}.`);
}

export async function cambiarSocio(db: Tx, socioId: number, cambios: Partial<Pick<Socio, "rol" | "pctReparto" | "activo">>, porSocioId: number) {
  if (cambios.rol === "socio" || cambios.activo === false) {
    const admins = (await listarSocios(db)).filter((s) => s.rol === "admin" && s.id !== socioId);
    if (!admins.length) throw new ErrorNegocio("Tiene que quedar al menos un admin.");
  }
  const [s] = await db.update(socios).set(cambios).where(eq(socios.id, socioId)).returning();
  await registrarOperacion(db, { socioId: porSocioId, tipo: "cambio_socio", resumen: `Cambios en ${s?.nombre}: ${JSON.stringify(cambios)}` });
  return s!;
}
