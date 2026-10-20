import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { euros, fecha } from "../lib/formato";
import type { Movimiento, Resumen } from "../lib/tipos";
import { LineaCaja } from "../componentes/graficos";
import { Cifra, Datos, Seccion, Tabla, Titulo, Vacio } from "../componentes/ui";

const TIPO = { aportacion: "Aportación", ingreso: "Ingreso", gasto: "Gasto", retirada: "Retirada" } as const;

export function Caja() {
  const r = useQuery({ queryKey: ["resumen"], queryFn: () => api.get<Resumen>("/api/resumen") });
  const m = useQuery({ queryKey: ["movimientos"], queryFn: () => api.get<{ movimientos: Movimiento[] }>("/api/movimientos").then((x) => x.movimientos) });
  return (
    <>
      <Titulo>Caja</Titulo>
      <Datos q={r}>
        {({ caja: c, mensual }) => (
          <>
            <div className="grid grid-cols-2 gap-6 border-b border-regla pb-6 md:grid-cols-4">
              <Cifra etiqueta="Invertido" valor={euros(c.aportadoCent)} />
              <Cifra etiqueta="Ingresos" valor={euros(c.ingresosCent)} tono="entra" />
              <Cifra etiqueta="Gastos" valor={euros(c.gastosCent)} tono="sale" />
              <Cifra etiqueta="Caja" valor={euros(c.cajaCent)} nota={`beneficio ${euros(c.beneficioCent)}`} />
            </div>
            <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <Seccion titulo="Caja a final de cada mes">{mensual.length > 1 ? <LineaCaja datos={mensual} /> : <Vacio>Hace falta más de un mes de movimientos.</Vacio>}</Seccion>
              <Seccion titulo="Gastos por categoría">
                {c.gastosPorCategoria.length ? (
                  <ul className="num divide-y divide-regla text-sm">
                    {c.gastosPorCategoria.map((g) => (
                      <li key={g.categoria} className="flex py-1.5"><span className="capitalize">{g.categoria}</span><span className="ml-auto">{euros(g.cent)}</span></li>
                    ))}
                  </ul>
                ) : <Vacio>Sin gastos.</Vacio>}
                {c.valorStockCent > 0 && <p className="mt-2 text-[13px] text-tinta-3">Incluye {euros(c.valorStockCent)} en paneles aún sin vender.</p>}
              </Seccion>
            </div>
          </>
        )}
      </Datos>
      <div className="mt-8">
        <Seccion titulo="Movimientos">
          <Datos q={m}>
            {(ms) =>
              ms.length ? (
                <Tabla etiqueta="Movimientos de caja">
                  <thead>
                    <tr><th>Fecha</th><th>Tipo</th><th className="text-right">Importe</th><th>Socio</th><th>Categoría</th><th>Nota</th></tr>
                  </thead>
                  <tbody className="num">
                    {ms.map((x) => {
                      const sale = x.tipo === "gasto" || x.tipo === "retirada";
                      return (
                        <tr key={x.id}>
                          <td className="whitespace-nowrap">{fecha(x.fecha, true)}</td>
                          <td>{TIPO[x.tipo]}</td>
                          <td className={`whitespace-nowrap text-right font-medium ${sale ? "text-sale" : "text-entra"}`}>{sale ? "−" : "+"}{euros(x.importeCent)}</td>
                          <td>{x.socio}</td>
                          <td>{x.categoria ?? "—"}</td>
                          <td className="min-w-48 text-tinta-2">{x.nota}{x.ventaId ? ` (venta ${x.ventaId})` : ""}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Tabla>
              ) : (
                <Vacio>Sin movimientos. Desde el bot: /aporto 50 o /gasto 30 imprenta</Vacio>
              )
            }
          </Datos>
        </Seccion>
      </div>
    </>
  );
}
