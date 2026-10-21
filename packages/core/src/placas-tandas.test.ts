import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bdDeTest, vaciar } from "./testing";
import type { DB } from "./db/client";
import {
  altaSocio, asignarPlaca, codigosDeTanda, crearComercio, crearProducto, crearTanda, escanearPlaca, importarCodigos, listarTandas,
  marcarCobrada, marcarNfc, normalizarCodigo, placasPanel, registrarVenta, type Socio,
} from "./index";

let db: DB;
let cerrar: () => Promise<void>;
let ana: Socio, bea: Socio;
beforeAll(async () => ({ db, cerrar } = await bdDeTest()));
afterAll(() => cerrar());
beforeEach(async () => {
  await vaciar(db);
  ana = await altaSocio(db, { telegramId: 1, nombre: "Ana" }, null);
  bea = await altaSocio(db, { telegramId: 2, nombre: "Bea" }, ana.id);
});

describe("lotes de placas", () => {
  it("reserva N códigos válidos y únicos; quedan sin asignar («aún no activada»)", async () => {
    const { tanda, codigos } = await crearTanda(db, 25, ana.id, "Primera impresión");
    expect(codigos).toHaveLength(25);
    expect(new Set(codigos).size).toBe(25);
    for (const c of codigos) expect(normalizarCodigo(c)).toBe(c);
    expect(await codigosDeTanda(db, tanda.id)).toEqual(codigos);
    expect(await escanearPlaca(db, codigos[0]!)).toEqual({ motivo: "sin_asignar" });
    const [t] = await listarTandas(db);
    expect(t).toMatchObject({ n: 25, nota: "Primera impresión", creadoPor: "Ana", asignadas: 0 });
    // Asignar una placa reservada la deja en el mismo lote
    const c = await crearComercio(db, { nombre: "Bar" }, ana.id);
    await asignarPlaca(db, codigos[0]!, c.id, bea.id);
    expect((await listarTandas(db))[0]!.asignadas).toBe(1);
    expect((await placasPanel(db)).find((p) => p.codigo === codigos[0])).toMatchObject({ comercio: "Bar", tandaId: tanda.id });
  });
  it("límites y errores", async () => {
    await expect(crearTanda(db, 0, ana.id)).rejects.toThrow(/1 a 200/);
    await expect(crearTanda(db, 201, ana.id)).rejects.toThrow(/1 a 200/);
    await expect(codigosDeTanda(db, 999)).rejects.toThrow(/no existe/);
  });
  it("importa códigos impresos fuera (ignora los no válidos y no duplica)", async () => {
    const { codigos } = await crearTanda(db, 1, ana.id);
    const r = await importarCodigos(db, ["m4psn", "GNDAT", "P3MCS", "ZZZZZ", codigos[0]!], ana.id);
    expect(r.codigos.sort()).toEqual(["GNDAT", "M4PSN", "P3MCS", codigos[0]!].sort());
    expect((await placasPanel(db)).length).toBe(4);
  });
  it("marca la pegatina como grabada / bloqueada", async () => {
    const { codigos } = await crearTanda(db, 1, ana.id);
    await marcarNfc(db, codigos[0]!, false, bea.id);
    let [p] = await placasPanel(db);
    expect(p!.nfcGrabadaAt).not.toBeNull();
    expect(p!.nfcBloqueadaAt).toBeNull();
    await marcarNfc(db, codigos[0]!, true, bea.id);
    [p] = await placasPanel(db);
    expect(p!.nfcBloqueadaAt).not.toBeNull();
  });
});

describe("permisos de cobro", () => {
  it("un socio solo cobra sus ventas; un admin, todas", async () => {
    const p = await crearProducto(db, "Panel", 2000, ana.id);
    const c = await crearComercio(db, { nombre: "X" }, ana.id);
    const deAna = await registrarVenta(db, { comercioId: c.id, producto: p, uds: 1, cobrada: false }, ana.id);
    const deBea = await registrarVenta(db, { comercioId: c.id, producto: p, uds: 1, cobrada: false }, bea.id);
    await expect(marcarCobrada(db, deAna.venta.id, null, bea.id, "panel", false)).rejects.toThrow(/Solo quien hizo la venta/);
    await marcarCobrada(db, deBea.venta.id, null, bea.id, "panel", false);
    await marcarCobrada(db, deAna.venta.id, null, ana.id, "panel", true);
  });
});
