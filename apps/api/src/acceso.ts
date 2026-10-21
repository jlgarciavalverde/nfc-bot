import type { FastifyInstance } from "fastify";

/**
 * Permisos de la API, en un solo sitio. Cada ruta /api/* declara `config: { acceso }`:
 * - publica: sin sesión (entrar, salir, la placa /r/…).
 * - socio: cualquier socio con sesión.
 * - admin: solo admins (ajustes, precios, lotes, socios, auditoría).
 * Lo que es «solo lo tuyo» (cobrar o deshacer una venta) lo comprueban los servicios, con `esAdmin`.
 * Una ruta /api sin regla responde 403 (denegado por defecto). El registro alimenta los tests de seguridad.
 */
export type Acceso = "publica" | "socio" | "admin";

declare module "fastify" {
  interface FastifyContextConfig {
    acceso?: Acceso;
  }
  interface FastifyInstance {
    registroAcceso: { metodo: string; url: string; acceso: Acceso | undefined }[];
  }
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const NO_SESION = "Tienes que entrar con el enlace que te da el bot (/panel).";

/** `escriturasMin`: límite propio de escrituras por socio y minuto (además del general por IP). */
export function registrarAcceso(app: FastifyInstance, escriturasMin = 60) {
  const registro: FastifyInstance["registroAcceso"] = [];
  app.decorate("registroAcceso", registro);
  app.addHook("onRoute", (r) => {
    if (!r.url.startsWith("/api/")) return;
    for (const m of [r.method].flat()) if (m !== "HEAD") registro.push({ metodo: m, url: r.url, acceso: r.config?.acceso });
  });

  const escrituras = new Map<number, number[]>();
  app.addHook("preHandler", async (req) => {
    if (!req.url.startsWith("/api/")) return;
    const acceso = req.routeOptions.config?.acceso;
    if (!acceso) throw new HttpError(403, "Acceso no permitido.");
    if (acceso === "publica") return;
    if (!req.socio) throw new HttpError(401, NO_SESION);
    if (acceso === "admin" && req.socio.rol !== "admin") throw new HttpError(403, "Solo un admin puede hacer esto.");
    if (req.method !== "GET") {
      const ahora = Date.now();
      const lista = (escrituras.get(req.socio.id) ?? []).filter((t) => ahora - t < 60_000);
      if (lista.length >= escriturasMin) throw new HttpError(429, "Vas muy deprisa: espera un momento y vuelve a intentarlo.");
      lista.push(ahora);
      escrituras.set(req.socio.id, lista);
    }
  });
}

/** Opciones de ruta con su regla de acceso (y lo que se quiera añadir, p. ej. rateLimit). */
export const regla = (acceso: Acceso, extra: Record<string, unknown> = {}) => ({ config: { acceso, ...extra } });
