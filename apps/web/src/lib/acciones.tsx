import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

interface OpcionesAviso {
  tono?: "ok" | "error";
  /** Muestra «Deshacer» (anula lo último que apuntaste). */
  deshacer?: boolean;
}
type Avisar = (texto: string, o?: OpcionesAviso | "ok" | "error") => void;

/** Mensajes breves abajo de la pantalla («Venta apuntada · Deshacer»). */
const Ctx = createContext<Avisar>(() => {});
export const useAviso = () => useContext(Ctx);

export function AvisosProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [lista, setLista] = useState<{ id: number; texto: string; tono: "ok" | "error"; deshacer?: boolean }[]>([]);
  const quitar = (id: number) => setLista((l) => l.filter((x) => x.id !== id));
  const avisar = useCallback<Avisar>((texto, o) => {
    const op: OpcionesAviso = typeof o === "string" ? { tono: o } : (o ?? {});
    const id = Date.now() + Math.random();
    const tono = op.tono ?? "ok";
    setLista((l) => [...l.slice(-2), { id, texto, tono, deshacer: op.deshacer }]);
    setTimeout(() => quitar(id), tono === "error" ? 7000 : op.deshacer ? 6000 : 3500);
  }, []);
  const deshacer = async (id: number) => {
    quitar(id);
    try {
      const r = await api.post<{ resumen: string }>("/api/deshacer");
      void qc.invalidateQueries();
      avisar(`Deshecho: ${r.resumen}`);
    } catch (e) {
      avisar((e as Error).message, "error");
    }
  };
  return (
    <Ctx.Provider value={avisar}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-[90] flex flex-col items-center gap-2 px-4 lg:bottom-6" role="status" aria-live="polite">
        {lista.map((a) => (
          <div key={a.id} className={`animate-entrar pointer-events-auto flex max-w-md items-center gap-3 rounded-xl px-4 py-3 text-[14px] font-medium shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] ${a.tono === "error" ? "bg-sale text-white" : "bg-base text-sobre-base dark:bg-sobre-base dark:text-base"}`}>
            <span className="min-w-0">{a.texto}</span>
            {a.deshacer && (
              <button type="button" onClick={() => deshacer(a.id)} className="shrink-0 rounded-lg px-2 py-1 font-bold text-estrella hover:bg-white/10 dark:text-estrella-texto">
                Deshacer
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

/**
 * Acción que cambia datos: al acabar refresca todo (los datos están muy relacionados) y avisa.
 * Con `deshacer`, el aviso lleva el botón «Deshacer».
 */
export function useAccion<T>(fn: (x: T) => Promise<unknown>, ok: string | ((x: T) => string), o: { deshacer?: boolean } = {}) {
  const qc = useQueryClient();
  const avisar = useAviso();
  return useMutation({
    mutationFn: fn,
    onSuccess: (_r, x) => {
      void qc.invalidateQueries();
      avisar(typeof ok === "function" ? ok(x) : ok, { deshacer: o.deshacer });
    },
    onError: (e: Error) => avisar(e.message, "error"),
  });
}
