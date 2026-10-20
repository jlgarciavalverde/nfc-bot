/** Minúsculas, sin tildes y con los espacios normalizados: para buscar comercios y productos por nombre. */
export function normalizar(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, " ")
    .trim();
}

const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

/** 1250 → «12,50 €». */
export function euros(cent: number) {
  return eur.format(cent / 100).replace(/ /g, " ");
}

/**
 * «50», «50€», «12,50 €», «12.5», «1.200», «1.200,50» → céntimos. Devuelve null si no es un importe.
 * Un punto seguido de exactamente tres cifras se toma como separador de miles (formato español).
 */
export function parseEuros(s: string): number | null {
  let t = s.trim().replace(/\s*(€|eur|euros?)$/i, "").replace(/^€\s*/, "").trim();
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+([.,]\d{1,2})?$/.test(t)) return null;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(t)) t = t.replace(/\./g, "");
  const n = Number(t.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

/** «15%», «-15 %», «15,5%» → puntos básicos. */
export function parsePorcentaje(s: string): number | null {
  const m = /^-?\s*(\d+(?:[.,]\d+)?)\s*%$/.exec(s.trim());
  if (!m) return null;
  const n = Number(m[1]!.replace(",", "."));
  if (!(n > 0 && n <= 100)) return null;
  return Math.round(n * 100);
}

export function pct(bp: number) {
  return `${(bp / 100).toLocaleString("es-ES", { maximumFractionDigits: 2 })} %`;
}

export function plural(n: number, uno: string, varios: string) {
  return `${n} ${n === 1 ? uno : varios}`;
}

/** Escapa para `parse_mode: "HTML"` de Telegram. */
export function html(s: string | null | undefined) {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
