/** Fechas de calendario (YYYY-MM-DD) en hora de Madrid: el negocio está en España. */

export function relojMadrid(now: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  const dias: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour) % 24, minuto: Number(p.minute), diaSemana: dias[p.weekday as string] ?? 1 };
}

export function hoy(now = new Date()) {
  return relojMadrid(now).fecha;
}

export function sumarDias(fecha: string, dias: number) {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function sumarMeses(fecha: string, meses: number) {
  const [y, m, d] = fecha.split("-").map(Number) as [number, number, number];
  const ultimo = new Date(Date.UTC(y, m - 1 + meses + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + meses, Math.min(d, ultimo), 12)).toISOString().slice(0, 10);
}

/** 1 = lunes … 7 = domingo. */
export function diaSemana(fecha: string) {
  const w = new Date(`${fecha}T12:00:00Z`).getUTCDay();
  return w === 0 ? 7 : w;
}

/** Lunes de la semana de `fecha`. */
export function lunes(fecha: string) {
  return sumarDias(fecha, 1 - diaSemana(fecha));
}

const DIAS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];
const NUM: Record<string, number> = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, quince: 15 };
export const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/**
 * Busca una fecha en texto libre y la devuelve junto al texto sin ella (el resto conserva mayúsculas y tildes).
 * Entiende «mañana», «pasado mañana», «en 2 semanas», «en un mes», «el lunes», «el 15/11», «15/11/2026», «2026-11-15».
 */
export function extraerFecha(original: string, base: string): { fecha: string; resto: string } | null {
  original = original.normalize("NFC");
  // Misma longitud que el original carácter a carácter, para poder recortar el original con los índices.
  const texto = [...original].map((c) => { const x = c.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); return x.length === 1 ? x : c; }).join("");
  const pruebas: [RegExp, (m: RegExpExecArray) => string | null][] = [
    [/\b(\d{4})-(\d{2})-(\d{2})\b/, (m) => `${m[1]}-${m[2]}-${m[3]}`],
    [/\b(?:el\s+(?:dia\s+)?)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/, (m) => {
      const d = Number(m[1]), mes = Number(m[2]);
      if (d < 1 || d > 31 || mes < 1 || mes > 12) return null;
      let y = m[3] ? Number(m[3]) : Number(base.slice(0, 4));
      if (y < 100) y += 2000;
      let f = `${y}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (!m[3] && f < base) f = `${y + 1}${f.slice(4)}`;
      return f;
    }],
    [/\bpasado\s+manana\b/, () => sumarDias(base, 2)],
    [/\bmanana\b/, () => sumarDias(base, 1)],
    [/\b(?:dentro\s+de|en)\s+(\d+|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|quince)\s+(dias?|semanas?|mes|meses)\b/, (m) => {
      const n = /^\d+$/.test(m[1]!) ? Number(m[1]) : NUM[m[1]!]!;
      if (m[2]!.startsWith("dia")) return sumarDias(base, n);
      if (m[2]!.startsWith("semana")) return sumarDias(base, 7 * n);
      return sumarMeses(base, n);
    }],
    [/\b(?:la\s+)?(?:semana|mes)\s+que\s+viene\b/, (m) => (m[0].includes("semana") ? sumarDias(base, 7) : sumarMeses(base, 1))],
    [/\b(?:el\s+)?(?:proximo\s+)?(lunes|martes|miercoles|jueves|viernes|sabado|domingo)(?:\s+que\s+viene)?\b/, (m) => {
      const w = DIAS.indexOf(m[1]!) + 1;
      let d = (w - diaSemana(base) + 7) % 7;
      if (d === 0) d = 7;
      return sumarDias(base, d);
    }],
  ];
  for (const [re, f] of pruebas) {
    const m = re.exec(texto);
    if (!m) continue;
    const fecha = f(m);
    if (!fecha || Number.isNaN(Date.parse(fecha))) continue;
    // Quita también el verbo que suele acompañar («volver en…», «pasar el…», «llamar el…»)
    const antes = /\b(volver|vuelve|volvemos|vuelvo|pasar|pasamos|paso|llamar|llamo|llamamos|repetir|para|hasta)\s*$/.exec(texto.slice(0, m.index));
    const corte = antes ? antes.index : m.index;
    const resto = (original.slice(0, corte) + " " + original.slice(m.index + m[0].length))
      .replace(/\s+/g, " ")
      .trim();
    return { fecha, resto };
  }
  return null;
}

/** «2026-11-05» → «5 nov». Con `conAnio`, «5 nov 2026». */
export function fechaCorta(f: string, conAnio = false) {
  const [y, m, d] = f.split("-").map(Number) as [number, number, number];
  return `${d} ${MESES[m - 1]!.slice(0, 3)}${conAnio ? ` ${y}` : ""}`;
}
