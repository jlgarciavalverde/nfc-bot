import { eq } from "drizzle-orm";
import type { Tx } from "../db/client";
import { ajustes } from "../db/schema";
import type { Estilo, Tono } from "../estilo";

export type ModoReparto = "igual" | "porcentaje" | "aportado";

export interface Ajustes {
  /** Chat del grupo de socios (lo fija un admin con /vincular). */
  grupoChatId: number | null;
  /** Aviso de stock bajo por debajo de estas unidades. */
  stockMin: number;
  modoReparto: ModoReparto;
  /** Comisión para quien vende, sobre el total de cada venta cobrada (puntos básicos). */
  comisionBp: number;
  productoDefectoId: number | null;
  /** Texto de bienvenida al grupo (null = el de por defecto). `{nombre}` = nombre de quien entra. */
  bienvenida: string | null;
  /** Tipos de aviso automático que no se publican (ver TIPOS_AVISO). */
  avisosSilenciados: string[];
  /** Personalidad del asistente (ver `estilo.ts`). */
  nombreAsistente: string | null;
  tono: Tono;
  emojis: boolean;
  /** Notas del admin para la IA (cómo responder; no cambian las reglas). */
  instruccionesIa: string | null;
  limpieza: Limpieza;
}

/** Qué se borra solo del chat. Minutos: 0 = nunca. Consultas y apuntes solo en el grupo; errores en cualquier chat. */
export interface Limpieza {
  consultasMin: number;
  apuntesMin: number;
  erroresMin: number;
  /** Borrar también el mensaje del socio (el bot tiene que ser admin del grupo con «Eliminar mensajes»). */
  borrarComandos: boolean;
  /** Las consultas hechas en el grupo se contestan por privado. */
  consultasPorPrivado: boolean;
}

/** Telegram no deja borrar mensajes de más de 48 h. */
export const MAX_MIN_LIMPIEZA = 47 * 60;
export const LIMPIEZA_DEFECTO: Limpieza = { consultasMin: 0, apuntesMin: 0, erroresMin: 5, borrarComandos: false, consultasPorPrivado: false };

export const estiloDe = (a: Ajustes): Estilo => ({ tono: a.tono, emojis: a.emojis, nombreAsistente: a.nombreAsistente });

const DEFECTO: Ajustes = { grupoChatId: null, stockMin: 5, modoReparto: "igual", comisionBp: 0, productoDefectoId: null, bienvenida: null, avisosSilenciados: [],
  nombreAsistente: null, tono: "cercano", emojis: true, instruccionesIa: null, limpieza: LIMPIEZA_DEFECTO,
};

export async function leerAjustes(db: Tx): Promise<Ajustes> {
  const filas = await db.select().from(ajustes);
  const out: Record<string, unknown> = { ...DEFECTO };
  for (const f of filas) if (f.clave in DEFECTO) out[f.clave] = f.valor;
  // Campos nuevos de la limpieza: lo guardado se completa con lo de por defecto
  out.limpieza = { ...LIMPIEZA_DEFECTO, ...(out.limpieza as object) };
  return out as unknown as Ajustes;
}

export async function guardarAjuste<K extends keyof Ajustes>(db: Tx, clave: K, valor: Ajustes[K]) {
  if (valor === null) {
    await db.delete(ajustes).where(eq(ajustes.clave, clave));
    return;
  }
  await db.insert(ajustes).values({ clave, valor }).onConflictDoUpdate({ target: ajustes.clave, set: { valor } });
}
