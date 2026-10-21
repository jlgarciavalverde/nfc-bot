import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { altaSocio, asignarPlaca, caracterControl, cambiarDatoComercio, guardarAjuste, resumenCaja, tablas, crearComercio, crearEnlacePanel, crearProducto, registrarVenta, registrarVisita, type DB, type Socio } from "@nfc/core";
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
  app = await buildApp(db, { ...configFromEnv({}), logLevel: "silent", loginRateLimit: 1000, escriturasMin: 10_000 });
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
  const { token } = await crearEnlacePanel(db, s.id);
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
    const { token } = await crearEnlacePanel(db, bea.id);
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

describe("sesión permanente y código", () => {
  it("entra con el código de 8 cifras (una vez) y la sesión dura un año y se renueva con el uso", async () => {
    const { codigo } = await crearEnlacePanel(db, bea.id);
    const r = await app.inject({ method: "POST", url: "/api/entrar", headers: { origin: ORIGEN, "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Safari/604.1" }, payload: { codigo: `${codigo.slice(0, 4)} ${codigo.slice(4)}` } });
    expect(r.statusCode).toBe(200);
    const c = r.cookies.find((x) => x.name === "sid")!;
    expect(c.maxAge).toBe(365 * 86_400);
    expect((await app.inject({ method: "POST", url: "/api/entrar", headers: { origin: ORIGEN }, payload: { codigo } })).statusCode).toBe(401);
    const cookie = `sid=${c.value}`;
    const ses = (await app.inject({ url: "/api/sesiones", headers: { cookie } })).json().sesiones;
    expect(ses).toEqual([expect.objectContaining({ dispositivo: "Safari en iPhone", actual: true })]);
    // Simula un día sin entrar: la siguiente petición alarga la sesión y reenvía la cookie
    await db.update(tablas.sesiones).set({ ultimoUsoAt: new Date(Date.now() - 2 * 86_400_000), expiraAt: new Date(Date.now() + 86_400_000) });
    const r2 = await app.inject({ url: "/api/yo", headers: { cookie } });
    expect(r2.cookies.find((x) => x.name === "sid")?.maxAge).toBe(365 * 86_400);
    const [ses2] = await db.select().from(tablas.sesiones);
    expect(ses2!.expiraAt.getTime()).toBeGreaterThan(Date.now() + 360 * 86_400_000);
    // Y sin renovar no se reenvía la cookie en cada petición
    expect((await app.inject({ url: "/api/yo", headers: { cookie } })).cookies).toHaveLength(0);
  });
  it("cerrar las demás sesiones", async () => {
    const a = await entrar(bea);
    const b = await entrar(bea);
    const r = await app.inject({ method: "DELETE", url: "/api/sesiones", headers: { cookie: a.cookie, origin: ORIGEN } });
    expect(r.json().cerradas).toBe(1);
    expect((await app.inject({ url: "/api/yo", headers: { cookie: b.cookie } })).statusCode).toBe(401);
    expect((await app.inject({ url: "/api/yo", headers: { cookie: a.cookie } })).statusCode).toBe(200);
  });
});

describe("apuntar desde el panel", () => {
  const h = (cookie: string) => ({ cookie, origin: ORIGEN });
  it("comercio, visita, venta, cobro, gasto, compra y recordatorio; cada uno avisa al grupo; deshacer", async () => {
    await crearProducto(db, "Panel NFC", 2000, ana.id);
    const { cookie } = await entrar(bea);
    const c = (await app.inject({ method: "POST", url: "/api/comercios", headers: h(cookie), payload: { nombre: "Bar Pepe", zona: "Centro" } })).json().comercio;
    expect((await app.inject({ method: "POST", url: "/api/visitas", headers: h(cookie), payload: { comercioId: c.id, resultado: "si", nota: "le encanta" } })).statusCode).toBe(200);
    const v = (await app.inject({ method: "POST", url: "/api/ventas", headers: h(cookie), payload: { comercioId: c.id, uds: 2, cobrada: false } })).json().venta;
    expect(v).toMatchObject({ totalCent: 4000, cobrada: false });
    expect((await app.inject({ method: "POST", url: `/api/ventas/${v.id}/cobrar`, headers: h(cookie), payload: { metodo: "bizum" } })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/api/movimientos", headers: h(cookie), payload: { tipo: "gasto", cent: 1500, categoria: "Imprenta" } })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/api/compras", headers: h(cookie), payload: { uds: 10, cent: 3000, proveedor: "Ali" } })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/api/recordatorios", headers: h(cookie), payload: { comercioId: c.id, fecha: "2099-01-01" } })).statusCode).toBe(200);
    expect((await app.inject({ method: "PATCH", url: `/api/comercios/${c.id}`, headers: h(cookie), payload: { contacto: "600 123 123" } })).json().comercio.contacto).toBe("600 123 123");

    const caja = await resumenCaja(db);
    expect(caja).toMatchObject({ ingresosCent: 4000, gastosCent: 4500 });
    const avisos = await db.select().from(tablas.avisos);
    expect(avisos.map((a) => a.texto)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("<b>Bea</b> desde el panel: nuevo comercio Bar Pepe (Centro)"),
        expect.stringContaining("venta #1 a Bar Pepe: 2 uds por 40,00 €, pendiente de cobro"),
        expect.stringContaining("cobrada la venta #1"),
        expect.stringContaining("gasto de 15,00 € (Imprenta)"),
      ]),
    );
    const act = (await app.inject({ url: "/api/actividad", headers: { cookie } })).json().actividad;
    expect(act[0]).toMatchObject({ origen: "panel", socio: "Bea" });
    // Lo último deshacible es la compra (los cambios de datos no se deshacen y bloquean)… el recordatorio y el dato no tienen deshacer
    const d = await app.inject({ method: "POST", url: "/api/deshacer", headers: h(cookie) });
    expect(d.statusCode).toBe(400);
  });
  it("venta con precio pactado y deshacer; sin sesión o desde otro origen, nada", async () => {
    await crearProducto(db, "Panel NFC", 2000, ana.id);
    const c = await crearComercio(db, { nombre: "X" }, ana.id);
    const { cookie } = await entrar(bea);
    expect((await app.inject({ method: "POST", url: "/api/ventas", payload: { comercioId: c.id, uds: 1, cobrada: true }, headers: { origin: ORIGEN } })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/api/ventas", payload: { comercioId: c.id, uds: 1, cobrada: true }, headers: { cookie, origin: "https://malo.example" } })).statusCode).toBe(403);
    const v = (await app.inject({ method: "POST", url: "/api/ventas", headers: h(cookie), payload: { comercioId: c.id, uds: 3, cobrada: true, metodo: "efectivo", pactadoCent: 5000 } })).json().venta;
    expect(v).toMatchObject({ totalCent: 5000, aplicado: "Precio pactado", metodo: "efectivo" });
    const act = (await app.inject({ url: "/api/actividad", headers: { cookie } })).json().actividad;
    expect(act[0]).toMatchObject({ deshacible: true });
    expect((await app.inject({ method: "POST", url: "/api/deshacer", headers: h(cookie) })).json().resumen).toContain("Venta #1");
    expect((await resumenCaja(db)).ventas).toBe(0);
  });
  it("un aviso de un tipo silenciado se guarda sin enviar", async () => {
    await guardarAjuste(db, "avisosSilenciados", ["panel"]);
    const { cookie } = await entrar(bea);
    await app.inject({ method: "POST", url: "/api/comercios", headers: h(cookie), payload: { nombre: "Y" } });
    const [a] = (await db.select().from(tablas.avisos)).filter((x) => x.tipo === "panel");
    expect(a!.silencioso).toBe(true);
  });
});

describe("placas", () => {
  it("/r/<código> redirige al enlace de reseñas del comercio y cuenta el escaneo", async () => {
    const codigo = "K7M2" + caracterControl("K7M2");
    expect((await app.inject({ url: `/r/${codigo}` })).body).toContain("todavía no está activada");
    expect((await app.inject({ url: "/r/XXXXX" })).statusCode).toBe(404);
    const c = await crearComercio(db, { nombre: "Bar <Pepe>" }, ana.id);
    await asignarPlaca(db, codigo, c.id, ana.id);
    const sin = await app.inject({ url: `/r/${codigo}` });
    expect(sin.body).toContain("Bar &lt;Pepe&gt; aún no tiene");
    await cambiarDatoComercio(db, c.id, "resenas", "https://g.page/r/pepe/review", ana.id);
    for (const url of [`/r/${codigo.toLowerCase()}`, `/R/${codigo}`]) {
      const r = await app.inject({ url });
      expect(r.statusCode).toBe(302);
      expect(r.headers.location).toBe("https://g.page/r/pepe/review");
      expect(r.headers["cache-control"]).toBe("no-store");
    }
    const [p] = await db.select().from(tablas.placas);
    expect(p!.escaneos).toBe(3);
  });
  it("límite de 60 escaneos por minuto e IP", async () => {
    let ultimo = 0;
    for (let i = 0; i < 61; i++) ultimo = (await app.inject({ url: "/r/XXXXX", remoteAddress: "10.0.0.9" })).statusCode;
    expect(ultimo).toBe(429);
  });
});
