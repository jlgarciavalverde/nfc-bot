import { normalizar } from "@nfc/core";

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
    lineas: ["/reparto — lo que le tocaría a cada uno", "/socios", "/panel — enlace al panel web (te llega por privado)", "/deshacer — anula lo último que apuntaste (10 min)"],
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
