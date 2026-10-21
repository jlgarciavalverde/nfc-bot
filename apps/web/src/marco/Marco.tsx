import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { House, Storefront, Wallet, DotsThreeOutline, Plus, MagnifyingGlass, Receipt, Package, Tag, Gear, UsersThree, ClockCounterClockwise, UserCircle, ContactlessPayment as Nfc, FileXls } from "@phosphor-icons/react";
import { EstrellaMarca } from "../ui/Superficies";
import { BotonIcono } from "../ui/Boton";
import { useApuntar } from "../apuntar/Apuntar";
import { useBuscador } from "./Buscador";
import { precargar } from "../lib/consultas";

export interface Seccion {
  href: string;
  texto: string;
  icono: typeof House;
  admin?: boolean;
}

export const PRINCIPALES: Seccion[] = [
  { href: "/", texto: "Hoy", icono: House },
  { href: "/comercios", texto: "Comercios", icono: Storefront },
  { href: "/caja", texto: "Caja", icono: Wallet },
];
export const SECUNDARIAS: Seccion[] = [
  { href: "/ventas", texto: "Ventas", icono: Receipt },
  { href: "/placas", texto: "Placas", icono: Nfc },
  { href: "/stock", texto: "Stock", icono: Package },
  { href: "/precios", texto: "Precios", icono: Tag },
  { href: "/ajustes", texto: "Ajustes", icono: Gear, admin: true },
  { href: "/socios", texto: "Socios", icono: UsersThree, admin: true },
  { href: "/auditoria", texto: "Auditoría", icono: ClockCounterClockwise, admin: true },
  { href: "/cuenta", texto: "Cuenta", icono: UserCircle },
];

export const activa = (ruta: string, href: string) => (href === "/" ? ruta === "/" : ruta === href || ruta.startsWith(`${href}/`));

/** Carcasa: barra negra arriba (como la base de la placa), lateral en el ordenador y barra inferior con «+» en el móvil. */
export function Marco({ nombre, esAdmin, children }: { nombre: string; esAdmin: boolean; children: ReactNode }) {
  const [ruta] = useLocation();
  const qc = useQueryClient();
  const apuntar = useApuntar();
  const buscar = useBuscador();
  const secundarias = SECUNDARIAS.filter((s) => !s.admin || esAdmin);
  const enMas = secundarias.some((s) => activa(ruta, s.href)) || ruta === "/mas";

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[80] focus:rounded-lg focus:bg-estrella focus:px-3 focus:py-2 focus:font-semibold focus:text-base">
        Saltar al contenido
      </a>

      {/* Barra superior (móvil) */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 bg-base px-3 text-sobre-base lg:hidden" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <Link href="/" className="flex items-center gap-2 rounded-lg px-1 font-bold tracking-tight">
          <EstrellaMarca className="size-7" />
          Socios NFC
        </Link>
        <div className="ml-auto flex items-center">
          <BotonIcono etiqueta="Buscar (⌘K)" onClick={buscar} className="!text-sobre-base hover:!bg-white/10"><MagnifyingGlass size={22} weight="bold" /></BotonIcono>
        </div>
      </header>

      {/* Lateral (ordenador) */}
      <aside className="sticky top-0 hidden h-dvh flex-col bg-base px-3 py-4 text-sobre-base lg:flex">
        <Link href="/" className="mb-5 flex items-center gap-2.5 px-2 text-[17px] font-bold tracking-tight">
          <EstrellaMarca className="size-8" />
          Socios NFC
        </Link>
        <button type="button" onClick={() => apuntar({})} className="mb-2 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-estrella px-3 font-bold text-base transition hover:brightness-95">
          <Plus size={18} weight="bold" /> Apuntar
        </button>
        <button type="button" onClick={buscar} className="mb-4 flex min-h-10 items-center gap-2 rounded-xl px-3 text-[14px] text-sobre-base-2 ring-1 ring-white/12 transition hover:bg-white/5 hover:text-sobre-base">
          <MagnifyingGlass size={16} /> Buscar
          <kbd className="ml-auto rounded border border-white/15 px-1.5 text-[11px]">⌘K</kbd>
        </button>
        <nav aria-label="Secciones" className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
          {[...PRINCIPALES, ...secundarias].map((s, k) => (
            <EnlaceLateral key={s.href} s={s} ruta={ruta} separador={k === PRINCIPALES.length} onPrecarga={() => precargar(qc, s.href)} />
          ))}
        </nav>
        <div className="mt-3 flex items-center gap-2 border-t border-white/10 px-2 pt-3 text-[13px] text-sobre-base-2">
          <span className="min-w-0 flex-1 truncate">{nombre}</span>
          {esAdmin && <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[11px] font-semibold text-estrella">admin</span>}
          <a href="/api/exportar.xlsx" download className="rounded-lg p-1.5 hover:bg-white/10 hover:text-sobre-base" aria-label="Descargar Excel" title="Descargar Excel"><FileXls size={20} /></a>
        </div>
      </aside>

      <main id="contenido" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 pb-28 pt-5 outline-none sm:px-6 lg:px-10 lg:pb-12 lg:pt-8">
        {children}
      </main>

      {/* Barra inferior (móvil); con el teclado abierto se quita para dejar sitio a lo que se escribe */}
      <nav aria-label="Secciones" className="fixed inset-x-0 bottom-0 z-30 border-t border-borde bg-superficie/95 backdrop-blur lg:hidden teclado:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <ul className="mx-auto grid h-16 max-w-md grid-cols-5 items-center">
          <TabInferior s={PRINCIPALES[0]!} activa={activa(ruta, "/")} onPrecarga={() => precargar(qc, "/")} />
          <TabInferior s={PRINCIPALES[1]!} activa={activa(ruta, "/comercios")} onPrecarga={() => precargar(qc, "/comercios")} />
          <li className="flex justify-center">
            <button type="button" onClick={() => apuntar({})} aria-label="Apuntar" className="-mt-6 flex size-14 items-center justify-center rounded-2xl bg-estrella text-base shadow-[0_6px_18px_-6px_rgba(0,0,0,0.45)] ring-4 ring-fondo transition active:scale-95">
              <Plus size={26} weight="bold" />
            </button>
          </li>
          <TabInferior s={PRINCIPALES[2]!} activa={activa(ruta, "/caja")} onPrecarga={() => precargar(qc, "/caja")} />
          <TabInferior s={{ href: "/mas", texto: "Más", icono: DotsThreeOutline }} activa={enMas} />
        </ul>
      </nav>
    </div>
  );
}

function EnlaceLateral({ s, ruta, separador, onPrecarga }: { s: Seccion; ruta: string; separador?: boolean; onPrecarga: () => void }) {
  const a = activa(ruta, s.href);
  const I = s.icono;
  return (
    <>
      {separador && <div className="my-2 h-px bg-white/10" aria-hidden />}
      <Link
        href={s.href}
        onMouseEnter={onPrecarga}
        onFocus={onPrecarga}
        aria-current={a ? "page" : undefined}
        className={`flex min-h-10 items-center gap-3 rounded-xl px-3 text-[14px] font-semibold transition-colors ${a ? "bg-white/10 text-sobre-base" : "text-sobre-base-2 hover:bg-white/5 hover:text-sobre-base"}`}
      >
        <I size={19} weight={a ? "fill" : "regular"} className={a ? "text-estrella" : ""} />
        {s.texto}
      </Link>
    </>
  );
}

function TabInferior({ s, activa: a, onPrecarga }: { s: Seccion; activa: boolean; onPrecarga?: () => void }) {
  const I = s.icono;
  return (
    <li>
      <Link href={s.href} onTouchStart={onPrecarga} aria-current={a ? "page" : undefined} className={`flex flex-col items-center gap-0.5 py-1 text-[11px] font-semibold ${a ? "text-tinta" : "text-tinta-3"}`}>
        <I size={24} weight={a ? "fill" : "regular"} />
        {s.texto}
        <span aria-hidden className={`h-0.5 w-5 rounded-full ${a ? "bg-estrella" : "bg-transparent"}`} />
      </Link>
    </li>
  );
}
