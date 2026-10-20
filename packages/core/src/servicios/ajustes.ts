import { eq } from "drizzle-orm";
import type { Tx } from "../db/client";
import { ajustes } from "../db/schema";

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
}

const DEFECTO: Ajustes = { grupoChatId: null, stockMin: 5, modoReparto: "igual", comisionBp: 0, productoDefectoId: null };

export async function leerAjustes(db: Tx): Promise<Ajustes> {
  const filas = await db.select().from(ajustes);
  const out: Record<string, unknown> = { ...DEFECTO };
  for (const f of filas) if (f.clave in DEFECTO) out[f.clave] = f.valor;
  return out as unknown as Ajustes;
}

export async function guardarAjuste<K extends keyof Ajustes>(db: Tx, clave: K, valor: Ajustes[K]) {
  if (valor === null) {
    await db.delete(ajustes).where(eq(ajustes.clave, clave));
    return;
  }
  await db.insert(ajustes).values({ clave, valor }).onConflictDoUpdate({ target: ajustes.clave, set: { valor } });
}
