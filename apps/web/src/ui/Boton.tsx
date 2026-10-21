import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export type Variante = "primario" | "acento" | "secundario" | "plano" | "peligro";
export type Tamano = "sm" | "md" | "lg";

const VARIANTES: Record<Variante, string> = {
  // Negro de la base de la placa
  primario: "bg-base text-sobre-base hover:bg-base/90 active:bg-base/80 dark:bg-sobre-base dark:text-base dark:hover:bg-sobre-base/90",
  // Ámbar de las estrellas: solo para la acción principal de cada pantalla
  acento: "bg-estrella text-base hover:brightness-95 active:brightness-90",
  secundario: "border border-control bg-superficie text-tinta hover:bg-hundido active:bg-hundido",
  plano: "text-tinta-2 hover:bg-hundido hover:text-tinta active:bg-hundido",
  peligro: "border border-control bg-superficie text-sale hover:bg-hundido",
};
const TAMANOS: Record<Tamano, string> = {
  sm: "min-h-8 px-2.5 text-[13px] gap-1.5 rounded-lg",
  md: "min-h-10 px-3.5 text-sm gap-2 rounded-[10px]",
  lg: "min-h-12 px-5 text-[15px] gap-2 rounded-xl",
};

export function claseBoton(variante: Variante = "secundario", tamano: Tamano = "md", extra = "") {
  return `inline-flex select-none items-center justify-center font-semibold transition-[background-color,filter,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 ${VARIANTES[variante]} ${TAMANOS[tamano]} ${extra}`;
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; tamano?: Tamano; icono?: ReactNode; cargando?: boolean };

export const Boton = forwardRef<HTMLButtonElement, Props>(function Boton({ variante = "secundario", tamano = "md", icono, cargando, children, className = "", ...p }, ref) {
  return (
    <button ref={ref} type="button" {...p} disabled={p.disabled || cargando} aria-busy={cargando || undefined} className={claseBoton(variante, tamano, className)}>
      {cargando ? <Girando /> : icono}
      {children}
    </button>
  );
});

/** Botón solo con icono: siempre con nombre accesible. */
export const BotonIcono = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { etiqueta: string; variante?: Variante }>(function BotonIcono({ etiqueta, variante = "plano", className = "", children, ...p }, ref) {
  return (
    <button ref={ref} type="button" aria-label={etiqueta} title={etiqueta} {...p} className={`${claseBoton(variante, "md", "!px-0 size-10 shrink-0")} ${className}`}>
      {children}
    </button>
  );
});

export function Girando() {
  return <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />;
}
