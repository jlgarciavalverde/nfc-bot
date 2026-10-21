import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Command } from "cmdk";
import { Dialog } from "radix-ui";
import { useLocation } from "wouter";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { useComercios, useYo } from "../lib/consultas";
import { useApuntar, type TipoApunte } from "../apuntar/Apuntar";
import { PRINCIPALES, SECUNDARIAS } from "./Marco";
import { PuntoEstado } from "../ui/Superficies";
import { normalizar } from "../lib/formato";

const Ctx = createContext<() => void>(() => {});
export const useBuscador = () => useContext(Ctx);

const ACCIONES: { tipo: TipoApunte; texto: string; claves: string }[] = [
  { tipo: "visita", texto: "Apuntar visita", claves: "visita pasar comercio si no luego" },
  { tipo: "venta", texto: "Apuntar venta", claves: "venta vender cobrar paneles" },
  { tipo: "dinero", texto: "Apuntar gasto o aportación", claves: "gasto aporto dinero ingreso retiro caja" },
  { tipo: "comercio", texto: "Nuevo comercio", claves: "comercio nuevo crear tienda bar" },
  { tipo: "placa", texto: "Asignar o grabar una placa", claves: "placa nfc pegatina grabar codigo qr" },
  { tipo: "compra", texto: "Compra de stock", claves: "compra stock proveedor paneles" },
  { tipo: "recordar", texto: "Recordatorio", claves: "recordar volver llamar" },
];

/** Buscador universal (⌘K / Ctrl+K o la lupa): comercios, acciones y secciones. */
export function BuscadorProvider({ children }: { children: ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  const [, ir] = useLocation();
  const apuntar = useApuntar();
  const yo = useYo();
  const comercios = useComercios();
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAbierto((x) => !x);
      }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, []);
  const hacer = (f: () => void) => {
    setAbierto(false);
    f();
  };
  const secciones = [...PRINCIPALES, ...SECUNDARIAS].filter((s) => !s.admin || yo.data?.rol === "admin");
  const item = "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 text-[15px] data-[selected=true]:bg-hundido";
  return (
    <Ctx.Provider value={() => setAbierto(true)}>
      {children}
      <Dialog.Root open={abierto} onOpenChange={setAbierto}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-[8vh] z-[70] w-[min(560px,calc(100vw-24px))] -translate-x-1/2 overflow-hidden rounded-[18px] border border-borde bg-superficie shadow-2xl outline-none data-[state=open]:animate-entrar">
            <Dialog.Title className="sr-only">Buscar</Dialog.Title>
            <Dialog.Description className="sr-only">Busca comercios, acciones o secciones</Dialog.Description>
            <Command label="Buscar" loop>
              <div className="flex items-center gap-2 border-b border-borde px-4">
                <MagnifyingGlass size={18} className="text-tinta-3" />
                <Command.Input autoFocus placeholder="Comercio, acción o sección…" className="h-13 min-h-12 flex-1 bg-transparent text-[16px] outline-none placeholder:text-tinta-3" />
              </div>
              <Command.List className="max-h-[60vh] overflow-y-auto p-2">
                <Command.Empty className="px-3 py-6 text-center text-tinta-3">Nada con ese nombre.</Command.Empty>
                <Command.Group heading="Apuntar" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[12px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-tinta-3">
                  {ACCIONES.map((a) => (
                    <Command.Item key={a.tipo} value={`${a.texto} ${a.claves}`} onSelect={() => hacer(() => apuntar({ tipo: a.tipo }))} className={item}>
                      <span className="text-estrella-texto">＋</span> {a.texto}
                    </Command.Item>
                  ))}
                </Command.Group>
                {!!comercios.data?.length && (
                  <Command.Group heading="Comercios" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[12px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-tinta-3">
                    {comercios.data.map((c) => (
                      <Command.Item key={c.id} value={`comercio ${c.nombre} ${normalizar(`${c.nombre} ${c.zona ?? ""} ${c.tipo ?? ""}`)} #${c.id}`} onSelect={() => hacer(() => ir(`/comercios/${c.id}`))} className={item}>
                        <PuntoEstado estado={c.estado} />
                        <span className="min-w-0 flex-1 truncate">{c.nombre}</span>
                        {c.zona && <span className="text-[13px] text-tinta-3">{c.zona}</span>}
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}
                <Command.Group heading="Ir a" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[12px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-tinta-3">
                  {secciones.map((s) => {
                    const I = s.icono;
                    return (
                      <Command.Item key={s.href} value={`ir ${s.texto}`} onSelect={() => hacer(() => ir(s.href))} className={item}>
                        <I size={18} className="text-tinta-3" /> {s.texto}
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              </Command.List>
            </Command>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </Ctx.Provider>
  );
}
