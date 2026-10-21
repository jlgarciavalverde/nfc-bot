import { Link } from "wouter";
import { MapPin, Receipt, CurrencyEur, ContactlessPayment as Nfc, TrendDown, TrendUp } from "@phosphor-icons/react";
import { euros, fecha, pct, plural } from "../lib/formato";
import { useResumen, useVentas, useYo } from "../lib/consultas";
import { useApuntar } from "../apuntar/Apuntar";
import { BarrasSemanas, BarraEmbudo } from "../componentes/graficos";
import { Actividad, CobrarVenta, HechoRecordatorio } from "../componentes/AccionesRapidas";
import { Cifra, Datos, Esqueleto, Estrellas, Seccion, Tarjeta, TarjetaPlaca, Vacio } from "../ui/Superficies";

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function hoyLargo(f: string) {
  const d = new Date(`${f}T12:00:00Z`);
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
}

export function Hoy() {
  const q = useResumen();
  const yo = useYo();
  const apuntar = useApuntar();
  return (
    <Datos q={q} esqueleto={<><div className="esqueleto mb-6 h-16 w-2/3" /><Esqueleto lineas={3} alto="h-32" /></>}>
      {(r) => {
        const s = r.semana, a = r.semanaAnterior;
        const delta = a ? s.vendidoCent - a.vendidoCent : 0;
        const deHoy = r.pendientes.filter((p) => p.fecha <= r.hoy);
        const proximos = r.pendientes.filter((p) => p.fecha > r.hoy);
        return (
          <div className="space-y-7">
            <header className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[14px] font-semibold text-tinta-3 first-letter:uppercase">{hoyLargo(r.hoy)}</p>
                <h1 className="text-[28px] font-bold leading-tight sm:text-[32px]">Hola, {yo.data?.nombre.split(" ")[0]}</h1>
              </div>
              <div className="hidden gap-2 sm:flex">
                <Atajo icono={<MapPin size={18} weight="bold" />} texto="Visita" onClick={() => apuntar({ tipo: "visita" })} />
                <Atajo icono={<Receipt size={18} weight="bold" />} texto="Venta" onClick={() => apuntar({ tipo: "venta" })} acento />
                <Atajo icono={<CurrencyEur size={18} weight="bold" />} texto="Dinero" onClick={() => apuntar({ tipo: "dinero" })} />
                <Atajo icono={<Nfc size={18} weight="bold" />} texto="Placa" onClick={() => apuntar({ tipo: "placa" })} />
              </div>
            </header>

            {/* Indicadores: la placa grande */}
            <TarjetaPlaca className="!p-5 sm:!p-6">
              <div className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
                <Cifra grande etiqueta="Caja" valor={euros(r.caja.cajaCent)} nota="lo que debería haber" />
                <Cifra grande etiqueta="Beneficio" valor={euros(r.caja.beneficioCent)} tono={r.caja.beneficioCent < 0 ? "sale" : r.caja.beneficioCent > 0 ? "entra" : undefined} nota={`${euros(r.caja.ingresosCent)} de ingresos`} />
                <Cifra etiqueta="Esta semana" valor={euros(s.vendidoCent)} nota={
                  <span className="inline-flex items-center gap-1">
                    {a && delta !== 0 && (delta > 0 ? <TrendUp size={14} className="text-entra" /> : <TrendDown size={14} className="text-sale" />)}
                    {a ? (delta === 0 ? "igual que la anterior" : `${delta > 0 ? "+" : "−"}${euros(Math.abs(delta))} que la anterior`) : `${plural(s.ventas, "venta", "ventas")}`}
                  </span>
                } />
                <Cifra etiqueta="Por cobrar" valor={euros(r.caja.pendienteCobroCent)} tono={r.caja.pendienteCobroCent ? "sale" : undefined} nota={`${plural(r.caja.ventas, "venta", "ventas")} en total`} />
              </div>
            </TarjetaPlaca>

            <div className="grid grid-cols-1 gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <Seccion titulo="Hoy toca" extra={deHoy.length ? plural(deHoy.length, "comercio", "comercios") : undefined}>
                {deHoy.length ? (
                  <Tarjeta className="divide-y divide-borde">
                    {deHoy.map((p) => (
                      <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                        <Link href={`/comercios/${p.comercioId}`} className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{p.comercio}</span>
                          <span className="block truncate text-[13px] text-tinta-3">
                            {p.fecha < r.hoy ? <span className="font-semibold text-sale">Atrasado desde el {fecha(p.fecha)}</span> : `Con ${p.socio}`}
                            {p.nota ? `: ${p.nota}` : ""}
                          </span>
                        </Link>
                        <HechoRecordatorio id={p.id} comercio={p.comercio} />
                      </div>
                    ))}
                  </Tarjeta>
                ) : (
                  <Vacio titulo="Nada para hoy">{proximos.length ? `El próximo: ${proximos[0]!.comercio}, el ${fecha(proximos[0]!.fecha)}.` : "Cuando apuntéis «volver otro día», aparecerá aquí."}</Vacio>
                )}
                {deHoy.length > 0 && proximos.length > 0 && (
                  <p className="mt-2 text-[13px] text-tinta-3">Y en los próximos días: {proximos.slice(0, 3).map((p) => `${p.comercio} (${fecha(p.fecha)})`).join(", ")}{proximos.length > 3 ? "…" : ""}</p>
                )}
              </Seccion>
              <Seccion titulo="Por cobrar" extra={<Link href="/ventas" className="font-semibold text-tinta-2 hover:text-tinta">Ver ventas</Link>}>
                <PorCobrar yoId={yo.data?.id} esAdmin={yo.data?.rol === "admin"} />
              </Seccion>
            </div>

            <div className="grid grid-cols-1 gap-7 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <Seccion titulo="Ventas por semana">
                <Tarjeta className="p-4 sm:p-5"><BarrasSemanas datos={r.series} /></Tarjeta>
              </Seccion>
              <Seccion titulo="Comercios" extra={<Link href="/comercios" className="font-semibold text-tinta-2 hover:text-tinta">Ver todos</Link>}>
                <Tarjeta className="space-y-4 p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="num text-[28px] font-bold leading-none">{pct(r.embudo.conversionBp)}</div>
                      <div className="mt-1 text-[13px] text-tinta-3">de los visitados acaban comprando</div>
                    </div>
                    <Estrellas llenas={r.embudo.conversionBp / 2000} tam={20} etiqueta={`Conversión ${pct(r.embudo.conversionBp)}`} />
                  </div>
                  <BarraEmbudo total={r.embudo.total} />
                  {r.embudo.porSocio.length > 1 && (
                    <ul className="space-y-1.5 border-t border-borde pt-3 text-[14px]">
                      {[...r.embudo.porSocio].sort((x, y) => y.cliente - x.cliente).map((x) => (
                        <li key={x.socio} className="num flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate font-semibold">{x.socio}</span>
                          <span className="text-tinta-3">{x.cliente} de {x.visitados}</span>
                          <Estrellas llenas={x.conversionBp / 2000} tam={12} />
                        </li>
                      ))}
                    </ul>
                  )}
                </Tarjeta>
              </Seccion>
            </div>

            <Seccion titulo="Actividad">
              <Tarjeta className="p-2 sm:p-3"><Actividad /></Tarjeta>
            </Seccion>
          </div>
        );
      }}
    </Datos>
  );
}

function Atajo({ icono, texto, onClick, acento }: { icono: React.ReactNode; texto: string; onClick: () => void; acento?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`flex min-h-11 items-center gap-2 rounded-xl px-4 text-[14px] font-bold transition active:scale-[0.98] ${acento ? "bg-estrella text-base hover:brightness-95" : "border border-control bg-superficie hover:bg-hundido"}`}>
      {icono} {texto}
    </button>
  );
}

function PorCobrar({ yoId, esAdmin }: { yoId?: number; esAdmin: boolean }) {
  const q = useVentas();
  if (q.isPending) return <Esqueleto lineas={2} />;
  const pend = (q.data ?? []).filter((v) => !v.cobrada);
  if (!pend.length) return <Vacio titulo="Todo cobrado">No hay ventas pendientes de cobro.</Vacio>;
  return (
    <Tarjeta className="divide-y divide-borde">
      {pend.slice(0, 6).map((v) => (
        <div key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
          <Link href={`/comercios/${v.comercioId}`} className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{v.comercio}</span>
            <span className="num block text-[13px] text-tinta-3">{fecha(v.fecha)}, vendió {v.socio}</span>
          </Link>
          <span className="num text-[16px] font-bold">{euros(v.totalCent)}</span>
          {(esAdmin || v.socioId === yoId) && <CobrarVenta id={v.id} totalCent={v.totalCent} comercio={v.comercio} />}
        </div>
      ))}
      {pend.length > 6 && (
        <Link href="/ventas?ver=pendientes" className="flex items-center justify-center gap-1 px-4 py-3 text-[14px] font-semibold text-tinta-2 hover:text-tinta">
          Ver {pend.length - 6} más
        </Link>
      )}
    </Tarjeta>
  );
}
