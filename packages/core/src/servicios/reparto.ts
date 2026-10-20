import { and, eq, isNull, sql } from "drizzle-orm";
import type { Tx } from "../db/client";
import { movimientos, ventas } from "../db/schema";
import { calcularReparto } from "../reparto";
import { leerAjustes } from "./ajustes";
import { resumenCaja } from "./caja";
import { listarSocios } from "./socios";

export async function reparto(db: Tx) {
  const [socios, aj, caja, porSocio, vendido] = await Promise.all([
    listarSocios(db),
    leerAjustes(db),
    resumenCaja(db),
    db
      .select({ socioId: movimientos.socioId, tipo: movimientos.tipo, cent: sql<number>`sum(${movimientos.importeCent})::int` })
      .from(movimientos)
      .where(isNull(movimientos.anuladoAt))
      .groupBy(movimientos.socioId, movimientos.tipo),
    db
      .select({ socioId: ventas.socioId, cent: sql<number>`sum(${ventas.totalCent})::int` })
      .from(ventas)
      .where(and(isNull(ventas.anuladoAt), eq(ventas.cobrada, true)))
      .groupBy(ventas.socioId),
  ]);
  const aportado: Record<number, number> = {};
  const retirado: Record<number, number> = {};
  for (const r of porSocio) {
    if (r.tipo === "aportacion") aportado[r.socioId] = r.cent;
    if (r.tipo === "retirada") retirado[r.socioId] = r.cent;
  }
  const r = calcularReparto({
    socios,
    aportadoCent: aportado,
    retiradoCent: retirado,
    vendidoCobradoCent: Object.fromEntries(vendido.map((v) => [v.socioId, v.cent])),
    beneficioCent: caja.beneficioCent,
    modo: aj.modoReparto,
    comisionBp: aj.comisionBp,
  });
  return { ...r, modo: aj.modoReparto, comisionBp: aj.comisionBp, caja };
}
