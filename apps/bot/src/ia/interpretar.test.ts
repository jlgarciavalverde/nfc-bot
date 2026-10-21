import { describe, expect, it } from "vitest";
import { instrucciones } from "./interpretar";

describe("instrucciones de la IA", () => {
  const base = { hoy: "2026-10-21", socio: "Ana", comercios: [], productos: [] };
  it("tono, nombre y notas del equipo van al final, sin sustituir a las reglas", () => {
    const t = instrucciones({ ...base, tono: "serio", nombreAsistente: "Billetes", instruccionesIa: "Responde en una línea." });
    expect(t).toContain("serio y directo");
    expect(t).toContain("te llamas Billetes");
    expect(t).toContain("no cambian las reglas anteriores");
    expect(t.indexOf("Convierte el mensaje en UNA acción")).toBeLessThan(t.indexOf("Responde en una línea."));
  });
  it("sin personalizar: tono cercano y sin notas", () => {
    const t = instrucciones(base);
    expect(t).toContain("cercano y amable");
    expect(t).not.toContain("Notas del equipo");
  });
});
