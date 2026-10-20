import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import type { Tx } from "../db/client";
import { enlacesPanel, sesiones, socios } from "../db/schema";

const hash = (t: string) => createHash("sha256").update(t).digest("hex");
export const MINUTOS_ENLACE = 15;
export const DIAS_SESION = 30;

/** Enlace de un solo uso para entrar al panel (solo se guarda su hash). */
export async function crearEnlacePanel(db: Tx, socioId: number) {
  const token = randomBytes(32).toString("base64url");
  await db.insert(enlacesPanel).values({ tokenHash: hash(token), socioId, expiraAt: new Date(Date.now() + MINUTOS_ENLACE * 60_000) });
  return token;
}

/** Canjea el enlace por una sesión. null si no vale (caducado, usado o inventado). */
export async function canjearEnlace(db: Tx, token: string) {
  const [e] = await db
    .update(enlacesPanel)
    .set({ usadoAt: new Date() })
    .where(and(eq(enlacesPanel.tokenHash, hash(token)), isNull(enlacesPanel.usadoAt), gt(enlacesPanel.expiraAt, new Date())))
    .returning();
  if (!e) return null;
  const sesion = randomBytes(32).toString("base64url");
  await db.insert(sesiones).values({ tokenHash: hash(sesion), socioId: e.socioId, expiraAt: new Date(Date.now() + DIAS_SESION * 86_400_000) });
  return sesion;
}

export async function socioDeSesion(db: Tx, sesion: string) {
  const [r] = await db
    .select({ socio: socios })
    .from(sesiones)
    .innerJoin(socios, eq(socios.id, sesiones.socioId))
    .where(and(eq(sesiones.tokenHash, hash(sesion)), gt(sesiones.expiraAt, new Date()), eq(socios.activo, true)));
  return r?.socio ?? null;
}

export async function cerrarSesion(db: Tx, sesion: string) {
  await db.delete(sesiones).where(eq(sesiones.tokenHash, hash(sesion)));
}

export async function purgarCaducados(db: Tx) {
  await db.delete(sesiones).where(lt(sesiones.expiraAt, new Date()));
  await db.delete(enlacesPanel).where(lt(enlacesPanel.expiraAt, new Date(Date.now() - 86_400_000)));
}
