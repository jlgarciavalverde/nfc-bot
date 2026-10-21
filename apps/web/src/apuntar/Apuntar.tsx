import { createContext, useContext, useState, type ReactNode } from "react";
import { CurrencyEur, Storefront, Receipt, MapPin, Package, Bell, ContactlessPayment as Nfc } from "@phosphor-icons/react";
import { Hoja } from "../ui/Hoja";
import { AsistenteCompra, AsistenteComercio, AsistenteDinero, AsistenteRecordar, AsistenteVenta, AsistenteVisita } from "./Asistentes";
import { AsistentePlaca } from "./Placa";

export type TipoApunte = "visita" | "venta" | "dinero" | "comercio" | "compra" | "recordar" | "placa";

interface Apertura {
  tipo?: TipoApunte;
  comercio?: { id: number; nombre: string };
  codigo?: string;
}
const Ctx = createContext<(a: Apertura) => void>(() => {});
/** Abre «Apuntar» desde cualquier sitio; con `tipo`, directamente en ese asistente (y con el comercio ya elegido si se pasa). */
export const useApuntar = () => useContext(Ctx);

const TIPOS: { tipo: TipoApunte; texto: string; detalle: string; icono: typeof Receipt }[] = [
  { tipo: "visita", texto: "Visita", detalle: "Has pasado por un comercio", icono: MapPin },
  { tipo: "venta", texto: "Venta", detalle: "Ha comprado paneles", icono: Receipt },
  { tipo: "dinero", texto: "Dinero", detalle: "Gasto, aportación o retirada", icono: CurrencyEur },
  { tipo: "placa", texto: "Placa NFC", detalle: "Asignar, grabar o comprobar", icono: Nfc },
  { tipo: "comercio", texto: "Comercio", detalle: "Apuntar uno nuevo", icono: Storefront },
  { tipo: "recordar", texto: "Recordatorio", detalle: "Volver otro día", icono: Bell },
  { tipo: "compra", texto: "Compra de stock", detalle: "Han llegado paneles", icono: Package },
];
const TITULOS: Record<TipoApunte, string> = { visita: "Apuntar visita", venta: "Apuntar venta", dinero: "Apuntar dinero", comercio: "Nuevo comercio", compra: "Compra de stock", recordar: "Recordatorio", placa: "Placa NFC" };

export function ApuntarProvider({ children }: { children: ReactNode }) {
  const [abierta, setAbierta] = useState<Apertura | null>(null);
  const cerrar = () => setAbierta(null);
  const tipo = abierta?.tipo;
  let contenido: ReactNode = null;
  if (abierta && !tipo) contenido = <Menu elegir={(t) => setAbierta({ ...abierta, tipo: t })} />;
  else if (tipo === "visita") contenido = <AsistenteVisita comercio={abierta?.comercio} hecho={cerrar} />;
  else if (tipo === "venta") contenido = <AsistenteVenta comercio={abierta?.comercio} hecho={cerrar} />;
  else if (tipo === "dinero") contenido = <AsistenteDinero hecho={cerrar} />;
  else if (tipo === "comercio") contenido = <AsistenteComercio hecho={cerrar} />;
  else if (tipo === "compra") contenido = <AsistenteCompra hecho={cerrar} />;
  else if (tipo === "recordar") contenido = <AsistenteRecordar comercio={abierta?.comercio} hecho={cerrar} />;
  else if (tipo === "placa") contenido = <AsistentePlaca comercio={abierta?.comercio} codigo={abierta?.codigo} hecho={cerrar} />;
  return (
    <Ctx.Provider value={setAbierta}>
      {children}
      <Hoja abierta={!!abierta} onCerrar={cerrar} titulo={tipo ? TITULOS[tipo] : "Apuntar"} descripcion={abierta?.comercio && tipo ? abierta.comercio.nombre : undefined}>
        {/* key: al cambiar de asistente empieza de cero */}
        <div key={tipo ?? "menu"} className="min-h-full">{contenido}</div>
      </Hoja>
    </Ctx.Provider>
  );
}

function Menu({ elegir }: { elegir: (t: TipoApunte) => void }) {
  return (
    <ul className="grid grid-cols-2 gap-2 pb-2" aria-label="Qué apuntar">
      {TIPOS.map((t, i) => {
        const I = t.icono;
        return (
          <li key={t.tipo} className={i === 0 || i === 1 ? "" : ""}>
            <button type="button" data-primero={i === 0 || undefined} onClick={() => elegir(t.tipo)} className="tarjeta-placa flex h-full min-h-28 w-full flex-col items-start gap-2 p-4 text-left transition-colors hover:bg-hundido active:scale-[0.99]">
              <span className={`flex size-10 items-center justify-center rounded-xl ${i < 2 ? "bg-estrella text-base" : "bg-hundido text-tinta"}`}><I size={22} weight="bold" /></span>
              <span>
                <span className="block text-[16px] font-bold">{t.texto}</span>
                <span className="block text-[12px] leading-snug text-tinta-3">{t.detalle}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
