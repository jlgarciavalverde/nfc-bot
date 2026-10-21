/** Personalidad del bot: tono de las frases más vistas y emojis sí/no. Puro: lo usan el bot y la vista previa del panel. */

export type Tono = "cercano" | "serio" | "gracioso";

export const TONOS: Record<Tono, { texto: string; detalle: string }> = {
  cercano: { texto: "Cercano", detalle: "Como un colega del grupo" },
  serio: { texto: "Serio", detalle: "Directo, sin bromas" },
  gracioso: { texto: "Gracioso", detalle: "Con algo de chispa" },
};

export interface Estilo {
  tono: Tono;
  emojis: boolean;
  nombreAsistente: string | null;
}

const FRASES = {
  cercano: {
    saludo: "👋 ¡Hola, {nombre}! Soy {bot}.",
    confirmar: "¿Lo apunto?",
    cancelado: "Cancelado.",
    noEntiendo: "No lo he entendido. Mira /ayuda.",
    fallo: "😵 Algo ha fallado por mi parte. Si se repite, avisa a quien mantiene el bot.",
    privado: "Te lo he mandado por privado. 📬",
    yaSocio: "Ya eres socio. 😉",
    nadaPendiente: "No tienes nada pendiente para los próximos 7 días. 👌",
    sinCobros: "No hay nada pendiente de cobro. 👌",
    venta: "",
    visitaSi: "",
  },
  serio: {
    saludo: "Hola, {nombre}. Soy {bot}.",
    confirmar: "¿Confirmas?",
    cancelado: "Cancelado.",
    noEntiendo: "No he entendido el mensaje. Consulta /ayuda.",
    fallo: "Se ha producido un error. Si se repite, avisa a quien mantiene el bot.",
    privado: "Te lo he enviado por privado.",
    yaSocio: "Ya eres socio.",
    nadaPendiente: "Sin pendientes en los próximos 7 días.",
    sinCobros: "No hay ventas pendientes de cobro.",
    venta: "",
    visitaSi: "",
  },
  gracioso: {
    saludo: "👋 ¡Buenas, {nombre}! Aquí {bot}, a tu servicio (y sin cobrar comisión).",
    confirmar: "¿Lo apunto en la libreta? ✍️",
    cancelado: "Vale, como si no hubiera pasado nada. 🤐",
    noEntiendo: "Me he perdido. 🙃 Mira /ayuda y lo intentamos otra vez.",
    fallo: "😵 Me he tropezado con algo. Si se repite, avisa a quien me mantiene.",
    privado: "Te lo he pasado por privado, que aquí hay mucho cotilla. 📬",
    yaSocio: "¡Si ya eres de la casa! 😉",
    nadaPendiente: "Nada pendiente en 7 días. ¡A vivir! 🏖",
    sinCobros: "Nadie nos debe nada. ¡Así da gusto! 👌",
    venta: "🎉 ¡Otra placa más para llenar Google de estrellas!",
    visitaSi: "🙌 ¡Ese sí que sí!",
  },
} satisfies Record<Tono, Record<string, string>>;

export type ClaveFrase = keyof (typeof FRASES)["cercano"];

export const ESTILO_DEFECTO: Estilo = { tono: "cercano", emojis: true, nombreAsistente: null };

/** Frase según el tono. `{bot}` = nombre del asistente; el resto de variables, de `vars` (ya escapadas). */
export function frase(e: Estilo, clave: ClaveFrase, vars: Record<string, string> = {}) {
  const t = (FRASES[e.tono] ?? FRASES.cercano)[clave];
  const todas: Record<string, string> = { bot: e.nombreAsistente || "el asistente del negocio", ...vars };
  return t.replace(/\{(\w+)\}/g, (m, k: string) => todas[k] ?? m);
}

const EMOJI = /(?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:\p{Emoji_Modifier}|️|⃣|‍(?:\p{Extended_Pictographic}|️))* ?/gu;

/** Lo que sale por el chat: sin emojis si así está configurado (las etiquetas HTML y las cifras no se tocan). */
export function aplicarEstilo(texto: string, e: Pick<Estilo, "emojis">) {
  if (e.emojis) return texto;
  return texto
    .replace(EMOJI, "")
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n");
}

/** Ejemplo para la vista previa del panel. */
export function ejemploEstilo(e: Estilo) {
  const l = [frase(e, "saludo", { nombre: "Ana" }), "", "⭐ Venta #12 a Bar Pepe: 3 paneles por 54,00 €", "✅ Cobrada por bizum"];
  const remate = frase(e, "venta");
  if (remate) l.push(remate);
  l.push("", `⏳ Venta de 2 paneles a Café Luna. ${frase(e, "confirmar")}`);
  return aplicarEstilo(l.join("\n"), e);
}
