import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { cuando, euros } from "../lib/formato";
import { useAccion } from "../lib/acciones";
import { Boton, Vacio } from "./ui";

const METODOS = [["bizum", "Bizum"], ["efectivo", "Efectivo"], ["transferencia", "Transf."], ["tarjeta", "Tarjeta"]] as const;

/** «Cobrar» → elige cómo han pagado → venta cobrada (y aviso al grupo). */
export function CobrarVenta({ id, totalCent, comercio }: { id: number; totalCent: number; comercio: string }) {
  const [abierto, setAbierto] = useState(false);
  const m = useAccion((metodo: string) => api.post(`/api/ventas/${id}/cobrar`, { metodo }), `Venta #${id} cobrada (${euros(totalCent)})`);
  if (!abierto) return <Boton onClick={() => setAbierto(true)} aria-label={`Cobrar la venta ${id} de ${comercio}`}>Cobrar</Boton>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1" role="group" aria-label={`Cómo ha pagado ${comercio}`}>
      {METODOS.map(([v, t]) => (
        <Boton key={v} variante="primario" disabled={m.isPending} onClick={() => m.mutate(v)}>{t}</Boton>
      ))}
      <Boton variante="plano" onClick={() => setAbierto(false)}>No</Boton>
    </span>
  );
}

export function HechoRecordatorio({ id, comercio }: { id: number; comercio: string }) {
  const m = useAccion(() => api.post(`/api/recordatorios/${id}/hecho`), `Hecho: ${comercio}`);
  return <Boton disabled={m.isPending} onClick={() => m.mutate(undefined)} aria-label={`Marcar como hecho ${comercio}`}>Hecho</Boton>;
}

interface Operacion { id: number; tipo: string; resumen: string; origen: string; creadoAt: string; deshechaAt: string | null; socio: string | null; deshacible: boolean }
const ORIGEN: Record<string, string> = { panel: "panel", ia: "bot (IA)", bot: "bot", admin: "ajuste" };

/** Quién ha hecho qué y cuándo (bot, panel, ajustes); lo último tuyo se puede deshacer durante 10 minutos. */
export function Actividad({ limite = 12 }: { limite?: number }) {
  const q = useQuery({ queryKey: ["actividad"], queryFn: () => api.get<{ actividad: Operacion[] }>("/api/actividad").then((r) => r.actividad), refetchInterval: 30_000 });
  const deshacer = useAccion(() => api.post<{ resumen: string }>("/api/deshacer"), "Deshecho");
  const filas = (q.data ?? []).slice(0, limite);
  if (q.isSuccess && !filas.length) return <Vacio>Aún no hay actividad.</Vacio>;
  return (
    <ul className="divide-y divide-regla text-sm">
      {filas.map((o) => (
        <li key={o.id} className={`flex items-start gap-3 py-2 ${o.deshechaAt ? "text-tinta-3 line-through" : ""}`}>
          <span className="min-w-0 flex-1">
            <span className="font-medium">{o.socio ?? "Sistema"}:</span> {o.resumen}
            <span className="block text-[13px] text-tinta-3">{cuando(o.creadoAt)}, desde el {ORIGEN[o.origen] ?? o.origen}</span>
          </span>
          {o.deshacible && (
            <Boton variante="plano" disabled={deshacer.isPending} onClick={() => deshacer.mutate(undefined)}>Deshacer</Boton>
          )}
        </li>
      ))}
    </ul>
  );
}
