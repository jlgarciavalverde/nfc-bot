import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { euros, fecha, pct, plural } from "../lib/formato";
import type { Resumen } from "../lib/tipos";
import { BarraEmbudo, BarrasSemanas, LineaCaja } from "../componentes/graficos";
import { Cifra, Datos, Seccion, Titulo, Vacio } from "../componentes/ui";

export function Inicio() {
  const q = useQuery({ queryKey: ["resumen"], queryFn: () => api.get<Resumen>("/api/resumen") });
  return (
    <Datos q={q}>
      {(r) => (
        <>
          <Titulo>Resumen</Titulo>
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 border-b border-regla pb-6 md:grid-cols-4">
            <Cifra etiqueta="Caja" valor={euros(r.caja.cajaCent)} nota="lo que debería haber" />
            <Cifra etiqueta="Beneficio" valor={euros(r.caja.beneficioCent)} tono={r.caja.beneficioCent < 0 ? "sale" : r.caja.beneficioCent > 0 ? "entra" : undefined} nota={`${euros(r.caja.ingresosCent)} de ingresos`} />
            <Cifra etiqueta="Invertido por los socios" valor={euros(r.caja.aportadoCent)} nota={r.caja.retiradoCent ? `${euros(r.caja.retiradoCent)} retirado` : undefined} />
            <Cifra etiqueta="Pendiente de cobro" valor={euros(r.caja.pendienteCobroCent)} nota={`${r.caja.ventas} ventas, ${r.caja.uds} paneles`} />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Seccion titulo="Ventas por semana">
              <BarrasSemanas datos={r.series} />
            </Seccion>
            <Seccion titulo={`Esta semana (desde el ${fecha(r.semana.desde)})`}>
              <dl className="grid grid-cols-3 gap-4 py-2">
                <Cifra etiqueta="Visitas" valor={r.semana.visitas} />
                <Cifra etiqueta="Ventas" valor={r.semana.ventas} nota={euros(r.semana.vendidoCent)} />
                <Cifra etiqueta="Comercios nuevos" valor={r.semana.comerciosNuevos} />
              </dl>
              {r.semana.ranking.length > 0 && (
                <ol className="mt-3 space-y-1 text-sm">
                  {r.semana.ranking.map((x, i) => (
                    <li key={x.socio} className="num flex gap-2">
                      <span className="w-4 text-tinta-3">{i + 1}</span>
                      <span className="font-medium">{x.socio}</span>
                      <span className="ml-auto text-tinta-2">{plural(x.visitas, "visita", "visitas")}, {plural(x.ventas, "venta", "ventas")}</span>
                      <span className="w-20 text-right">{euros(x.vendidoCent)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Seccion>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Seccion titulo="Comercios" extra={<span className="num text-sm text-tinta-2">Conversión {pct(r.embudo.conversionBp)} de {r.embudo.visitados} visitados</span>}>
              <div className="pt-2"><BarraEmbudo total={r.embudo.total} /></div>
              {r.embudo.porSocio.length > 0 && (
                <table className="num mt-5 text-sm">
                  <thead>
                    <tr className="text-left text-[13px] text-tinta-2"><th className="py-1 font-medium">Socio</th><th className="font-medium">Visitados</th><th className="font-medium">Clientes</th><th className="font-medium">Conversión</th></tr>
                  </thead>
                  <tbody>
                    {r.embudo.porSocio.map((s) => (
                      <tr key={s.socio} className="border-t border-regla"><td className="py-1.5">{s.socio}</td><td>{s.visitados}</td><td>{s.cliente}</td><td>{pct(s.conversionBp)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Seccion>
            <Seccion titulo="A quién volver (7 días)">
              {r.pendientes.length ? (
                <ul className="divide-y divide-regla text-sm">
                  {r.pendientes.map((p) => (
                    <li key={p.id} className="flex gap-3 py-2">
                      <span className={`num w-14 shrink-0 ${p.fecha <= r.hoy ? "font-semibold text-sale" : "text-tinta-2"}`}>{p.fecha < r.hoy ? "atrasado" : p.fecha === r.hoy ? "hoy" : fecha(p.fecha)}</span>
                      <span className="min-w-0">
                        <span className="font-medium">{p.comercio}</span>
                        <span className="text-tinta-2"> con {p.socio}</span>
                        {p.nota && <span className="block truncate text-tinta-3">{p.nota}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Vacio>Nada pendiente esta semana.</Vacio>
              )}
            </Seccion>
          </div>

          {r.mensual.length > 1 && (
            <div className="mt-8">
              <Seccion titulo="Caja a final de cada mes">
                <LineaCaja datos={r.mensual} />
              </Seccion>
            </div>
          )}
        </>
      )}
    </Datos>
  );
}
