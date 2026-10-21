import { ErrorNegocio, extraerFecha, MESES, normalizar, parseEuros, parsePorcentaje } from "@nfc/core";
import type { Accion } from "./acciones";

/** Uso de cada comando (se enseña cuando falta algo). */
export const USO: Record<string, string> = {
  precio: "/precio 5  (cuánto sale comprar 5 paneles)",
  ficha: "/ficha Bar Pepe",
  buscar: "/buscar pepe",
  zona: "/zona centro",
  nuevo: "/nuevo Bar Pepe | bar | centro | 600123123",
  dato: "/dato Bar Pepe | contacto | Pepe 600123123   (campos: tipo, zona, direccion, contacto, maps, resenas, nota, nombre)",
  placa: "/placa K7M2Q Bar Pepe — asignar   ·   /placa K7M2Q — ver   ·   /placa K7M2Q quitar",
  visita: "/visita Bar Pepe no muy caro   ·   /visita Bar Pepe luego volver en 2 semanas   ·   /visita Bar Pepe si",
  venta: "/venta Bar Pepe 3 pagado bizum   ·   /venta Bar Pepe 3 pendiente   ·   /venta Bar Pepe 5 por 90€ pagado",
  cobrado: "/cobrado 12 bizum   (número de la venta, lo ves en /ventas)",
  aporto: "/aporto 50 para la primera compra",
  gasto: "/gasto 30 imprenta tarjetas",
  ingreso: "/ingreso 20 propina",
  retiro: "/retiro 100",
  compra: "/compra 50 180€ AliExpress   (50 paneles por 180 € en total)",
  recordar: "/recordar Bar Pepe el lunes llamar al dueño",
  producto: "/producto nuevo Panel NFC 25€   ·   /producto Panel NFC 22€",
  tramo: "/tramo 5 20€   (desde 5 uds, 20 €/ud)   ·   /tramo 10 -25%   ·   /tramo borrar 5",
  oferta: "/oferta 3x2   ·   /oferta pack 5 99€   ·   /oferta -10% desde 20   ·   añade «hasta 31/12» si caduca   ·   /oferta quitar 3",
  config:
    "/config reparto igual|porcentaje|aportado   ·   /config comision 10%   ·   /config porcentaje Ana 50%   ·   /config stock 5   ·   /config admin Ana   ·   /config socio Ana   ·   /config baja Ana   ·   /config producto Panel NFC   ·   /config bienvenida ¡Hola, {nombre}!   ·   /config avisos   ·   /config avisos copia no   ·   /config nombre Billetes   ·   /config tono cercano|serio|gracioso   ·   /config emojis si|no   ·   /config ia responde en una línea   ·   /config limpieza",
  mes: "/mes   ·   /mes septiembre   ·   /mes 2026-09",
};

const falta = (cmd: string) => new ErrorNegocio(`Así: ${USO[cmd] ?? `/${cmd}`}`);

const RESULTADOS: Record<string, "si" | "no" | "luego" | "interesado"> = {
  si: "si",
  vale: "si",
  acepta: "si",
  no: "no",
  luego: "luego",
  despues: "luego",
  volver: "luego",
  pensarlo: "luego",
  interesado: "interesado",
  interesada: "interesado",
  interesa: "interesado",
};
const METODOS = { efectivo: "efectivo", bizum: "bizum", transferencia: "transferencia", transfer: "transferencia", tarjeta: "tarjeta", datafono: "tarjeta", otro: "otro" } as const;
type Metodo = (typeof METODOS)[keyof typeof METODOS];

const metodoDe = (palabra: string): Metodo | undefined => (METODOS as Record<string, Metodo>)[normalizar(palabra)];
const vacio = (s: string | undefined) => (s?.trim() ? s.trim() : undefined);
const partes = (s: string) => s.split("|").map((x) => x.trim());
const entero = (s: string | undefined) => (s && /^\d+$/.test(s) ? Number(s) : null);

/** «50», «50uds», «50 uds», «50 paneles» → 50. Devuelve también cuántas palabras ocupa. */
function unidades(palabras: string[], i: number): { n: number; ocupa: number } | null {
  const w = palabras[i];
  if (!w) return null;
  const m = /^(\d+)(uds?|unidades|paneles)?$/i.exec(w);
  if (!m) return null;
  const sig = normalizar(palabras[i + 1] ?? "");
  const ocupa = !m[2] && ["ud", "uds", "unidades", "panel", "paneles", "u"].includes(sig) ? 2 : 1;
  return { n: Number(m[1]), ocupa };
}

function importe(cmd: string, args: string) {
  const [primero, ...resto] = args.trim().split(/\s+/);
  let cent = primero ? parseEuros(primero) : null;
  let nota = resto.join(" ");
  // «50 €» con espacio
  if (cent && /^(€|eur|euros)$/i.test(resto[0] ?? "")) nota = resto.slice(1).join(" ");
  if (!cent) {
    // «para la imprenta 30€»: busca el importe en cualquier sitio
    const m = /(\d+(?:[.,]\d{1,2})?)\s*(€|eur|euros)/i.exec(args);
    if (m) {
      cent = parseEuros(m[1]!);
      nota = (args.slice(0, m.index) + args.slice(m.index + m[0].length)).replace(/\s+/g, " ").trim();
    }
  }
  if (!cent) throw falta(cmd);
  return { cent, nota: vacio(nota) };
}

/** «2026-09», «septiembre», «septiembre 2025» → YYYY-MM. */
export function parseMes(s: string, hoy: string): string | null {
  const t = normalizar(s);
  if (!t) return hoy.slice(0, 7);
  if (/^\d{4} \d{2}$/.test(t)) return t.replace(" ", "-");
  const [nombre, anio] = t.split(" ");
  const i = MESES.indexOf(nombre!);
  if (i < 0) return null;
  let y = anio && /^\d{4}$/.test(anio) ? Number(anio) : Number(hoy.slice(0, 4));
  const mm = String(i + 1).padStart(2, "0");
  if (!anio && `${y}-${mm}` > hoy.slice(0, 7)) y -= 1; // «diciembre» en enero es el pasado
  return `${y}-${mm}`;
}

/**
 * Traduce un comando de texto a una acción. `cmd` sin la barra, en minúsculas; `args` el resto del mensaje.
 * Lanza ErrorNegocio con el uso correcto si falta algo.
 */
export function parseComando(cmd: string, args: string, hoy: string): Accion | null {
  const a = args.trim();
  const palabras = a.split(/\s+/).filter(Boolean);
  switch (cmd) {
    case "start":
    case "ayuda":
    case "help":
      return { t: "ayuda", tema: vacio(a) };
    case "precios":
      return { t: "precios" };
    case "precio": {
      const u = unidades(palabras, 0);
      if (!u || u.n <= 0) throw falta("precio");
      return { t: "precio", uds: u.n, producto: vacio(palabras.slice(u.ocupa).join(" ")) };
    }
    case "ficha":
    case "comercio":
      if (!a) throw falta("ficha");
      return { t: "ficha", comercio: a };
    case "buscar":
      if (!a) throw falta("buscar");
      return { t: "buscar", texto: a };
    case "zona":
      if (!a) throw falta("zona");
      return { t: "lista", zona: a };
    case "lista":
    case "comercios": {
      const e = normalizar(a);
      const estados = { pendiente: "pendiente", pendientes: "pendiente", interesado: "interesado", interesados: "interesado", si: "si", no: "no", cliente: "cliente", clientes: "cliente" } as const;
      return { t: "lista", estado: estados[e as keyof typeof estados] };
    }
    case "embudo":
      return { t: "embudo" };
    case "caja":
      return { t: "caja" };
    case "mes": {
      const mes = parseMes(a, hoy);
      if (!mes) throw falta("mes");
      return { t: "mes", mes };
    }
    case "stock":
      return { t: "stock" };
    case "ventas":
      return { t: "ventas", pendientes: /pendiente/i.test(a) || undefined };
    case "movimientos":
      return { t: "movimientos" };
    case "pendientes":
      return { t: "pendientes", todos: /todos/i.test(a) || undefined };
    case "reparto":
      return { t: "reparto" };
    case "socios":
      return { t: "socios" };
    case "placas":
      return { t: "placas" };
    case "placa": {
      const [codigo, ...resto] = palabras;
      if (!codigo) throw falta("placa");
      const c = resto.join(" ");
      if (!c) return { t: "placa", codigo };
      if (["quitar", "liberar", "borrar"].includes(normalizar(c))) return { t: "quitarPlaca", codigo };
      return { t: "asignarPlaca", codigo, comercio: c };
    }

    case "nuevo": {
      const [nombre, tipo, zona, contacto, direccion] = partes(a);
      if (!nombre) throw falta("nuevo");
      return { t: "nuevo", nombre, tipo: vacio(tipo), zona: vacio(zona), contacto: vacio(contacto), direccion: vacio(direccion) };
    }
    case "dato": {
      const [c, campo, ...valor] = partes(a);
      const campos = ["tipo", "zona", "direccion", "contacto", "maps", "resenas", "nota", "nombre"] as const;
      const k = campos.find((x) => x === normalizar(campo ?? ""));
      if (!c || !k) throw falta("dato");
      return { t: "dato", comercio: c, campo: k, valor: valor.join(" | ") };
    }
    case "visita": {
      let nombre: string, resultado: "si" | "no" | "luego" | "interesado" | undefined, nota: string;
      if (a.includes("|")) {
        const [c, r, ...n] = partes(a);
        nombre = c ?? "";
        resultado = RESULTADOS[normalizar(r ?? "")];
        nota = n.join(" | ");
      } else {
        const i = palabras.findIndex((w, k) => k > 0 && RESULTADOS[normalizar(w)]);
        if (i < 0) throw falta("visita");
        nombre = palabras.slice(0, i).join(" ");
        resultado = RESULTADOS[normalizar(palabras[i]!)];
        nota = palabras.slice(i + 1).join(" ");
      }
      if (!nombre || !resultado) throw falta("visita");
      const f = resultado === "no" ? null : extraerFecha(nota, hoy);
      return { t: "visita", comercio: nombre, resultado, nota: vacio(f ? f.resto : nota), proxima: f?.fecha };
    }
    case "venta": {
      const i = palabras.findIndex((_, k) => k > 0 && unidades(palabras, k));
      if (i < 0) throw falta("venta");
      const u = unidades(palabras, i)!;
      const resto = palabras.slice(i + u.ocupa);
      let cobrada: boolean | undefined, metodo: Metodo | undefined, pactadoCent: number | undefined;
      const libres: string[] = [];
      for (let k = 0; k < resto.length; k++) {
        const w = normalizar(resto[k]!);
        if (["pagado", "pagada", "cobrado", "cobrada", "pagan"].includes(w)) cobrada = true;
        else if (["pendiente", "debe", "fiado"].includes(w)) cobrada = false;
        else if (metodoDe(w)) metodo = metodoDe(w);
        else if ((w === "por" || w === "a") && parseEuros(resto[k + 1] ?? "")) {
          pactadoCent = parseEuros(resto[k + 1]!)!;
          k++;
          if (/^(€|eur|euros)$/i.test(resto[k + 1] ?? "")) k++;
        } else if (["en", "con", "uds", "paneles"].includes(w) && !libres.length) continue;
        else libres.push(resto[k]!);
      }
      // Con método de pago se da por cobrada; sin nada, pendiente (mejor apuntar de menos que de más en caja).
      if (cobrada === undefined) cobrada = metodo !== undefined;
      return { t: "venta", comercio: palabras.slice(0, i).join(" "), uds: u.n, cobrada, metodo, pactadoCent, nota: vacio(libres.join(" ")) };
    }
    case "cobrado":
    case "cobrada": {
      const id = entero(palabras[0]?.replace(/^#/, ""));
      if (!id) throw falta("cobrado");
      return { t: "cobrado", ventaId: id, metodo: palabras[1] ? metodoDe(palabras[1]) : undefined };
    }
    case "aporto":
    case "aportacion":
    case "invierto": {
      const { cent, nota } = importe("aporto", a);
      return { t: "movimiento", tipo: "aportacion", cent, nota };
    }
    case "gasto": {
      const { cent, nota } = importe("gasto", a);
      const [cat, ...resto] = (nota ?? "").split(/\s+/);
      return { t: "movimiento", tipo: "gasto", cent, categoria: vacio(cat?.toLowerCase()), nota };
    }
    case "ingreso": {
      const { cent, nota } = importe("ingreso", a);
      return { t: "movimiento", tipo: "ingreso", cent, categoria: "otros", nota };
    }
    case "retiro":
    case "retirada": {
      const { cent, nota } = importe("retiro", a);
      return { t: "movimiento", tipo: "retirada", cent, nota };
    }
    case "compra": {
      const u = unidades(palabras, 0);
      if (!u) throw falta("compra");
      const resto = palabras.slice(u.ocupa);
      if (normalizar(resto[0] ?? "") === "por") resto.shift();
      const cent = parseEuros(resto[0] ?? "");
      if (!cent) throw falta("compra");
      resto.shift();
      if (/^(€|eur|euros)$/i.test(resto[0] ?? "")) resto.shift();
      if (["a", "de", "en"].includes(normalizar(resto[0] ?? ""))) resto.shift();
      return { t: "compra", uds: u.n, cent, proveedor: vacio(resto.join(" ")) };
    }
    case "recordar": {
      const f = extraerFecha(a, hoy);
      if (!f || !f.resto) throw falta("recordar");
      const [c, ...n] = f.resto.includes("|") ? partes(f.resto) : [f.resto];
      return { t: "recordar", comercio: c!, fecha: f.fecha, nota: vacio(n.join(" ")) };
    }

    case "producto": {
      const nuevo = normalizar(palabras[0] ?? "") === "nuevo";
      const ws = nuevo ? palabras.slice(1) : palabras;
      let precioIdx = ws.length - 1;
      if (/^(€|eur|euros)$/i.test(ws[precioIdx] ?? "")) precioIdx--;
      const cent = parseEuros(ws[precioIdx] ?? "");
      const nombre = ws.slice(0, precioIdx).join(" ");
      if (!cent || !nombre) throw falta("producto");
      return { t: "producto", nombre, cent, nuevo };
    }
    case "tramo": {
      if (normalizar(palabras[0] ?? "") === "borrar") {
        const d = entero(palabras[1]);
        if (!d) throw falta("tramo");
        return { t: "tramo", desde: d, borrar: true };
      }
      const d = unidades(palabras, 0);
      const v = palabras.slice(d?.ocupa ?? 1).join("");
      if (!d) throw falta("tramo");
      const bp = parsePorcentaje(v);
      const cent = bp ? null : parseEuros(v.replace(/\/ud$/, ""));
      if (!bp && !cent) throw falta("tramo");
      return { t: "tramo", desde: d.n, cent: cent ?? undefined, descuentoBp: bp ?? undefined };
    }
    case "oferta": {
      const p0 = normalizar(palabras[0] ?? "");
      if (p0 === "quitar" || p0 === "borrar") {
        const id = entero(palabras[1]?.replace(/^#/, ""));
        if (!id) throw falta("oferta");
        return { t: "quitarOferta", id };
      }
      const f = /\bhasta\b/i.test(a) ? extraerFecha(a.replace(/\bhasta\s+(el\s+)?/i, "el "), hoy) : null;
      const cuerpo = (f ? f.resto : a).trim();
      const hasta = f?.fecha;
      let m: RegExpExecArray | null;
      if ((m = /^(\d+)\s*x\s*(\d+)$/i.exec(cuerpo))) return { t: "oferta", tipo: "nxm", n: Number(m[1]), m: Number(m[2]), hasta };
      if ((m = /^pack\s+(?:de\s+)?(\d+)\s+(?:por\s+)?(\S+)(?:\s*€)?$/i.exec(cuerpo))) {
        const cent = parseEuros(m[2]!);
        if (!cent) throw falta("oferta");
        return { t: "oferta", tipo: "pack", n: Number(m[1]), cent, hasta };
      }
      if ((m = /^(-?\s*\d+(?:[.,]\d+)?\s*%)\s+(?:desde|a partir de)\s+(\d+)/i.exec(cuerpo))) {
        const bp = parsePorcentaje(m[1]!);
        if (!bp) throw falta("oferta");
        return { t: "oferta", tipo: "descuento", n: Number(m[2]), descuentoBp: bp, hasta };
      }
      throw falta("oferta");
    }
    case "config": {
      const [clave, ...resto] = palabras;
      const k = normalizar(clave ?? "") as Extract<Accion, { t: "config" }>["clave"];
      if (!["reparto", "comision", "porcentaje", "stock", "admin", "socio", "baja", "producto", "bienvenida", "avisos", "nombre", "tono", "emojis", "ia", "limpieza"].includes(k)) throw falta("config");
      // Texto libre (con saltos de línea); vacío = volver al de por defecto
      if (k === "bienvenida" || k === "nombre" || k === "ia") return { t: "config", clave: k, valor: a.replace(/^\S+\s*/, "") };
      // Sin valor: enseña cómo está
      if (k === "avisos" || k === "limpieza" || k === "tono") return { t: "config", clave: k, valor: resto.join(" ") };
      if (k === "porcentaje") {
        const valor = resto.at(-1) ?? "";
        const socio = resto.slice(0, -1).join(" ");
        if (!socio || !parsePorcentaje(valor) && valor !== "0%") throw falta("config");
        return { t: "config", clave: k, socio, valor };
      }
      if (!resto.length) throw falta("config");
      return { t: "config", clave: k, valor: resto.join(" ") };
    }
  }
  return null;
}
