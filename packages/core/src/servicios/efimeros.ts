import { and, eq, lte } from "drizzle-orm";
import type { Tx } from "../db/client";
import { efimeros } from "../db/schema";

/** Telegram no deja borrar mensajes de más de 48 h: se programan como mucho a 47 h. */
const MAX_MS = 47 * 3600_000;

/**
 * Programa el borrado de un mensaje del bot. Con `clave`, devuelve los mensajes anteriores con esa clave
 * (para borrarlos ya) y los quita de la lista.
 */
export async function programarBorrado(db: Tx, m: { chatId: number; messageId: number; enMs: number; clave?: string }) {
  let anteriores: { chatId: number; messageId: number }[] = [];
  if (m.clave) anteriores = await db.delete(efimeros).where(eq(efimeros.clave, m.clave)).returning({ chatId: efimeros.chatId, messageId: efimeros.messageId });
  await db.insert(efimeros).values({ chatId: m.chatId, messageId: m.messageId, clave: m.clave ?? null, borrarAt: new Date(Date.now() + Math.min(m.enMs, MAX_MS)) });
  return anteriores;
}

/** Mensajes cuyo momento de borrarse ha llegado (se quitan de la lista: si Telegram falla, no se reintenta). */
export async function efimerosVencidos(db: Tx, ahora = new Date()) {
  return db.delete(efimeros).where(lte(efimeros.borrarAt, ahora)).returning({ chatId: efimeros.chatId, messageId: efimeros.messageId });
}

/** Ya no hace falta borrarlo más tarde (se ha borrado ahora). */
export async function olvidarEfimero(db: Tx, chatId: number, messageId: number) {
  await db.delete(efimeros).where(and(eq(efimeros.chatId, chatId), eq(efimeros.messageId, messageId)));
}

/** Saca de la lista todos los mensajes pendientes de borrarse en un chat (para borrarlos ya con /limpiar). */
export async function vaciarEfimeros(db: Tx, chatId: number) {
  return db.delete(efimeros).where(eq(efimeros.chatId, chatId)).returning({ chatId: efimeros.chatId, messageId: efimeros.messageId });
}
