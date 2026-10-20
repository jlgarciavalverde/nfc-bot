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
