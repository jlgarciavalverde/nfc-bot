import { and, asc, desc, eq, isNull, lt, sql } from "drizzle-orm";
import type { Tx } from "../db/client";
import { avisos } from "../db/schema";
import { leerAjustes } from "./ajustes";

export type DestinoAviso = "grupo" | "admins" | "socio";

/** Tipos de aviso que un admin puede silenciar con /config avisos <tipo> no. */
export const TIPOS_AVISO = {
  panel: "Cambios hechos desde el panel web",
  copia: "Copias de seguridad que fallan",
  version: "Actualizaciones del bot",
  oferta: "Ofertas que caducan",
  cobro: "Ventas sin cobrar hace más de 7 días",
  stock: "Stock bajo",
} as const;
export type TipoAviso = keyof typeof TIPOS_AVISO;

/** Deja un aviso en el buzón; el bot lo envía en el siguiente minuto. Si su tipo está silenciado, se guarda sin enviar. */
export async function avisar(db: Tx, a: { tipo: TipoAviso | string; texto: string; destino?: DestinoAviso; socioId?: number | null; silencioso?: boolean }) {
  const { avisosSilenciados } = await leerAjustes(db);
  const silencioso = a.silencioso || avisosSilenciados.includes(a.tipo);
  await db.insert(avisos).values({ tipo: a.tipo, texto: a.texto.slice(0, 3500), destino: a.destino ?? "grupo", socioId: a.socioId ?? null, silencioso });
}

/** Avisos por enviar (los más antiguos primero). Tras 5 intentos fallidos se dejan de reintentar. */
export async function avisosPorEnviar(db: Tx, limite = 20) {
  return db
    .select()
    .from(avisos)
    .where(and(isNull(avisos.enviadoAt), eq(avisos.silencioso, false), lt(avisos.intentos, 5)))
    .orderBy(asc(avisos.id))
    .limit(limite);
}

export async function marcarAviso(db: Tx, id: number, ok: boolean) {
  await db
    .update(avisos)
    .set(ok ? { enviadoAt: new Date() } : { intentos: sql`${avisos.intentos} + 1` })
    .where(eq(avisos.id, id));
}

/** Último aviso de un tipo (enviado o silencioso), p. ej. el resultado de la última copia. */
export async function ultimoAviso(db: Tx, tipo: string) {
  const [a] = await db.select().from(avisos).where(eq(avisos.tipo, tipo)).orderBy(desc(avisos.id)).limit(1);
  return a ?? null;
}
