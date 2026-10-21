import { useId, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { normalizar } from "../lib/formato";
import type { Comercio } from "../lib/tipos";
import { PuntoEstado } from "./ui";

export type Eleccion = { id: number; nombre: string } | { nuevo: string };

/** Elegir un comercio escribiendo su nombre; si no existe, se ofrece crearlo. */
export function BuscadorComercio({ valor, onChange, permitirNuevo = true }: { valor: Eleccion | null; onChange: (e: Eleccion | null) => void; permitirNuevo?: boolean }) {
  const q = useQuery({ queryKey: ["comercios"], queryFn: () => api.get<{ comercios: Comercio[] }>("/api/comercios").then((r) => r.comercios) });
  const [texto, setTexto] = useState("");
  const id = useId();
  const t = normalizar(texto.trim());
  const opciones = useMemo(() => (t ? (q.data ?? []).filter((c) => normalizar(c.nombre).includes(t)).slice(0, 6) : []), [q.data, t]);
  const exacto = opciones.some((c) => normalizar(c.nombre) === t);

  if (valor) {
    return (
      <div className="flex min-h-9 items-center justify-between gap-2 rounded-md border border-regla-2 bg-fondo px-2.5">
        <span className="min-w-0 truncate font-medium">{"nuevo" in valor ? `${valor.nuevo} (nuevo)` : valor.nombre}</span>
        <button type="button" className="text-sm text-tinta-2 underline" onClick={() => (onChange(null), setTexto(""))}>
          Cambiar
        </button>
      </div>
    );
  }
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[13px] text-tinta-2">Comercio</label>
      <input
        id={id}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Escribe el nombre"
        autoComplete="off"
        className="min-h-9 w-full rounded-md border border-regla-2 bg-papel px-2.5 text-[15px]"
      />
      {t && (
        <ul className="mt-1 divide-y divide-regla rounded-md border border-regla bg-papel">
          {opciones.map((c) => (
            <li key={c.id}>
              <button type="button" className="flex w-full items-center gap-2 px-2.5 py-2 text-left hover:bg-fondo" onClick={() => onChange({ id: c.id, nombre: c.nombre })}>
                <PuntoEstado estado={c.estado} />
                <span className="min-w-0 truncate">{c.nombre}</span>
                {c.zona && <span className="ml-auto shrink-0 text-[13px] text-tinta-3">{c.zona}</span>}
              </button>
            </li>
          ))}
          {permitirNuevo && !exacto && (
            <li>
              <button type="button" className="w-full px-2.5 py-2 text-left font-medium hover:bg-fondo" onClick={() => onChange({ nuevo: texto.trim() })}>
                Crear «{texto.trim()}»
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
