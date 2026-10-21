import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { euros, fecha } from "../lib/formato";
import type { Venta } from "../lib/tipos";
import { Cifra, Datos, Filtro, Tabla, Titulo, Vacio } from "../componentes/ui";
import { CobrarVenta } from "../componentes/AccionesRapidas";

export function Ventas() {
  const q = useQuery({ queryKey: ["ventas"], queryFn: () => api.get<{ ventas: Venta[] }>("/api/ventas").then((r) => r.ventas) });
  const [filtro, setFiltro] = useState<"todas" | "pendientes">("todas");
  return (
    <Datos q={q}>
      {(todas) => {
        const vs = filtro === "pendientes" ? todas.filter((v) => !v.cobrada) : todas;
        const total = vs.reduce((a, v) => a + v.totalCent, 0);
        const conCoste = vs.filter((v) => v.costeCent != null);
        const margen = conCoste.reduce((a, v) => a + v.totalCent - v.costeCent!, 0);
        const descuento = vs.reduce((a, v) => a + v.precioListaCent - v.totalCent, 0);
        return (
          <>
            <Titulo accion={<Filtro etiqueta="Ventas" valor={filtro} onChange={setFiltro} opciones={[{ valor: "todas", texto: "Todas" }, { valor: "pendientes", texto: "Pendientes de cobro" }]} />}>Ventas</Titulo>
            <div className="mb-6 grid grid-cols-2 gap-6 md:grid-cols-4">
              <Cifra etiqueta={filtro === "pendientes" ? "Por cobrar" : "Facturado"} valor={euros(total)} />
              <Cifra etiqueta="Paneles" valor={vs.reduce((a, v) => a + v.uds, 0)} nota={`${vs.length} ventas`} />
              <Cifra etiqueta="Margen" valor={conCoste.length ? euros(margen) : "—"} nota={conCoste.length < vs.length ? "solo ventas con coste de stock" : undefined} />
              <Cifra etiqueta="Descuento concedido" valor={euros(descuento)} nota="frente al precio de lista" />
            </div>
            {vs.length ? (
              <Tabla etiqueta="Ventas">
                <thead>
                  <tr><th>Nº</th><th>Fecha</th><th>Comercio</th><th>Vendedor</th><th className="text-right">Uds</th><th className="text-right">Total</th><th className="text-right">Margen</th><th>Precio</th><th>Cobro</th></tr>
                </thead>
                <tbody className="num">
                  {vs.map((v) => (
                    <tr key={v.id}>
                      <td className="text-tinta-3">{v.id}</td>
                      <td className="whitespace-nowrap">{fecha(v.fecha, true)}</td>
                      <td className="min-w-36 font-medium">{v.comercio}</td>
                      <td>{v.socio}</td>
                      <td className="text-right">{v.uds}</td>
                      <td className="text-right font-medium">{euros(v.totalCent)}</td>
                      <td className="text-right">{v.costeCent == null ? "—" : euros(v.totalCent - v.costeCent)}</td>
                      <td className="min-w-40 text-tinta-2">{v.aplicado}</td>
                      <td className="whitespace-nowrap">{v.cobrada ? (v.metodo ?? "cobrada") : <CobrarVenta id={v.id} totalCent={v.totalCent} comercio={v.comercio} />}</td>
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            ) : (
              <Vacio>{filtro === "pendientes" ? "No hay nada pendiente de cobro." : "Aún no hay ventas. Se apuntan desde el bot: /venta Bar Pepe 3 pagado bizum"}</Vacio>
            )}
          </>
        );
      }}
    </Datos>
  );
}
