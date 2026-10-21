import { describe, expect, it } from "vitest";
import { altoTeclado } from "./teclado";

describe("altoTeclado", () => {
  const base = { alto: 667, vvAlto: 667, vvArriba: 0, altoBase: 667, escribiendo: true };
  it("sin teclado", () => expect(altoTeclado(base)).toEqual({ tapado: 0, abierto: false }));
  it("iOS: el visual viewport encoge y el layout no", () => expect(altoTeclado({ ...base, vvAlto: 380 })).toEqual({ tapado: 287, abierto: true }));
  it("iOS con la página desplazada", () => expect(altoTeclado({ ...base, vvAlto: 380, vvArriba: 40 })).toEqual({ tapado: 247, abierto: true }));
  it("Android con resizes-content: encoge la ventana, nada que compensar", () => expect(altoTeclado({ ...base, alto: 380, vvAlto: 380 })).toEqual({ tapado: 0, abierto: true }));
  it("la barra del navegador que aparece no es un teclado", () => expect(altoTeclado({ ...base, alto: 610, vvAlto: 610 })).toEqual({ tapado: 0, abierto: false }));
  it("sin un campo enfocado no cuenta como teclado", () => expect(altoTeclado({ ...base, vvAlto: 380, escribiendo: false }).abierto).toBe(false));
});
