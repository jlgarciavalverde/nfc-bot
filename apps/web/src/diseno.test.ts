import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { codigoValido } from "./lib/nfc";

// Guardarraíl del diseño «la marca de la placa» (docs/diseno.md): sin colores sueltos ni los tics de diseño generado.
const RAIZ = join(__dirname);
function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? archivos(p) : /\.tsx$/.test(f) && !f.includes(".test.") ? [p] : [];
  });
}
const fuentes = archivos(RAIZ).map((p) => ({ p: p.slice(RAIZ.length + 1), s: readFileSync(p, "utf8") }));

describe("diseño", () => {
  it("sin colores hex sueltos fuera de los tokens (salvo el mapa, que pinta en SVG)", () => {
    const malos = fuentes.filter((f) => !f.p.includes("MapaComercios") && /["'`\s]#[0-9a-fA-F]{3,8}\b/.test(f.s.replace(/%23[0-9a-fA-F]{6}/g, "")));
    expect(malos.map((f) => f.p)).toEqual([]);
  });
  it("sin degradados decorativos ni sombras en tarjetas (solo en capas flotantes)", () => {
    expect(fuentes.filter((f) => /bg-gradient|bg-linear-|from-\w+-\d/.test(f.s)).map((f) => f.p)).toEqual([]);
    const sombras = fuentes.filter((f) => /\bshadow-(sm|md|lg|xl)\b/.test(f.s) && !/Hoja|Buscador|acciones|Campos|Marco/.test(f.p));
    expect(sombras.map((f) => f.p)).toEqual([]);
  });
  it("sin flechas en el texto de los botones ni separadores «A · B · C»", () => {
    expect(fuentes.filter((f) => />[^<{]*→[^<{]*</.test(f.s)).map((f) => f.p)).toEqual([]);
    expect(fuentes.filter((f) => />[^<{]*\s·\s[^<{]*\s·\s/.test(f.s)).map((f) => f.p)).toEqual([]);
  });
  it("sin sobretítulos en mayúsculas", () => {
    expect(fuentes.filter((f) => /(?<!first-letter:)\buppercase\b/.test(f.s) && !/Placa|Galeria|App\.tsx/.test(f.p)).map((f) => f.p)).toEqual([]);
  });
});

describe("código de placa (mismo cálculo que el servidor)", () => {
  it("valida el carácter de control", () => {
    for (const c of ["M4PSN", "GNDAT", "P3MCS"]) expect(codigoValido(c)).toBe(c);
    expect(codigoValido("m4p-sn")).toBe("M4PSN");
    expect(codigoValido("M4PSM")).toBeNull();
    expect(codigoValido("M4PS0")).toBeNull();
  });
});
