import { describe, expect, it } from "vitest";
import { aplicarEstilo, ejemploEstilo, frase, TONOS, type Tono } from "./estilo";

describe("estilo", () => {
  it("sin emojis: quita los emojis sin tocar el HTML, las cifras ni los signos", () => {
    const t = "⭐ Venta <b>#12</b> a Bar Pepe: 3 uds, 54,00 €\n✅ Cobrada ⏳\n👨‍👩‍👧 familia ✖ Cancelar\n＋10,00 € · 1/2";
    expect(aplicarEstilo(t, { emojis: false })).toBe("Venta <b>#12</b> a Bar Pepe: 3 uds, 54,00 €\nCobrada\nfamilia Cancelar\n＋10,00 € · 1/2");
    expect(aplicarEstilo(t, { emojis: true })).toBe(t);
  });
  it("todas las frases existen en los tres tonos y {bot} usa el nombre del asistente", () => {
    for (const tono of Object.keys(TONOS) as Tono[]) {
      expect(frase({ tono, emojis: true, nombreAsistente: "Billetes" }, "saludo", { nombre: "Ana" })).toMatch(/Ana.*Billetes/);
      expect(frase({ tono, emojis: true, nombreAsistente: null }, "confirmar")).toMatch(/\?/);
    }
    expect(frase({ tono: "serio", emojis: true, nombreAsistente: null }, "saludo", { nombre: "Ana" })).toBe("Hola, Ana. Soy el asistente del negocio.");
  });
  it("la vista previa cambia con el tono y los emojis", () => {
    const base = { tono: "cercano" as Tono, emojis: true, nombreAsistente: "Billetes" };
    expect(ejemploEstilo(base)).not.toBe(ejemploEstilo({ ...base, tono: "gracioso" }));
    expect(ejemploEstilo({ ...base, emojis: false })).not.toMatch(/⭐|✅/);
  });
});
