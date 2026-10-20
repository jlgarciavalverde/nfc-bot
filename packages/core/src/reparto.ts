import type { ModoReparto } from "./servicios/ajustes";

export interface EntradaReparto {
  socios: { id: number; nombre: string; pctReparto: number }[];
  aportadoCent: Record<number, number>;
  retiradoCent: Record<number, number>;
  /** Total de ventas cobradas por cada vendedor (base de la comisión). */
  vendidoCobradoCent: Record<number, number>;
  beneficioCent: number;
  modo: ModoReparto;
  comisionBp: number;
}

export interface LineaReparto {
  socioId: number;
  nombre: string;
  aportadoCent: number;
  comisionCent: number;
  parteCent: number;
  retiradoCent: number;
  /** Lo que le correspondería si se liquidase hoy: aportado + comisión + parte − retirado. */
  saldoCent: number;
  pesoBp: number;
}

/** Reparte `total` en proporción a `pesos` con el método del mayor resto: la suma cuadra al céntimo. */
export function repartirProporcional(total: number, pesos: number[]) {
  const suma = pesos.reduce((a, b) => a + b, 0);
  if (!suma) return pesos.map(() => 0);
  const signo = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  const exactos = pesos.map((p) => (abs * p) / suma);
  const base = exactos.map(Math.floor);
  let resto = abs - base.reduce((a, b) => a + b, 0);
  const orden = exactos.map((e, i) => ({ i, r: e - Math.floor(e) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of orden) {
    if (resto <= 0) break;
    base[i]! += 1;
    resto--;
  }
  return base.map((b) => b * signo);
}

/**
 * Reparto del beneficio entre socios. Primero sale la comisión de cada vendedor; lo que queda (que puede ser negativo:
 * pérdidas) se reparte a partes iguales, por porcentaje fijo o en proporción a lo aportado.
 */
export function calcularReparto(e: EntradaReparto) {
  const avisos: string[] = [];
  const comisiones = e.socios.map((s) => Math.round(((e.vendidoCobradoCent[s.id] ?? 0) * e.comisionBp) / 10_000));
  const repartible = e.beneficioCent - comisiones.reduce((a, b) => a + b, 0);
  let modo = e.modo;
  let pesos: number[];
  if (modo === "porcentaje") {
    pesos = e.socios.map((s) => s.pctReparto);
    const suma = pesos.reduce((a, b) => a + b, 0);
    if (suma !== 10_000) {
      avisos.push(`Los porcentajes suman ${suma / 100} % en vez de 100 %: reparto a partes iguales hasta que se corrijan (/config porcentaje).`);
      modo = "igual";
    }
  }
  if (modo === "aportado") {
    pesos = e.socios.map((s) => e.aportadoCent[s.id] ?? 0);
    if (!pesos.some(Boolean)) {
      avisos.push("Nadie ha aportado dinero todavía: reparto a partes iguales.");
      modo = "igual";
    }
  }
  if (modo === "igual") pesos = e.socios.map(() => 1);
  const partes = repartirProporcional(repartible, pesos!);
  const sumaPesos = pesos!.reduce((a, b) => a + b, 0) || 1;
  const lineas: LineaReparto[] = e.socios.map((s, i) => {
    const aportado = e.aportadoCent[s.id] ?? 0;
    const retirado = e.retiradoCent[s.id] ?? 0;
    return {
      socioId: s.id,
      nombre: s.nombre,
      aportadoCent: aportado,
      comisionCent: comisiones[i]!,
      parteCent: partes[i]!,
      retiradoCent: retirado,
      saldoCent: aportado + comisiones[i]! + partes[i]! - retirado,
      pesoBp: Math.round((pesos![i]! * 10_000) / sumaPesos),
    };
  });
  return { modoAplicado: modo, repartibleCent: repartible, lineas, avisos };
}
