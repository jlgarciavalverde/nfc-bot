import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { RadioGroup, Switch } from "radix-ui";

const CONTROL = "w-full rounded-[10px] border border-control bg-superficie px-3 text-[16px] text-tinta placeholder:text-tinta-3/80 transition-colors focus:border-tinta focus:outline-none focus-visible:outline-2 focus-visible:outline-foco disabled:opacity-50 aria-[invalid=true]:border-sale";

interface Envoltura {
  etiqueta: string;
  ayuda?: ReactNode;
  error?: string | null;
  oculta?: boolean;
}

function Envuelve({ id, etiqueta, ayuda, error, oculta, children }: Envoltura & { id: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className={oculta ? "sr-only" : "text-[13px] font-semibold text-tinta-2"}>{etiqueta}</label>
      {children}
      {error ? <p id={`${id}-e`} className="text-[13px] font-medium text-sale">{error}</p> : ayuda ? <p id={`${id}-a`} className="text-[13px] text-tinta-3">{ayuda}</p> : null}
    </div>
  );
}

/** Campo de texto con etiqueta, ayuda y error (16 px para que iOS no haga zoom). */
export const Campo = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & Envoltura & { sufijo?: ReactNode }>(function Campo({ etiqueta, ayuda, error, oculta, sufijo, className = "", ...p }, ref) {
  const id = useId();
  return (
    <Envuelve id={id} etiqueta={etiqueta} ayuda={ayuda} error={error} oculta={oculta}>
      <div className="relative">
        <input
          ref={ref}
          id={id}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${id}-e` : ayuda ? `${id}-a` : undefined}
          {...p}
          className={`${CONTROL} num min-h-11 ${sufijo ? "pr-10" : ""} ${className}`}
        />
        {sufijo && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center font-semibold text-tinta-3">{sufijo}</span>}
      </div>
    </Envuelve>
  );
});

export const Area = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & Envoltura>(function Area({ etiqueta, ayuda, error, oculta, className = "", ...p }, ref) {
  const id = useId();
  return (
    <Envuelve id={id} etiqueta={etiqueta} ayuda={ayuda} error={error} oculta={oculta}>
      <textarea ref={ref} id={id} rows={3} aria-invalid={!!error || undefined} {...p} className={`${CONTROL} min-h-20 py-2.5 ${className}`} />
    </Envuelve>
  );
});

/** Importe grande en euros (paso «¿cuánto?» de los asistentes). */
export const Importe = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & Envoltura>(function Importe({ etiqueta, ayuda, error, className = "", ...p }, ref) {
  const id = useId();
  return (
    <Envuelve id={id} etiqueta={etiqueta} ayuda={ayuda} error={error}>
      <div className="flex items-baseline gap-2 border-b-2 border-control pb-1 focus-within:border-tinta">
        <input ref={ref} id={id} inputMode="decimal" autoComplete="off" aria-invalid={!!error || undefined} {...p} className={`num w-full min-w-0 bg-transparent text-[40px] font-bold leading-tight tracking-tight text-tinta outline-none placeholder:text-tinta-3/50 ${className}`} />
        <span className="text-[28px] font-bold text-tinta-3">€</span>
      </div>
    </Envuelve>
  );
});

export function Selector<T extends string>({ etiqueta, valor, opciones, onChange, ayuda }: Envoltura & { valor: T; opciones: { valor: T; texto: string }[]; onChange: (v: T) => void }) {
  const id = useId();
  return (
    <Envuelve id={id} etiqueta={etiqueta} ayuda={ayuda}>
      <select id={id} value={valor} onChange={(e) => onChange(e.target.value as T)} className={`${CONTROL} min-h-11 appearance-none bg-[length:12px] bg-[right_12px_center] bg-no-repeat pr-8`} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%2369645b' stroke-width='1.6' fill='none'/%3E%3C/svg%3E\")" }}>
        {opciones.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
      </select>
    </Envuelve>
  );
}

/** Opciones grandes tipo baldosa (resultado de una visita, forma de cobro…). Teclado: flechas. */
export function Opciones<T extends string>({ etiqueta, valor, opciones, onChange, columnas = 2, oculta }: { etiqueta: string; valor: T | null; opciones: { valor: T; texto: string; detalle?: string; icono?: ReactNode }[]; onChange: (v: T) => void; columnas?: 2 | 3 | 4; oculta?: boolean }) {
  const cols = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-2 sm:grid-cols-4" }[columnas];
  return (
    <fieldset className="min-w-0">
      <legend className={oculta ? "sr-only" : "mb-1.5 text-[13px] font-semibold text-tinta-2"}>{etiqueta}</legend>
      <RadioGroup.Root value={valor ?? ""} onValueChange={(v) => onChange(v as T)} className={`grid gap-2 ${cols}`} aria-label={etiqueta}>
        {opciones.map((o) => (
          <RadioGroup.Item
            key={o.valor}
            value={o.valor}
            className="flex min-h-14 flex-col items-start justify-center gap-0.5 rounded-xl border border-control bg-superficie px-3 py-2.5 text-left transition-colors hover:bg-hundido data-[state=checked]:border-base data-[state=checked]:bg-base data-[state=checked]:text-sobre-base dark:data-[state=checked]:border-sobre-base dark:data-[state=checked]:bg-sobre-base dark:data-[state=checked]:text-base"
          >
            <span className="flex items-center gap-2 text-[15px] font-semibold">{o.icono}{o.texto}</span>
            {o.detalle && <span className="text-[12px] opacity-75">{o.detalle}</span>}
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>
    </fieldset>
  );
}

/** Filtro en fichas (una opción activa). */
export function Chips<T extends string>({ etiqueta, valor, opciones, onChange }: { etiqueta: string; valor: T; opciones: { valor: T; texto: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <RadioGroup.Root value={valor} onValueChange={(v) => onChange(v as T)} aria-label={etiqueta} className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
      {opciones.map((o) => (
        <RadioGroup.Item
          key={o.valor}
          value={o.valor}
          className="shrink-0 rounded-full border border-borde-fuerte bg-superficie px-3 py-1.5 text-[13px] font-semibold text-tinta-2 transition-colors hover:text-tinta data-[state=checked]:border-base data-[state=checked]:bg-base data-[state=checked]:text-sobre-base dark:data-[state=checked]:border-sobre-base dark:data-[state=checked]:bg-sobre-base dark:data-[state=checked]:text-base"
        >
          {o.texto}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}

export function Interruptor({ etiqueta, detalle, valor, onChange, disabled }: { etiqueta: string; detalle?: string; valor: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <label htmlFor={id} className="min-w-0">
        <span className="block text-[15px] font-semibold">{etiqueta}</span>
        {detalle && <span className="block text-[13px] text-tinta-3">{detalle}</span>}
      </label>
      <Switch.Root id={id} checked={valor} onCheckedChange={onChange} disabled={disabled} className="relative h-7 w-12 shrink-0 rounded-full border border-control bg-hundido transition-colors data-[state=checked]:border-base data-[state=checked]:bg-base disabled:opacity-50 dark:data-[state=checked]:border-estrella dark:data-[state=checked]:bg-estrella">
        <Switch.Thumb className="block size-5 translate-x-[3px] rounded-full bg-superficie shadow-sm transition-transform duration-150 data-[state=checked]:translate-x-[23px] data-[state=checked]:bg-estrella dark:data-[state=checked]:bg-base" />
      </Switch.Root>
    </div>
  );
}
