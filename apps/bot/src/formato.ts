import {
  describirOferta, describirTramo, ESTADOS, euros, fechaCorta, html, pct, plural,
  type EstadoComercio, type Presupuesto, type ResumenCaja,
} from "@nfc/core";

export const ICONO_ESTADO: Record<EstadoComercio, string> = { pendiente: "⚪", interesado: "🟡", si: "🟢", no: "🔴", cliente: "⭐" };
export const ICONO_RESULTADO = { si: "🟢 sí", no: "🔴 no", luego: "🟡 luego", interesado: "🟡 interesado" } as const;

export const b = (s: string | number) => `<b>${html(String(s))}</b>`;

export function presupuestoTexto(p: Presupuesto, nombreProducto: string) {
  const unit = Math.round(p.totalCent / p.uds);
  const lineas = [`${b(plural(p.uds, nombreProducto, nombreProducto))}: ${b(euros(p.totalCent))} (${euros(unit)}/ud)`, html(p.aplicado)];
  if (p.ahorroCent > 0) lineas.push(`Ahorro para el cliente: ${euros(p.ahorroCent)} sobre ${euros(p.listaCent)}`);
  return lineas.join("\n");
}

export function tablaPrecios(
  productos: { nombre: string; precioCent: number; tramos: Parameters<typeof describirTramo>[0][]; ofertas: (Parameters<typeof describirOferta>[0] & { id: number; nombre: string; hasta: string | null })[] }[],
  ejemplos: { uds: number; totalCent: number }[][],
) {
  if (!productos.length) return "Aún no hay productos. Un admin puede crearlo: /producto nuevo Panel NFC 25€";
  return productos
    .map((p, i) => {
      const l = [`${b(p.nombre)}: ${euros(p.precioCent)}/ud`];
      for (const t of p.tramos) l.push(`  • ${html(describirTramo(t))}`);
      for (const o of p.ofertas) l.push(`  🎁 #${o.id} ${html(describirOferta(o))}${o.hasta ? ` (hasta el ${fechaCorta(o.hasta)})` : ""}`);
      const ej = ejemplos[i] ?? [];
      if (ej.length) l.push(`  Ejemplos: ${ej.map((e) => `${e.uds} → ${euros(e.totalCent)}`).join(" · ")}`);
      return l.join("\n");
    })
    .join("\n\n");
}

export function cajaTexto(c: ResumenCaja, titulo: string) {
  const l = [
    b(titulo),
    `💶 Invertido por los socios: ${b(euros(c.aportadoCent))}`,
    `📈 Ingresos: ${euros(c.ingresosCent)}`,
    `📉 Gastos: ${euros(c.gastosCent)}`,
    `${c.beneficioCent >= 0 ? "✅" : "⚠️"} Beneficio: ${b(euros(c.beneficioCent))}`,
  ];
  if (c.retiradoCent) l.push(`↩️ Retirado por socios: ${euros(c.retiradoCent)}`);
  l.push(`🏦 Caja (lo que debería haber): ${b(euros(c.cajaCent))}`);
  if (c.pendienteCobroCent) l.push(`⏳ Pendiente de cobrar: ${euros(c.pendienteCobroCent)}`);
  l.push("", `Ventas: ${c.ventas} (${plural(c.uds, "panel", "paneles")}, ${euros(c.facturadoCent)})`);
  if (c.margenCent) l.push(`Margen sobre el coste de los paneles: ${euros(c.margenCent)}`);
  if (c.valorStockCent) l.push(`Stock sin vender (ya pagado, cuenta como gasto): ${euros(c.valorStockCent)}`);
  if (c.gastosPorCategoria.length) l.push(`Gastos: ${c.gastosPorCategoria.map((g) => `${html(g.categoria)} ${euros(g.cent)}`).join(" · ")}`);
  return l.join("\n");
}

export function embudoTexto(e: { total: Record<EstadoComercio, number>; visitados: number; conversionBp: number; porSocio: ({ socio: string; visitados: number; conversionBp: number } & Record<EstadoComercio, number>)[] }) {
  const orden: EstadoComercio[] = ["pendiente", "interesado", "si", "no", "cliente"];
  const l = [b("Embudo de comercios"), ...orden.map((k) => `${ICONO_ESTADO[k]} ${ESTADOS[k]}: ${b(e.total[k])}`)];
  l.push("", `Visitados: ${e.visitados} · Conversión: ${b(pct(e.conversionBp))}`);
  if (e.porSocio.length) {
    l.push("", b("Por socio"));
    for (const s of [...e.porSocio].sort((x, y) => y.cliente - x.cliente || y.visitados - x.visitados)) {
      l.push(`${html(s.socio)}: ${s.visitados} visitados, ${s.cliente} clientes (${pct(s.conversionBp)})`);
    }
  }
  return l.join("\n");
}
