const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
export const euros = (cent: number | null | undefined) => (cent == null ? "—" : eur.format(cent / 100));
export const pct = (bp: number) => `${(bp / 100).toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`;
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export function fecha(f: string | null | undefined, anio = false) {
  if (!f) return "—";
  const [y, m, d] = f.slice(0, 10).split("-").map(Number) as [number, number, number];
  return `${d} ${MESES[m - 1]}${anio ? ` ${y}` : ""}`;
}
export const mesLargo = (ym: string) => {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return `${["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"][m - 1]} ${y}`;
};
export const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
/** «12,50», «12.5 €», «30» → céntimos; null si no es un importe válido. */
export const aCent = (s: string) => {
  const t = s.trim().replace(/\s*€$/, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const n = Math.round(Number(t) * 100);
  return n > 0 ? n : null;
};
/** Fecha y hora relativas cortas: «hace 5 min», «ayer 18:30», «3 oct 10:15». */
export function cuando(iso: string) {
  const d = new Date(iso);
  const min = Math.round((Date.now() - d.getTime()) / 60_000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const hora = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
  const dia = (x: Date) => x.toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
  if (dia(d) === dia(new Date())) return `hoy ${hora}`;
  if (dia(d) === dia(new Date(Date.now() - 86_400_000))) return `ayer ${hora}`;
  return `${fecha(dia(d))} ${hora}`;
}
