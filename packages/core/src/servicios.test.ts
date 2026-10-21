import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { bdDeTest, vaciar } from "./testing";
import type { DB } from "./db/client";
import { comercios, lotes, movimientos, recordatorios, ventas } from "./db/schema";
import {
  altaSocio, apuntarMovimiento, comprarLote, crearComercio, crearOferta, crearProducto, deshacerUltima, embudo, estadoStock,
  guardarTramo, marcarCobrada, recordatoriosPendientes, registrarVenta, registrarVisita, reparto, resumenCaja, buscarComercio,
  guardarAjuste, resumenPeriodo, ErrorNegocio, asignarPlaca, quitarPlaca, escanearPlaca, infoPlaca, listarPlacas, cambiarDatoComercio,
  caracterControl, normalizarCodigo, fichaComercio, type Socio, type Producto,
} from "./index";

let db: DB;
let cerrar: () => Promise<void>;
let ana: Socio, bea: Socio, panel: Producto;

beforeAll(async () => ({ db, cerrar } = await bdDeTest()));
afterAll(() => cerrar());
beforeEach(async () => {
  await vaciar(db);
  ana = await altaSocio(db, { telegramId: 1, nombre: "Ana" }, null);
  bea = await altaSocio(db, { telegramId: 2, nombre: "Bea" }, ana.id);
  panel = await crearProducto(db, "Panel NFC", 2500, ana.id);
});

describe("socios", () => {
  it("el primero es admin y el resto socio", () => {
    expect(ana.rol).toBe("admin");
    expect(bea.rol).toBe("socio");
  });
});

describe("comercios y visitas", () => {
  it("busca sin tildes y por trozo; no duplica", async () => {
    await crearComercio(db, { nombre: "Panadería López" }, ana.id);
    await crearComercio(db, { nombre: "Bar Pepe" }, ana.id);
    expect((await buscarComercio(db, "panaderia lopez")).unico?.nombre).toBe("Panadería López");
    expect((await buscarComercio(db, "pepe")).unico?.nombre).toBe("Bar Pepe");
    expect((await buscarComercio(db, "a")).unico).toBeNull();
    await expect(crearComercio(db, { nombre: "bar PEPE" }, ana.id)).rejects.toThrow(ErrorNegocio);
  });
  it("visita «luego» deja interesado y recordatorio a 14 días; deshacer lo revierte", async () => {
    const c = await crearComercio(db, { nombre: "Bar Pepe" }, ana.id);
    const r = await registrarVisita(db, { comercioId: c.id, resultado: "luego", nota: "vuelve el dueño", fecha: "2026-10-21" }, bea.id);
    expect(r.comercio.estado).toBe("interesado");
    expect(r.proxima).toBe("2026-11-04");
    expect(await recordatoriosPendientes(db, "2026-11-04", bea.id)).toHaveLength(1);
    expect(await recordatoriosPendientes(db, "2026-11-03")).toHaveLength(0);
    const [cc] = await db.select().from(comercios).where(eq(comercios.id, c.id));
    expect(cc!.responsableId).toBe(bea.id);

    await deshacerUltima(db, bea.id);
    const [d] = await db.select().from(comercios).where(eq(comercios.id, c.id));
    expect(d).toMatchObject({ estado: "pendiente", responsableId: null });
    expect(await recordatoriosPendientes(db, "2026-12-31")).toHaveLength(0);
  });
  it("una visita nueva sustituye el recordatorio anterior; «no» guarda el motivo", async () => {
    const c = await crearComercio(db, { nombre: "Bar Pepe" }, ana.id);
    await registrarVisita(db, { comercioId: c.id, resultado: "luego", fecha: "2026-10-21" }, ana.id);
    await registrarVisita(db, { comercioId: c.id, resultado: "no", nota: "caro", fecha: "2026-10-22" }, ana.id);
    const [d] = await db.select().from(comercios).where(eq(comercios.id, c.id));
    expect(d).toMatchObject({ estado: "no", motivoNo: "caro" });
    expect(await recordatoriosPendientes(db, "2026-12-31")).toHaveLength(0);
    // deshacer el «no» reabre el recordatorio
    await deshacerUltima(db, ana.id);
    expect(await recordatoriosPendientes(db, "2026-12-31")).toHaveLength(1);
  });
  it("embudo y conversión", async () => {
    const a = await crearComercio(db, { nombre: "A" }, ana.id);
    const b = await crearComercio(db, { nombre: "B" }, ana.id);
    await crearComercio(db, { nombre: "C" }, ana.id);
    await registrarVisita(db, { comercioId: a.id, resultado: "no" }, ana.id);
    await registrarVenta(db, { comercioId: b.id, producto: panel, uds: 1, cobrada: true }, bea.id);
    const e = await embudo(db);
    expect(e.total).toMatchObject({ pendiente: 1, no: 1, cliente: 1 });
    expect(e.conversionBp).toBe(5000);
    expect(e.porSocio.find((s) => s.socio === "Bea")?.cliente).toBe(1);
  });
});

describe("ventas, stock y caja", () => {
  it("sin stock registrado no se controla; con stock descuenta FIFO y calcula margen", async () => {
    const c = await crearComercio(db, { nombre: "Bar Pepe" }, ana.id);
    const sin = await registrarVenta(db, { comercioId: c.id, producto: panel, uds: 2, cobrada: true }, ana.id);
    expect(sin.venta.costeCent).toBeNull();

    await comprarLote(db, { producto: panel, uds: 2, costeCent: 1000, fecha: "2026-10-01" }, ana.id); // 5 €/ud
    await comprarLote(db, { producto: panel, uds: 10, costeCent: 8000, fecha: "2026-10-05" }, ana.id); // 8 €/ud
    const v = await registrarVenta(db, { comercioId: c.id, producto: panel, uds: 3, cobrada: false }, ana.id);
    expect(v.venta.costeCent).toBe(1000 + 800);
    expect((await estadoStock(db))[0]).toMatchObject({ uds: 9, valorCent: 7200 });
    await expect(registrarVenta(db, { comercioId: c.id, producto: panel, uds: 10, cobrada: true }, ana.id)).rejects.toThrow(/Solo quedan 9/);

    const caja = await resumenCaja(db);
    expect(caja).toMatchObject({ ingresosCent: 5000, gastosCent: 9000, pendienteCobroCent: 7500, ventas: 2, uds: 5, valorStockCent: 7200 });
    expect(caja.margenCent).toBe(7500 - 1800);

    await marcarCobrada(db, v.venta.id, "bizum", bea.id);
    expect((await resumenCaja(db)).ingresosCent).toBe(12_500);
    await expect(marcarCobrada(db, v.venta.id, null, bea.id)).rejects.toThrow(/ya estaba cobrada/);
  });
  it("aplica tramos/ofertas y respeta el precio pactado", async () => {
    await guardarTramo(db, panel.id, 5, { precioCent: 2000 }, ana.id);
    await crearOferta(db, panel.id, { nombre: "3x2", tipo: "nxm", n: 3, m: 2, precioCent: null, descuentoBp: null, desde: null, hasta: null }, ana.id);
    const c = await crearComercio(db, { nombre: "X" }, ana.id);
    const v = await registrarVenta(db, { comercioId: c.id, producto: panel, uds: 3, cobrada: true }, ana.id);
    expect(v.venta).toMatchObject({ totalCent: 5000, precioListaCent: 7500 });
    const p = await registrarVenta(db, { comercioId: c.id, producto: panel, uds: 3, totalPactadoCent: 6000, cobrada: true }, ana.id);
    expect(p.venta).toMatchObject({ totalCent: 6000, aplicado: "Precio pactado" });
  });
  it("deshacer una venta devuelve el stock, anula el ingreso y el estado del comercio", async () => {
    await comprarLote(db, { producto: panel, uds: 5, costeCent: 2500 }, ana.id);
    const c = await crearComercio(db, { nombre: "Bar Pepe" }, ana.id);
    await registrarVisita(db, { comercioId: c.id, resultado: "si" }, ana.id);
    await registrarVenta(db, { comercioId: c.id, producto: panel, uds: 2, cobrada: true }, ana.id);
    await deshacerUltima(db, ana.id);
    const [l] = await db.select().from(lotes);
    expect(l!.udsRestantes).toBe(5);
    expect(await db.select().from(movimientos).where(and(eq(movimientos.tipo, "ingreso"), isNull(movimientos.anuladoAt)))).toHaveLength(0);
    expect((await db.select().from(comercios))[0]!.estado).toBe("si");
    expect((await db.select().from(ventas))[0]!.anuladoAt).not.toBeNull();
    // compra de lote ya consumido: no se deshace
    await comprarLote(db, { producto: panel, uds: 5, costeCent: 2500 }, bea.id);
    await registrarVenta(db, { comercioId: c.id, producto: panel, uds: 6, cobrada: true }, ana.id);
    await expect(deshacerUltima(db, bea.id)).rejects.toThrow(/Ya se han vendido/);
  });
  it("solo se deshace lo propio y de los últimos 10 minutos", async () => {
    await apuntarMovimiento(db, { tipo: "aportacion", importeCent: 5000, socioId: ana.id }, ana.id);
    await expect(deshacerUltima(db, bea.id)).rejects.toThrow(/nada que deshacer/);
    await expect(deshacerUltima(db, ana.id, new Date(Date.now() + 11 * 60_000))).rejects.toThrow(/nada que deshacer/);
    await deshacerUltima(db, ana.id);
    expect((await resumenCaja(db)).aportadoCent).toBe(0);
  });
  it("reparto con aportaciones, comisión y retiradas", async () => {
    await guardarAjuste(db, "comisionBp", 1000);
    await guardarAjuste(db, "modoReparto", "aportado");
    await apuntarMovimiento(db, { tipo: "aportacion", importeCent: 30_000, socioId: ana.id }, ana.id);
    await apuntarMovimiento(db, { tipo: "aportacion", importeCent: 10_000, socioId: bea.id }, bea.id);
    await apuntarMovimiento(db, { tipo: "gasto", importeCent: 2000, socioId: ana.id, categoria: "imprenta" }, ana.id);
    const c = await crearComercio(db, { nombre: "X" }, ana.id);
    await registrarVenta(db, { comercioId: c.id, producto: panel, uds: 4, cobrada: true }, bea.id); // 100 €
    await apuntarMovimiento(db, { tipo: "retirada", importeCent: 1000, socioId: bea.id }, bea.id);
    const r = await reparto(db);
    expect(r.caja.beneficioCent).toBe(8000);
    expect(r.repartibleCent).toBe(7000); // 80 € − 10 € de comisión de Bea
    const [la, lb] = r.lineas;
    expect(la).toMatchObject({ comisionCent: 0, parteCent: 5250, saldoCent: 35_250 });
    expect(lb).toMatchObject({ comisionCent: 1000, parteCent: 1750, retiradoCent: 1000, saldoCent: 11_750 });
    expect(r.caja.cajaCent).toBe(la!.saldoCent + lb!.saldoCent);
  });
  it("resumen de un periodo", async () => {
    const c = await crearComercio(db, { nombre: "X" }, ana.id);
    await registrarVisita(db, { comercioId: c.id, resultado: "si", fecha: "2026-10-20" }, ana.id);
    await registrarVenta(db, { comercioId: c.id, producto: panel, uds: 2, cobrada: true, fecha: "2026-10-21" }, bea.id);
    const r = await resumenPeriodo(db, "2026-10-19", "2026-10-25");
    expect(r).toMatchObject({ visitas: 1, ventas: 1, uds: 2, vendidoCent: 5000 });
    expect(r.ranking[0]).toMatchObject({ socio: "Bea", ventas: 1 });
  });
});

it("recordatorios no salen si el comercio se anula", async () => {
  const c = await crearComercio(db, { nombre: "X" }, ana.id);
  await db.insert(recordatorios).values({ comercioId: c.id, socioId: ana.id, fecha: "2026-10-21" });
  await db.update(comercios).set({ anuladoAt: new Date() });
  expect(await recordatoriosPendientes(db, "2026-10-21")).toHaveLength(0);
});

describe("placas", () => {
  const codigo = (base: string) => base + caracterControl(base);
  it("el carácter de control detecta un carácter cambiado y dos intercambiados", () => {
    const c = codigo("K7M2");
    expect(normalizarCodigo(c.toLowerCase())).toBe(c);
    expect(normalizarCodigo(`${c.slice(0, 2)}-${c.slice(2)}`)).toBe(c);
    expect(normalizarCodigo("K7M3" + c[4])).toBeNull();
    expect(normalizarCodigo("7KM2" + c[4])).toBeNull();
    expect(normalizarCodigo("K7M2")).toBeNull();
    expect(normalizarCodigo("K0M2X")).toBeNull();
  });
  it("asignar, escanear, reasignar, deshacer y quitar", async () => {
    const pepe = await crearComercio(db, { nombre: "Bar Pepe" }, ana.id);
    const lola = await crearComercio(db, { nombre: "Peluquería Lola" }, ana.id);
    const c = codigo("K7M2");
    expect(await escanearPlaca(db, c)).toEqual({ motivo: "sin_asignar" });
    expect(await escanearPlaca(db, "XXXXX")).toEqual({ motivo: "invalida" });
    const mal = c.slice(0, 4) + (c[4] === "A" ? "B" : "A");
    await expect(asignarPlaca(db, mal, pepe.id, ana.id)).rejects.toThrow(ErrorNegocio);

    await asignarPlaca(db, c.toLowerCase(), pepe.id, bea.id);
    expect(await escanearPlaca(db, c)).toEqual({ motivo: "sin_enlace", comercio: "Bar Pepe" });
    await expect(cambiarDatoComercio(db, pepe.id, "resenas", "http://g.page/x", ana.id)).rejects.toThrow(ErrorNegocio);
    await cambiarDatoComercio(db, pepe.id, "resenas", "https://g.page/r/pepe/review", ana.id);
    expect(await escanearPlaca(db, c)).toEqual({ url: "https://g.page/r/pepe/review" });
    expect((await infoPlaca(db, c)).placa?.escaneos).toBe(2);
    expect((await fichaComercio(db, pepe.id)).placas).toMatchObject([{ codigo: c, escaneos: 2 }]);

    await expect(asignarPlaca(db, c, pepe.id, ana.id)).rejects.toThrow("ya es de Bar Pepe");
    const r = await asignarPlaca(db, c, lola.id, ana.id);
    expect(r.antes?.nombre).toBe("Bar Pepe");
    expect((await listarPlacas(db)).map((p) => p.comercio)).toEqual(["Peluquería Lola"]);
    await deshacerUltima(db, ana.id);
    expect((await infoPlaca(db, c)).comercio).toBe("Bar Pepe");

    await quitarPlaca(db, c, bea.id);
    expect(await escanearPlaca(db, c)).toEqual({ motivo: "sin_asignar" });
    await deshacerUltima(db, bea.id);
    expect((await infoPlaca(db, c)).comercio).toBe("Bar Pepe");
  });
});
