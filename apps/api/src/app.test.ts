import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { altaSocio, crearComercio, crearEnlacePanel, crearProducto, registrarVenta, registrarVisita, type DB, type Socio } from "@nfc/core";
import { bdDeTest, vaciar } from "@nfc/core/testing";
import { buildApp } from "./app";
import { configFromEnv } from "./config";

let db: DB;
let cerrar: () => Promise<void>;
let app: Awaited<ReturnType<typeof buildApp>>;
let ana: Socio, bea: Socio;
const ORIGEN = "http://localhost:5173";

beforeAll(async () => {
  ({ db, cerrar } = await bdDeTest());
  app = await buildApp(db, { ...configFromEnv({}), logLevel: "silent" });
});
afterAll(async () => {
  await app.close();
  await cerrar();
});
beforeEach(async () => {
  await vaciar(db);
  ana = await altaSocio(db, { telegramId: 1, nombre: "Ana" }, null);
  bea = await altaSocio(db, { telegramId: 2, nombre: "Bea" }, ana.id);
});

async function entrar(s: Socio) {
  const token = await crearEnlacePanel(db, s.id);
  const r = await app.inject({ method: "POST", url: "/api/entrar", headers: { origin: ORIGEN }, payload: { token } });
  expect(r.statusCode).toBe(200);
  const c = r.cookies.find((x) => x.name === "sid")!;
  expect(c).toMatchObject({ httpOnly: true, sameSite: "Strict" });
  return { cookie: `sid=${c.value}`, token };
}

describe("sesión", () => {
  it("enlace de un solo uso; sin sesión 401", async () => {
    expect((await app.inject({ url: "/api/resumen" })).statusCode).toBe(401);
    const { cookie, token } = await entrar(bea);
    expect((await app.inject({ url: "/api/yo", headers: { cookie } })).json().socio).toEqual({ id: bea.id, nombre: "Bea", rol: "socio" });
    const otra = await app.inject({ method: "POST", url: "/api/entrar", headers: { origin: ORIGEN }, payload: { token } });
    expect(otra.statusCode).toBe(401);
    await app.inject({ method: "POST", url: "/api/salir", headers: { cookie, origin: ORIGEN } });
    expect((await app.inject({ url: "/api/yo", headers: { cookie } })).statusCode).toBe(401);
  });
  it("cambios desde otro origen: 403", async () => {
    const token = await crearEnlacePanel(db, bea.id);
    expect((await app.inject({ method: "POST", url: "/api/entrar", headers: { origin: "https://malo.example" }, payload: { token } })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: "/api/entrar", payload: { token } })).statusCode).toBe(403);
  });
  it("un socio dado de baja pierde la sesión", async () => {
    const { cookie } = await entrar(bea);
    const { cambiarSocio } = await import("@nfc/core");
    await cambiarSocio(db, bea.id, { activo: false }, ana.id);
    expect((await app.inject({ url: "/api/yo", headers: { cookie } })).statusCode).toBe(401);
  });
});

describe("datos y precios", () => {
  it("resumen, comercios y ficha", async () => {
    const p = await crearProducto(db, "Panel NFC", 2500, ana.id);
    const c = await crearComercio(db, { nombre: "Bar Pepe", zona: "Centro" }, ana.id);
    await registrarVisita(db, { comercioId: c.id, resultado: "si" }, bea.id);
    await registrarVenta(db, { comercioId: c.id, producto: p, uds: 2, cobrada: true }, bea.id);
    const { cookie } = await entrar(bea);
    const r = (await app.inject({ url: "/api/resumen", headers: { cookie } })).json();
    expect(r.caja.ingresosCent).toBe(5000);
    expect(r.series).toHaveLength(12);
    expect(r.series.at(-1).ventasCent).toBe(5000);
    expect(r.mensual.at(-1).cajaCent).toBe(5000);
    const cs = (await app.inject({ url: "/api/comercios", headers: { cookie } })).json().comercios;
    expect(cs[0]).toMatchObject({ nombre: "Bar Pepe", estado: "cliente", responsable: "Bea", visitas: 1 });
    expect((await app.inject({ url: `/api/comercios/${c.id}`, headers: { cookie } })).json().ventas).toHaveLength(1);
    expect((await app.inject({ url: "/api/comercios/999", headers: { cookie } })).statusCode).toBe(404);
  });
  it("solo admin cambia precios; validación", async () => {
    const socioCookie = (await entrar(bea)).cookie;
    const adminCookie = (await entrar(ana)).cookie;
    const h = (cookie: string) => ({ cookie, origin: ORIGEN });
    expect((await app.inject({ method: "POST", url: "/api/productos", headers: h(socioCookie), payload: { nombre: "X", precioCent: 100 } })).statusCode).toBe(403);
    const p = (await app.inject({ method: "POST", url: "/api/productos", headers: h(adminCookie), payload: { nombre: "Panel", precioCent: 2500 } })).json().producto;
    expect((await app.inject({ method: "PUT", url: "/api/tramos", headers: h(adminCookie), payload: { productoId: p.id, desdeUds: 5, precioCent: 2000, descuentoBp: 100 } })).statusCode).toBe(400);
    expect((await app.inject({ method: "PUT", url: "/api/tramos", headers: h(adminCookie), payload: { productoId: p.id, desdeUds: 5, precioCent: 2000 } })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/api/ofertas", headers: h(adminCookie), payload: { productoId: p.id, tipo: "nxm", n: 3 } })).statusCode).toBe(400);
    const o = await app.inject({ method: "POST", url: "/api/ofertas", headers: h(adminCookie), payload: { productoId: p.id, tipo: "nxm", n: 3, m: 2 } });
    expect(o.json().oferta.nombre).toBe("3x2");
    const precios = (await app.inject({ url: "/api/precios", headers: { cookie: socioCookie } })).json();
    expect(precios.productos[0].tramos).toHaveLength(1);
    expect(precios.productos[0].ofertas[0].descripcion).toBe("3x2");
    expect((await app.inject({ method: "DELETE", url: `/api/ofertas/${o.json().oferta.id}`, headers: h(adminCookie) })).statusCode).toBe(200);
    expect((await app.inject({ method: "DELETE", url: `/api/tramos?productoId=${p.id}&desdeUds=5`, headers: h(adminCookie) })).statusCode).toBe(200);
  });
  it("exporta un Excel con todas las hojas", async () => {
    const p = await crearProducto(db, "Panel NFC", 2500, ana.id);
    const c = await crearComercio(db, { nombre: "Bar Pepe" }, ana.id);
    await registrarVenta(db, { comercioId: c.id, producto: p, uds: 2, cobrada: true }, bea.id);
    const { cookie } = await entrar(bea);
    const r = await app.inject({ url: "/api/exportar.xlsx", headers: { cookie } });
    expect(r.statusCode).toBe(200);
    expect(r.headers["content-disposition"]).toContain(".xlsx");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(r.rawPayload as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Resumen", "Comercios", "Visitas", "Ventas", "Movimientos", "Stock", "Reparto"]);
    const ventas = wb.getWorksheet("Ventas")!;
    expect(ventas.getRow(2).getCell(3).value).toBe("Bar Pepe");
    expect(ventas.getRow(2).getCell(7).value).toBe(50);
  });
  it("rutas desconocidas de la API: 404 JSON", async () => {
    const { cookie } = await entrar(bea);
    const r = await app.inject({ url: "/api/nada", headers: { cookie } });
    expect(r.statusCode).toBe(404);
    expect(r.json().error).toBeDefined();
  });
});
