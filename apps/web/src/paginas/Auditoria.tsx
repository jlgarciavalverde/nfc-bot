import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { cuando } from "../lib/formato";
import { Boton } from "../ui/Boton";
import { Chips } from "../ui/Campos";
import { Esqueleto, Tarjeta, Titulo, Vacio } from "../ui/Superficies";

interface Op { id: number; tipo: string; resumen: string; origen: string; creadoAt: string; deshechaAt: string | null; socio: string | null }
const ORIGEN: Record<string, string> = { bot: "Bot", ia: "Bot (IA)", panel: "Panel", admin: "Ajuste" };
const FILTROS = [["", "Todo"], ["sesion", "Sesiones"], ["venta", "Ventas"], ["cobro", "Cobros"], ["placa", "Placas"], ["ajustes", "Ajustes"], ["deshacer", "Deshechos"]] as const;

export default function Auditoria() {
  const [tipo, setTipo] = useState("");
  const q = useInfiniteQuery({
    queryKey: ["auditoria", tipo],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => api.get<{ operaciones: Op[] }>(`/api/auditoria?${new URLSearchParams({ ...(tipo ? { tipo } : {}), ...(pageParam ? { antesDe: String(pageParam) } : {}) })}`).then((r) => r.operaciones),
    getNextPageParam: (ult) => (ult.length === 100 ? ult.at(-1)!.id : undefined),
  });
  const ops = q.data?.pages.flat() ?? [];
  return (
    <>
      <Titulo detalle="Todo lo que se ha hecho, por quién y desde dónde (bot, panel o ajustes). Solo lo ven los admins.">Auditoría</Titulo>
      <div className="mb-4"><Chips etiqueta="Tipo" valor={tipo} onChange={setTipo} opciones={FILTROS.map(([v, t]) => ({ valor: v, texto: t }))} /></div>
      {q.isPending ? (
        <Esqueleto lineas={8} alto="h-12" />
      ) : ops.length ? (
        <>
          <Tarjeta className="divide-y divide-borde">
            {ops.map((o) => (
              <div key={o.id} className={`flex items-start gap-3 px-4 py-2.5 text-[14px] ${o.deshechaAt ? "opacity-55" : ""}`}>
                <span className="num w-12 shrink-0 pt-0.5 text-[12px] text-tinta-3">#{o.id}</span>
                <span className="min-w-0 flex-1">
                  <span className={o.deshechaAt ? "line-through" : ""}><b className="font-semibold">{o.socio ?? "Sistema"}</b>: {o.resumen}</span>
                  <span className="block text-[12px] text-tinta-3">{cuando(o.creadoAt)}, {ORIGEN[o.origen] ?? o.origen}, {o.tipo}{o.deshechaAt ? ", deshecho" : ""}</span>
                </span>
              </div>
            ))}
          </Tarjeta>
          {q.hasNextPage && <Boton className="mt-4 w-full" cargando={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>Cargar más</Boton>}
        </>
      ) : (
        <Vacio>Nada con ese filtro.</Vacio>
      )}
    </>
  );
}
