import { useEffect, useId, useRef, type ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { ESTADOS, type Estado } from "../lib/tipos";

export function Titulo({ children, accion }: { children: ReactNode; accion?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <h1 className="text-2xl font-semibold tracking-tight">{children}</h1>
      {accion}
    </div>
  );
}

export function Seccion({ titulo, children, extra }: { titulo: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <section className="min-w-0">
      <div className="mb-2 flex items-baseline justify-between gap-3 border-b border-regla-2 pb-1.5">
        <h2 className="text-[15px] font-semibold">{titulo}</h2>
        {extra}
      </div>
      {children}
    </section>
  );
}

/** Cifra grande con su etiqueta. `tono` colorea solo la cifra. */
export function Cifra({ etiqueta, valor, nota, tono }: { etiqueta: string; valor: ReactNode; nota?: ReactNode; tono?: "entra" | "sale" }) {
  return (
    <div className="min-w-0">
      <div className="text-[13px] text-tinta-2">{etiqueta}</div>
      <div className={`num truncate text-[26px] font-semibold leading-tight tracking-tight ${tono === "entra" ? "text-entra" : tono === "sale" ? "text-sale" : ""}`}>{valor}</div>
      {nota && <div className="num text-[13px] text-tinta-3">{nota}</div>}
    </div>
  );
}

const COLOR_ESTADO: Record<Estado, string> = { pendiente: "bg-e-pendiente", interesado: "bg-e-interesado", si: "bg-e-si", no: "bg-e-no", cliente: "bg-e-cliente" };

export function PuntoEstado({ estado }: { estado: Estado }) {
  return <span aria-hidden className={`inline-block size-2.5 shrink-0 rounded-full ${COLOR_ESTADO[estado]} ${estado === "cliente" ? "ring-2 ring-estrella ring-offset-1 ring-offset-papel" : ""}`} />;
}

export function EtiquetaEstado({ estado }: { estado: Estado }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <PuntoEstado estado={estado} />
      {ESTADOS[estado]}
    </span>
  );
}

export function Boton({ children, variante = "normal", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: "normal" | "primario" | "peligro" | "plano" }) {
  const v = {
    normal: "border border-regla-2 bg-papel hover:bg-fondo",
    primario: "bg-tinta text-papel hover:opacity-90",
    peligro: "border border-regla-2 bg-papel text-sale hover:bg-fondo",
    plano: "text-tinta-2 hover:text-tinta hover:bg-fondo",
  }[variante];
  return (
    <button type="button" {...p} className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium disabled:opacity-50 ${v} ${p.className ?? ""}`}>
      {children}
    </button>
  );
}

export function Campo({ etiqueta, ayuda, ...p }: React.InputHTMLAttributes<HTMLInputElement> & { etiqueta: string; ayuda?: string }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex min-w-0 flex-col gap-1 text-[13px] text-tinta-2">
      {etiqueta}
      <input id={id} {...p} className={`num min-h-9 w-full rounded-md border border-regla-2 bg-papel px-2.5 text-[15px] text-tinta ${p.className ?? ""}`} aria-describedby={ayuda ? `${id}-a` : undefined} />
      {ayuda && <span id={`${id}-a`} className="text-tinta-3">{ayuda}</span>}
    </label>
  );
}

export function Selector<T extends string>({ etiqueta, valor, opciones, onChange }: { etiqueta: string; valor: T; opciones: { valor: T; texto: string }[]; onChange: (v: T) => void }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex flex-col gap-1 text-[13px] text-tinta-2">
      {etiqueta}
      <select id={id} value={valor} onChange={(e) => onChange(e.target.value as T)} className="min-h-9 rounded-md border border-regla-2 bg-papel px-2 text-[15px] text-tinta">
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Pestañas tipo filtro (radio). */
export function Filtro<T extends string>({ etiqueta, valor, opciones, onChange }: { etiqueta: string; valor: T; opciones: { valor: T; texto: ReactNode }[]; onChange: (v: T) => void }) {
  const nombre = useId();
  return (
    <fieldset className="flex flex-wrap gap-1">
      <legend className="sr-only">{etiqueta}</legend>
      {opciones.map((o) => (
        <label key={o.valor} className={`cursor-pointer rounded-md px-2.5 py-1.5 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-foco ${valor === o.valor ? "bg-tinta text-papel" : "text-tinta-2 hover:bg-papel"}`}>
          <input type="radio" name={nombre} value={o.valor} checked={valor === o.valor} onChange={() => onChange(o.valor)} className="sr-only" />
          {o.texto}
        </label>
      ))}
    </fieldset>
  );
}

/** Tabla con desplazamiento horizontal propio (nunca desborda la página). */
export function Tabla({ children, etiqueta }: { children: ReactNode; etiqueta: string }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="region" aria-label={etiqueta} tabIndex={0}>
      <table className="text-sm [&_td]:border-b [&_td]:border-regla [&_td]:px-2 [&_td]:py-2 [&_td]:align-top [&_th]:whitespace-nowrap [&_th]:border-b [&_th]:border-regla-2 [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:text-[13px] [&_th]:font-medium [&_th]:text-tinta-2 [&_td:first-child]:pl-0 [&_th:first-child]:pl-0">
        {children}
      </table>
    </div>
  );
}

export function Vacio({ children }: { children: ReactNode }) {
  return <p className="py-6 text-tinta-3">{children}</p>;
}

/** Estado de carga/error de una consulta; muestra `children(datos)` cuando hay datos. */
export function Datos<T>({ q, children }: { q: UseQueryResult<T>; children: (d: T) => ReactNode }) {
  if (q.isPending) return <p className="py-10 text-tinta-3" role="status">Cargando…</p>;
  if (q.isError)
    return (
      <div role="alert" className="py-6">
        <p className="text-sale">{q.error.message}</p>
        <Boton className="mt-2" onClick={() => q.refetch()}>
          Reintentar
        </Boton>
      </div>
    );
  return <>{children(q.data)}</>;
}

/** Hoja lateral (diálogo modal nativo). */
export function Hoja({ abierta, onCerrar, titulo, children }: { abierta: boolean; onCerrar: () => void; titulo: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierta && !d.open) d.showModal();
    if (!abierta && d.open) d.close();
  }, [abierta]);
  return (
    <dialog
      ref={ref}
      onClose={onCerrar}
      onClick={(e) => e.target === ref.current && onCerrar()}
      aria-label={titulo}
      className="m-0 ml-auto h-dvh max-h-dvh w-full max-w-lg bg-papel p-0 text-tinta backdrop:bg-black/40"
    >
      <div className="flex items-center justify-between gap-3 border-b border-regla px-5 py-3">
        <h2 className="min-w-0 truncate text-lg font-semibold">{titulo}</h2>
        <Boton variante="plano" onClick={onCerrar} aria-label="Cerrar">
          Cerrar
        </Boton>
      </div>
      <div className="px-5 py-4">{abierta && children}</div>
    </dialog>
  );
}
