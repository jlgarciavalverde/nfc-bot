import { createHash, randomBytes, randomInt } from "node:crypto";
import { and, desc, eq, gt, isNull, lt, ne } from "drizzle-orm";
import type { Tx } from "../db/client";
import { enlacesPanel, sesiones, socios } from "../db/schema";

const hash = (t: string) => createHash("sha256").update(t).digest("hex");
export const MINUTOS_ENLACE = 15;
/** La sesión se renueva sola con cada uso: solo caduca tras un año sin entrar. */
export const DIAS_SESION = 365;
/** Para no escribir en la BD en cada petición: se renueva como mucho una vez al día. */
const RENOVAR_CADA_MS = 86_400_000;

/** Enlace de un solo uso para entrar al panel + código de 8 cifras equivalente (solo se guardan sus hashes). */
export async function crearEnlacePanel(db: Tx, socioId: number) {
  const token = randomBytes(32).toString("base64url");
  const codigo = String(randomInt(0, 100_000_000)).padStart(8, "0");
  await db.insert(enlacesPanel).values({ tokenHash: hash(token), codigoHash: hash(`codigo:${codigo}`), socioId, expiraAt: new Date(Date.now() + MINUTOS_ENLACE * 60_000) });
  return { token, codigo };
}

async function abrirSesion(db: Tx, socioId: number, dispositivo?: string | null) {
  const sesion = randomBytes(32).toString("base64url");
  await db.insert(sesiones).values({ tokenHash: hash(sesion), socioId, expiraAt: new Date(Date.now() + DIAS_SESION * 86_400_000), dispositivo: dispositivo?.slice(0, 120) ?? null, ultimoUsoAt: new Date() });
  return sesion;
}

/** Canjea el enlace por una sesión. null si no vale (caducado, usado o inventado). */
export async function canjearEnlace(db: Tx, token: string, dispositivo?: string | null) {
  const [e] = await db
    .update(enlacesPanel)
    .set({ usadoAt: new Date() })
    .where(and(eq(enlacesPanel.tokenHash, hash(token)), isNull(enlacesPanel.usadoAt), gt(enlacesPanel.expiraAt, new Date())))
    .returning();
  return e ? abrirSesion(db, e.socioId, dispositivo) : null;
}

/** Igual con el código de 8 cifras (admite espacios y guiones). */
export async function canjearCodigo(db: Tx, codigo: string, dispositivo?: string | null) {
  const c = codigo.replace(/[\s-]/g, "");
  if (!/^\d{8}$/.test(c)) return null;
  const [e] = await db
    .update(enlacesPanel)
    .set({ usadoAt: new Date() })
    .where(and(eq(enlacesPanel.codigoHash, hash(`codigo:${c}`)), isNull(enlacesPanel.usadoAt), gt(enlacesPanel.expiraAt, new Date())))
    .returning();
  return e ? abrirSesion(db, e.socioId, dispositivo) : null;
}

/** Socio de la sesión; de paso la renueva (una vez al día) para que no caduque mientras se use. `renovada` → reenviar cookie. */
export async function socioDeSesion(db: Tx, sesion: string) {
  const [r] = await db
    .select({ socio: socios, expiraAt: sesiones.expiraAt, ultimoUsoAt: sesiones.ultimoUsoAt })
    .from(sesiones)
    .innerJoin(socios, eq(socios.id, sesiones.socioId))
    .where(and(eq(sesiones.tokenHash, hash(sesion)), gt(sesiones.expiraAt, new Date()), eq(socios.activo, true)));
  if (!r) return null;
  let renovada = false;
  if (!r.ultimoUsoAt || Date.now() - r.ultimoUsoAt.getTime() > RENOVAR_CADA_MS) {
    await db.update(sesiones).set({ ultimoUsoAt: new Date(), expiraAt: new Date(Date.now() + DIAS_SESION * 86_400_000) }).where(eq(sesiones.tokenHash, hash(sesion)));
    renovada = true;
  }
  return Object.assign(r.socio, { renovada });
}

export async function cerrarSesion(db: Tx, sesion: string) {
  await db.delete(sesiones).where(eq(sesiones.tokenHash, hash(sesion)));
}

/** Cierra todas las sesiones de un socio (móvil perdido); con `salvo`, menos esa. Devuelve cuántas cerró. */
export async function cerrarSesionesDe(db: Tx, socioId: number, salvo?: string) {
  const r = await db
    .delete(sesiones)
    .where(and(eq(sesiones.socioId, socioId), salvo ? ne(sesiones.tokenHash, hash(salvo)) : undefined))
    .returning({ t: sesiones.tokenHash });
  return r.length;
}

export async function sesionesDe(db: Tx, socioId: number, actual?: string) {
  const ss = await db
    .select({ tokenHash: sesiones.tokenHash, dispositivo: sesiones.dispositivo, ultimoUsoAt: sesiones.ultimoUsoAt, creadoAt: sesiones.creadoAt })
    .from(sesiones)
    .where(and(eq(sesiones.socioId, socioId), gt(sesiones.expiraAt, new Date())))
    .orderBy(desc(sesiones.ultimoUsoAt));
  const h = actual ? hash(actual) : null;
  return ss.map(({ tokenHash, ...s }) => ({ ...s, actual: tokenHash === h }));
}

export async function purgarCaducados(db: Tx) {
  await db.delete(sesiones).where(lt(sesiones.expiraAt, new Date()));
  await db.delete(enlacesPanel).where(lt(enlacesPanel.expiraAt, new Date(Date.now() - 86_400_000)));
}
