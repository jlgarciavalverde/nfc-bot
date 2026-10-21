import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  actividadReciente, apuntarMovimiento, avisar, buscarComercio, cambiarDatoComercio, comercioPorId, comprarLote, crearComercio,
  crearRecordatorio, deshacerUltima, ErrorNegocio, estadoStock, euros, hoy, html, leerAjustes, listarProductos, marcarCobrada,
  marcarHecho, registrarVenta, registrarVisita, resolverProducto, tablas, CAMPOS_COMERCIO, type DB, type Socio, type Tx,
} from "@nfc/core";
import { eq } from "drizzle-orm";

export const eurosTxt = euros;

/** Aviso al grupo de lo que alguien ha hecho desde el panel (los demás socios se enteran sin abrirlo). */
export async function avisoPanel(db: Tx, s: Socio, que: string) {
  await avisar(db, { tipo: "panel", texto: `🖥️ <b>${html(s.nombre)}</b> desde el panel: ${html(que)}` });
}

const id = z.coerce.number().int().positive();
const cent = z.number().int().positive().max(100_000_000);
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const texto = (max = 500) => z.string().trim().max(max).optional().nullable().transform((v) => v || null);
const metodo = z.enum(["efectivo", "bizum", "transferencia", "tarjeta", "otro"]);
const RESULTADO = { si: "sí", no: "no", luego: "volver otro día", interesado: "interesado" } as const;
const TIPO_MOV = { aportacion: "aportación", gasto: "gasto", ingreso: "ingreso", retirada: "retirada" } as const;

/** Apuntar desde el panel: lo mismo que en el bot, con los mismos servicios (y su registro para deshacer). */
export async function registrarGestion(app: FastifyInstance, db: DB, g: { socio: (r: FastifyRequest) => Socio; admin: (r: FastifyRequest) => Socio }) {
  const { socio } = g;

  app.get("/api/actividad", async (req) => ({ actividad: await actividadReciente(db, socio(req).id) }));

  app.post("/api/deshacer", async (req) => {
    const s = socio(req);
    const resumen = await deshacerUltima(db, s.id);
    await avisoPanel(db, s, `deshecho «${resumen}»`);
    return { resumen };
  });

  app.post("/api/comercios", async (req) => {
    const s = socio(req);
    const b = z
      .object({ nombre: z.string().trim().min(1).max(120), tipo: texto(), zona: texto(), direccion: texto(), contacto: texto(), mapsUrl: texto().refine((v) => !v || v.startsWith("https://"), "El enlace tiene que empezar por https://"), nota: texto() })
      .parse(req.body);
    const c = await crearComercio(db, b, s.id, "panel");
    await avisoPanel(db, s, `nuevo comercio ${c.nombre}${c.zona ? ` (${c.zona})` : ""}`);
    return { comercio: c };
  });

  app.patch("/api/comercios/:id", async (req) => {
    const s = socio(req);
    const cid = id.parse((req.params as { id: string }).id);
    const b = z.partialRecord(z.enum(Object.keys(CAMPOS_COMERCIO) as [keyof typeof CAMPOS_COMERCIO]), z.string().max(500)).parse(req.body);
    let c = await comercioPorId(db, cid);
    for (const [campo, valor] of Object.entries(b)) c = await cambiarDatoComercio(db, cid, campo as keyof typeof CAMPOS_COMERCIO, valor ?? "", s.id, "panel");
    return { comercio: c };
  });

  app.post("/api/visitas", async (req) => {
    const s = socio(req);
    const b = z.object({ comercioId: id, resultado: z.enum(["si", "no", "luego", "interesado"]), nota: texto(), proxima: fecha.optional().nullable() }).parse(req.body);
    const r = await registrarVisita(db, { comercioId: b.comercioId, resultado: b.resultado, nota: b.nota, proximaFecha: b.proxima ?? null }, s.id, "panel");
    await avisoPanel(db, s, `visita a ${r.comercio.nombre}: ${RESULTADO[b.resultado]}${b.nota ? ` (${b.nota})` : ""}${r.proxima ? `, volver el ${r.proxima}` : ""}`);
    return r;
  });

  app.post("/api/ventas", async (req) => {
    const s = socio(req);
    const b = z
      .object({ comercioId: id, productoId: id.optional(), uds: z.number().int().positive().max(10_000), cobrada: z.boolean(), metodo: metodo.optional().nullable(), pactadoCent: cent.optional().nullable(), nota: texto() })
      .parse(req.body);
    const producto = b.productoId ? (await listarProductos(db)).find((p) => p.id === b.productoId) : await resolverProducto(db);
    if (!producto) throw new ErrorNegocio("Ese producto no existe.");
    const r = await registrarVenta(db, { comercioId: b.comercioId, producto, uds: b.uds, cobrada: b.cobrada, metodo: b.cobrada ? (b.metodo ?? null) : null, totalPactadoCent: b.pactadoCent ?? null, nota: b.nota }, s.id, "panel");
    await avisoPanel(db, s, `venta #${r.venta.id} a ${r.comercio.nombre}: ${b.uds} ${b.uds === 1 ? "ud" : "uds"} por ${euros(r.venta.totalCent)}, ${r.venta.cobrada ? "cobrada" : "pendiente de cobro"}`);
    await avisoStock(db, producto.id);
    return { venta: r.venta };
  });

  app.post("/api/ventas/:id/cobrar", async (req) => {
    const s = socio(req);
    const vid = id.parse((req.params as { id: string }).id);
    const b = z.object({ metodo: metodo.optional().nullable() }).parse(req.body ?? {});
    const r = await marcarCobrada(db, vid, b.metodo ?? null, s.id, "panel");
    await avisoPanel(db, s, `cobrada la venta #${vid} de ${r.comercio} (${euros(r.venta.totalCent)}${b.metodo ? `, ${b.metodo}` : ""})`);
    return { ok: true };
  });

  app.post("/api/movimientos", async (req) => {
    const s = socio(req);
    const b = z.object({ tipo: z.enum(["aportacion", "gasto", "ingreso", "retirada"]), cent, categoria: texto(60), nota: texto() }).parse(req.body);
    await apuntarMovimiento(db, { tipo: b.tipo, importeCent: b.cent, socioId: s.id, categoria: b.categoria?.toLowerCase() ?? (b.tipo === "ingreso" ? "otros" : null), nota: b.nota }, s.id, "panel");
    await avisoPanel(db, s, `${TIPO_MOV[b.tipo]} de ${euros(b.cent)}${b.categoria ? ` (${b.categoria})` : ""}${b.nota ? `: ${b.nota}` : ""}`);
    return { ok: true };
  });

  app.post("/api/compras", async (req) => {
    const s = socio(req);
    const b = z.object({ productoId: id.optional(), uds: z.number().int().positive().max(100_000), cent, proveedor: texto(120) }).parse(req.body);
    const producto = b.productoId ? (await listarProductos(db)).find((p) => p.id === b.productoId) : await resolverProducto(db);
    if (!producto) throw new ErrorNegocio("Ese producto no existe.");
    const l = await comprarLote(db, { producto, uds: b.uds, costeCent: b.cent, proveedor: b.proveedor }, s.id, "panel");
    await avisoPanel(db, s, `compra de ${l.uds} ${producto.nombre} por ${euros(l.costeCent)}${l.proveedor ? ` a ${l.proveedor}` : ""}`);
    return { lote: l };
  });

  app.post("/api/recordatorios", async (req) => {
    const s = socio(req);
    const b = z.object({ comercioId: id, fecha, nota: texto() }).parse(req.body);
    if (b.fecha < hoy()) throw new ErrorNegocio("Esa fecha ya ha pasado.");
    const c = await comercioPorId(db, b.comercioId);
    const r = await crearRecordatorio(db, { comercioId: c.id, fecha: b.fecha, nota: b.nota }, s.id);
    return { recordatorio: r };
  });

  app.post("/api/recordatorios/:id/hecho", async (req) => {
    const s = socio(req);
    await marcarHecho(db, id.parse((req.params as { id: string }).id), s.id);
    return { ok: true };
  });

  /** Para el buscador de comercios de los formularios. */
  app.get("/api/comercios-buscar", async (req) => {
    socio(req);
    const q = z.object({ q: z.string().max(120) }).parse(req.query);
    return { comercios: (await buscarComercio(db, q.q)).opciones.map((c) => ({ id: c.id, nombre: c.nombre, zona: c.zona, estado: c.estado })) };
  });
}

async function avisoStock(db: Tx, productoId: number) {
  const { stockMin } = await leerAjustes(db);
  const s = (await estadoStock(db)).find((x) => x.productoId === productoId);
  if (s && s.lotes && s.uds < stockMin) {
    const [p] = await db.select({ nombre: tablas.productos.nombre }).from(tablas.productos).where(eq(tablas.productos.id, productoId));
    await avisar(db, { tipo: "stock", texto: `⚠️ Quedan <b>${s.uds}</b> ${s.uds === 1 ? "panel" : "paneles"} de ${html(p?.nombre ?? "")}. Toca pedir más.` });
  }
}
