import { describe, expect, it } from "vitest";
import { parseComando, parseMes } from "./comandos";

const H = "2026-10-21";
const p = (cmd: string, args: string) => parseComando(cmd, args, H);

describe("parseComando", () => {
  it("visita con resultado, nota y fecha", () => {
    expect(p("visita", "Bar Pepe no muy caro")).toEqual({ t: "visita", comercio: "Bar Pepe", resultado: "no", nota: "muy caro", proxima: undefined });
    expect(p("visita", "Panadería López luego volver en 2 semanas que está el dueño")).toMatchObject({ comercio: "Panadería López", resultado: "luego", proxima: "2026-11-04", nota: "que está el dueño" });
    expect(p("visita", "Bar Pepe | Sí | le encanta")).toMatchObject({ comercio: "Bar Pepe", resultado: "si", nota: "le encanta" });
    // «no» como primera palabra del nombre no cuenta como resultado
    expect(p("visita", "No Name Bar si")).toMatchObject({ comercio: "No Name Bar", resultado: "si" });
    expect(() => p("visita", "Bar Pepe")).toThrow(/Así/);
  });
  it("venta: unidades, cobro, método, precio pactado y nota", () => {
    expect(p("venta", "Bar Pepe 3 pagado bizum")).toEqual({ t: "venta", comercio: "Bar Pepe", uds: 3, cobrada: true, metodo: "bizum", pactadoCent: undefined, nota: undefined });
    expect(p("venta", "Bar Pepe 3 uds")).toMatchObject({ uds: 3, cobrada: false });
    expect(p("venta", "Bar Pepe 5 por 90€ efectivo regalo llavero")).toMatchObject({ uds: 5, pactadoCent: 9000, cobrada: true, metodo: "efectivo", nota: "regalo llavero" });
    expect(p("venta", "Bar Pepe 2 pendiente")).toMatchObject({ cobrada: false });
    expect(p("venta", "100 Montaditos 2 pagado")).toMatchObject({ comercio: "100 Montaditos", uds: 2 });
    expect(() => p("venta", "Bar Pepe")).toThrow();
  });
  it("caja", () => {
    expect(p("aporto", "50 primera compra")).toEqual({ t: "movimiento", tipo: "aportacion", cent: 5000, nota: "primera compra" });
    expect(p("gasto", "30,50 € imprenta tarjetas")).toMatchObject({ tipo: "gasto", cent: 3050, categoria: "imprenta", nota: "imprenta tarjetas" });
    expect(p("gasto", "gasolina 20€")).toMatchObject({ cent: 2000, categoria: "gasolina" });
    expect(p("retiro", "100")).toMatchObject({ tipo: "retirada", cent: 10_000 });
    expect(() => p("gasto", "imprenta")).toThrow();
  });
  it("compra, cobrado, recordar", () => {
    expect(p("compra", "50 uds 180€ AliExpress")).toEqual({ t: "compra", uds: 50, cent: 18_000, proveedor: "AliExpress" });
    expect(p("compra", "50 por 180 € a Temu")).toMatchObject({ uds: 50, cent: 18_000, proveedor: "Temu" });
    expect(p("cobrado", "#12 bizum")).toEqual({ t: "cobrado", ventaId: 12, metodo: "bizum" });
    expect(p("recordar", "Bar Pepe el lunes | llamar al dueño")).toMatchObject({ comercio: "Bar Pepe", fecha: "2026-10-26", nota: "llamar al dueño" });
  });
  it("admin: producto, tramo, oferta, config", () => {
    expect(p("producto", "nuevo Panel NFC 25€")).toEqual({ t: "producto", nombre: "Panel NFC", cent: 2500, nuevo: true });
    expect(p("producto", "Panel NFC 22 €")).toMatchObject({ nombre: "Panel NFC", cent: 2200, nuevo: false });
    expect(p("tramo", "5 20€")).toMatchObject({ desde: 5, cent: 2000 });
    expect(p("tramo", "10 uds -25%")).toMatchObject({ desde: 10, descuentoBp: 2500 });
    expect(p("tramo", "borrar 5")).toMatchObject({ desde: 5, borrar: true });
    expect(p("oferta", "3x2")).toMatchObject({ tipo: "nxm", n: 3, m: 2 });
    expect(p("oferta", "pack 5 99€ hasta 31/12")).toMatchObject({ tipo: "pack", n: 5, cent: 9900, hasta: "2026-12-31" });
    expect(p("oferta", "-10% desde 20")).toMatchObject({ tipo: "descuento", n: 20, descuentoBp: 1000 });
    expect(p("oferta", "quitar 3")).toEqual({ t: "quitarOferta", id: 3 });
    expect(p("config", "porcentaje Ana María 50%")).toEqual({ t: "config", clave: "porcentaje", socio: "Ana María", valor: "50%" });
    expect(() => p("config", "nada 1")).toThrow();
  });
  it("comando desconocido → null", () => {
    expect(p("loquesea", "")).toBeNull();
  });
  it("parseMes", () => {
    expect(parseMes("", H)).toBe("2026-10");
    expect(parseMes("septiembre", H)).toBe("2026-09");
    expect(parseMes("diciembre", H)).toBe("2025-12");
    expect(parseMes("2026-03", H)).toBe("2026-03");
    expect(parseMes("marte", H)).toBeNull();
  });
});
