import { useId, useMemo, useState } from "react";
import { MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { api } from "../lib/api";
import { normalizar } from "../lib/formato";
import { useComercios } from "../lib/consultas";
import { PuntoEstado } from "../ui/Superficies";

export type Eleccion = { id: number; nombre: string } | { nuevo: string };

export const hoyMadrid = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
export const enDias = (n: number) => new Date(Date.now() + n * 86_400_000).toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });

/** Id del comercio elegido; si es nuevo, lo crea antes. */
export async function idComercio(e: Eleccion) {
  if ("id" in e) return e.id;
  const r = await api.post<{ comercio: { id: number } }>("/api/comercios", { nombre: e.nuevo });
  return r.comercio.id;
}
export const nombreEleccion = (e: Eleccion | null) => (!e ? "" : "id" in e ? e.nombre : e.nuevo);

/**
 * Paso «¿Qué comercio?»: buscador con resultados grandes. Al elegir, avanza solo.
 * Si no existe, ofrece crearlo (se crea al guardar, no antes).
 */
export function ElegirComercio({ valor, onChange, avanzar, permitirNuevo = true }: { valor: Eleccion | null; onChange: (e: Eleccion) => void; avanzar: () => void; permitirNuevo?: boolean }) {
  const q = useComercios();
  const [texto, setTexto] = useState("");
  const id = useId();
  const t = normalizar(texto.trim());
  const lista = useMemo(() => {
    const todos = q.data ?? [];
    if (!t) return [...todos].sort((a, b) => (b.ultimaVisita ?? "").localeCompare(a.ultimaVisita ?? "")).slice(0, 6);
    return todos.filter((c) => normalizar(`${c.nombre} ${c.zona ?? ""}`).includes(t)).slice(0, 8);
  }, [q.data, t]);
  const exacto = (q.data ?? []).some((c) => normalizar(c.nombre) === t);
  const elegir = (e: Eleccion) => {
    onChange(e);
    avanzar();
  };
  return (
    <div className="space-y-3">
      <label htmlFor={id} className="sr-only">Buscar comercio</label>
      <div className="flex items-center gap-2 rounded-[12px] border border-control bg-superficie px-3 focus-within:border-tinta">
        <MagnifyingGlass size={18} className="shrink-0 text-tinta-3" />
        <input id={id} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escribe el nombre" autoComplete="off" className="min-h-12 w-full bg-transparent text-[16px] outline-none placeholder:text-tinta-3" />
      </div>
      {valor && !t && <p className="text-[14px] text-tinta-2">Elegido: <b className="font-semibold text-tinta">{nombreEleccion(valor)}</b>{"nuevo" in valor ? " (nuevo)" : ""}</p>}
      <ul className="divide-y divide-borde overflow-hidden rounded-[12px] border border-borde bg-superficie" aria-label={t ? "Resultados" : "Últimos visitados"}>
        {!t && <li className="px-4 py-2 text-[12px] font-semibold text-tinta-3">Últimos visitados</li>}
        {lista.map((c) => (
          <li key={c.id}>
            <button type="button" onClick={() => elegir({ id: c.id, nombre: c.nombre })} aria-pressed={!!valor && "id" in valor && valor.id === c.id} className="flex min-h-13 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-hundido aria-pressed:bg-hundido">
              <PuntoEstado estado={c.estado} />
              <span className="min-w-0 flex-1 truncate font-semibold">{c.nombre}</span>
              {c.zona && <span className="shrink-0 text-[13px] text-tinta-3">{c.zona}</span>}
            </button>
          </li>
        ))}
        {permitirNuevo && t && !exacto && (
          <li>
            <button type="button" onClick={() => elegir({ nuevo: texto.trim() })} className="flex min-h-13 w-full items-center gap-3 px-4 py-3 text-left font-semibold transition-colors hover:bg-hundido">
              <span className="flex size-6 items-center justify-center rounded-full bg-estrella text-base"><Plus size={14} weight="bold" /></span>
              Crear «{texto.trim()}»
            </button>
          </li>
        )}
        {!lista.length && !(permitirNuevo && t) && <li className="px-4 py-4 text-tinta-3">{q.isPending ? "Cargando…" : "Aún no hay comercios."}</li>}
      </ul>
    </div>
  );
}

/** Fila del resumen final de un asistente. */
export function Resumen({ filas }: { filas: [string, React.ReactNode][] }) {
  return (
    <dl className="tarjeta-placa grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2.5 p-5 text-[15px]">
      {filas.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-tinta-3">{k}</dt>
          <dd className="min-w-0 break-words text-right font-semibold">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
