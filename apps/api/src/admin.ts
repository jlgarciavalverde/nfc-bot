import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { zipSync, strToU8 } from "fflate";
import qrcode from "qrcode-generator";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import {
  asignarPlaca, avisar, cambiarDatoComercio, cambiarSocio, codigosDeTanda, comercioPorId, crearTanda, guardarAjuste, html, infoPlaca, leerAjustes,
  listarSocios, listarTandas, marcarNfc, normalizarCodigo, placasPanel, quitarPlaca, registrarOperacion, tablas, TIPOS_AVISO, MAX_TANDA, type DB, type Socio,
} from "@nfc/core";
import { HttpError, regla } from "./acceso";
import { avisoPanel } from "./gestion";

const id = z.coerce.number().int().positive();

/** Placas, lotes, ajustes, socios y auditoría. */
export async function registrarAdmin(app: FastifyInstance, db: DB, publicUrl: string) {
  const s = (req: { socio: Socio | null }) => req.socio!;
  const urlNfc = (c: string) => `${publicUrl}/r/${c}`;
  // En el QR, todo en mayúsculas: modo alfanumérico, QR más pequeño (igual que hardware/soporte-nfc/generar_lote.py)
  const urlQr = (c: string) => `${publicUrl}/R/${c}`.toUpperCase();

  // ── Placas ──
  app.get("/api/placas", regla("socio"), async () => ({ placas: (await placasPanel(db)).map((p) => ({ ...p, urlNfc: urlNfc(p.codigo) })), lotes: await listarTandas(db) }));

  app.get("/api/placas/:codigo", regla("socio"), async (req) => {
    const { codigo } = z.object({ codigo: z.string().max(20) }).parse(req.params);
    const c = normalizarCodigo(codigo);
    if (!c) throw new HttpError(400, `«${codigo}» no es un código de placa válido: son 5 letras y números (está en la tapa de detrás).`);
    const i = await infoPlaca(db, c);
    return { ...i, urlNfc: urlNfc(c), urlQr: urlQr(c) };
  });

  app.post("/api/placas/:codigo/asignar", regla("socio"), async (req) => {
    const yo = s(req);
    const { codigo } = z.object({ codigo: z.string().max(20) }).parse(req.params);
    const b = z.object({ comercioId: id, resenasUrl: z.string().trim().max(500).optional().nullable() }).parse(req.body);
    if (b.resenasUrl) await cambiarDatoComercio(db, b.comercioId, "resenas", b.resenasUrl, yo.id, "panel");
    const c = await comercioPorId(db, b.comercioId);
    const yaEra = (await infoPlaca(db, codigo)).placa?.comercioId === c.id;
    const r = yaEra ? null : await asignarPlaca(db, codigo, c.id, yo.id, "panel");
    if (r) await avisoPanel(db, yo, `placa ${r.placa.codigo} asignada a ${c.nombre}${r.antes ? ` (antes era de ${r.antes.nombre})` : ""}`);
    return { codigo: normalizarCodigo(codigo), comercio: c.nombre, urlNfc: urlNfc(normalizarCodigo(codigo)!), conEnlace: !!(b.resenasUrl || c.resenasUrl) };
  });

  app.post("/api/placas/:codigo/quitar", regla("socio"), async (req) => {
    const yo = s(req);
    const { codigo } = z.object({ codigo: z.string().max(20) }).parse(req.params);
    const r = await quitarPlaca(db, codigo, yo.id, "panel");
    await avisoPanel(db, yo, `placa ${r.codigo} quitada${r.comercio ? ` de ${r.comercio.nombre}` : ""}`);
    return { ok: true };
  });

  app.post("/api/placas/:codigo/nfc", regla("socio"), async (req) => {
    const { codigo } = z.object({ codigo: z.string().max(20) }).parse(req.params);
    const b = z.object({ bloqueada: z.boolean() }).parse(req.body);
    await marcarNfc(db, codigo, b.bloqueada, s(req).id);
    return { ok: true };
  });

  // ── Lotes de placas (solo admin) ──
  app.post("/api/lotes", regla("admin"), async (req) => {
    const yo = s(req);
    const b = z.object({ n: z.number().int().min(1).max(MAX_TANDA), nota: z.string().trim().max(200).optional().nullable() }).parse(req.body);
    const r = await crearTanda(db, b.n, yo.id, b.nota);
    await avisoPanel(db, yo, `lote ${r.tanda.id} de ${b.n} placas reservado`);
    return { lote: r.tanda, codigos: r.codigos };
  });

  app.get("/api/lotes/:id/lote.csv", regla("admin"), async (req, reply) => {
    const t = id.parse((req.params as { id: string }).id);
    const cods = await codigosDeTanda(db, t);
    const csv = ["codigo,url_nfc,url_qr", ...cods.map((c) => `${c},${urlNfc(c)},${urlQr(c)}`)].join("\n") + "\n";
    return reply.header("content-type", "text/csv; charset=utf-8").header("content-disposition", `attachment; filename="lote-${t}.csv"`).header("cache-control", "no-store").send(csv);
  });

  app.get("/api/lotes/:id/qr.zip", regla("admin"), async (req, reply) => {
    const t = id.parse((req.params as { id: string }).id);
    const cods = await codigosDeTanda(db, t);
    const archivos: Record<string, Uint8Array> = {};
    for (const c of cods) {
      const q = qrcode(0, "M");
      q.addData(urlQr(c), "Alphanumeric");
      q.make();
      archivos[`qr_${c}.svg`] = strToU8(q.createSvgTag({ cellSize: 10, margin: 4, scalable: true }));
    }
    archivos["lote.csv"] = strToU8(["codigo,url_nfc,url_qr", ...cods.map((c) => `${c},${urlNfc(c)},${urlQr(c)}`)].join("\n") + "\n");
    return reply.header("content-type", "application/zip").header("content-disposition", `attachment; filename="lote-${t}-qr.zip"`).header("cache-control", "no-store").send(Buffer.from(zipSync(archivos)));
  });

  // ── Ajustes ──
  app.get("/api/ajustes", regla("socio"), async () => ({ ajustes: { ...(await leerAjustes(db)), grupoChatId: undefined }, tiposAviso: TIPOS_AVISO }));

  app.put("/api/ajustes", regla("admin"), async (req) => {
    const yo = s(req);
    const b = z
      .object({
        modoReparto: z.enum(["igual", "porcentaje", "aportado"]),
        comisionBp: z.number().int().min(0).max(5000),
        stockMin: z.number().int().min(0).max(10_000),
        bienvenida: z.string().max(1000).nullable(),
        avisosSilenciados: z.array(z.enum(Object.keys(TIPOS_AVISO) as [string, ...string[]])).max(20),
      })
      .partial()
      .parse(req.body);
    const cambios: string[] = [];
    for (const [k, v] of Object.entries(b) as [keyof typeof b, never][]) {
      if (v === undefined) continue;
      await guardarAjuste(db, k, (k === "bienvenida" && !v ? null : v) as never);
      cambios.push(k);
    }
    if (cambios.length) {
      await registrarOperacion(db, { socioId: yo.id, tipo: "ajustes", resumen: `Ajustes cambiados: ${cambios.join(", ")}`, origen: "panel" });
      await avisoPanel(db, yo, `ajustes cambiados (${cambios.join(", ")})`);
    }
    return { ajustes: { ...(await leerAjustes(db)), grupoChatId: undefined } };
  });

  // ── Socios ──
  app.get("/api/socios", regla("socio"), async (req) => {
    const yo = s(req);
    const ss = await listarSocios(db);
    return { socios: ss.map((x) => ({ id: x.id, nombre: x.nombre, rol: x.rol, username: yo.rol === "admin" ? x.username : undefined, pctReparto: x.pctReparto, desde: x.creadoAt })) };
  });

  app.patch("/api/socios/:id", regla("admin"), async (req) => {
    const yo = s(req);
    const sid = id.parse((req.params as { id: string }).id);
    const b = z.object({ rol: z.enum(["admin", "socio"]), pctReparto: z.number().int().min(0).max(10_000), activo: z.literal(false) }).partial().parse(req.body);
    if (!Object.keys(b).length) throw new HttpError(400, "No hay nada que cambiar.");
    if (!(await listarSocios(db)).some((x) => x.id === sid)) throw new HttpError(404, "Ese socio no existe.");
    const r = await cambiarSocio(db, sid, b, yo.id);
    if (b.activo === false) await db.delete(tablas.sesiones).where(eq(tablas.sesiones.socioId, sid));
    await avisoPanel(db, yo, b.activo === false ? `${r.nombre} ya no es socio` : b.rol ? `${r.nombre} ahora es ${b.rol}` : `porcentaje de ${r.nombre}: ${(b.pctReparto ?? 0) / 100} %`);
    return { socio: { id: r.id, nombre: r.nombre, rol: r.rol, pctReparto: r.pctReparto, activo: r.activo } };
  });

  // ── Auditoría (solo admin): todo lo que se ha hecho, con filtros ──
  app.get("/api/auditoria", regla("admin"), async (req) => {
    const q = z.object({ socio: id.optional(), tipo: z.string().max(40).optional(), origen: z.string().max(20).optional(), antesDe: id.optional() }).parse(req.query);
    const o = tablas.operaciones;
    const filas = await db
      .select({ id: o.id, tipo: o.tipo, resumen: o.resumen, origen: o.origen, creadoAt: o.creadoAt, deshechaAt: o.deshechaAt, socio: tablas.socios.nombre })
      .from(o)
      .leftJoin(tablas.socios, eq(tablas.socios.id, o.socioId))
      .where(and(q.socio ? eq(o.socioId, q.socio) : undefined, q.tipo ? eq(o.tipo, q.tipo) : undefined, q.origen ? eq(o.origen, q.origen) : undefined, q.antesDe ? lt(o.id, q.antesDe) : undefined))
      .orderBy(desc(o.id))
      .limit(100);
    const tipos = await db.select({ tipo: o.tipo, n: sql<number>`count(*)::int` }).from(o).where(gte(o.creadoAt, sql`now() - interval '90 days'`)).groupBy(o.tipo).orderBy(o.tipo);
    return { operaciones: filas, tipos };
  });

  return { avisoSesionNueva: (yo: Socio, disp: string | null) => avisar(db, { tipo: "sesion", destino: "socio", socioId: yo.id, texto: `🔐 Nuevo inicio de sesión en el panel${disp ? ` (<b>${html(disp)}</b>)` : ""}. ¿No has sido tú? Escribe /panel cerrar y cierro todas tus sesiones.` }) };
}
