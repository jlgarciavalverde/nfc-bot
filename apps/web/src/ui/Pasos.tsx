import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Boton } from "./Boton";

export interface Paso {
  titulo: string;
  /** null si el paso está bien; si no, el mensaje que se enseña al intentar seguir. */
  validar?: () => string | null;
  contenido: (avanzar: () => void) => ReactNode;
  /** Saltar el paso (p. ej. «¿cuándo volver?» si dijo que no). */
  omitir?: boolean;
}

/**
 * Formulario en pasos: una cosa por pantalla, progreso con las estrellas de la placa, Enter para seguir,
 * y en el último paso «Guardar». El contenido de cada paso recibe `avanzar` para ir solo al elegir una opción.
 */
export function Pasos({ pasos, onTerminar, textoFinal, ocupado, error }: { pasos: Paso[]; onTerminar: () => void; textoFinal: string; ocupado?: boolean; error?: string | null }) {
  const visibles = pasos.filter((p) => !p.omitir);
  const [i, setI] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);
  const actual = visibles[Math.min(i, visibles.length - 1)]!;
  const ultimo = i >= visibles.length - 1;
  const zona = useRef<HTMLDivElement>(null);

  // Al cambiar de paso, el foco va al primer campo (o al título) para seguir con el teclado o el lector
  useEffect(() => {
    const el = zona.current?.querySelector<HTMLElement>("input:not([type=hidden]), textarea, select, [role=radio][data-state=checked], [role=radio], button[data-primero]");
    (el ?? zona.current?.querySelector<HTMLElement>("h3"))?.focus({ preventScroll: true });
  }, [i]);

  const siguiente = () => {
    const e = actual.validar?.() ?? null;
    setAviso(e);
    if (e) return;
    if (ultimo) onTerminar();
    else setI((x) => Math.min(x + 1, visibles.length - 1));
  };
  // `avanzar` desde una opción: se espera al siguiente render para validar con el valor ya elegido
  const [pedido, setPedido] = useState(0);
  useEffect(() => {
    if (pedido) siguiente();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido]);
  const avanzar = () => setPedido((n) => n + 1);
  const enviar = (ev: FormEvent) => {
    ev.preventDefault();
    siguiente();
  };

  return (
    <form onSubmit={enviar} noValidate className="flex min-h-full flex-col" aria-label={actual.titulo}>
      <div className="mb-4 flex items-center gap-3" aria-hidden>
        <div className="flex flex-1 gap-1">
          {visibles.map((_, k) => (
            <span key={k} className={`h-1.5 flex-1 rounded-full transition-colors duration-200 ${k <= i ? "bg-estrella" : "bg-hundido"}`} />
          ))}
        </div>
        <span className="num text-[12px] font-semibold text-tinta-3">{i + 1}/{visibles.length}</span>
      </div>
      <div ref={zona} key={i} className="animate-entrar flex-1 space-y-4">
        <h3 tabIndex={-1} className="text-[22px] font-bold leading-tight outline-none">{actual.titulo}</h3>
        <p className="sr-only" aria-live="polite">Paso {i + 1} de {visibles.length}: {actual.titulo}</p>
        {actual.contenido(avanzar)}
      </div>
      {(aviso || error) && <p role="alert" className="mt-4 rounded-lg bg-sale/10 px-3 py-2 text-[14px] font-medium text-sale">{aviso ?? error}</p>}
      <div className="sticky bottom-0 -mx-5 mt-5 flex gap-2 bg-fondo px-5 pb-1 pt-3">
        {i > 0 && (
          <Boton tamano="lg" variante="secundario" onClick={() => (setAviso(null), setI((x) => x - 1))}>
            Atrás
          </Boton>
        )}
        <Boton type="submit" tamano="lg" variante={ultimo ? "acento" : "primario"} className="flex-1" cargando={ultimo && ocupado}>
          {ultimo ? textoFinal : "Siguiente"}
        </Boton>
      </div>
    </form>
  );
}

/** Borrador que sobrevive a cerrar la hoja sin querer (sessionStorage; se borra al guardar). */
export function useBorrador<T extends object>(clave: string, inicial: T) {
  const k = `borrador:${clave}`;
  const [v, setV] = useState<T>(() => {
    try {
      const s = sessionStorage.getItem(k);
      return s ? { ...inicial, ...(JSON.parse(s) as T) } : inicial;
    } catch {
      return inicial;
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(k, JSON.stringify(v));
    } catch {
      // modo privado: sin borrador, no pasa nada
    }
  }, [k, v]);
  const poner = (p: Partial<T>) => setV((x) => ({ ...x, ...p }));
  const limpiar = () => {
    try {
      sessionStorage.removeItem(k);
    } catch {
      // nada
    }
  };
  return [v, poner, limpiar] as const;
}
