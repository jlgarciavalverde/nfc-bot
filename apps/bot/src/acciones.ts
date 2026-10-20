import { z } from "zod";

/** Comercio por nombre (lo escribe alguien) o por id (ya resuelto, p. ej. tras elegir entre varios). */
const comercio = z.union([z.string().min(1).max(120), z.number().int().positive()]);
const metodo = z.enum(["efectivo", "bizum", "transferencia", "tarjeta", "otro"]);
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const cent = z.number().int().positive().max(100_000_000);
const texto = z.string().max(500);

/**
 * Todo lo que el bot sabe hacer, venga de un comando, de la IA o de un botón de confirmar.
 * Las de `ESCRITURA` cambian datos: si vienen de la IA, piden confirmación antes de ejecutarse.
 */
export const Accion = z.discriminatedUnion("t", [
  // ── Consultas ──
  z.object({ t: z.literal("ayuda"), tema: z.string().optional() }),
  z.object({ t: z.literal("precios") }),
  z.object({ t: z.literal("precio"), uds: z.number().int().positive().max(10_000), producto: z.string().optional() }),
  z.object({ t: z.literal("ficha"), comercio }),
  z.object({ t: z.literal("buscar"), texto: z.string().min(1).max(120) }),
  z.object({ t: z.literal("lista"), estado: z.enum(["pendiente", "interesado", "si", "no", "cliente"]).optional(), zona: z.string().max(120).optional() }),
  z.object({ t: z.literal("embudo") }),
  z.object({ t: z.literal("caja") }),
  z.object({ t: z.literal("mes"), mes: z.string().regex(/^\d{4}-\d{2}$/).optional() }),
  z.object({ t: z.literal("stock") }),
  z.object({ t: z.literal("ventas"), pendientes: z.boolean().optional() }),
  z.object({ t: z.literal("movimientos") }),
  z.object({ t: z.literal("pendientes"), todos: z.boolean().optional() }),
  z.object({ t: z.literal("reparto") }),
  z.object({ t: z.literal("socios") }),
  // ── Escrituras ──
  z.object({ t: z.literal("nuevo"), nombre: z.string().min(1).max(120), tipo: texto.optional(), zona: texto.optional(), contacto: texto.optional(), direccion: texto.optional() }),
  z.object({ t: z.literal("dato"), comercio, campo: z.enum(["tipo", "zona", "direccion", "contacto", "maps", "nota", "nombre"]), valor: texto }),
  z.object({ t: z.literal("visita"), comercio, resultado: z.enum(["si", "no", "luego", "interesado"]), nota: texto.optional(), proxima: fecha.optional() }),
  z.object({
    t: z.literal("venta"),
    comercio,
    uds: z.number().int().positive().max(10_000),
    cobrada: z.boolean(),
    metodo: metodo.optional(),
    pactadoCent: cent.optional(),
    producto: z.string().max(120).optional(),
    nota: texto.optional(),
  }),
  z.object({ t: z.literal("cobrado"), ventaId: z.number().int().positive(), metodo: metodo.optional() }),
  z.object({ t: z.literal("movimiento"), tipo: z.enum(["aportacion", "gasto", "ingreso", "retirada"]), cent, categoria: z.string().max(60).optional(), nota: texto.optional() }),
  z.object({ t: z.literal("compra"), uds: z.number().int().positive().max(100_000), cent, proveedor: texto.optional(), producto: z.string().max(120).optional() }),
  z.object({ t: z.literal("recordar"), comercio, fecha, nota: texto.optional() }),
  z.object({ t: z.literal("ubicacion"), comercio: z.number().int().positive(), lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }),
  // ── Solo admin ──
  z.object({ t: z.literal("producto"), nombre: z.string().min(1).max(120), cent, nuevo: z.boolean() }),
  z.object({ t: z.literal("tramo"), producto: z.string().optional(), desde: z.number().int().min(2), cent: cent.optional(), descuentoBp: z.number().int().min(1).max(10_000).optional(), borrar: z.boolean().optional() }),
  z.object({
    t: z.literal("oferta"),
    producto: z.string().optional(),
    tipo: z.enum(["nxm", "pack", "descuento"]),
    n: z.number().int().positive(),
    m: z.number().int().positive().optional(),
    cent: cent.optional(),
    descuentoBp: z.number().int().min(1).max(10_000).optional(),
    hasta: fecha.optional(),
  }),
  z.object({ t: z.literal("quitarOferta"), id: z.number().int().positive() }),
  z.object({ t: z.literal("config"), clave: z.enum(["reparto", "comision", "porcentaje", "stock", "admin", "socio", "baja", "producto"]), socio: z.string().optional(), valor: z.string() }),
  z.object({ t: z.literal("alta"), telegramId: z.number().int(), nombre: z.string().max(120), username: z.string().max(64).nullable().optional() }),
]);
export type Accion = z.infer<typeof Accion>;

export const ESCRITURA = new Set<Accion["t"]>(["nuevo", "dato", "visita", "venta", "cobrado", "movimiento", "compra", "recordar", "ubicacion", "producto", "tramo", "oferta", "quitarOferta", "config", "alta"]);
export const SOLO_ADMIN = new Set<Accion["t"]>(["producto", "tramo", "oferta", "quitarOferta", "config", "alta"]);
