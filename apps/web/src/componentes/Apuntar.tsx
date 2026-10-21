import { createContext, useContext, useState, type FormEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { calcularPrecio } from "@nfc/core/precios";
import { api } from "../lib/api";
import { aCent, euros } from "../lib/formato";
import { useAccion } from "../lib/acciones";
import type { Producto } from "../lib/tipos";
import { BuscadorComercio, type Eleccion } from "./BuscadorComercio";
import { Boton, Campo, Filtro, Hoja, Selector } from "./ui";

export type TipoApunte = "visita" | "venta" | "dinero" | "compra" | "comercio" | "recordar";
const TITULOS: Record<TipoApunte, string> = { visita: "Visita", venta: "Venta", dinero: "Dinero", compra: "Compra de stock", comercio: "Comercio", recordar: "Recordatorio" };

interface Apertura {
  tipo: TipoApunte;
  comercio?: { id: number; nombre: string };
}
const Ctx = createContext<(a: Apertura) => void>(() => {});
/** Abre la hoja «Apuntar» desde cualquier sitio (p. ej. desde la ficha de un comercio, con el comercio ya elegido). */
export const useApuntar = () => useContext(Ctx);

export function ApuntarProvider({ children }: { children: ReactNode }) {
  const [abierta, setAbierta] = useState<Apertura | null>(null);
  return (
    <Ctx.Provider value={setAbierta}>
      {children}
      <Hoja abierta={!!abierta} onCerrar={() => setAbierta(null)} titulo="Apuntar">
        {abierta && <Formularios inicial={abierta} cerrar={() => setAbierta(null)} />}
      </Hoja>
    </Ctx.Provider>
  );
}

const hoyMadrid = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
const enDias = (n: number) => new Date(Date.now() + n * 86_400_000).toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });

function Formularios({ inicial, cerrar }: { inicial: Apertura; cerrar: () => void }) {
  const [tipo, setTipo] = useState<TipoApunte>(inicial.tipo);
  const [comercio, setComercio] = useState<Eleccion | null>(inicial.comercio ?? null);
  const pideComercio = tipo === "visita" || tipo === "venta" || tipo === "recordar";
  return (
    <div className="space-y-4">
      <Filtro etiqueta="Qué apuntar" valor={tipo} onChange={setTipo} opciones={(Object.keys(TITULOS) as TipoApunte[]).map((t) => ({ valor: t, texto: TITULOS[t] }))} />
      {pideComercio && <BuscadorComercio valor={comercio} onChange={setComercio} permitirNuevo={tipo !== "recordar"} />}
      {tipo === "visita" && <FormVisita comercio={comercio} hecho={cerrar} />}
      {tipo === "venta" && <FormVenta comercio={comercio} hecho={cerrar} />}
      {tipo === "dinero" && <FormDinero hecho={cerrar} />}
      {tipo === "compra" && <FormCompra hecho={cerrar} />}
      {tipo === "comercio" && <FormComercio hecho={cerrar} />}
      {tipo === "recordar" && <FormRecordar comercio={comercio} hecho={cerrar} />}
    </div>
  );
}

/** Id del comercio elegido; si es nuevo, lo crea antes. */
async function idComercio(e: Eleccion) {
  if ("id" in e) return e.id;
  const r = await api.post<{ comercio: { id: number } }>("/api/comercios", { nombre: e.nuevo });
  return r.comercio.id;
}

function Enviar({ texto, ocupado, error }: { texto: string; ocupado: boolean; error?: string | null }) {
  return (
    <div className="pt-2">
      {error && <p role="alert" className="mb-2 text-sm text-sale">{error}</p>}
      <Boton type="submit" variante="primario" className="w-full" disabled={ocupado}>{ocupado ? "Guardando…" : texto}</Boton>
    </div>
  );
}

function Opciones<T extends string>({ etiqueta, valor, onChange, opciones }: { etiqueta: string; valor: T; onChange: (v: T) => void; opciones: { valor: T; texto: string }[] }) {
  return (
    <div>
      <div className="mb-1 text-[13px] text-tinta-2">{etiqueta}</div>
      <div className="rounded-md bg-fondo p-1"><Filtro etiqueta={etiqueta} valor={valor} onChange={onChange} opciones={opciones} /></div>
    </div>
  );
}

function FormVisita({ comercio, hecho }: { comercio: Eleccion | null; hecho: () => void }) {
  const [resultado, setResultado] = useState<"si" | "no" | "luego" | "interesado">("si");
  const [nota, setNota] = useState("");
  const [proxima, setProxima] = useState(enDias(14));
  const [error, setError] = useState<string | null>(null);
  const m = useAccion(async () => api.post("/api/visitas", { comercioId: await idComercio(comercio!), resultado, nota, proxima: resultado === "luego" || resultado === "interesado" ? proxima : null }), "Visita apuntada");
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (!comercio) return setError("Elige el comercio.");
    setError(null);
    m.mutate(undefined, { onSuccess: hecho });
  };
  return (
    <form onSubmit={enviar} className="space-y-3" aria-label="Apuntar visita">
      <Opciones etiqueta="¿Qué ha dicho?" valor={resultado} onChange={setResultado} opciones={[{ valor: "si", texto: "Sí" }, { valor: "no", texto: "No" }, { valor: "luego", texto: "Volver otro día" }, { valor: "interesado", texto: "Interesado" }]} />
      <Campo etiqueta={resultado === "no" ? "Motivo" : "Nota"} value={nota} onChange={(e) => setNota(e.target.value)} maxLength={500} />
      {(resultado === "luego" || resultado === "interesado") && <Campo etiqueta="Volver el" type="date" min={enDias(1)} value={proxima} onChange={(e) => setProxima(e.target.value)} required />}
      <Enviar texto="Apuntar visita" ocupado={m.isPending} error={error} />
    </form>
  );
}

function FormVenta({ comercio, hecho }: { comercio: Eleccion | null; hecho: () => void }) {
  const precios = useQuery({ queryKey: ["precios"], queryFn: () => api.get<{ productos: Producto[] }>("/api/precios").then((r) => r.productos) });
  const [productoId, setProductoId] = useState<string>("");
  const [uds, setUds] = useState("1");
  const [cobro, setCobro] = useState<"bizum" | "efectivo" | "transferencia" | "tarjeta" | "pendiente">("bizum");
  const [pactado, setPactado] = useState("");
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const prods = precios.data ?? [];
  const p = prods.find((x) => String(x.id) === productoId) ?? prods[0];
  const n = Number(uds);
  const presupuesto = p && Number.isInteger(n) && n > 0 && n <= 10_000 ? calcularPrecio(n, p.precioCent, p.tramos, p.ofertas, hoyMadrid()) : null;
  const pactadoCent = pactado ? aCent(pactado) : null;
  const m = useAccion(
    async () =>
      api.post("/api/ventas", { comercioId: await idComercio(comercio!), productoId: p?.id, uds: n, cobrada: cobro !== "pendiente", metodo: cobro === "pendiente" ? null : cobro, pactadoCent, nota }),
    "Venta apuntada",
  );
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (!comercio) return setError("Elige el comercio.");
    if (!presupuesto) return setError("Pon cuántos paneles.");
    if (pactado && !pactadoCent) return setError("El precio pactado no es un importe válido.");
    setError(null);
    m.mutate(undefined, { onSuccess: hecho });
  };
  if (precios.isSuccess && !prods.length) return <p className="text-tinta-2">Antes hay que crear el producto en Precios.</p>;
  return (
    <form onSubmit={enviar} className="space-y-3" aria-label="Apuntar venta">
      {prods.length > 1 && <Selector etiqueta="Producto" valor={String(p?.id ?? "")} onChange={setProductoId} opciones={prods.map((x) => ({ valor: String(x.id), texto: x.nombre }))} />}
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Paneles" type="number" inputMode="numeric" min={1} max={10000} value={uds} onChange={(e) => setUds(e.target.value)} required />
        <Campo etiqueta="Precio pactado (opcional)" inputMode="decimal" placeholder={presupuesto ? euros(presupuesto.totalCent) : ""} value={pactado} onChange={(e) => setPactado(e.target.value)} />
      </div>
      {presupuesto && (
        <p className="num text-sm text-tinta-2" aria-live="polite">
          {pactadoCent ? <>Total pactado: <b className="text-tinta">{euros(pactadoCent)}</b> (tarifa: {euros(presupuesto.totalCent)})</> : <>Total: <b className="text-tinta">{euros(presupuesto.totalCent)}</b>, {presupuesto.aplicado.toLowerCase()}</>}
        </p>
      )}
      <Opciones etiqueta="Cobro" valor={cobro} onChange={setCobro} opciones={[{ valor: "bizum", texto: "Bizum" }, { valor: "efectivo", texto: "Efectivo" }, { valor: "transferencia", texto: "Transferencia" }, { valor: "tarjeta", texto: "Tarjeta" }, { valor: "pendiente", texto: "Pendiente" }]} />
      <Campo etiqueta="Nota" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={500} />
      <Enviar texto="Apuntar venta" ocupado={m.isPending} error={error} />
    </form>
  );
}

function FormDinero({ hecho }: { hecho: () => void }) {
  const [tipo, setTipo] = useState<"aportacion" | "gasto" | "ingreso" | "retirada">("gasto");
  const [importe, setImporte] = useState("");
  const [categoria, setCategoria] = useState("");
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const NOMBRE = { aportacion: "Aportación", gasto: "Gasto", ingreso: "Ingreso", retirada: "Retirada" };
  const m = useAccion(() => api.post("/api/movimientos", { tipo, cent: aCent(importe), categoria, nota }), `${NOMBRE[tipo]} apuntada`);
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (!aCent(importe)) return setError("Pon un importe válido, p. ej. 30 o 12,50.");
    setError(null);
    m.mutate(undefined, { onSuccess: hecho });
  };
  return (
    <form onSubmit={enviar} className="space-y-3" aria-label="Apuntar dinero">
      <Opciones etiqueta="Tipo" valor={tipo} onChange={setTipo} opciones={[{ valor: "gasto", texto: "Gasto" }, { valor: "aportacion", texto: "Pongo dinero" }, { valor: "ingreso", texto: "Ingreso" }, { valor: "retirada", texto: "Me llevo dinero" }]} />
      <p className="text-[13px] text-tinta-3">
        {{ gasto: "Algo que paga el negocio.", aportacion: "Dinero que pones tú en el negocio.", ingreso: "Dinero que entra y no es una venta (las ventas se apuntan como venta).", retirada: "Dinero del negocio que te llevas tú." }[tipo]}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Importe (€)" inputMode="decimal" value={importe} onChange={(e) => setImporte(e.target.value)} required />
        {tipo === "gasto" && <Campo etiqueta="Categoría" placeholder="imprenta, gasolina…" value={categoria} onChange={(e) => setCategoria(e.target.value)} maxLength={60} />}
      </div>
      <Campo etiqueta="Nota" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={500} />
      <Enviar texto={`Apuntar ${NOMBRE[tipo].toLowerCase()}`} ocupado={m.isPending} error={error} />
    </form>
  );
}

function FormCompra({ hecho }: { hecho: () => void }) {
  const [uds, setUds] = useState("");
  const [coste, setCoste] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [error, setError] = useState<string | null>(null);
  const m = useAccion(() => api.post("/api/compras", { uds: Number(uds), cent: aCent(coste), proveedor }), "Compra apuntada");
  const n = Number(uds), c = aCent(coste);
  return (
    <form
      aria-label="Apuntar compra"
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!Number.isInteger(n) || n <= 0 || !c) return setError("Pon cuántos paneles y cuánto costaron en total.");
        setError(null);
        m.mutate(undefined, { onSuccess: hecho });
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Paneles" type="number" inputMode="numeric" min={1} value={uds} onChange={(e) => setUds(e.target.value)} required />
        <Campo etiqueta="Coste total (€)" inputMode="decimal" value={coste} onChange={(e) => setCoste(e.target.value)} required />
      </div>
      {n > 0 && c && <p className="num text-sm text-tinta-2">{euros(Math.round(c / n))} por panel</p>}
      <Campo etiqueta="Proveedor" value={proveedor} onChange={(e) => setProveedor(e.target.value)} maxLength={120} />
      <p className="text-[13px] text-tinta-3">Se apunta como gasto y suma al stock. Las ventas gastan primero los paneles más antiguos.</p>
      <Enviar texto="Apuntar compra" ocupado={m.isPending} error={error} />
    </form>
  );
}

function FormComercio({ hecho }: { hecho: () => void }) {
  const [d, setD] = useState({ nombre: "", tipo: "", zona: "", direccion: "", contacto: "", mapsUrl: "" });
  const [error, setError] = useState<string | null>(null);
  const m = useAccion(() => api.post("/api/comercios", d), `Comercio «${d.nombre}» apuntado`);
  const campo = (k: keyof typeof d, etiqueta: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Campo etiqueta={etiqueta} value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} {...extra} />
  );
  return (
    <form
      aria-label="Apuntar comercio"
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!d.nombre.trim()) return setError("Falta el nombre.");
        if (d.mapsUrl && !d.mapsUrl.startsWith("https://")) return setError("El enlace de Google Maps tiene que empezar por https://");
        setError(null);
        m.mutate(undefined, { onSuccess: hecho });
      }}
    >
      {campo("nombre", "Nombre", { required: true, maxLength: 120 })}
      <div className="grid grid-cols-2 gap-3">
        {campo("tipo", "Tipo", { placeholder: "bar, peluquería…" })}
        {campo("zona", "Zona")}
      </div>
      {campo("direccion", "Dirección")}
      {campo("contacto", "Contacto", { placeholder: "Nombre y teléfono" })}
      {campo("mapsUrl", "Enlace de Google Maps", { type: "url", placeholder: "https://maps.app.goo.gl/…" })}
      <Enviar texto="Apuntar comercio" ocupado={m.isPending} error={error} />
    </form>
  );
}

function FormRecordar({ comercio, hecho }: { comercio: Eleccion | null; hecho: () => void }) {
  const [fecha, setFecha] = useState(enDias(7));
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const m = useAccion(async () => api.post("/api/recordatorios", { comercioId: await idComercio(comercio!), fecha, nota }), "Te lo recordaré ese día");
  return (
    <form
      aria-label="Apuntar recordatorio"
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!comercio) return setError("Elige el comercio.");
        setError(null);
        m.mutate(undefined, { onSuccess: hecho });
      }}
    >
      <Campo etiqueta="Día" type="date" min={hoyMadrid()} value={fecha} onChange={(e) => setFecha(e.target.value)} required />
      <Campo etiqueta="Nota" placeholder="Llamar al dueño…" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={500} />
      <p className="text-[13px] text-tinta-3">Ese día a las 9:00 te llega por privado en Telegram.</p>
      <Enviar texto="Guardar recordatorio" ocupado={m.isPending} error={error} />
    </form>
  );
}
