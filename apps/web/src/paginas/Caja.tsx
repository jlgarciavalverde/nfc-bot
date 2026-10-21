import { useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Tabs } from "radix-ui";
import { euros, fecha, pct, mesLargo } from "../lib/formato";
import { useMovimientos, useReparto, useResumen, useYo } from "../lib/consultas";
import type { Movimiento } from "../lib/tipos";
import { useApuntar } from "../apuntar/Apuntar";
import { LineaCaja } from "../componentes/graficos";
import { Boton } from "../ui/Boton";
import { Chips } from "../ui/Campos";
import { Cifra, Datos, Esqueleto, Seccion, Tarjeta, TarjetaPlaca, Titulo, Vacio } from "../ui/Superficies";

const PESTANAS = [["resumen", "Resumen"], ["movimientos", "Movimientos"], ["reparto", "Reparto"]] as const;
type Pestana = (typeof PESTANAS)[number][0];

export default function Caja() {
  const apuntar = useApuntar();
  const busqueda = new URLSearchParams(useSearch());
  const [, ir] = useLocation();
  const ver = (PESTANAS.find(([k]) => k === busqueda.get("ver"))?.[0] ?? "resumen") as Pestana;
  return (
    <>
      <Titulo accion={<Boton variante="primario" onClick={() => apuntar({ tipo: "dinero" })}>Apuntar dinero</Boton>}>Caja</Titulo>
      <Tabs.Root value={ver} onValueChange={(v) => ir(v === "resumen" ? "/caja" : `/caja?ver=${v}`, { replace: true })}>
        <Tabs.List aria-label="Caja" className="mb-5 flex gap-1 border-b border-borde">
          {PESTANAS.map(([k, t]) => (
            <Tabs.Trigger key={k} value={k} className="-mb-px border-b-2 border-transparent px-3 pb-2.5 pt-1 text-[15px] font-semibold text-tinta-3 transition-colors hover:text-tinta data-[state=active]:border-estrella data-[state=active]:text-tinta">
              {t}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="resumen"><Resumen /></Tabs.Content>
        <Tabs.Content value="movimientos"><Movimientos /></Tabs.Content>
        <Tabs.Content value="reparto"><Reparto /></Tabs.Content>
      </Tabs.Root>
    </>
  );
}

function Resumen() {
  const q = useResumen();
  return (
    <Datos q={q} esqueleto={<Esqueleto lineas={3} alto="h-28" />}>
      {({ caja: c, mensual }) => (
        <div className="space-y-7">
          <TarjetaPlaca className="!p-5 sm:!p-6">
            <div className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
              <Cifra grande etiqueta="Caja" valor={euros(c.cajaCent)} nota="lo que debería haber" />
              <Cifra grande etiqueta="Beneficio" valor={euros(c.beneficioCent)} tono={c.beneficioCent < 0 ? "sale" : "entra"} nota="ingresos − gastos" />
              <Cifra etiqueta="Invertido" valor={euros(c.aportadoCent)} nota={c.retiradoCent ? `${euros(c.retiradoCent)} retirado` : "por los socios"} />
              <Cifra etiqueta="Por cobrar" valor={euros(c.pendienteCobroCent)} />
            </div>
          </TarjetaPlaca>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tarjeta className="p-4"><Cifra etiqueta="Ingresos" valor={euros(c.ingresosCent)} tono="entra" /></Tarjeta>
            <Tarjeta className="p-4"><Cifra etiqueta="Gastos" valor={euros(c.gastosCent)} tono="sale" /></Tarjeta>
            <Tarjeta className="p-4"><Cifra etiqueta="Margen paneles" valor={c.margenCent ? euros(c.margenCent) : "—"} nota="venta − coste" /></Tarjeta>
            <Tarjeta className="p-4"><Cifra etiqueta="Stock sin vender" valor={euros(c.valorStockCent)} nota="ya cuenta como gasto" /></Tarjeta>
          </div>
          <div className="grid grid-cols-1 gap-7 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Seccion titulo="Caja a final de mes">
              <Tarjeta className="p-4 sm:p-5">{mensual.length > 1 ? <LineaCaja datos={mensual} /> : <p className="text-tinta-3">Hace falta más de un mes de movimientos.</p>}</Tarjeta>
              {mensual.length > 0 && (
                <ul className="num mt-3 space-y-1 text-[14px]">
                  {[...mensual].reverse().slice(0, 6).map((m) => (
                    <li key={m.mes} className="flex gap-3">
                      <span className="w-28 capitalize text-tinta-2">{mesLargo(m.mes)}</span>
                      <span className="text-entra">+{euros(m.ingresosCent)}</span>
                      <span className="text-sale">−{euros(m.gastosCent)}</span>
                      <span className="ml-auto font-semibold">{euros(m.cajaCent)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Seccion>
            <Seccion titulo="Gastos por categoría">
              {c.gastosPorCategoria.length ? (
                <Tarjeta className="space-y-3 p-4 sm:p-5">
                  {c.gastosPorCategoria.map((g) => (
                    <div key={g.categoria}>
                      <div className="num flex text-[14px]"><span className="capitalize">{g.categoria}</span><span className="ml-auto font-semibold">{euros(g.cent)}</span></div>
                      <div className="mt-1 h-1.5 rounded-full bg-hundido"><div className="h-full rounded-full bg-tinta-2" style={{ width: `${(g.cent / c.gastosCent) * 100}%` }} /></div>
                    </div>
                  ))}
                </Tarjeta>
              ) : (
                <Vacio>Sin gastos.</Vacio>
              )}
            </Seccion>
          </div>
        </div>
      )}
    </Datos>
  );
}

const TIPO: Record<Movimiento["tipo"], string> = { aportacion: "Aportación", ingreso: "Ingreso", gasto: "Gasto", retirada: "Retirada" };

function Movimientos() {
  const q = useMovimientos();
  const [tipo, setTipo] = useState<Movimiento["tipo"] | "todos">("todos");
  const [socio, setSocio] = useState("todos");
  const socios = useMemo(() => [...new Set((q.data ?? []).map((m) => m.socio))], [q.data]);
  return (
    <Datos q={q} esqueleto={<Esqueleto lineas={6} />}>
      {(ms) => {
        const f = ms.filter((m) => (tipo === "todos" || m.tipo === tipo) && (socio === "todos" || m.socio === socio));
        const neto = f.reduce((a, m) => a + (m.tipo === "gasto" || m.tipo === "retirada" ? -m.importeCent : m.importeCent), 0);
        return (
          <div className="space-y-4">
            <Chips etiqueta="Tipo" valor={tipo} onChange={setTipo} opciones={[{ valor: "todos" as const, texto: "Todos" }, ...(Object.keys(TIPO) as Movimiento["tipo"][]).map((k) => ({ valor: k, texto: TIPO[k] }))]} />
            {socios.length > 1 && <Chips etiqueta="Socio" valor={socio} onChange={setSocio} opciones={[{ valor: "todos", texto: "Todos los socios" }, ...socios.map((s) => ({ valor: s, texto: s }))]} />}
            <p className="num text-[14px] text-tinta-3">{f.length} movimientos, neto <b className={neto < 0 ? "text-sale" : "text-entra"}>{euros(neto)}</b></p>
            {f.length ? (
              <Tarjeta className="divide-y divide-borde">
                {f.map((m) => {
                  const sale = m.tipo === "gasto" || m.tipo === "retirada";
                  return (
                    <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{m.nota || (m.categoria ? m.categoria : TIPO[m.tipo])}</span>
                        <span className="block text-[13px] text-tinta-3">{TIPO[m.tipo]}{m.categoria ? `, ${m.categoria}` : ""}, {m.socio}, {fecha(m.fecha, true)}</span>
                      </span>
                      <span className={`num shrink-0 font-bold ${sale ? "text-sale" : "text-entra"}`}>{sale ? "−" : "+"}{euros(m.importeCent)}</span>
                    </div>
                  );
                })}
              </Tarjeta>
            ) : (
              <Vacio>Ningún movimiento con ese filtro.</Vacio>
            )}
          </div>
        );
      }}
    </Datos>
  );
}

const MODO: Record<string, string> = { igual: "a partes iguales", porcentaje: "por porcentaje fijo", aportado: "en proporción a lo aportado" };

function Reparto() {
  const q = useReparto();
  const yo = useYo();
  return (
    <Datos q={q} esqueleto={<Esqueleto lineas={3} />}>
      {(r) => (
        <div className="space-y-5">
          <p className="max-w-3xl text-[15px] text-tinta-2">
            Beneficio de <b className="num text-tinta">{euros(r.caja.beneficioCent)}</b>
            {r.comisionBp ? <>, menos un {pct(r.comisionBp)} de comisión para quien vende</> : null}: se reparten <b className="num text-tinta">{euros(r.repartibleCent)}</b> {MODO[r.modoAplicado]}. El saldo es lo que le tocaría a cada uno si se liquidase hoy (entre todos suman la caja, {euros(r.caja.cajaCent)}).
          </p>
          {r.avisos.map((a) => <p key={a} role="alert" className="rounded-lg bg-sale/10 px-3 py-2 text-[14px] font-medium text-sale">{a}</p>)}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {r.lineas.map((l) => (
              <TarjetaPlaca key={l.socioId} className={l.nombre === yo.data?.nombre ? "ring-2 ring-estrella" : ""}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[17px] font-bold">{l.nombre}</span>
                  <span className="num text-[13px] text-tinta-3">{pct(l.pesoBp)}</span>
                </div>
                <div className="num mt-2 text-[30px] font-bold leading-none">{euros(l.saldoCent)}</div>
                <dl className="num mt-3 space-y-1 text-[14px]">
                  <div className="flex"><dt className="text-tinta-3">Aportado</dt><dd className="ml-auto">{euros(l.aportadoCent)}</dd></div>
                  {l.comisionCent > 0 && <div className="flex"><dt className="text-tinta-3">Comisión</dt><dd className="ml-auto">+{euros(l.comisionCent)}</dd></div>}
                  <div className="flex"><dt className="text-tinta-3">Su parte</dt><dd className={`ml-auto ${l.parteCent < 0 ? "text-sale" : ""}`}>{l.parteCent < 0 ? "−" : "+"}{euros(Math.abs(l.parteCent))}</dd></div>
                  {l.retiradoCent > 0 && <div className="flex"><dt className="text-tinta-3">Retirado</dt><dd className="ml-auto">−{euros(l.retiradoCent)}</dd></div>}
                </dl>
              </TarjetaPlaca>
            ))}
          </div>
        </div>
      )}
    </Datos>
  );
}
