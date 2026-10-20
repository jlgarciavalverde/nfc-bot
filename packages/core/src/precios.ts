import { euros, pct } from "./texto";

export interface TramoPrecio {
  desdeUds: number;
  precioCent: number | null;
  descuentoBp: number | null;
}

export interface OfertaPrecio {
  id: number;
  nombre: string;
  tipo: "nxm" | "pack" | "descuento";
  n: number;
  m: number | null;
  precioCent: number | null;
  descuentoBp: number | null;
  desde: string | null;
  hasta: string | null;
  activa: boolean;
}

export interface Presupuesto {
  uds: number;
  totalCent: number;
  /** Precio sin tramos ni ofertas. */
  listaCent: number;
  ahorroCent: number;
  /** Lo que se aplicó, para enseñarlo y guardarlo en la venta. */
  aplicado: string;
  ofertaId: number | null;
}

/** Precio unitario según el tramo más alto alcanzado (o el de lista si no hay ninguno). */
export function precioUnitario(precioCent: number, tramos: TramoPrecio[], uds: number) {
  const t = [...tramos].filter((x) => x.desdeUds <= uds).sort((a, b) => b.desdeUds - a.desdeUds)[0];
  if (!t) return { unitCent: precioCent, tramo: null };
  const unitCent = t.precioCent ?? Math.round((precioCent * (10_000 - (t.descuentoBp ?? 0))) / 10_000);
  return { unitCent, tramo: t };
}

export function ofertaVigente(o: OfertaPrecio, fecha: string) {
  return o.activa && (!o.desde || o.desde <= fecha) && (!o.hasta || o.hasta >= fecha);
}

export function describirOferta(o: Pick<OfertaPrecio, "tipo" | "n" | "m" | "precioCent" | "descuentoBp">) {
  if (o.tipo === "nxm") return `${o.n}x${o.m}`;
  if (o.tipo === "pack") return `pack de ${o.n} por ${euros(o.precioCent ?? 0)}`;
  return `-${pct(o.descuentoBp ?? 0)} desde ${o.n} uds`;
}

export function describirTramo(t: TramoPrecio) {
  return t.precioCent != null ? `desde ${t.desdeUds} uds a ${euros(t.precioCent)}/ud` : `desde ${t.desdeUds} uds -${pct(t.descuentoBp ?? 0)}`;
}

/**
 * Mejor precio para `uds` unidades. Las ofertas no se acumulan entre sí ni con los tramos:
 * se calcula cada opción por separado y gana la más barata para el cliente (en empate, la más sencilla: el tramo).
 * Las unidades que no completan un 3x2 o un pack se cobran al precio del tramo alcanzado por el total.
 */
export function calcularPrecio(uds: number, precioCent: number, tramos: TramoPrecio[], ofertas: OfertaPrecio[], fecha: string): Presupuesto {
  if (!Number.isInteger(uds) || uds <= 0) throw new Error("Las unidades tienen que ser un número entero mayor que 0");
  const listaCent = precioCent * uds;
  const { unitCent, tramo } = precioUnitario(precioCent, tramos, uds);
  let mejor = { totalCent: unitCent * uds, aplicado: tramo ? `Tramo ${describirTramo(tramo)}` : "Precio de lista", ofertaId: null as number | null };

  for (const o of ofertas) {
    if (!ofertaVigente(o, fecha) || uds < o.n) continue;
    let total: number;
    if (o.tipo === "descuento") {
      total = Math.round((unitCent * uds * (10_000 - (o.descuentoBp ?? 0))) / 10_000);
    } else {
      const grupos = Math.floor(uds / o.n);
      const sueltas = uds % o.n;
      const sueltasCent = sueltas * unitCent;
      total = o.tipo === "nxm" ? grupos * (o.m ?? o.n) * unitCent + sueltasCent : grupos * (o.precioCent ?? 0) + sueltasCent;
    }
    const desc = describirOferta(o);
    if (total < mejor.totalCent) mejor = { totalCent: total, aplicado: o.nombre === desc ? `Oferta ${desc}` : `Oferta «${o.nombre}» (${desc})`, ofertaId: o.id };
  }
  return { uds, listaCent, ahorroCent: listaCent - mejor.totalCent, ...mejor };
}
