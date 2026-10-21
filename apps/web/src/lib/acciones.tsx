import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

/** Mensajes breves de confirmación («Venta apuntada») abajo de la pantalla. */
const Ctx = createContext<(texto: string, tono?: "ok" | "error") => void>(() => {});
export const useAviso = () => useContext(Ctx);

export function AvisosProvider({ children }: { children: ReactNode }) {
  const [lista, setLista] = useState<{ id: number; texto: string; tono: "ok" | "error" }[]>([]);
  const avisar = useCallback((texto: string, tono: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random();
    setLista((l) => [...l.slice(-2), { id, texto, tono }]);
    setTimeout(() => setLista((l) => l.filter((x) => x.id !== id)), tono === "error" ? 7000 : 3500);
  }, []);
  return (
    <Ctx.Provider value={avisar}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4" role="status" aria-live="polite">
        {lista.map((a) => (
          <div key={a.id} className={`pointer-events-auto max-w-md rounded-md px-4 py-2.5 text-sm shadow-lg ${a.tono === "error" ? "bg-sale text-white" : "bg-tinta text-papel"}`}>
            {a.texto}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

/** Acción que cambia datos: al acabar, refresca todo (los datos están muy relacionados) y avisa. */
export function useAccion<T>(fn: (x: T) => Promise<unknown>, ok: string | ((x: T) => string)) {
  const qc = useQueryClient();
  const avisar = useAviso();
  return useMutation({
    mutationFn: fn,
    onSuccess: (_r, x) => {
      void qc.invalidateQueries();
      avisar(typeof ok === "function" ? ok(x) : ok);
    },
    onError: (e: Error) => avisar(e.message, "error"),
  });
}
