import type { ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { ESTADOS, type Estado } from "../lib/tipos";
import { Boton } from "./Boton";

/** Cabecera de página: título grande y acciones. */
export function Titulo({ children, detalle, accion }: { children: ReactNode; detalle?: ReactNode; accion?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-[26px] font-bold leading-tight sm:text-[30px]">{children}</h1>
        {detalle && <p className="mt-1 text-[14px] text-tinta-3">{detalle}</p>}
      </div>
      {accion && <div className="flex flex-wrap gap-2">{accion}</div>}
    </header>
  );
}

export function Seccion({ titulo, extra, children, className = "" }: { titulo: string; extra?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 ${className}`} aria-label={titulo}>
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h2 className="text-[17px] font-bold">{titulo}</h2>
        {extra && <div className="text-[13px] text-tinta-3">{extra}</div>}
      </div>
      {children}
    </section>
  );
}

/** La tarjeta con el marco interior de la placa (para lo importante: indicadores, la ficha, el paso actual). */
export function TarjetaPlaca({ children, className = "", as: Tag = "div" }: { children: ReactNode; className?: string; as?: "div" | "section" | "article" }) {
  return <Tag className={`tarjeta-placa p-4 sm:p-5 ${className}`}>{children}</Tag>;
}

/** Superficie sencilla (listas, bloques secundarios). */
export function Tarjeta({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[var(--radius-placa)] border border-borde bg-superficie ${className}`}>{children}</div>;
}

export function Cifra({ etiqueta, valor, nota, tono, grande }: { etiqueta: string; valor: ReactNode; nota?: ReactNode; tono?: "entra" | "sale"; grande?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[13px] font-semibold text-tinta-3">{etiqueta}</div>
      <div className={`num truncate font-bold leading-[1.1] tracking-tight ${grande ? "text-[34px] sm:text-[40px]" : "text-[24px] sm:text-[28px]"} ${tono === "entra" ? "text-entra" : tono === "sale" ? "text-sale" : ""}`}>{valor}</div>
      {nota && <div className="num mt-0.5 text-[13px] text-tinta-3">{nota}</div>}
    </div>
  );
}

const ESTRELLA = "M12 2.6l2.75 5.86 6.43.68-4.8 4.36 1.33 6.33L12 16.6 6.29 19.83l1.33-6.33-4.8-4.36 6.43-.68z";

/** Las 5 estrellas de la placa como progreso (`llenas` de 0 a 5, admite medias). */
export function Estrellas({ llenas, total = 5, tam = 16, etiqueta }: { llenas: number; total?: number; tam?: number; etiqueta?: string }) {
  return (
    <span className="inline-flex items-center gap-[2px]" role={etiqueta ? "img" : undefined} aria-label={etiqueta} aria-hidden={etiqueta ? undefined : true}>
      {Array.from({ length: total }, (_, i) => {
        const f = Math.max(0, Math.min(1, llenas - i));
        return (
          <svg key={i} viewBox="0 0 24 24" width={tam} height={tam} aria-hidden>
            <defs>
              <clipPath id={`e${i}-${tam}-${Math.round(f * 100)}`}><rect width={24 * f} height="24" /></clipPath>
            </defs>
            <path d={ESTRELLA} className="fill-borde-fuerte" />
            {f > 0 && <path d={ESTRELLA} className="fill-estrella" clipPath={`url(#e${i}-${tam}-${Math.round(f * 100)})`} />}
          </svg>
        );
      })}
    </span>
  );
}

export function EstrellaMarca({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" className="fill-base dark:fill-sobre-base/10" />
      <path d="M16 6l2.9 6.2 6.7.7-5 4.6 1.4 6.6L16 20.8 10 24.1l1.4-6.6-5-4.6 6.7-.7z" className="fill-estrella" />
    </svg>
  );
}

const COLOR_ESTADO: Record<Estado, string> = { pendiente: "bg-e-pendiente", interesado: "bg-e-interesado", si: "bg-e-si", no: "bg-e-no", cliente: "bg-e-cliente" };

export function PuntoEstado({ estado }: { estado: Estado }) {
  return <span aria-hidden className={`inline-block size-2.5 shrink-0 rounded-full ${COLOR_ESTADO[estado]} ${estado === "cliente" ? "ring-2 ring-estrella ring-offset-1 ring-offset-superficie" : ""}`} />;
}

/** Sello del estado del comercio (como una chapa). */
export function Sello({ estado, corto }: { estado: Estado; corto?: boolean }) {
  const t = corto ? { pendiente: "Por visitar", interesado: "Interesado", si: "Sí", no: "No", cliente: "Cliente" }[estado] : ESTADOS[estado];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[12px] font-semibold ${estado === "cliente" ? "border-base bg-base text-sobre-base dark:border-sobre-base dark:bg-sobre-base dark:text-base" : "border-borde-fuerte bg-superficie text-tinta-2"}`}>
      {estado === "cliente" ? <span className="text-estrella">★</span> : <PuntoEstado estado={estado} />}
      {t}
    </span>
  );
}

export function Vacio({ titulo, children, accion }: { titulo?: string; children?: ReactNode; accion?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[var(--radius-placa)] border border-dashed border-borde-fuerte px-6 py-8 text-center">
      <Estrellas llenas={0} tam={14} />
      {titulo && <p className="font-semibold">{titulo}</p>}
      {children && <p className="max-w-sm text-[14px] text-tinta-3">{children}</p>}
      {accion && <div className="mt-2">{accion}</div>}
    </div>
  );
}

export function Esqueleto({ lineas = 3, alto = "h-14" }: { lineas?: number; alto?: string }) {
  return (
    <div className="space-y-2" role="status" aria-label="Cargando">
      {Array.from({ length: lineas }, (_, i) => <div key={i} className={`esqueleto ${alto}`} />)}
    </div>
  );
}

/** Carga/error de una consulta: esqueleto mientras carga, mensaje y «Reintentar» si falla. */
export function Datos<T>({ q, children, esqueleto }: { q: UseQueryResult<T>; children: (d: T) => ReactNode; esqueleto?: ReactNode }) {
  if (q.isPending) return <>{esqueleto ?? <Esqueleto />}</>;
  if (q.isError)
    return (
      <div role="alert" className="rounded-[var(--radius-placa)] border border-sale/40 bg-superficie p-4">
        <p className="font-medium text-sale">{q.error.message}</p>
        <Boton className="mt-3" onClick={() => q.refetch()}>Reintentar</Boton>
      </div>
    );
  return <>{children(q.data)}</>;
}

/** Fila de lista tocable (comercios, ventas, placas…). */
export function Fila({ children, onClick, className = "" }: { children: ReactNode; onClick?: () => void; className?: string }) {
  const base = `flex w-full min-w-0 items-center gap-3 px-4 py-3 text-left ${className}`;
  return onClick ? (
    <button type="button" onClick={onClick} className={`${base} transition-colors hover:bg-hundido active:bg-hundido`}>{children}</button>
  ) : (
    <div className={base}>{children}</div>
  );
}
