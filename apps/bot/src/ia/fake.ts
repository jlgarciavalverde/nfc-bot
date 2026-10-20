import { extraerFecha, normalizar } from "@nfc/core";
import { aAccion, type Interprete } from "./interpretar";

/**
 * Intérprete de pega para tests y desarrollo sin clave (AI_FAKE=1): entiende unas pocas frases fijas
 * y produce la misma salida plana que Gemini, así que también prueba `aAccion`.
 */
export function crearFake(): Interprete {
  return {
    nombre: "fake",
    async interpretar(texto, ctx) {
      const t = normalizar(texto);
      const comercio = (resto: string) => ctx.comercios.find((c) => normalizar(resto).includes(normalizar(c))) ?? resto.replace(/^(el|la|al|a)\s+/i, "").trim();
      let m: RegExpExecArray | null;
      if ((m = /vendid[oa]s? (\d+) (?:paneles? )?(?:a|al|en) (?:la |el )?(.+?)(?: pagad[oa]| por | en |$)/.exec(t))) {
        const metodo = ["bizum", "efectivo", "tarjeta", "transferencia"].find((x) => t.includes(x));
        return aAccion({ accion: "venta", unidades: Number(m[1]), comercio: comercio(m[2]!), cobrada: /pagad|cobrad/.test(t), metodo });
      }
      if ((m = /gastad[oa]s? (\d+(?:[.,]\d+)?) (?:euros? )?en (\w+)/.exec(t))) {
        return aAccion({ accion: "gasto", importe_euros: Number(m[1]!.replace(",", ".")), categoria: m[2], nota: m[2] });
      }
      if ((m = /(?:visitado|pasado por|ido a) (?:el |la )?(.+?),? (?:y )?(?:dice|ha dicho|dijo) (?:que )?(si|no|luego)/.exec(t))) {
        const f = extraerFecha(texto, ctx.hoy);
        return aAccion({ accion: "visita", comercio: comercio(m[1]!), resultado: m[2], fecha: f?.fecha });
      }
      if ((m = /cuanto (?:cuestan|salen|vale|valen) (\d+)/.exec(t))) return aAccion({ accion: "precio", unidades: Number(m[1]) });
      if (/como va la caja|cuanto dinero/.test(t)) return aAccion({ accion: "caja" });
      if (/vendido/.test(t)) return aAccion({ accion: "ninguna", respuesta: "¿Cuántos paneles y a qué comercio?" });
      return aAccion({ accion: "ninguna", respuesta: "No sé qué apuntar con eso. Mira /ayuda." });
    },
  };
}
