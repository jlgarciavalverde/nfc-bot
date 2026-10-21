import { lazy, Suspense, useMemo, useState } from "react";
import { Link, useSearch, useLocation } from "wouter";
import { ListBullets, MapTrifold, MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { fecha, normalizar } from "../lib/formato";
import { useComercios } from "../lib/consultas";
import { ESTADOS, ORDEN_ESTADOS, type Estado } from "../lib/tipos";
import { useApuntar } from "../apuntar/Apuntar";
import { Boton } from "../ui/Boton";
import { Chips } from "../ui/Campos";
import { Datos, Esqueleto, Sello, Tarjeta, Titulo, Vacio } from "../ui/Superficies";

const Mapa = lazy(() => import("../componentes/MapaComercios"));

export default function Comercios() {
  const q = useComercios();
  const apuntar = useApuntar();
  const busqueda = new URLSearchParams(useSearch());
  const [, ir] = useLocation();
  const vista = busqueda.get("vista") === "mapa" ? "mapa" : "lista";
  const [estado, setEstado] = useState<Estado | "todos">("todos");
  const [texto, setTexto] = useState("");
  const cambiarVista = (v: "lista" | "mapa") => ir(v === "mapa" ? "/comercios?vista=mapa" : "/comercios", { replace: true });

  return (
    <>
      <Titulo
        detalle={q.data ? `${q.data.length} apuntados, ${q.data.filter((c) => c.estado === "cliente").length} clientes` : undefined}
        accion={
          <>
            <div className="flex rounded-[10px] border border-control p-0.5" role="group" aria-label="Vista">
              <button type="button" aria-pressed={vista === "lista"} onClick={() => cambiarVista("lista")} className="flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-[14px] font-semibold aria-pressed:bg-base aria-pressed:text-sobre-base dark:aria-pressed:bg-sobre-base dark:aria-pressed:text-base"><ListBullets size={17} /> Lista</button>
              <button type="button" aria-pressed={vista === "mapa"} onClick={() => cambiarVista("mapa")} className="flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-[14px] font-semibold aria-pressed:bg-base aria-pressed:text-sobre-base dark:aria-pressed:bg-sobre-base dark:aria-pressed:text-base"><MapTrifold size={17} /> Mapa</button>
            </div>
            <Boton variante="primario" icono={<Plus size={17} weight="bold" />} onClick={() => apuntar({ tipo: "comercio" })}>Nuevo</Boton>
          </>
        }
      >
        Comercios
      </Titulo>
      <Datos q={q} esqueleto={<Esqueleto lineas={6} />}>
        {(cs) => <Lista cs={cs} vista={vista} estado={estado} setEstado={setEstado} texto={texto} setTexto={setTexto} />}
      </Datos>
    </>
  );
}

function Lista({ cs, vista, estado, setEstado, texto, setTexto }: { cs: import("../lib/tipos").Comercio[]; vista: "lista" | "mapa"; estado: Estado | "todos"; setEstado: (e: Estado | "todos") => void; texto: string; setTexto: (t: string) => void }) {
  const filtrados = useMemo(() => {
    const t = normalizar(texto.trim());
    return cs.filter((c) => (estado === "todos" || c.estado === estado) && (!t || normalizar([c.nombre, c.zona, c.tipo, c.responsable].filter(Boolean).join(" ")).includes(t)));
  }, [cs, estado, texto]);
  const cuenta = (e: Estado) => cs.filter((c) => c.estado === e).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-2 rounded-[12px] border border-control bg-superficie px-3 focus-within:border-tinta">
          <MagnifyingGlass size={18} className="text-tinta-3" />
          <span className="sr-only">Buscar</span>
          <input type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por nombre, zona, tipo o socio" className="min-h-11 w-full bg-transparent text-[16px] outline-none placeholder:text-tinta-3" />
        </label>
        <Chips etiqueta="Estado" valor={estado} onChange={setEstado} opciones={[{ valor: "todos" as const, texto: `Todos ${cs.length}` }, ...ORDEN_ESTADOS.map((e) => ({ valor: e, texto: <>{ESTADOS[e]} <span className="num opacity-70">{cuenta(e)}</span></> }))]} />
      </div>
      {vista === "mapa" ? (
        <Suspense fallback={<div className="esqueleto h-[62dvh]" />}>
          <Mapa comercios={filtrados} />
        </Suspense>
      ) : filtrados.length ? (
        <Tarjeta className="divide-y divide-borde overflow-hidden">
          {filtrados.map((c) => (
            <Link key={c.id} href={`/comercios/${c.id}`} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-hundido">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold">{c.nombre}</span>
                <span className="block truncate text-[13px] text-tinta-3">
                  {[c.tipo, c.zona, c.responsable && `lo lleva ${c.responsable}`].filter(Boolean).join(", ") || "Sin datos"}
                  {c.estado === "no" && c.motivoNo ? `: ${c.motivoNo}` : ""}
                </span>
              </span>
              <span className="hidden shrink-0 text-right text-[12px] text-tinta-3 sm:block">{c.ultimaVisita ? `visto el ${fecha(c.ultimaVisita)}` : "sin visitar"}</span>
              <Sello estado={c.estado} corto />
            </Link>
          ))}
        </Tarjeta>
      ) : (
        <Vacio titulo={cs.length ? "Ningún comercio con ese filtro" : "Aún no hay comercios"}>{cs.length ? "Prueba con otro estado o búsqueda." : "Apunta la primera visita con el botón «+»."}</Vacio>
      )}
    </div>
  );
}
