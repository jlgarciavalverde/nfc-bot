import { describe, expect, it } from "vitest";
import { crearGemini } from "./gemini";

const ctx = { hoy: "2026-10-21", comercios: ["Bar Pepe"], productos: ["Panel NFC"], socio: "Ana" };
const ok = (json: unknown) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] } }] }), { status: 200 });

describe("crearGemini", () => {
  it("si el primer modelo está saturado, usa el siguiente", async () => {
    const pedidos: string[] = [];
    const g = crearGemini({
      apiKey: "k",
      models: ["a", "b"],
      fetchImpl: (async (url: string) => {
        pedidos.push(url);
        return url.includes("/a:") ? new Response("{}", { status: 503 }) : ok({ accion: "caja" });
      }) as typeof fetch,
    });
    expect(await g.interpretar("¿cómo va la caja?", ctx)).toEqual({ ok: true, accion: { t: "caja" } });
    expect(pedidos).toHaveLength(2);
  });
  it("si todos están saturados, lo dice; el límite diario no se reintenta", async () => {
    let n = 0;
    const sat = crearGemini({ apiKey: "k", models: ["a", "b"], fetchImpl: (async () => (n++, new Response("{}", { status: 503 }))) as typeof fetch });
    await expect(sat.interpretar("x", ctx)).rejects.toThrow(/saturada/);
    expect(n).toBe(2);
    n = 0;
    const cupo = crearGemini({ apiKey: "k", models: ["a", "b"], fetchImpl: (async () => (n++, new Response("{}", { status: 429 }))) as typeof fetch });
    await expect(cupo.interpretar("x", ctx)).rejects.toThrow(/límite/);
    expect(n).toBe(1);
  });
});
