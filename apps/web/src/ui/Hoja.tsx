import { useEffect, useState, type ReactNode } from "react";
import { Dialog } from "radix-ui";
import { Drawer } from "vaul";
import { X } from "@phosphor-icons/react";
import { BotonIcono } from "./Boton";

export function useEsMovil() {
  const q = "(max-width: 639px)";
  const [m, setM] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const f = () => setM(mq.matches);
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);
  return m;
}

/**
 * Hoja: en el móvil sube desde abajo (se cierra arrastrando); en el ordenador entra por la derecha.
 * Accesible: foco atrapado, Escape cierra, título obligatorio.
 */
export function Hoja({ abierta, onCerrar, titulo, descripcion, children, pie }: { abierta: boolean; onCerrar: () => void; titulo: string; descripcion?: string; children: ReactNode; pie?: ReactNode }) {
  const movil = useEsMovil();
  const cabecera = (T: typeof Dialog.Title, D: typeof Dialog.Description) => (
    <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
      <div className="min-w-0">
        <T className="truncate text-[19px] font-bold">{titulo}</T>
        {descripcion ? <D className="mt-0.5 text-[13px] text-tinta-3">{descripcion}</D> : <D className="sr-only">{titulo}</D>}
      </div>
      <Dialog.Close asChild>
        <BotonIcono etiqueta="Cerrar" className="-mr-2 -mt-1"><X size={20} weight="bold" /></BotonIcono>
      </Dialog.Close>
    </div>
  );
  if (movil) {
    return (
      <Drawer.Root open={abierta} onOpenChange={(o) => !o && onCerrar()} repositionInputs={false}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-40 bg-black/45" />
          <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 flex max-h-[94dvh] flex-col rounded-t-[20px] bg-fondo outline-none" aria-describedby={undefined}>
            <div aria-hidden className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-borde-fuerte" />
            {cabecera(Drawer.Title as never, Drawer.Description as never)}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>
            {pie && <div className="border-t border-borde bg-fondo px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">{pie}</div>}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }
  return (
    <Dialog.Root open={abierta} onOpenChange={(o) => !o && onCerrar()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/35 data-[state=open]:animate-[fade_150ms]" />
        <Dialog.Content className="fixed inset-y-3 right-3 z-50 flex w-[min(480px,calc(100vw-24px))] flex-col overflow-hidden rounded-[20px] border border-borde bg-fondo shadow-2xl outline-none data-[state=open]:animate-entrar">
          {cabecera(Dialog.Title, Dialog.Description)}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
          {pie && <div className="border-t border-borde px-5 py-3">{pie}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Confirmación para acciones que no se pueden deshacer (bloquear una pegatina, dar de baja…). */
export function Confirmar({ abierta, onCerrar, titulo, texto, accion, onConfirmar, peligro }: { abierta: boolean; onCerrar: () => void; titulo: string; texto: ReactNode; accion: string; onConfirmar: () => void; peligro?: boolean }) {
  return (
    <Dialog.Root open={abierta} onOpenChange={(o) => !o && onCerrar()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/45" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[70] w-[min(400px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-[20px] border border-borde bg-fondo p-5 shadow-2xl outline-none data-[state=open]:animate-entrar">
          <Dialog.Title className="text-[18px] font-bold">{titulo}</Dialog.Title>
          <Dialog.Description asChild><div className="mt-2 text-[14px] text-tinta-2">{texto}</div></Dialog.Description>
          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild><button type="button" className="min-h-10 rounded-[10px] px-4 text-sm font-semibold text-tinta-2 hover:bg-hundido">Cancelar</button></Dialog.Close>
            <button type="button" onClick={() => (onConfirmar(), onCerrar())} className={`min-h-10 rounded-[10px] px-4 text-sm font-semibold ${peligro ? "bg-sale text-white" : "bg-base text-sobre-base"}`}>{accion}</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
