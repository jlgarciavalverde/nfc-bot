import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { calcularPrecio } from "@nfc/core/precios";
import { api } from "../lib/api";
import { aCent, euros, fecha, pct } from "../lib/formato";
import type { Producto } from "../lib/tipos";
import { useYo } from "../App";
import { Boton, Campo, Datos, Selector, Seccion, Tabla, Titulo, Vacio } from "../componentes/ui";

const hoy = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });

export function Precios() {
  const q = useQuery({ queryKey: ["precios"], queryFn: () => api.get<{ productos: Producto[] }>("/api/precios").then((r) => r.productos) });
  const esAdmin = useYo().data?.rol === "admin";
  return (
    <Datos q={q}>
      {(ps) => (
        <>
          <Titulo>Precios y bonos</Titulo>
          {!ps.length && <Vacio>Aún no hay productos.</Vacio>}
          <div className="space-y-10">
            {ps.map((p) => <FichaProducto key={p.id} p={p} admin={esAdmin} />)}
          </div>
          {esAdmin && <NuevoProducto />}
        </>
      )}
    </Datos>
  );
}

function useCambio<T>(f: (x: T) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: f, onSuccess: () => qc.invalidateQueries({ queryKey: ["precios"] }) });
}

function FichaProducto({ p, admin }: { p: Producto; admin: boolean }) {
  const [uds, setUds] = useState("5");
  const n = Number(uds);
  const presupuesto = Number.isInteger(n) && n > 0 && n <= 10_000 ? calcularPrecio(n, p.precioCent, p.tramos, p.ofertas, hoy()) : null;
  const ejemplos = [1, 3, 5, 10, 20].map((k) => calcularPrecio(k, p.precioCent, p.tramos, p.ofertas, hoy()));
  const quitarTramo = useCambio((desde: number) => api.del(`/api/tramos?productoId=${p.id}&desdeUds=${desde}`));
  const quitarOferta = useCambio((id: number) => api.del(`/api/ofertas/${id}`));
  return (
    <Seccion titulo={p.nombre} extra={<span className="num text-tinta-2">{euros(p.precioCent)} la unidad</span>}>
      <div className="grid grid-cols-1 gap-8 pt-3 lg:grid-cols-2">
        <div className="min-w-0 space-y-6">
          <div>
            <h3 className="mb-1 text-sm font-semibold">Tramos por cantidad</h3>
            {p.tramos.length ? (
              <ul className="num divide-y divide-regla text-sm">
                {p.tramos.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 py-1.5">
                    <span>Desde {t.desdeUds} uds</span>
                    <span className="ml-auto font-medium">{t.precioCent != null ? `${euros(t.precioCent)}/ud` : `−${pct(t.descuentoBp!)}`}</span>
                    {admin && <Boton variante="plano" aria-label={`Quitar el tramo desde ${t.desdeUds}`} onClick={() => quitarTramo.mutate(t.desdeUds)}>Quitar</Boton>}
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-tinta-3">Sin tramos: siempre el precio de lista.</p>}
            {admin && <NuevoTramo productoId={p.id} />}
            {admin && <CambiarPrecio p={p} />}
          </div>
          <div>
            <h3 className="mb-1 text-sm font-semibold">Ofertas</h3>
            {p.ofertas.length ? (
              <ul className="divide-y divide-regla text-sm">
                {p.ofertas.map((o) => (
                  <li key={o.id} className="flex items-center gap-3 py-1.5">
                    <span className="font-medium">{o.descripcion}</span>
                    <span className="text-tinta-3">{o.hasta ? `hasta el ${fecha(o.hasta, true)}` : "sin fecha de fin"}</span>
                    {admin && <Boton variante="plano" className="ml-auto" aria-label={`Quitar la oferta ${o.descripcion}`} onClick={() => quitarOferta.mutate(o.id)}>Quitar</Boton>}
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-tinta-3">Sin ofertas.</p>}
            {admin && <NuevaOferta productoId={p.id} />}
            <p className="mt-2 text-[13px] text-tinta-3">Las ofertas no se suman entre sí ni con los tramos: a cada venta se le aplica lo que salga más barato.</p>
          </div>
        </div>
        <div className="min-w-0">
          <h3 className="mb-2 text-sm font-semibold">Calculadora</h3>
          <div className="flex items-end gap-4">
            <div className="w-28"><Campo etiqueta="Paneles" type="number" min={1} max={10000} inputMode="numeric" value={uds} onChange={(e) => setUds(e.target.value)} /></div>
            {presupuesto && (
              <div className="num pb-1" aria-live="polite">
                <div className="text-2xl font-semibold">{euros(presupuesto.totalCent)}</div>
                <div className="text-[13px] text-tinta-2">{euros(Math.round(presupuesto.totalCent / presupuesto.uds))}/ud{presupuesto.ahorroCent > 0 ? `, ahorra ${euros(presupuesto.ahorroCent)}` : ""}</div>
              </div>
            )}
          </div>
          {presupuesto && <p className="mt-1 text-sm text-tinta-2">{presupuesto.aplicado}</p>}
          <Tabla etiqueta="Precios de ejemplo">
            <thead>
              <tr><th>Paneles</th><th className="text-right">Total</th><th className="text-right">Por ud</th><th>Se aplica</th></tr>
            </thead>
            <tbody className="num">
              {ejemplos.map((e) => (
                <tr key={e.uds}><td>{e.uds}</td><td className="text-right font-medium">{euros(e.totalCent)}</td><td className="text-right">{euros(Math.round(e.totalCent / e.uds))}</td><td className="text-tinta-2">{e.aplicado}</td></tr>
              ))}
            </tbody>
          </Tabla>
        </div>
      </div>
    </Seccion>
  );
}

function Formulario({ titulo, onSubmit, children, error, ocupado }: { titulo: string; onSubmit: (e: FormEvent) => void; children: React.ReactNode; error?: string | null; ocupado?: boolean }) {
  return (
    <form onSubmit={onSubmit} className="mt-3 rounded-md border border-regla bg-papel p-3" aria-label={titulo}>
      <div className="flex flex-wrap items-end gap-3">{children}<Boton type="submit" variante="primario" disabled={ocupado}>{titulo}</Boton></div>
      {error && <p role="alert" className="mt-2 text-sm text-sale">{error}</p>}
    </form>
  );
}

function NuevoTramo({ productoId }: { productoId: number }) {
  const [desde, setDesde] = useState("");
  const [valor, setValor] = useState("");
  const [tipo, setTipo] = useState<"precio" | "descuento">("precio");
  const [error, setError] = useState<string | null>(null);
  const m = useCambio((b: object) => api.put("/api/tramos", b));
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const d = Number(desde);
    if (!Number.isInteger(d) || d < 2) return setError("El tramo empieza como mínimo en 2 unidades.");
    const cent = tipo === "precio" ? aCent(valor) : null;
    const bp = tipo === "descuento" ? Math.round(Number(valor.replace(",", ".").replace("%", "")) * 100) : null;
    if (tipo === "precio" && !cent) return setError("Pon el precio por unidad, p. ej. 20 o 19,50.");
    if (tipo === "descuento" && !(bp! > 0 && bp! <= 10_000)) return setError("El descuento va de 1 a 100 %.");
    m.mutate({ productoId, desdeUds: d, ...(cent ? { precioCent: cent } : { descuentoBp: bp }) }, { onSuccess: () => (setDesde(""), setValor("")), onError: (x) => setError(x.message) });
  };
  return (
    <Formulario titulo="Añadir tramo" onSubmit={enviar} error={error} ocupado={m.isPending}>
      <div className="w-24"><Campo etiqueta="Desde (uds)" inputMode="numeric" value={desde} onChange={(e) => setDesde(e.target.value)} required /></div>
      <Selector etiqueta="Tipo" valor={tipo} onChange={setTipo} opciones={[{ valor: "precio", texto: "Precio por ud" }, { valor: "descuento", texto: "Descuento %" }]} />
      <div className="w-28"><Campo etiqueta={tipo === "precio" ? "€ por ud" : "% descuento"} inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} required /></div>
    </Formulario>
  );
}

function CambiarPrecio({ p }: { p: Producto }) {
  const [precio, setPrecio] = useState("");
  const [error, setError] = useState<string | null>(null);
  const m = useCambio((c: number) => api.put(`/api/productos/${p.id}`, { precioCent: c }));
  return (
    <Formulario
      titulo="Cambiar precio de lista"
      error={error}
      ocupado={m.isPending}
      onSubmit={(e) => {
        e.preventDefault();
        const c = aCent(precio);
        if (!c) return setError("Pon el precio por unidad, p. ej. 25 o 24,90.");
        m.mutate(c, { onSuccess: () => (setPrecio(""), setError(null)), onError: (x) => setError(x.message) });
      }}
    >
      <div className="w-32"><Campo etiqueta="€ por ud" inputMode="decimal" placeholder={(p.precioCent / 100).toString().replace(".", ",")} value={precio} onChange={(e) => setPrecio(e.target.value)} required /></div>
    </Formulario>
  );
}

function NuevaOferta({ productoId }: { productoId: number }) {
  const [tipo, setTipo] = useState<"nxm" | "pack" | "descuento">("nxm");
  const [n, setN] = useState("");
  const [v, setV] = useState("");
  const [hasta, setHasta] = useState("");
  const [error, setError] = useState<string | null>(null);
  const m = useCambio((b: object) => api.post("/api/ofertas", b));
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const nn = Number(n);
    if (!Number.isInteger(nn) || nn < 1) return setError("Pon un número de unidades válido.");
    const extra =
      tipo === "nxm" ? { m: Number(v) } : tipo === "pack" ? { precioCent: aCent(v) } : { descuentoBp: Math.round(Number(v.replace(",", ".").replace("%", "")) * 100) };
    if (tipo === "nxm" && !(extra.m! >= 1 && extra.m! < nn)) return setError("En NxM se pagan menos de las que se llevan (3x2).");
    if (tipo === "pack" && !extra.precioCent) return setError("Pon el precio del pack.");
    m.mutate({ productoId, tipo, n: nn, ...extra, hasta: hasta || null }, { onSuccess: () => (setN(""), setV(""), setHasta("")), onError: (x) => setError(x.message) });
  };
  const etiquetas = { nxm: ["Se lleva", "Paga"], pack: ["Unidades", "Precio del pack €"], descuento: ["Desde (uds)", "% descuento"] }[tipo];
  return (
    <Formulario titulo="Crear oferta" onSubmit={enviar} error={error} ocupado={m.isPending}>
      <Selector etiqueta="Tipo" valor={tipo} onChange={setTipo} opciones={[{ valor: "nxm", texto: "Lleva N, paga M" }, { valor: "pack", texto: "Pack a precio cerrado" }, { valor: "descuento", texto: "Descuento por volumen" }]} />
      <div className="w-24"><Campo etiqueta={etiquetas[0]!} inputMode="numeric" value={n} onChange={(e) => setN(e.target.value)} required /></div>
      <div className="w-32"><Campo etiqueta={etiquetas[1]!} inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} required /></div>
      <div className="w-40"><Campo etiqueta="Hasta (opcional)" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
    </Formulario>
  );
}

function NuevoProducto() {
  const [nombre, setNombre] = useState("");
  const [precio, setPrecio] = useState("");
  const [error, setError] = useState<string | null>(null);
  const m = useCambio((b: object) => api.post("/api/productos", b));
  return (
    <div className="mt-10">
      <Seccion titulo="Nuevo producto">
        <Formulario
          titulo="Crear producto"
          error={error}
          ocupado={m.isPending}
          onSubmit={(e) => {
            e.preventDefault();
            const c = aCent(precio);
            if (!nombre.trim() || !c) return setError("Pon nombre y precio por unidad.");
            m.mutate({ nombre: nombre.trim(), precioCent: c }, { onSuccess: () => (setNombre(""), setPrecio(""), setError(null)), onError: (x) => setError(x.message) });
          }}
        >
          <div className="w-56"><Campo etiqueta="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required /></div>
          <div className="w-28"><Campo etiqueta="€ por ud" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} required /></div>
        </Formulario>
      </Seccion>
    </div>
  );
}
