import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { euros, fecha } from "../lib/formato";
import type { Stock as TStock } from "../lib/tipos";
import { Cifra, Datos, Seccion, Tabla, Titulo, Vacio } from "../componentes/ui";

export function Stock() {
  const q = useQuery({ queryKey: ["stock"], queryFn: () => api.get<TStock>("/api/stock") });
  return (
    <Datos q={q}>
      {({ stock, lotes }) => (
        <>
          <Titulo>Stock</Titulo>
          {stock.length ? (
            <div className="mb-8 grid grid-cols-2 gap-6 md:grid-cols-4">
              {stock.map((s) => (
                <Cifra key={s.productoId} etiqueta={s.producto} valor={`${s.uds} uds`} nota={`valor ${euros(s.valorCent)}${s.uds ? `, ${euros(Math.round(s.valorCent / s.uds))}/ud` : ""}`} />
              ))}
            </div>
          ) : (
            <Vacio>Aún no se lleva stock. Empieza registrando una compra en el bot: /compra 50 180€ proveedor</Vacio>
          )}
          {lotes.length > 0 && (
            <Seccion titulo="Compras (se gastan por orden: la más antigua primero)">
              <Tabla etiqueta="Compras de paneles">
                <thead>
                  <tr><th>Fecha</th><th>Producto</th><th className="text-right">Compradas</th><th className="text-right">Quedan</th><th className="text-right">Coste</th><th className="text-right">Por ud</th><th>Proveedor</th></tr>
                </thead>
                <tbody className="num">
                  {lotes.map((l) => (
                    <tr key={l.id}>
                      <td className="whitespace-nowrap">{fecha(l.fecha, true)}</td>
                      <td>{l.producto}</td>
                      <td className="text-right">{l.uds}</td>
                      <td className={`text-right ${l.udsRestantes ? "font-medium" : "text-tinta-3"}`}>{l.udsRestantes}</td>
                      <td className="text-right">{euros(l.costeCent)}</td>
                      <td className="text-right">{euros(Math.round(l.costeCent / l.uds))}</td>
                      <td>{l.proveedor ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            </Seccion>
          )}
        </>
      )}
    </Datos>
  );
}
