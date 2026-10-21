import { existsSync } from "node:fs";
import { resolve } from "node:path";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { sql } from "drizzle-orm";
import { z } from "zod";
import {
  borrarTramo, registrarOperacion, canjearCodigo, escanearPlaca, html, canjearEnlace, cerrarSesionesDe, sesionesDe, cambiarPrecio, cerrarSesion, crearOferta, crearProducto, describirOferta, embudo, ErrorNegocio, estadoStock,
  fichaComercio, guardarTramo, hoy, listarLotes, listarMovimientos, listarProductos, listarVentas, ofertasDe, quitarOferta,
  recordatoriosPendientes, reparto, resumenCaja, resumenPeriodo, lunes, sumarDias, socioDeSesion, tramosDe, DIAS_SESION, type DB, type Socio,
} from "@nfc/core";
import type { ApiConfig } from "./config";
import { avisoPanel, eurosTxt } from "./gestion";
import { cajaMensual, comerciosPanel, seriesSemanales, visitasPanel } from "./datos";
import { exportarExcel } from "./excel";
import { registrarGestion } from "./gestion";
import { HttpError, NO_SESION, regla, registrarAcceso } from "./acceso";
import { registrarAdmin } from "./admin";

declare module "fastify" {
  interface FastifyRequest {
    socio: Socio | null;
  }
}


const MAX_FALLOS_CODIGO = 50;

export async function buildApp(db: DB, config: ApiConfig) {
  const fallosCodigo: number[] = [];
  const app = Fastify({
    logger: config.logLevel === "silent" ? false : { level: config.logLevel ?? "info", redact: ["req.headers.cookie"] },
    trustProxy: config.trustCloudflare,
    bodyLimit: 64 * 1024,
  });
  const nombreCookie = config.secureCookies ? "__Host-sid" : "sid";

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https://*.tile.openstreetmap.org"],
        // Estilos en línea: los inyectan vaul y react-remove-scroll (hojas y diálogos). Los scripts siguen solo 'self'.
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'"],
        manifestSrc: ["'self'"],
        workerSrc: ["'none'"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: config.secureCookies ? [] : null,
      },
    },
    referrerPolicy: { policy: "no-referrer" },
  });
  await app.register(cookie);
  // Solo el propio panel puede usar la cámara (leer el QR) y la ubicación; nada más
  app.addHook("onSend", async (_req, reply) => {
    // (Web NFC no tiene directiva propia: solo funciona en el sitio de primer nivel, que es el panel)
    reply.header("permissions-policy", "camera=(self), geolocation=(self), microphone=(), payment=(), usb=()");
  });
  await app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
    allowList: (req) => !req.url.startsWith("/api/"),
    keyGenerator: (req) => (config.trustCloudflare ? String(req.headers["cf-connecting-ip"] ?? req.ip) : req.ip),
  });

  app.decorateRequest("socio", null);
  registrarAcceso(app, config.escriturasMin);
  const cookieSesion = { path: "/", httpOnly: true, sameSite: "strict" as const, secure: config.secureCookies, maxAge: DIAS_SESION * 86_400 };
  app.addHook("onRequest", async (req, reply) => {
    if (!req.url.startsWith("/api/")) return;
    const sid = req.cookies[nombreCookie];
    const s = sid ? await socioDeSesion(db, sid) : null;
    req.socio = s;
    // Sesión permanente: cada día de uso se alarga otro año (cookie incluida)
    if (s?.renovada) reply.setCookie(nombreCookie, sid!, cookieSesion);
    // CSRF: los cambios solo desde el propio panel (además de SameSite=Strict)
    if (req.method !== "GET" && req.method !== "HEAD" && req.url.startsWith("/api/")) {
      const origin = req.headers.origin;
      if (origin !== config.publicUrl) throw new HttpError(403, "Origen no permitido.");
    }
  });

  app.setErrorHandler((err: unknown, req, reply) => {
    if (err instanceof HttpError) return reply.status(err.status).send({ error: err.message });
    if (err instanceof ErrorNegocio) return reply.status(400).send({ error: err.message });
    if (err instanceof z.ZodError) return reply.status(400).send({ error: "Datos no válidos.", detalles: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
    const e = err as { statusCode?: number; message?: string };
    if (e.statusCode === 429) return reply.status(429).send({ error: "Demasiadas peticiones. Espera un momento." });
    if (e.statusCode && e.statusCode < 500) return reply.status(e.statusCode).send({ error: e.message ?? "Petición no válida." });
    req.log.error(err);
    return reply.status(500).send({ error: "Algo ha fallado en el servidor." });
  });

  const socio = (req: FastifyRequest) => {
    if (!req.socio) throw new HttpError(401, NO_SESION);
    return req.socio;
  };
  const admin = (req: FastifyRequest) => {
    const s = socio(req);
    if (s.rol !== "admin") throw new HttpError(403, "Solo un admin puede cambiar esto.");
    return s;
  };

  app.get("/health", async () => {
    let dbOk = "ok";
    try {
      await db.execute(sql`select 1`);
    } catch {
      dbOk = "error";
    }
    return { version: config.version, db: dbOk };
  });

  // ── Placas: el QR y la pegatina NFC llevan /r/<código> (en mayúsculas en el QR: sale más pequeño) ──
  const placa = async (req: FastifyRequest, reply: FastifyReply) => {
    const { codigo } = z.object({ codigo: z.string().max(20) }).parse(req.params);
    const r = await escanearPlaca(db, codigo);
    reply.header("cache-control", "no-store");
    if ("url" in r) return reply.redirect(r.url, 302);
    const texto = {
      invalida: "Este enlace no corresponde a ninguna placa.",
      sin_asignar: "Esta placa todavía no está activada.",
      sin_enlace: `${r.comercio ? html(r.comercio) : "Este comercio"} aún no tiene configurado su enlace de reseñas.`,
    }[r.motivo];
    return reply.status(r.motivo === "invalida" ? 404 : 200).type("text/html; charset=utf-8").send(paginaPlaca(texto));
  };
  const limitePlacas = { config: { rateLimit: { max: 60, timeWindow: "1 minute", allowList: () => false } } };
  app.get("/r/:codigo", limitePlacas, placa);
  app.get("/R/:codigo", limitePlacas, placa);

  // ── Sesión ──
  // Con el enlace del bot (token) o con su código de 8 cifras (app instalada). Límite estricto: 10 intentos por minuto.
  app.post("/api/entrar", regla("publica", { rateLimit: { max: config.loginRateLimit, timeWindow: "1 minute" } }), async (req, reply: FastifyReply) => {
    const b = z.union([z.object({ token: z.string().min(20).max(100) }), z.object({ codigo: z.string().min(8).max(12) })]).parse(req.body);
    const disp = dispositivo(req.headers["user-agent"]);
    // Freno global a probar códigos al azar desde muchas IPs: con demasiados fallos, el código se desactiva 15 min (el enlace sigue)
    if ("codigo" in b && fallosCodigo.filter((t) => Date.now() - t < 15 * 60_000).length >= MAX_FALLOS_CODIGO)
      throw new HttpError(429, "Entrar con código está pausado unos minutos por demasiados intentos. Usa el enlace que te manda el bot.");
    const sesion = "token" in b ? await canjearEnlace(db, b.token, disp) : await canjearCodigo(db, b.codigo, disp);
    if (!sesion) {
      if ("codigo" in b) fallosCodigo.push(Date.now());
      throw new HttpError(401, "token" in b ? "Ese enlace ya no vale (caduca a los 15 minutos y sirve una sola vez). Pide otro al bot con /panel." : "Ese código no vale o ha caducado. Pide otro al bot con /panel.");
    }
    reply.setCookie(nombreCookie, sesion, cookieSesion);
    const yo = (await socioDeSesion(db, sesion))!;
    await registrarOperacion(db, { socioId: yo.id, tipo: "sesion", resumen: `Inicio de sesión en el panel${disp ? ` (${disp})` : ""}`, origen: "panel" });
    await avisoSesionNueva(yo, disp);
    return { socio: publico(yo) };
  });
  app.get("/api/sesiones", regla("socio"), async (req) => (socio(req), { sesiones: await sesionesDe(db, req.socio!.id, req.cookies[nombreCookie]) }));
  /** Cierra las demás sesiones del socio (otros dispositivos). */
  app.delete("/api/sesiones", regla("socio"), async (req) => ({ cerradas: await cerrarSesionesDe(db, socio(req).id, req.cookies[nombreCookie]) }));
  app.post("/api/salir", regla("publica"), async (req, reply) => {
    const sid = req.cookies[nombreCookie];
    if (sid) await cerrarSesion(db, sid);
    if (req.socio) await registrarOperacion(db, { socioId: req.socio.id, tipo: "sesion", resumen: "Cierre de sesión en el panel", origen: "panel" });
    reply.clearCookie(nombreCookie, { path: "/" });
    return { ok: true };
  });
  app.get("/api/yo", regla("socio"), async (req) => ({ socio: publico(socio(req)) }));

  // ── Datos ──
  app.get("/api/resumen", regla("socio"), async (req) => {
    socio(req);
    const h = hoy();
    const [caja, emb, semana, series, mensual, pend] = await Promise.all([
      resumenCaja(db),
      embudo(db),
      resumenPeriodo(db, lunes(h), sumarDias(lunes(h), 6)),
      seriesSemanales(db, h),
      cajaMensual(db),
      recordatoriosPendientes(db, sumarDias(h, 7)),
    ]);
    const anterior = await resumenPeriodo(db, sumarDias(lunes(h), -7), sumarDias(lunes(h), -1));
    const sinExtra = (x: typeof semana) => ({ ...x, caja: undefined, embudo: undefined });
    return { hoy: h, caja, embudo: emb, semana: sinExtra(semana), semanaAnterior: sinExtra(anterior), series, mensual, pendientes: pend.map(({ telegramId: _, ...r }) => r) };
  });
  app.get("/api/comercios", regla("socio"), async (req) => (socio(req), { comercios: await comerciosPanel(db) }));
  app.get("/api/comercios/:id", regla("socio"), async (req) => {
    socio(req);
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    try {
      return await fichaComercio(db, id);
    } catch (e) {
      if (e instanceof ErrorNegocio) throw new HttpError(404, e.message);
      throw e;
    }
  });
  app.get("/api/visitas", regla("socio"), async (req) => (socio(req), { visitas: await visitasPanel(db) }));
  app.get("/api/ventas", regla("socio"), async (req) => (socio(req), { ventas: await listarVentas(db, { limite: 5000 }) }));
  app.get("/api/movimientos", regla("socio"), async (req) => (socio(req), { movimientos: await listarMovimientos(db) }));
  app.get("/api/stock", regla("socio"), async (req) => (socio(req), { stock: (await estadoStock(db)).filter((s) => s.lotes), lotes: await listarLotes(db) }));
  app.get("/api/reparto", regla("socio"), async (req) => (socio(req), await reparto(db)));
  app.get("/api/precios", regla("socio"), async (req) => {
    socio(req);
    const prods = await listarProductos(db);
    return {
      productos: await Promise.all(
        prods.map(async (p) => ({ ...p, tramos: await tramosDe(db, p.id), ofertas: (await ofertasDe(db, p.id, hoy())).map((o) => ({ ...o, descripcion: describirOferta(o) })) })),
      ),
    };
  });
  app.get("/api/exportar.xlsx", regla("socio"), async (req, reply) => {
    socio(req);
    const buf = await exportarExcel(db);
    return reply
      .header("content-type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("content-disposition", `attachment; filename="nfc-${hoy()}.xlsx"`)
      .header("cache-control", "no-store")
      .send(buf);
  });

  // ── Precios (admin) ──
  const euros = z.number().int().positive().max(100_000_000);
  app.post("/api/productos", regla("admin"), async (req) => {
    const s = admin(req);
    const b = z.object({ nombre: z.string().trim().min(1).max(120), precioCent: euros }).parse(req.body);
    const p = await crearProducto(db, b.nombre, b.precioCent, s.id);
    await avisoPanel(db, s, `producto ${p.nombre} a ${eurosTxt(p.precioCent)}/ud`);
    return { producto: p };
  });
  app.put("/api/productos/:id", regla("admin"), async (req) => {
    const s = admin(req);
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    const b = z.object({ precioCent: euros }).parse(req.body);
    if (!(await listarProductos(db)).some((p) => p.id === id)) throw new HttpError(404, "Ese producto no existe.");
    const antes = (await listarProductos(db)).find((p) => p.id === id)!;
    const p = await cambiarPrecio(db, id, b.precioCent, s.id);
    await avisoPanel(db, s, `precio de ${p.nombre}: ${eurosTxt(antes.precioCent)} → ${eurosTxt(p.precioCent)}/ud`);
    return { producto: p };
  });
  app.put("/api/tramos", regla("admin"), async (req) => {
    const s = admin(req);
    const b = z
      .object({ productoId: z.number().int().positive(), desdeUds: z.number().int().min(2).max(10_000), precioCent: euros.optional(), descuentoBp: z.number().int().min(1).max(10_000).optional() })
      .refine((x) => (x.precioCent == null) !== (x.descuentoBp == null), "Pon precio o descuento, no los dos")
      .parse(req.body);
    await guardarTramo(db, b.productoId, b.desdeUds, b.precioCent ? { precioCent: b.precioCent } : { descuentoBp: b.descuentoBp! }, s.id);
    await avisoPanel(db, s, `tramo desde ${b.desdeUds} uds a ${b.precioCent ? `${eurosTxt(b.precioCent)}/ud` : `−${b.descuentoBp! / 100} %`}`);
    return { ok: true };
  });
  app.delete("/api/tramos", regla("admin"), async (req) => {
    const s = admin(req);
    const b = z.object({ productoId: z.coerce.number().int().positive(), desdeUds: z.coerce.number().int() }).parse(req.query);
    await borrarTramo(db, b.productoId, b.desdeUds, s.id);
    await avisoPanel(db, s, `quitado el tramo desde ${b.desdeUds} uds`);
    return { ok: true };
  });
  app.post("/api/ofertas", regla("admin"), async (req) => {
    const s = admin(req);
    const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional();
    const b = z
      .object({
        productoId: z.number().int().positive(),
        tipo: z.enum(["nxm", "pack", "descuento"]),
        n: z.number().int().positive().max(10_000),
        m: z.number().int().positive().nullable().optional(),
        precioCent: euros.nullable().optional(),
        descuentoBp: z.number().int().min(1).max(10_000).nullable().optional(),
        desde: fecha,
        hasta: fecha,
      })
      .parse(req.body);
    const d = { tipo: b.tipo, n: b.n, m: b.m ?? null, precioCent: b.precioCent ?? null, descuentoBp: b.descuentoBp ?? null, desde: b.desde ?? null, hasta: b.hasta ?? null };
    if (d.tipo === "pack" && !d.precioCent) throw new HttpError(400, "Un pack necesita precio.");
    if (d.tipo === "descuento" && !d.descuentoBp) throw new HttpError(400, "Falta el porcentaje de descuento.");
    if (d.tipo === "nxm" && !d.m) throw new HttpError(400, "Falta cuántas se pagan (el 2 de 3x2).");
    const o = await crearOferta(db, b.productoId, { ...d, nombre: describirOferta(d) }, s.id);
    await avisoPanel(db, s, `nueva oferta ${o.nombre}${o.hasta ? ` hasta el ${o.hasta}` : ""}`);
    return { oferta: o };
  });
  app.delete("/api/ofertas/:id", regla("admin"), async (req) => {
    const s = admin(req);
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    const o = await quitarOferta(db, id, s.id);
    await avisoPanel(db, s, `retirada la oferta ${o.nombre}`);
    return { ok: true };
  });

  await registrarGestion(app, db, { socio, admin });
  const { avisoSesionNueva } = await registrarAdmin(app, db, config.publicUrl);

  app.all("/api/*", regla("publica"), async () => {
    throw new HttpError(404, "No existe.");
  });

  // ── Web (SPA) ──
  const webDir = config.webDir ? resolve(config.webDir) : null;
  if (webDir && existsSync(webDir)) {
    await app.register(fastifyStatic, { root: webDir, wildcard: false, maxAge: "1h", immutable: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.method !== "GET") return reply.status(404).send({ error: "No existe." });
      return reply.header("cache-control", "no-store").sendFile("index.html");
    });
  }
  return app;
}

/** Página mínima para una placa que aún no redirige (la ve el cliente del comercio, no un socio). */
const paginaPlaca = (texto: string) => `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reseñas</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:17px/1.5 system-ui,sans-serif;background:#faf9f6;color:#1d1d1f}
main{max-width:22rem;padding:2rem;text-align:center}p{margin:.5rem 0}.s{color:#6b6b6b;font-size:15px}</style></head>
<body><main><p>★★★★★</p><p>${texto}</p><p class="s">Vuelve a probar en unos días. ¡Gracias!</p></main></body></html>`;

const publico = (s: Socio) => ({ id: s.id, nombre: s.nombre, rol: s.rol });

/** «Chrome en Android», «Safari en iPhone»…: para reconocer las sesiones abiertas. */
function dispositivo(ua: string | undefined) {
  if (!ua) return null;
  const nav = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Navegador";
  const so = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  return so ? `${nav} en ${so}` : nav;
}
