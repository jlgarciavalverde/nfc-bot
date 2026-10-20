import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Convenciones: dinero en céntimos (integer), porcentajes en puntos básicos (1 % = 100),
// nada se borra: los registros de negocio se anulan (`anuladoAt`) y las consultas los excluyen.

const creado = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const anulado = () => timestamp({ withTimezone: true });

export const rolSocio = pgEnum("rol_socio", ["admin", "socio"]);

export const socios = pgTable("socios", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  telegramId: bigint({ mode: "number" }).notNull().unique(),
  nombre: text().notNull(),
  username: text(),
  rol: rolSocio().notNull().default("socio"),
  /** Parte del beneficio en puntos básicos (solo cuenta con el reparto «porcentaje»). */
  pctReparto: integer().notNull().default(0),
  activo: boolean().notNull().default(true),
  creadoAt: creado(),
});

/** Ajustes sueltos (grupo vinculado, stock mínimo, regla de reparto…). */
export const ajustes = pgTable("ajustes", {
  clave: text().primaryKey(),
  valor: jsonb().notNull(),
});

export const productos = pgTable("productos", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  nombre: text().notNull(),
  nombreNorm: text().notNull().unique(),
  precioCent: integer().notNull(),
  activo: boolean().notNull().default(true),
  creadoAt: creado(),
});

/** A partir de `desdeUds` unidades, cada unidad cuesta `precioCent` o tiene `descuentoBp` de descuento. */
export const tramos = pgTable(
  "tramos",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    productoId: integer().notNull().references(() => productos.id),
    desdeUds: integer().notNull(),
    precioCent: integer(),
    descuentoBp: integer(),
  },
  (t) => [
    uniqueIndex("tramos_producto_desde").on(t.productoId, t.desdeUds),
    check("tramos_uno_de_dos", sql`(${t.precioCent} is null) <> (${t.descuentoBp} is null)`),
  ],
);

export const tipoOferta = pgEnum("tipo_oferta", ["nxm", "pack", "descuento"]);

/**
 * Ofertas (no se acumulan entre sí: se aplica la que deja el precio más bajo).
 * - nxm: lleva `n`, paga `m`.
 * - pack: `n` unidades por `precioCent`.
 * - descuento: `descuentoBp` sobre el total a partir de `n` unidades.
 */
export const ofertas = pgTable("ofertas", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  productoId: integer().notNull().references(() => productos.id),
  nombre: text().notNull(),
  tipo: tipoOferta().notNull(),
  n: integer().notNull(),
  m: integer(),
  precioCent: integer(),
  descuentoBp: integer(),
  desde: date(),
  hasta: date(),
  activa: boolean().notNull().default(true),
  creadoAt: creado(),
});

export const estadoComercio = pgEnum("estado_comercio", ["pendiente", "interesado", "si", "no", "cliente"]);

export const comercios = pgTable(
  "comercios",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    nombre: text().notNull(),
    nombreNorm: text().notNull(),
    tipo: text(),
    zona: text(),
    direccion: text(),
    contacto: text(),
    mapsUrl: text(),
    nota: text(),
    lat: real(),
    lon: real(),
    estado: estadoComercio().notNull().default("pendiente"),
    motivoNo: text(),
    responsableId: integer().references(() => socios.id),
    creadoPor: integer().references(() => socios.id),
    creadoAt: creado(),
    actualizadoAt: creado(),
    anuladoAt: anulado(),
  },
  (t) => [index("comercios_nombre_norm").on(t.nombreNorm), index("comercios_estado").on(t.estado)],
);

export const resultadoVisita = pgEnum("resultado_visita", ["si", "no", "luego", "interesado"]);

export const visitas = pgTable(
  "visitas",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    comercioId: integer().notNull().references(() => comercios.id),
    socioId: integer().notNull().references(() => socios.id),
    fecha: date().notNull(),
    resultado: resultadoVisita().notNull(),
    nota: text(),
    proximaFecha: date(),
    creadoAt: creado(),
    anuladoAt: anulado(),
  },
  (t) => [index("visitas_comercio").on(t.comercioId), index("visitas_socio").on(t.socioId)],
);

export const metodoPago = pgEnum("metodo_pago", ["efectivo", "bizum", "transferencia", "tarjeta", "otro"]);

export const ventas = pgTable(
  "ventas",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    comercioId: integer().notNull().references(() => comercios.id),
    socioId: integer().notNull().references(() => socios.id),
    productoId: integer().notNull().references(() => productos.id),
    fecha: date().notNull(),
    uds: integer().notNull(),
    /** Total cobrado o por cobrar. */
    totalCent: integer().notNull(),
    /** Lo que costaría sin tramos ni ofertas (para ver el descuento concedido). */
    precioListaCent: integer().notNull(),
    /** Qué precio se aplicó («Tramo desde 5 uds», «Oferta 3x2», «Precio pactado»…). */
    aplicado: text().notNull(),
    /** Coste de los paneles según los lotes (FIFO); null si aún no se lleva stock. */
    costeCent: integer(),
    cobrada: boolean().notNull().default(false),
    metodo: metodoPago(),
    nota: text(),
    creadoAt: creado(),
    anuladoAt: anulado(),
  },
  (t) => [index("ventas_comercio").on(t.comercioId), index("ventas_socio").on(t.socioId), index("ventas_fecha").on(t.fecha)],
);

export const lotes = pgTable("lotes", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  productoId: integer().notNull().references(() => productos.id),
  fecha: date().notNull(),
  uds: integer().notNull(),
  udsRestantes: integer().notNull(),
  costeCent: integer().notNull(),
  proveedor: text(),
  socioId: integer().notNull().references(() => socios.id),
  creadoAt: creado(),
  anuladoAt: anulado(),
});

/** Qué unidades de qué lote salieron en cada venta (para el margen y para deshacer la venta). */
export const consumos = pgTable(
  "consumos",
  {
    ventaId: integer().notNull().references(() => ventas.id),
    loteId: integer().notNull().references(() => lotes.id),
    uds: integer().notNull(),
    costeCent: integer().notNull(),
  },
  (t) => [primaryKey({ columns: [t.ventaId, t.loteId] }), index("consumos_lote").on(t.loteId)],
);

export const tipoMovimiento = pgEnum("tipo_movimiento", ["aportacion", "gasto", "ingreso", "retirada"]);

/** Libro de caja. El importe siempre es positivo; el tipo dice si entra o sale. */
export const movimientos = pgTable(
  "movimientos",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    tipo: tipoMovimiento().notNull(),
    importeCent: integer().notNull(),
    fecha: date().notNull(),
    /** Quién aporta, gasta, cobra o retira. */
    socioId: integer().notNull().references(() => socios.id),
    categoria: text(),
    nota: text(),
    ventaId: integer().references(() => ventas.id),
    loteId: integer().references(() => lotes.id),
    creadoAt: creado(),
    anuladoAt: anulado(),
  },
  (t) => [index("movimientos_fecha").on(t.fecha), index("movimientos_venta").on(t.ventaId), check("importe_positivo", sql`${t.importeCent} > 0`)],
);

export const recordatorios = pgTable(
  "recordatorios",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    comercioId: integer().notNull().references(() => comercios.id),
    socioId: integer().notNull().references(() => socios.id),
    visitaId: integer().references(() => visitas.id),
    fecha: date().notNull(),
    nota: text(),
    hechoAt: timestamp({ withTimezone: true }),
    creadoAt: creado(),
    anuladoAt: anulado(),
  },
  (t) => [index("recordatorios_fecha").on(t.fecha)],
);

/**
 * Cada operación que cambia datos, con lo necesario para deshacerla. Es también el registro de auditoría:
 * quién hizo qué y cuándo.
 */
export const operaciones = pgTable(
  "operaciones",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    socioId: integer().references(() => socios.id),
    tipo: text().notNull(),
    resumen: text().notNull(),
    deshacer: jsonb(),
    origen: text().notNull().default("bot"),
    creadoAt: creado(),
    deshechaAt: timestamp({ withTimezone: true }),
  },
  (t) => [index("operaciones_socio").on(t.socioId, t.creadoAt)],
);

/** Acciones que esperan un «Confirmar» (propuestas de la IA, crear un comercio desconocido, altas). */
export const pendientes = pgTable("pendientes", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  socioId: integer().references(() => socios.id),
  /** Para altas: el usuario de Telegram que la pidió (aún no es socio). */
  telegramId: bigint({ mode: "number" }),
  accion: jsonb().notNull(),
  expiraAt: timestamp({ withTimezone: true }).notNull(),
  resueltaAt: timestamp({ withTimezone: true }),
  creadoAt: creado(),
});

/** Avisos programados ya enviados (idempotente tras reinicios). */
export const envios = pgTable("envios", {
  clave: text().primaryKey(),
  creadoAt: creado(),
});

export const enlacesPanel = pgTable("enlaces_panel", {
  tokenHash: text().primaryKey(),
  socioId: integer().notNull().references(() => socios.id),
  expiraAt: timestamp({ withTimezone: true }).notNull(),
  usadoAt: timestamp({ withTimezone: true }),
});

export const sesiones = pgTable("sesiones", {
  tokenHash: text().primaryKey(),
  socioId: integer().notNull().references(() => socios.id),
  expiraAt: timestamp({ withTimezone: true }).notNull(),
  creadoAt: creado(),
});

/** Uso diario de la IA (límite propio además del del plan gratuito). */
export const usoIa = pgTable("uso_ia", {
  fecha: date().primaryKey(),
  peticiones: integer().notNull().default(0),
});
