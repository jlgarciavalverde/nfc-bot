import { Accion } from "../acciones";

export interface ContextoIa {
  hoy: string;
  /** Comercios conocidos, para que la IA use el nombre exacto. */
  comercios: string[];
  productos: string[];
  socio: string;
}

export type Interpretacion = { ok: true; accion: Accion } | { ok: false; respuesta: string };

export interface Interprete {
  nombre: string;
  interpretar(texto: string, ctx: ContextoIa): Promise<Interpretacion>;
}

export class ErrorIa extends Error {}

/** Esquema de salida (subconjunto OpenAPI que entiende Gemini). Plano a propósito: la IA se equivoca menos. */
export const ESQUEMA = {
  type: "OBJECT",
  properties: {
    accion: {
      type: "STRING",
      enum: [
        "ninguna", "precio", "precios", "ficha", "buscar", "lista", "embudo", "caja", "mes", "stock", "ventas", "pendientes", "reparto",
        "nuevo", "dato", "visita", "venta", "cobrado", "aportacion", "gasto", "ingreso", "retirada", "compra", "recordar",
      ],
    },
    comercio: { type: "STRING", description: "Nombre del comercio; si se parece a uno de la lista, usa el de la lista tal cual" },
    unidades: { type: "INTEGER" },
    importe_euros: { type: "NUMBER", description: "Importe en euros (total, no por unidad)" },
    cobrada: { type: "BOOLEAN", description: "Venta ya pagada" },
    metodo: { type: "STRING", enum: ["efectivo", "bizum", "transferencia", "tarjeta", "otro"] },
    resultado: { type: "STRING", enum: ["si", "no", "luego", "interesado"], description: "Resultado de la visita" },
    nota: { type: "STRING" },
    fecha: { type: "STRING", description: "YYYY-MM-DD: para visita, cuándo volver; para recordar, el día" },
    producto: { type: "STRING" },
    categoria: { type: "STRING", description: "Categoría del gasto en una palabra (imprenta, gasolina, stock, publicidad…)" },
    proveedor: { type: "STRING" },
    campo: { type: "STRING", enum: ["tipo", "zona", "direccion", "contacto", "maps", "resenas", "nota", "nombre"] },
    valor: { type: "STRING" },
    texto: { type: "STRING", description: "Texto a buscar" },
    venta_id: { type: "INTEGER" },
    mes: { type: "STRING", description: "YYYY-MM" },
    estado: { type: "STRING", enum: ["pendiente", "interesado", "si", "no", "cliente"] },
    zona: { type: "STRING" },
    pendientes: { type: "BOOLEAN", description: "En «ventas»: solo las pendientes de cobro" },
    respuesta: { type: "STRING", description: "Si accion = ninguna: una frase corta explicando qué falta o qué puede escribir" },
  },
  required: ["accion"],
} as const;

export function instrucciones(ctx: ContextoIa) {
  return [
    "Eres el asistente de un grupo de amigos que vende paneles NFC para reseñas de Google a pequeños comercios.",
    "Convierte el mensaje en UNA acción del esquema. No inventes datos: si falta algo imprescindible (p. ej. unidades de una venta), usa accion = ninguna y explica qué falta en `respuesta`.",
    `Hoy es ${ctx.hoy}. Quien escribe es ${ctx.socio}. Convierte fechas relativas («el lunes», «en dos semanas») a YYYY-MM-DD.`,
    "Acciones: visita = han ido a un comercio (si = acepta, no = rechaza, luego = volver otro día, interesado = le interesa pero no decide);",
    "venta = han vendido paneles (unidades obligatorias; importe_euros solo si dicen un precio pactado distinto del normal; cobrada si ya han pagado);",
    "cobrado = ya han pagado una venta pendiente (venta_id); aportacion = un socio pone dinero en el negocio; gasto = pagan algo del negocio;",
    "ingreso = entra dinero que no es una venta; retirada = un socio se lleva dinero; compra = compran paneles al proveedor (unidades e importe total);",
    "recordar = acordarse de volver a un comercio un día; nuevo = apuntar un comercio sin visitarlo; dato = cambiar un dato de un comercio;",
    "precio = cuánto cuestan N paneles; ficha = información de un comercio; caja/mes/stock/embudo/reparto/ventas/pendientes = consultas.",
    "Si es una charla sin relación con el negocio, accion = ninguna y una respuesta muy breve.",
    `Comercios conocidos: ${ctx.comercios.slice(0, 300).join(" | ") || "(ninguno)"}`,
    `Productos: ${ctx.productos.join(" | ") || "(ninguno)"}`,
  ].join("\n");
}

const limpio = (s: unknown) => (typeof s === "string" && s.trim() ? s.trim() : undefined);
const centDe = (n: unknown) => (typeof n === "number" && n > 0 ? Math.round(n * 100) : undefined);

/** Traduce la salida plana de la IA a una acción válida (o explica por qué no). */
export function aAccion(r: Record<string, unknown>): Interpretacion {
  const s = (k: string) => limpio(r[k]);
  const n = (k: string) => (typeof r[k] === "number" ? (r[k] as number) : undefined);
  const nada = (respuesta: string): Interpretacion => ({ ok: false, respuesta });
  let a: unknown;
  switch (r.accion) {
    case "ninguna":
      return nada(s("respuesta") ?? "No sé qué apuntar con eso. Mira /ayuda.");
    case "precio": a = { t: "precio", uds: n("unidades"), producto: s("producto") }; break;
    case "precios": a = { t: "precios" }; break;
    case "ficha": a = { t: "ficha", comercio: s("comercio") }; break;
    case "buscar": a = { t: "buscar", texto: s("texto") ?? s("comercio") }; break;
    case "lista": a = { t: "lista", estado: s("estado"), zona: s("zona") }; break;
    case "embudo": a = { t: "embudo" }; break;
    case "caja": a = { t: "caja" }; break;
    case "mes": a = { t: "mes", mes: s("mes") }; break;
    case "stock": a = { t: "stock" }; break;
    case "ventas": a = { t: "ventas", pendientes: r.pendientes === true || undefined }; break;
    case "pendientes": a = { t: "pendientes" }; break;
    case "reparto": a = { t: "reparto" }; break;
    case "nuevo": a = { t: "nuevo", nombre: s("comercio"), zona: s("zona"), nota: undefined }; break;
    case "dato": a = { t: "dato", comercio: s("comercio"), campo: s("campo"), valor: s("valor") ?? "" }; break;
    case "visita": a = { t: "visita", comercio: s("comercio"), resultado: s("resultado"), nota: s("nota"), proxima: s("resultado") === "no" ? undefined : s("fecha") }; break;
    case "venta": a = { t: "venta", comercio: s("comercio"), uds: n("unidades"), cobrada: r.cobrada === true || !!s("metodo"), metodo: s("metodo"), pactadoCent: centDe(r.importe_euros), producto: s("producto"), nota: s("nota") }; break;
    case "cobrado": a = { t: "cobrado", ventaId: n("venta_id"), metodo: s("metodo") }; break;
    case "aportacion":
    case "gasto":
    case "ingreso":
    case "retirada": a = { t: "movimiento", tipo: r.accion, cent: centDe(r.importe_euros), categoria: s("categoria")?.toLowerCase(), nota: s("nota") }; break;
    case "compra": a = { t: "compra", uds: n("unidades"), cent: centDe(r.importe_euros), proveedor: s("proveedor"), producto: s("producto") }; break;
    case "recordar": a = { t: "recordar", comercio: s("comercio"), fecha: s("fecha"), nota: s("nota") }; break;
    default:
      return nada("No lo he entendido. Mira /ayuda.");
  }
  const p = Accion.safeParse(a);
  if (!p.success) {
    const campos = [...new Set(p.error.issues.map((i) => String(i.path[0])))].join(", ");
    return nada(`Me falta algún dato (${campos}). Dímelo otra vez con más detalle o usa el comando: /ayuda`);
  }
  return { ok: true, accion: p.data };
}
