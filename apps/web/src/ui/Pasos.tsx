import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Boton } from "./Boton";
import { ContextoPaso } from "./contextoPaso";

/** Pantalla táctil: al cambiar de paso no se abre el teclado salvo en los pasos que son solo para escribir. */
const tactil = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

export interface Paso {
  titulo: string;
  /** null si el paso está bien; si no, el mensaje que se enseña al intentar seguir. */
  validar?: () => string | null;
  contenido: (avanzar: () => void) => ReactNode;
  /** Saltar el paso (p. ej. «¿cuándo volver?» si dijo que no). */
  omitir?: boolean;
  /** Paso que es solo para escribir (importe, nombre): en el móvil abre el teclado al llegar. */
  escribir?: boolean;
}

/**
 * Formulario en pasos: una cosa por pantalla, progreso con las estrellas de la placa, Enter para seguir,
 * y en el último paso «Guardar». El contenido de cada paso recibe `avanzar` para ir solo al elegir una opción.
 */
export function Pasos({ pasos, onTerminar, textoFinal, ocupado, error, borrador }: { pasos: Paso[]; onTerminar: () => void; textoFinal: string; ocupado?: boolean; error?: string | null; borrador?: Borrador }) {
  const visibles = pasos.filter((p) => !p.omitir);
  const [i, setI] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);
  const actual = visibles[Math.min(i, visibles.length - 1)]!;
  const ultimo = i >= visibles.length - 1;
  const zona = useRef<HTMLDivElement>(null);

  // Al cambiar de paso, el foco va al primer campo (o al título) para seguir con el teclado o el lector.
  // En el móvil, solo a un campo de texto si el paso es para escribir: si no, el teclado tapa las opciones.
  useEffect(() => {
    const texto = !tactil() || actual.escribir;
    const el = zona.current?.querySelector<HTMLElement>(texto ? "input:not([type=hidden]), textarea, select, [role=radio][data-state=checked], [role=radio], button[data-primero]" : "[role=radio][data-state=checked], [role=radio], button[data-primero]");
    (el ?? zona.current?.querySelector<HTMLElement>("h3"))?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <div className="mb-4 flex items-center gap-3 teclado:mb-2" aria-hidden>
        <div className="flex flex-1 gap-1">
          {visibles.map((_, k) => (
            <span key={k} className={`h-1.5 flex-1 rounded-full transition-colors duration-200 ${k <= i ? "bg-estrella" : "bg-hundido"}`} />
          ))}
        </div>
        <span className="num text-[12px] font-semibold text-tinta-3">{i + 1}/{visibles.length}</span>
      </div>
      {borrador?.recuperado && i === 0 && (
        <p className="mb-3 flex items-center gap-2 rounded-lg bg-hundido px-3 py-2 text-[13px] text-tinta-2" role="status">
          <span className="min-w-0 flex-1">Sigues con lo que dejaste a medias.</span>
          <button type="button" onClick={borrador.descartar} className="min-h-9 shrink-0 rounded-md px-2 font-semibold text-tinta underline">Empezar de cero</button>
        </p>
      )}
      <div ref={zona} key={i} className="animate-entrar flex-1 space-y-4 teclado:space-y-3">
        <h3 tabIndex={-1} className="text-[22px] font-bold leading-tight outline-none teclado:text-[18px]">{actual.titulo}</h3>
        <p className="sr-only" aria-live="polite">Paso {i + 1} de {visibles.length}: {actual.titulo}</p>
        <ContextoPaso.Provider value={{ ultimo }}>{actual.contenido(avanzar)}</ContextoPaso.Provider>
      </div>
      {/* Barra pegada abajo (encima del teclado): el aviso va con ella para que se vea siempre */}
      <div className="sticky bottom-0 -mx-5 mt-5 bg-fondo px-5 pb-1 pt-3">
        {(aviso || error) && <p role="alert" className="mb-2 rounded-lg bg-sale/10 px-3 py-2 text-[14px] font-medium text-sale">{aviso ?? error}</p>}
        <div className="flex gap-2">
        {i > 0 && (
          <Boton tamano="lg" variante="secundario" onClick={() => (setAviso(null), setI((x) => x - 1))}>
            Atrás
          </Boton>
        )}
        <Boton type="submit" tamano="lg" variante={ultimo ? "acento" : "primario"} className="flex-1" cargando={ultimo && ocupado}>
          {ultimo ? textoFinal : "Siguiente"}
        </Boton>
        </div>
      </div>
    </form>
  );
}

export interface Borrador {
  /** Al abrir había algo a medias (y aún no se ha tocado). */
  recuperado: boolean;
  descartar: () => void;
}

/** Borrador que sobrevive a cerrar la hoja sin querer (sessionStorage; se borra al guardar). */
export function useBorrador<T extends object>(clave: string, inicial: T) {
  const k = `borrador:${clave}`;
  const [recuperado, setRecuperado] = useState(false);
  const [v, setV] = useState<T>(() => {
    try {
      const s = sessionStorage.getItem(k);
      if (!s || s === JSON.stringify(inicial)) return inicial;
      setTimeout(() => setRecuperado(true));
      return { ...inicial, ...(JSON.parse(s) as T) };
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
  const poner = (p: Partial<T>) => (setRecuperado(false), setV((x) => ({ ...x, ...p })));
  const limpiar = () => {
    try {
      sessionStorage.removeItem(k);
    } catch {
      // nada
    }
  };
  const borrador: Borrador = { recuperado, descartar: () => (limpiar(), setRecuperado(false), setV(inicial)) };
  return [v, poner, limpiar, borrador] as const;
}
