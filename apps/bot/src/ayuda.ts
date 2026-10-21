import { html, normalizar } from "@nfc/core";

const TEMAS: Record<string, { titulo: string; lineas: string[]; admin?: boolean }> = {
  comercios: {
    titulo: "🏪 Comercios y visitas",
    lineas: [
      "/visita Bar Pepe si — ha dicho que sí",
      "/visita Bar Pepe no muy caro — no, con el motivo",
      "/visita Bar Pepe luego volver en 2 semanas — te lo recuerdo ese día",
      "/nuevo Bar Pepe | bar | centro | 600123123 — apuntar sin visitar",
      "/ficha Bar Pepe · /buscar pepe · /zona centro",
      "/lista [pendiente|interesado|si|no|cliente]",
      "/dato Bar Pepe | maps | https://maps.app.goo.gl/…",
      "/dato Bar Pepe | resenas | https://g.page/r/…/review — enlace de reseñas de Google (para sus placas)",
      "/embudo — cuántos en cada estado y conversión",
      "Mándame una 📍 ubicación y la guardo en el comercio que elijas.",
    ],
  },
  ventas: {
    titulo: "⭐ Ventas",
    lineas: [
      "/venta Bar Pepe 3 pagado bizum",
      "/venta Bar Pepe 3 pendiente — y cuando paguen: /cobrado 12 bizum",
      "/venta Bar Pepe 5 por 90€ pagado — precio pactado",
      "/ventas · /ventas pendientes",
      "La venta aplica el mejor precio, descuenta stock, apunta el ingreso y marca el comercio como cliente.",
    ],
  },
  placas: {
    titulo: "🪧 Placas",
    lineas: [
      "/placa K7M2Q Bar Pepe — la placa con ese código (en la tapa de detrás) lleva a las reseñas de Bar Pepe",
      "/placa K7M2Q — a quién está asignada y cuántas veces la han escaneado",
      "/placa K7M2Q quitar — deja de redirigir · /placas — todas, con sus escaneos",
      "Las placas se imprimen sin saber para quién son: al venderla, asígnala y apunta el enlace de reseñas del comercio con /dato.",
    ],
  },
  precios: {
    titulo: "🏷 Precios y bonos",
    lineas: ["/precios — tabla de precios, tramos y ofertas", "/precio 5 — cuánto sale comprar 5"],
  },
  caja: {
    titulo: "💶 Caja",
    lineas: [
      "/aporto 50 primera compra — dinero que pones tú",
      "/gasto 30 imprenta tarjetas — la primera palabra es la categoría",
      "/ingreso 20 propina — ingreso que no es una venta",
      "/retiro 100 — dinero que te llevas",
      "/caja · /mes · /mes septiembre · /movimientos",
    ],
  },
  stock: {
    titulo: "📦 Stock",
    lineas: ["/compra 50 180€ AliExpress — 50 paneles por 180 € en total", "/stock", "El stock se empieza a controlar con la primera compra; antes, las ventas no lo tocan."],
  },
  seguimiento: {
    titulo: "⏰ Seguimiento",
    lineas: [
      "/pendientes — lo tuyo de los próximos 7 días · /pendientes todos",
      "/recordar Bar Pepe el lunes llamar al dueño",
      "Cada día a las 9:00 te escribo por privado lo que te toca, y los lunes publico el resumen de la semana en el grupo.",
    ],
  },
  socios: {
    titulo: "🤝 Socios y reparto",
    lineas: ["/reparto — lo que le tocaría a cada uno", "/socios", "/panel — enlace y código para el panel web (te llega por privado) · /panel cerrar — cierra tus sesiones", "/deshacer — anula lo último que apuntaste (10 min)"],
  },
  admin: {
    titulo: "👑 Admin",
    admin: true,
    lineas: [
      "/producto nuevo Panel NFC 25€ · /producto Panel NFC 22€",
      "/tramo 5 20€ · /tramo 10 -25% · /tramo borrar 5",
      "/oferta 3x2 · /oferta pack 5 99€ · /oferta -10% desde 20 · «hasta 31/12» · /oferta quitar 3",
      "/config reparto igual|porcentaje|aportado · /config comision 10% · /config porcentaje Ana 50%",
      "/config stock 5 · /config admin Ana · /config socio Ana · /config baja Ana",
      "/config bienvenida ¡Hola, {nombre}! … — texto al entrar alguien al grupo (vacío = el de por defecto)",
      "/config avisos — qué avisos automáticos se publican · /config avisos panel no",
      "/vincular — en el grupo, para que el bot trabaje ahí",
    ],
  },
};

export function ayuda(tema: string | undefined, esAdmin: boolean) {
  const t = tema ? normalizar(tema) : "";
  const elegido = Object.entries(TEMAS).find(([k]) => t && k.startsWith(t));
  if (elegido) return [`<b>${elegido[1].titulo}</b>`, ...elegido[1].lineas].join("\n");
  const bloques = Object.values(TEMAS)
    .filter((x) => !x.admin || esAdmin)
    .map((x) => [`<b>${x.titulo}</b>`, ...x.lineas].join("\n"));
  return [
    ...bloques,
    "",
    "💬 También me puedes escribir normal, p. ej. «hemos vendido 3 paneles al Bar Pepe, pagado por bizum». En el grupo, mencióname o responde a un mensaje mío. Antes de apuntar nada te pido que lo confirmes.",
  ].join("\n\n");
}

/** Lo básico en pocas líneas: para quien acaba de entrar como socio. */
export function chuleta(bot: string) {
  return [
    "<b>Lo básico</b>",
    "🏪 Al visitar un comercio: /visita Bar Pepe si (o no, o luego)",
    "⭐ Al vender: /venta Bar Pepe 3 pagado bizum",
    "💶 Dinero: /aporto 50, /gasto 30 imprenta, /retiro 100",
    "📊 Cómo vamos: /caja, /embudo, /pendientes, /precios",
    "↩️ Si te equivocas: /deshacer (10 minutos)",
    `💬 O háblame normal mencionándome: «@${bot} hemos vendido 2 paneles al Bar Pepe»`,
    "",
    "Todo lo demás: /ayuda",
  ].join("\n");
}

export const BIENVENIDA_DEFECTO =
  "👋 ¡Bienvenido/a, {nombre}! Aquí llevamos todo el negocio de los paneles NFC: comercios visitados, ventas, caja y reparto. Yo lo apunto todo.";

/** Bienvenida al entrar en el grupo (HTML ya escapado); `{nombre}` se sustituye por el nombre de la persona. */
export function bienvenida(plantilla: string | null, nombre: string) {
  return html(plantilla || BIENVENIDA_DEFECTO).replaceAll("{nombre}", `<b>${html(nombre)}</b>`);
}
