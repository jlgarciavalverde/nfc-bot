import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { altaSocio, crearComercio, crearEnlacePanel, crearProducto, registrarVenta, tablas, type DB, type Socio } from "@nfc/core";
import { bdDeTest, vaciar } from "@nfc/core/testing";
import { strFromU8, unzipSync } from "fflate";
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
  ana = await altaSocio(db, { telegramId: 1, nombre: "Ana" }, null); // admin
  bea = await altaSocio(db, { telegramId: 2, nombre: "Bea" }, ana.id); // socia
});

async function cookieDe(s: Socio) {
  const { token } = await crearEnlacePanel(db, s.id);
  const r = await app.inject({ method: "POST", url: "/api/entrar", headers: { origin: ORIGEN }, payload: { token } });
  return `sid=${r.cookies.find((c) => c.name === "sid")!.value}`;
}
const ruta = (url: string) => url.replace(":id", "1").replace(":codigo", "M4PSN").replace("*", "nada");

describe("matriz de permisos (generada del registro de rutas)", () => {
  it("todas las rutas /api declaran su regla", () => {
    const sinRegla = app.registroAcceso.filter((r) => !r.acceso);
    expect(sinRegla).toEqual([]);
    expect(app.registroAcceso.length).toBeGreaterThan(30);
  });
  it("anónimo: 401 en todo lo que no es público; socio: 403 en lo de admin", async () => {
    const cBea = await cookieDe(bea);
    for (const r of app.registroAcceso) {
      if (r.acceso === "publica") continue;
      const url = ruta(r.url);
      const anon = await app.inject({ method: r.metodo as never, url, headers: { origin: ORIGEN }, payload: r.metodo === "GET" || r.metodo === "DELETE" ? undefined : {} });
      expect(anon.statusCode, `${r.metodo} ${r.url} sin sesión`).toBe(401);
      if (r.acceso === "admin") {
        const s = await app.inject({ method: r.metodo as never, url, headers: { origin: ORIGEN, cookie: cBea }, payload: r.metodo === "GET" || r.metodo === "DELETE" ? undefined : {} });
        expect(s.statusCode, `${r.metodo} ${r.url} como socia`).toBe(403);
      }
    }
  });
  it("las escrituras exigen el Origin del panel aunque haya sesión", async () => {
    const c = await cookieDe(ana);
    for (const r of app.registroAcceso.filter((x) => x.metodo !== "GET" && x.acceso !== "publica")) {
      const res = await app.inject({ method: r.metodo as never, url: ruta(r.url), headers: { cookie: c, origin: "https://malo.example" }, payload: {} });
      expect(res.statusCode, `${r.metodo} ${r.url}`).toBe(403);
    }
  });
  it("datos basura: 400 con mensaje, nunca 500", async () => {
    const c = await cookieDe(ana);
    const basura = [{}, { comercioId: "x" }, { n: -1 }, { uds: 1e9 }, { cent: "mucho" }, [], { a: "b".repeat(5000) }];
    for (const r of app.registroAcceso.filter((x) => x.metodo !== "GET" && x.acceso !== "publica" && !x.url.includes("salir"))) {
      for (const payload of basura) {
        const res = await app.inject({ method: r.metodo as never, url: ruta(r.url), headers: { cookie: c, origin: ORIGEN }, payload });
        expect(res.statusCode, `${r.metodo} ${r.url} ${JSON.stringify(payload).slice(0, 40)}`).toBeLessThan(500);
      }
    }
  });
});

describe("reglas finas", () => {
  it("un socio no cobra la venta de otro; un admin sí", async () => {
    const p = await crearProducto(db, "Panel", 2000, ana.id);
    const c = await crearComercio(db, { nombre: "X" }, ana.id);
    const v = await registrarVenta(db, { comercioId: c.id, producto: p, uds: 1, cobrada: false }, ana.id);
    const r = await app.inject({ method: "POST", url: `/api/ventas/${v.venta.id}/cobrar`, headers: { cookie: await cookieDe(bea), origin: ORIGEN }, payload: {} });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toContain("Solo quien hizo la venta");
    expect((await app.inject({ method: "POST", url: `/api/ventas/${v.venta.id}/cobrar`, headers: { cookie: await cookieDe(ana), origin: ORIGEN }, payload: {} })).statusCode).toBe(200);
  });
  it("inicio de sesión: queda en la auditoría y avisa al socio por Telegram", async () => {
    await app.inject({ method: "POST", url: "/api/entrar", headers: { origin: ORIGEN, "user-agent": "Mozilla/5.0 (Linux; Android 14) Chrome/130" }, payload: { token: (await crearEnlacePanel(db, bea.id)).token } });
    const [a] = (await db.select().from(tablas.avisos)).filter((x) => x.tipo === "sesion");
    expect(a).toMatchObject({ destino: "socio", socioId: bea.id });
    expect(a!.texto).toContain("Chrome en Android");
    const aud = (await app.inject({ url: "/api/auditoria?tipo=sesion", headers: { cookie: await cookieDe(ana) } })).json();
    expect(aud.operaciones.some((o: { resumen: string; socio: string }) => o.socio === "Bea" && o.resumen.includes("Inicio de sesión"))).toBe(true);
  });
  it("cabeceras de seguridad", async () => {
    const r = await app.inject({ url: "/health" });
    expect(r.headers["permissions-policy"]).toContain("camera=(self)");
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    expect(r.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  });
  it("límite de escrituras por socio", async () => {
    const limitada = await buildApp(db, { ...configFromEnv({}), logLevel: "silent", loginRateLimit: 1000, escriturasMin: 3 });
    const { token } = await crearEnlacePanel(db, bea.id);
    const e = await limitada.inject({ method: "POST", url: "/api/entrar", headers: { origin: ORIGEN }, payload: { token } });
    const cookie = `sid=${e.cookies.find((c) => c.name === "sid")!.value}`;
    const codigos = [];
    for (let i = 0; i < 4; i++) codigos.push((await limitada.inject({ method: "POST", url: "/api/comercios", headers: { cookie, origin: ORIGEN }, payload: { nombre: `C${i}` } })).statusCode);
    expect(codigos).toEqual([200, 200, 200, 429]);
    await limitada.close();
  });
});

describe("placas y lotes", () => {
  it("admin crea un lote; descarga CSV y ZIP con un QR por código; un socio asigna, graba y quita", async () => {
    const cAna = await cookieDe(ana);
    const cBea = await cookieDe(bea);
    const r = await app.inject({ method: "POST", url: "/api/lotes", headers: { cookie: cAna, origin: ORIGEN }, payload: { n: 3, nota: "Prueba" } });
    const { lote, codigos } = r.json();
    expect(codigos).toHaveLength(3);
    const csv = (await app.inject({ url: `/api/lotes/${lote.id}/lote.csv`, headers: { cookie: cAna } })).body;
    expect(csv.split("\n")[1]).toMatch(/^[A-Z2-9]{5},http:\/\/localhost:5173\/r\/[A-Z2-9]{5},HTTP:\/\/LOCALHOST:5173\/R\/[A-Z2-9]{5}$/);
    const zip = unzipSync(new Uint8Array((await app.inject({ url: `/api/lotes/${lote.id}/qr.zip`, headers: { cookie: cAna } })).rawPayload));
    expect(Object.keys(zip).sort()).toEqual([...codigos.map((c: string) => `qr_${c}.svg`), "lote.csv"].sort());
    expect(strFromU8(zip[`qr_${codigos[0]}.svg`]!)).toContain("<svg");
    expect((await app.inject({ url: `/api/lotes/${lote.id}/lote.csv`, headers: { cookie: cBea } })).statusCode).toBe(403);

    const c = await crearComercio(db, { nombre: "Bar Pepe" }, ana.id);
    const mal = await app.inject({ method: "POST", url: `/api/placas/${codigos[0]}/asignar`, headers: { cookie: cBea, origin: ORIGEN }, payload: { comercioId: c.id, resenasUrl: "http://inseguro" } });
    expect(mal.statusCode).toBe(400);
    const ok = await app.inject({ method: "POST", url: `/api/placas/${codigos[0]}/asignar`, headers: { cookie: cBea, origin: ORIGEN }, payload: { comercioId: c.id, resenasUrl: "https://g.page/r/abc/review" } });
    expect(ok.json()).toMatchObject({ comercio: "Bar Pepe", conEnlace: true });
    expect((await app.inject({ method: "POST", url: `/api/placas/${codigos[0]}/nfc`, headers: { cookie: cBea, origin: ORIGEN }, payload: { bloqueada: true } })).statusCode).toBe(200);
    const escaneo = await app.inject({ url: `/r/${codigos[0]}` });
    expect(escaneo.statusCode).toBe(302);
    expect(escaneo.headers.location).toBe("https://g.page/r/abc/review");
    const lista = (await app.inject({ url: "/api/placas", headers: { cookie: cBea } })).json();
    expect(lista.placas.find((p: { codigo: string }) => p.codigo === codigos[0])).toMatchObject({ comercio: "Bar Pepe", escaneos: 1 });
    expect(lista.placas.find((p: { codigo: string }) => p.codigo === codigos[0]).nfcBloqueadaAt).not.toBeNull();
    expect(lista.lotes[0]).toMatchObject({ n: 3, asignadas: 1 });
    expect((await app.inject({ method: "POST", url: `/api/placas/${codigos[0]}/quitar`, headers: { cookie: cBea, origin: ORIGEN } })).statusCode).toBe(200);
    expect((await app.inject({ url: `/r/${codigos[0]}` })).statusCode).toBe(200);
    expect((await app.inject({ url: "/api/placas/ABCDE", headers: { cookie: cBea } })).statusCode).toBe(400);
  });
  it("ajustes: todos los leen, solo admin los cambia, valida", async () => {
    const cBea = await cookieDe(bea);
    const cAna = await cookieDe(ana);
    expect((await app.inject({ url: "/api/ajustes", headers: { cookie: cBea } })).json().ajustes.modoReparto).toBe("igual");
    expect((await app.inject({ method: "PUT", url: "/api/ajustes", headers: { cookie: cBea, origin: ORIGEN }, payload: { stockMin: 3 } })).statusCode).toBe(403);
    expect((await app.inject({ method: "PUT", url: "/api/ajustes", headers: { cookie: cAna, origin: ORIGEN }, payload: { comisionBp: 9999999 } })).statusCode).toBe(400);
    const r = await app.inject({ method: "PUT", url: "/api/ajustes", headers: { cookie: cAna, origin: ORIGEN }, payload: { stockMin: 3, avisosSilenciados: ["panel"], bienvenida: "" } });
    expect(r.json().ajustes).toMatchObject({ stockMin: 3, avisosSilenciados: ["panel"], bienvenida: null });
    const lim = { consultasMin: 10, apuntesMin: 0, erroresMin: 5, borrarComandos: true, consultasPorPrivado: false };
    const p = await app.inject({ method: "PUT", url: "/api/ajustes", headers: { cookie: cAna, origin: ORIGEN }, payload: { tono: "serio", emojis: false, nombreAsistente: " Billetes ", instruccionesIa: "", limpieza: lim } });
    expect(p.json().ajustes).toMatchObject({ tono: "serio", emojis: false, nombreAsistente: "Billetes", instruccionesIa: null, limpieza: lim });
    for (const malo of [{ tono: "pirata" }, { nombreAsistente: "x".repeat(41) }, { instruccionesIa: "x".repeat(501) }, { limpieza: { ...lim, consultasMin: 5000 } }]) {
      expect((await app.inject({ method: "PUT", url: "/api/ajustes", headers: { cookie: cAna, origin: ORIGEN }, payload: malo })).statusCode).toBe(400);
    }
  });
  it("socios: baja cierra sus sesiones", async () => {
    const cBea = await cookieDe(bea);
    const cAna = await cookieDe(ana);
    expect((await app.inject({ method: "PATCH", url: `/api/socios/${bea.id}`, headers: { cookie: cAna, origin: ORIGEN }, payload: { activo: false } })).statusCode).toBe(200);
    expect((await app.inject({ url: "/api/yo", headers: { cookie: cBea } })).statusCode).toBe(401);
    expect((await app.inject({ method: "PATCH", url: `/api/socios/${ana.id}`, headers: { cookie: cAna, origin: ORIGEN }, payload: { rol: "socio" } })).statusCode).toBe(400);
  });
});
