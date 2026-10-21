import { and, asc, eq, isNull, lte, sql } from "drizzle-orm";
import type { Tx } from "../db/client";
import { comercios, envios, recordatorios, socios } from "../db/schema";
import { ErrorNegocio } from "./errores";
import { registrarOperacion } from "./operaciones";

/** Recordatorios sin hacer hasta `fecha` (incluida). Con `socioId`, solo los suyos. */
export async function recordatoriosPendientes(db: Tx, fecha: string, socioId?: number) {
  return db
    .select({
      id: recordatorios.id,
      fecha: recordatorios.fecha,
      nota: recordatorios.nota,
      comercioId: comercios.id,
      comercio: comercios.nombre,
      zona: comercios.zona,
      socioId: recordatorios.socioId,
      socio: socios.nombre,
      telegramId: socios.telegramId,
    })
    .from(recordatorios)
    .innerJoin(comercios, eq(comercios.id, recordatorios.comercioId))
    .innerJoin(socios, eq(socios.id, recordatorios.socioId))
    .where(
      and(
        isNull(recordatorios.hechoAt),
        isNull(recordatorios.anuladoAt),
        isNull(comercios.anuladoAt),
        lte(recordatorios.fecha, fecha),
        socioId ? eq(recordatorios.socioId, socioId) : undefined,
      ),
    )
    .orderBy(asc(recordatorios.fecha), asc(comercios.nombre));
}

export async function crearRecordatorio(db: Tx, d: { comercioId: number; fecha: string; nota?: string | null }, socioId: number) {
  const [r] = await db.insert(recordatorios).values({ ...d, socioId }).returning();
  await registrarOperacion(db, { socioId, tipo: "recordatorio", resumen: `Recordatorio para el ${d.fecha}` });
  return r!;
}

export async function marcarHecho(db: Tx, id: number, socioId: number) {
  const r = await db
    .update(recordatorios)
    .set({ hechoAt: new Date() })
    .where(and(eq(recordatorios.id, id), isNull(recordatorios.hechoAt), isNull(recordatorios.anuladoAt)))
    .returning();
  if (!r.length) throw new ErrorNegocio("Ese recordatorio ya estaba hecho.");
  await registrarOperacion(db, { socioId, tipo: "recordatorio_hecho", resumen: `Recordatorio hecho` });
  return r[0]!;
}

/** Marca un aviso programado como enviado. false si ya se había enviado (no repetir tras un reinicio). */
export async function reclamarEnvio(db: Tx, clave: string) {
  const r = await db.insert(envios).values({ clave }).onConflictDoNothing().returning({ c: envios.clave });
  return r.length > 0;
}

export async function contarPendientes(db: Tx, fecha: string) {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(recordatorios)
    .where(and(isNull(recordatorios.hechoAt), isNull(recordatorios.anuladoAt), lte(recordatorios.fecha, fecha)));
  return r?.n ?? 0;
}
