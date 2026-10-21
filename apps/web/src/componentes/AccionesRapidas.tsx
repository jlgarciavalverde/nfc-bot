import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowCounterClockwise, Check } from "@phosphor-icons/react";
import { api } from "../lib/api";
import { cuando, euros } from "../lib/formato";
import { useAccion } from "../lib/acciones";
import { Boton } from "../ui/Boton";
import { Esqueleto, Vacio } from "../ui/Superficies";

const METODOS = [["bizum", "Bizum"], ["efectivo", "Efectivo"], ["transferencia", "Transf."], ["tarjeta", "Tarjeta"]] as const;

/** «Cobrar» → cómo han pagado → venta cobrada (y aviso al grupo). */
export function CobrarVenta({ id, totalCent, comercio }: { id: number; totalCent: number; comercio: string }) {
  const [abierto, setAbierto] = useState(false);
  const m = useAccion((metodo: string) => api.post(`/api/ventas/${id}/cobrar`, { metodo }), `Cobrados ${euros(totalCent)} de ${comercio}`, { deshacer: true });
  if (!abierto) return <Boton tamano="sm" variante="primario" onClick={() => setAbierto(true)} aria-label={`Cobrar la venta ${id} de ${comercio}`}>Cobrar</Boton>;
  return (
    <span className="flex flex-wrap items-center justify-end gap-1" role="group" aria-label={`Cómo ha pagado ${comercio}`}>
      {METODOS.map(([v, t]) => (
        <Boton key={v} tamano="sm" variante="secundario" disabled={m.isPending} onClick={() => m.mutate(v)}>{t}</Boton>
      ))}
      <Boton tamano="sm" variante="plano" onClick={() => setAbierto(false)}>No</Boton>
    </span>
  );
}

export function HechoRecordatorio({ id, comercio }: { id: number; comercio: string }) {
  const m = useAccion(() => api.post(`/api/recordatorios/${id}/hecho`), `Hecho: ${comercio}`);
  return (
    <Boton tamano="sm" variante="secundario" icono={<Check size={15} weight="bold" />} cargando={m.isPending} onClick={() => m.mutate(undefined)} aria-label={`Marcar como hecho ${comercio}`}>
      Hecho
    </Boton>
  );
}

interface Operacion { id: number; tipo: string; resumen: string; origen: string; creadoAt: string; deshechaAt: string | null; socio: string | null; deshacible: boolean }
const ORIGEN: Record<string, string> = { panel: "el panel", ia: "el bot (IA)", bot: "el bot", admin: "un ajuste" };
const inicial = (n: string | null) => (n ?? "?").trim().charAt(0).toUpperCase();

/** Quién ha hecho qué y cuándo; lo último tuyo se puede deshacer durante 10 minutos. */
export function Actividad({ limite = 10 }: { limite?: number }) {
  const q = useQuery({ queryKey: ["actividad"], queryFn: () => api.get<{ actividad: Operacion[] }>("/api/actividad").then((r) => r.actividad), refetchInterval: 30_000 });
  const deshacer = useAccion(() => api.post<{ resumen: string }>("/api/deshacer"), "Deshecho");
  if (q.isPending) return <Esqueleto lineas={4} alto="h-11" />;
  const filas = (q.data ?? []).filter((o) => o.tipo !== "sesion").slice(0, limite);
  if (!filas.length) return <Vacio>Aún no hay actividad.</Vacio>;
  return (
    <ol className="relative space-y-0.5">
      {filas.map((o) => (
        <li key={o.id} className={`flex items-start gap-3 rounded-xl px-1 py-2 ${o.deshechaAt ? "opacity-55" : ""}`}>
          <span aria-hidden className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-base text-[13px] font-bold text-estrella dark:bg-hundido">{inicial(o.socio)}</span>
          <span className="min-w-0 flex-1 text-[14px]">
            <span className={o.deshechaAt ? "line-through" : ""}>
              <b className="font-semibold">{o.socio ?? "Sistema"}</b>: {o.resumen}
            </span>
            <span className="block text-[12px] text-tinta-3">{cuando(o.creadoAt)}, desde {ORIGEN[o.origen] ?? o.origen}{o.deshechaAt ? " (deshecho)" : ""}</span>
          </span>
          {o.deshacible && (
            <Boton tamano="sm" variante="plano" icono={<ArrowCounterClockwise size={15} />} cargando={deshacer.isPending} onClick={() => deshacer.mutate(undefined)}>Deshacer</Boton>
          )}
        </li>
      ))}
    </ol>
  );
}
