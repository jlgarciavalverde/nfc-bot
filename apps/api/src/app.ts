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
  borrarTramo, canjearEnlace, cambiarPrecio, cerrarSesion, crearOferta, crearProducto, describirOferta, embudo, ErrorNegocio, estadoStock,
  fichaComercio, guardarTramo, hoy, listarLotes, listarMovimientos, listarProductos, listarVentas, ofertasDe, quitarOferta,
  recordatoriosPendientes, reparto, resumenCaja, resumenPeriodo, lunes, sumarDias, socioDeSesion, tramosDe, DIAS_SESION, type DB, type Socio,
} from "@nfc/core";
import type { ApiConfig } from "./config";
import { cajaMensual, comerciosPanel, seriesSemanales, visitasPanel } from "./datos";
import { exportarExcel } from "./excel";

declare module "fastify" {
  interface FastifyRequest {
    socio: Socio | null;
  }
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function buildApp(db: DB, config: ApiConfig) {
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
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: config.secureCookies ? [] : null,
      },
    },
    referrerPolicy: { policy: "no-referrer" },
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
    allowList: (req) => !req.url.startsWith("/api/"),
    keyGenerator: (req) => (config.trustCloudflare ? String(req.headers["cf-connecting-ip"] ?? req.ip) : req.ip),
  });

  app.decorateRequest("socio", null);
  app.addHook("onRequest", async (req) => {
    const sid = req.cookies[nombreCookie];
    req.socio = sid ? await socioDeSesion(db, sid) : null;
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
    if (!req.socio) throw new HttpError(401, "Tienes que entrar con el enlace que te da el bot (/panel).");
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

  // ── Sesión ──
  app.post("/api/entrar", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply: FastifyReply) => {
    const { token } = z.object({ token: z.string().min(20).max(100) }).parse(req.body);
    const sesion = await canjearEnlace(db, token);
    if (!sesion) throw new HttpError(401, "Ese enlace ya no vale (caduca a los 15 minutos y sirve una sola vez). Pide otro al bot con /panel.");
    reply.setCookie(nombreCookie, sesion, { path: "/", httpOnly: true, sameSite: "strict", secure: config.secureCookies, maxAge: DIAS_SESION * 86_400 });
    return { socio: publico((await socioDeSesion(db, sesion))!) };
  });
  app.post("/api/salir", async (req, reply) => {
    const sid = req.cookies[nombreCookie];
    if (sid) await cerrarSesion(db, sid);
    reply.clearCookie(nombreCookie, { path: "/" });
    return { ok: true };
  });
  app.get("/api/yo", async (req) => ({ socio: publico(socio(req)) }));

  // ── Datos ──
  app.get("/api/resumen", async (req) => {
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
    return { hoy: h, caja, embudo: emb, semana: { ...semana, caja: undefined, embudo: undefined }, series, mensual, pendientes: pend.map(({ telegramId: _, ...r }) => r) };
  });
  app.get("/api/comercios", async (req) => (socio(req), { comercios: await comerciosPanel(db) }));
  app.get("/api/comercios/:id", async (req) => {
    socio(req);
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    try {
      return await fichaComercio(db, id);
    } catch (e) {
      if (e instanceof ErrorNegocio) throw new HttpError(404, e.message);
      throw e;
    }
  });
  app.get("/api/visitas", async (req) => (socio(req), { visitas: await visitasPanel(db) }));
  app.get("/api/ventas", async (req) => (socio(req), { ventas: await listarVentas(db, { limite: 5000 }) }));
  app.get("/api/movimientos", async (req) => (socio(req), { movimientos: await listarMovimientos(db) }));
  app.get("/api/stock", async (req) => (socio(req), { stock: (await estadoStock(db)).filter((s) => s.lotes), lotes: await listarLotes(db) }));
  app.get("/api/reparto", async (req) => (socio(req), await reparto(db)));
  app.get("/api/precios", async (req) => {
    socio(req);
    const prods = await listarProductos(db);
    return {
      productos: await Promise.all(
        prods.map(async (p) => ({ ...p, tramos: await tramosDe(db, p.id), ofertas: (await ofertasDe(db, p.id, hoy())).map((o) => ({ ...o, descripcion: describirOferta(o) })) })),
      ),
    };
  });
  app.get("/api/exportar.xlsx", async (req, reply) => {
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
  app.post("/api/productos", async (req) => {
    const s = admin(req);
    const b = z.object({ nombre: z.string().trim().min(1).max(120), precioCent: euros }).parse(req.body);
    return { producto: await crearProducto(db, b.nombre, b.precioCent, s.id) };
  });
  app.put("/api/productos/:id", async (req) => {
    const s = admin(req);
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    const b = z.object({ precioCent: euros }).parse(req.body);
    if (!(await listarProductos(db)).some((p) => p.id === id)) throw new HttpError(404, "Ese producto no existe.");
    return { producto: await cambiarPrecio(db, id, b.precioCent, s.id) };
  });
  app.put("/api/tramos", async (req) => {
    const s = admin(req);
    const b = z
      .object({ productoId: z.number().int().positive(), desdeUds: z.number().int().min(2).max(10_000), precioCent: euros.optional(), descuentoBp: z.number().int().min(1).max(10_000).optional() })
      .refine((x) => (x.precioCent == null) !== (x.descuentoBp == null), "Pon precio o descuento, no los dos")
      .parse(req.body);
    await guardarTramo(db, b.productoId, b.desdeUds, b.precioCent ? { precioCent: b.precioCent } : { descuentoBp: b.descuentoBp! }, s.id);
    return { ok: true };
  });
  app.delete("/api/tramos", async (req) => {
    const s = admin(req);
    const b = z.object({ productoId: z.coerce.number().int().positive(), desdeUds: z.coerce.number().int() }).parse(req.query);
    await borrarTramo(db, b.productoId, b.desdeUds, s.id);
    return { ok: true };
  });
  app.post("/api/ofertas", async (req) => {
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
    return { oferta: await crearOferta(db, b.productoId, { ...d, nombre: describirOferta(d) }, s.id) };
  });
  app.delete("/api/ofertas/:id", async (req) => {
    const s = admin(req);
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    await quitarOferta(db, id, s.id);
    return { ok: true };
  });

  app.all("/api/*", async () => {
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

const publico = (s: Socio) => ({ id: s.id, nombre: s.nombre, rol: s.rol });
