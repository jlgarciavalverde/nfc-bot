import { describe, expect, it } from "vitest";
import { calcularPrecio, type OfertaPrecio } from "./precios";
import { calcularReparto, repartirProporcional } from "./reparto";
import { extraerFecha, sumarMeses } from "./fechas";
import { euros, normalizar, parseEuros, parsePorcentaje } from "./texto";

const of = (o: Partial<OfertaPrecio> & Pick<OfertaPrecio, "tipo" | "n">): OfertaPrecio => ({
  id: 1, nombre: "o", m: null, precioCent: null, descuentoBp: null, desde: null, hasta: null, activa: true, ...o,
});

describe("calcularPrecio", () => {
  const tramos = [
    { desdeUds: 5, precioCent: 2000, descuentoBp: null },
    { desdeUds: 10, precioCent: null, descuentoBp: 3000 },
  ];
  it("precio de lista sin tramos", () => {
    const p = calcularPrecio(3, 2500, [], [], "2026-10-21");
    expect(p).toMatchObject({ totalCent: 7500, listaCent: 7500, ahorroCent: 0, aplicado: "Precio de lista" });
  });
  it("tramo por precio fijo y por descuento", () => {
    expect(calcularPrecio(5, 2500, tramos, [], "2026-10-21").totalCent).toBe(10_000);
    expect(calcularPrecio(12, 2500, tramos, [], "2026-10-21")).toMatchObject({ totalCent: 12 * 1750, ahorroCent: 12 * 750 });
  });
  it("3x2 con sueltas al precio del tramo", () => {
    const p = calcularPrecio(7, 2500, tramos, [of({ tipo: "nxm", n: 3, m: 2, nombre: "3x2" })], "2026-10-21");
    // 2 grupos → 4 pagadas + 1 suelta = 5 × 20 € (tramo de 5) = 100 € < 7 × 20 € = 140 €
    expect(p.totalCent).toBe(10_000);
    expect(p.aplicado).toContain("3x2");
  });
  it("pack y descuento: gana el más barato y no se acumulan", () => {
    const os = [of({ id: 1, tipo: "pack", n: 5, precioCent: 9000, nombre: "pack5" }), of({ id: 2, tipo: "descuento", n: 5, descuentoBp: 1500, nombre: "-15" })];
    // 5 uds: tramo 100 €, pack 90 €, -15 % sobre tramo 85 €
    expect(calcularPrecio(5, 2500, tramos, os, "2026-10-21")).toMatchObject({ totalCent: 8500, ofertaId: 2 });
  });
  it("ignora ofertas caducadas, futuras e inactivas y las que no llegan al mínimo", () => {
    const os = [
      of({ tipo: "pack", n: 2, precioCent: 100, hasta: "2026-10-20" }),
      of({ tipo: "pack", n: 2, precioCent: 100, desde: "2026-10-22" }),
      of({ tipo: "pack", n: 2, precioCent: 100, activa: false }),
      of({ tipo: "pack", n: 4, precioCent: 100 }),
    ];
    expect(calcularPrecio(3, 2500, [], os, "2026-10-21").totalCent).toBe(7500);
  });
  it("en empate se queda el tramo", () => {
    const p = calcularPrecio(5, 2500, tramos, [of({ tipo: "pack", n: 5, precioCent: 10_000 })], "2026-10-21");
    expect(p.ofertaId).toBeNull();
  });
  it("rechaza unidades no válidas", () => {
    expect(() => calcularPrecio(0, 2500, [], [], "2026-10-21")).toThrow();
    expect(() => calcularPrecio(1.5, 2500, [], [], "2026-10-21")).toThrow();
  });
});

describe("reparto", () => {
  const socios = [{ id: 1, nombre: "Ana", pctReparto: 5000 }, { id: 2, nombre: "Bea", pctReparto: 3000 }, { id: 3, nombre: "Carlos", pctReparto: 2000 }];
  const base = { socios, aportadoCent: { 1: 10_000, 2: 10_000, 3: 0 }, retiradoCent: { 2: 1000 }, vendidoCobradoCent: { 1: 20_000 }, beneficioCent: 10_000, comisionBp: 0 };
  it("el mayor resto cuadra al céntimo", () => {
    expect(repartirProporcional(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(repartirProporcional(-100, [1, 1, 1])).toEqual([-34, -33, -33]);
    expect(repartirProporcional(100, [0, 0])).toEqual([0, 0]);
  });
  it("a partes iguales con comisión", () => {
    const r = calcularReparto({ ...base, modo: "igual", comisionBp: 1000 });
    expect(r.repartibleCent).toBe(8000);
    expect(r.lineas.map((l) => l.comisionCent)).toEqual([2000, 0, 0]);
    expect(r.lineas.reduce((a, l) => a + l.parteCent, 0)).toBe(8000);
    expect(r.lineas[1]!.saldoCent).toBe(10_000 + r.lineas[1]!.parteCent - 1000);
  });
  it("por porcentaje y aviso si no suman 100", () => {
    expect(calcularReparto({ ...base, modo: "porcentaje" }).lineas.map((l) => l.parteCent)).toEqual([5000, 3000, 2000]);
    const mal = calcularReparto({ ...base, socios: socios.map((s) => ({ ...s, pctReparto: 1000 })), modo: "porcentaje" });
    expect(mal.modoAplicado).toBe("igual");
    expect(mal.avisos[0]).toContain("30 %");
  });
  it("por lo aportado", () => {
    expect(calcularReparto({ ...base, modo: "aportado" }).lineas.map((l) => l.parteCent)).toEqual([5000, 5000, 0]);
  });
});

describe("texto y fechas", () => {
  it("importes", () => {
    expect(parseEuros("50")).toBe(5000);
    expect(parseEuros("12,50€")).toBe(1250);
    expect(parseEuros("12.5 €")).toBe(1250);
    expect(parseEuros("1.200")).toBe(120_000);
    expect(parseEuros("1.200,50")).toBe(120_050);
    expect(parseEuros("0")).toBeNull();
    expect(parseEuros("abc")).toBeNull();
    expect(parsePorcentaje("-15%")).toBe(1500);
    expect(parsePorcentaje("150%")).toBeNull();
    expect(euros(123456)).toBe("1234,56 €");
  });
  it("normalizar", () => {
    expect(normalizar("  Panadería  López!! ")).toBe("panaderia lopez");
  });
  it("fechas en texto libre", () => {
    const b = "2026-10-21"; // miércoles
    expect(extraerFecha("volver en 2 semanas, le interesa", b)).toEqual({ fecha: "2026-11-04", resto: ", le interesa" });
    expect(extraerFecha("Pasar MAÑANA por la tarde", b)).toEqual({ fecha: "2026-10-22", resto: "por la tarde" });
    expect(extraerFecha("el lunes", b)?.fecha).toBe("2026-10-26");
    expect(extraerFecha("el miércoles", b)?.fecha).toBe("2026-10-28");
    expect(extraerFecha("el 5/1", b)?.fecha).toBe("2027-01-05");
    expect(extraerFecha("en un mes", b)?.fecha).toBe("2026-11-21");
    expect(extraerFecha("nada de fechas", b)).toBeNull();
    expect(sumarMeses("2026-01-31", 1)).toBe("2026-02-28");
  });
});
