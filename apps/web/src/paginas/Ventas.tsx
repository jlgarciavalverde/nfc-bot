import { useState } from "react";
import { Link, useSearch } from "wouter";
import { euros, fecha, plural } from "../lib/formato";
import { useVentas, useYo } from "../lib/consultas";
import { useApuntar } from "../apuntar/Apuntar";
import { CobrarVenta } from "../componentes/AccionesRapidas";
import { Boton } from "../ui/Boton";
import { Chips } from "../ui/Campos";
import { Cifra, Datos, Esqueleto, Tarjeta, Titulo, Vacio } from "../ui/Superficies";

export default function Ventas() {
  const q = useVentas();
  const yo = useYo();
  const apuntar = useApuntar();
  const [filtro, setFiltro] = useState<"todas" | "pendientes" | "mias">(new URLSearchParams(useSearch()).get("ver") === "pendientes" ? "pendientes" : "todas");
  return (
    <>
      <Titulo accion={<Boton variante="acento" onClick={() => apuntar({ tipo: "venta" })}>Apuntar venta</Boton>}>Ventas</Titulo>
      <Datos q={q} esqueleto={<Esqueleto lineas={6} />}>
        {(todas) => {
          const vs = todas.filter((v) => (filtro === "pendientes" ? !v.cobrada : filtro === "mias" ? v.socioId === yo.data?.id : true));
          const total = vs.reduce((a, v) => a + v.totalCent, 0);
          const conCoste = vs.filter((v) => v.costeCent != null);
          const margen = conCoste.reduce((a, v) => a + v.totalCent - v.costeCent!, 0);
          const descuento = vs.reduce((a, v) => a + v.precioListaCent - v.totalCent, 0);
          return (
            <div className="space-y-5">
              <Chips etiqueta="Ventas" valor={filtro} onChange={setFiltro} opciones={[{ valor: "todas", texto: "Todas" }, { valor: "pendientes", texto: `Por cobrar ${todas.filter((v) => !v.cobrada).length}` }, { valor: "mias", texto: "Mías" }]} />
              <Tarjeta className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4 sm:p-5">
                <Cifra etiqueta={filtro === "pendientes" ? "Por cobrar" : "Facturado"} valor={euros(total)} />
                <Cifra etiqueta="Paneles" valor={vs.reduce((a, v) => a + v.uds, 0)} nota={plural(vs.length, "venta", "ventas")} />
                <Cifra etiqueta="Margen" valor={conCoste.length ? euros(margen) : "—"} nota={conCoste.length < vs.length ? "solo con coste de stock" : undefined} />
                <Cifra etiqueta="Descuentos" valor={euros(descuento)} nota="frente al precio de lista" />
              </Tarjeta>
              {vs.length ? (
                <Tarjeta className="divide-y divide-borde">
                  {vs.map((v) => (
                    <div key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                      <span className="num w-10 shrink-0 text-[13px] text-tinta-3">#{v.id}</span>
                      <Link href={`/comercios/${v.comercioId}`} className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{v.comercio}</span>
                        <span className="block truncate text-[13px] text-tinta-3">{fecha(v.fecha, true)}, {plural(v.uds, "panel", "paneles")}, {v.socio}, {v.aplicado.toLowerCase()}</span>
                      </Link>
                      <span className="text-right">
                        <span className="num block font-bold">{euros(v.totalCent)}</span>
                        {v.cobrada ? <span className="block text-[12px] text-entra">{v.metodo ?? "cobrada"}</span> : <span className="block text-[12px] font-semibold text-sale">pendiente</span>}
                      </span>
                      {!v.cobrada && (yo.data?.rol === "admin" || v.socioId === yo.data?.id) && <CobrarVenta id={v.id} totalCent={v.totalCent} comercio={v.comercio} />}
                    </div>
                  ))}
                </Tarjeta>
              ) : (
                <Vacio titulo={filtro === "pendientes" ? "Todo cobrado" : "Sin ventas"}>{filtro === "pendientes" ? "No hay nada pendiente." : "Las ventas se apuntan con el botón «+» o desde el bot."}</Vacio>
              )}
            </div>
          );
        }}
      </Datos>
    </>
  );
}
