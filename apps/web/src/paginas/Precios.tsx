import { useState } from "react";
import { calcularPrecio } from "@nfc/core/precios";
import { Plus, Trash } from "@phosphor-icons/react";
import { api } from "../lib/api";
import { aCent, euros, fecha, pct } from "../lib/formato";
import { useAccion } from "../lib/acciones";
import { usePrecios, useYo } from "../lib/consultas";
import type { Producto } from "../lib/tipos";
import { Boton, BotonIcono } from "../ui/Boton";
import { Campo, Opciones } from "../ui/Campos";
import { Hoja } from "../ui/Hoja";
import { Datos, Esqueleto, Estrellas, Seccion, Tarjeta, TarjetaPlaca, Titulo, Vacio } from "../ui/Superficies";

const hoy = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
type Edicion = { tipo: "tramo" | "oferta" | "precio"; p: Producto } | { tipo: "producto" } | null;

export default function Precios() {
  const q = usePrecios();
  const esAdmin = useYo().data?.rol === "admin";
  const [edicion, setEdicion] = useState<Edicion>(null);
  return (
    <>
      <Titulo detalle={esAdmin ? "Las ofertas no se suman: a cada venta se le aplica lo más barato para el cliente." : "Solo un admin puede cambiar los precios."} accion={esAdmin ? <Boton icono={<Plus size={17} />} onClick={() => setEdicion({ tipo: "producto" })}>Producto</Boton> : undefined}>
        Precios y bonos
      </Titulo>
      <Datos q={q} esqueleto={<Esqueleto lineas={3} alto="h-40" />}>
        {(ps) => (ps.length ? <div className="space-y-10">{ps.map((p) => <FichaProducto key={p.id} p={p} admin={esAdmin} editar={setEdicion} />)}</div> : <Vacio titulo="Aún no hay productos" />)}
      </Datos>
      <Hoja abierta={!!edicion} onCerrar={() => setEdicion(null)} titulo={!edicion ? "" : edicion.tipo === "tramo" ? "Nuevo tramo" : edicion.tipo === "oferta" ? "Nueva oferta" : edicion.tipo === "precio" ? "Precio de lista" : "Nuevo producto"} descripcion={edicion && "p" in edicion ? edicion.p.nombre : undefined}>
        {edicion?.tipo === "tramo" && <FormTramo p={edicion.p} hecho={() => setEdicion(null)} />}
        {edicion?.tipo === "oferta" && <FormOferta p={edicion.p} hecho={() => setEdicion(null)} />}
        {edicion?.tipo === "precio" && <FormPrecio p={edicion.p} hecho={() => setEdicion(null)} />}
        {edicion?.tipo === "producto" && <FormProducto hecho={() => setEdicion(null)} />}
      </Hoja>
    </>
  );
}

function FichaProducto({ p, admin, editar }: { p: Producto; admin: boolean; editar: (e: Edicion) => void }) {
  const [uds, setUds] = useState(3);
  const presupuesto = calcularPrecio(uds, p.precioCent, p.tramos, p.ofertas, hoy());
  const ejemplos = [1, 2, 3, 5, 10].map((k) => calcularPrecio(k, p.precioCent, p.tramos, p.ofertas, hoy()));
  const quitarTramo = useAccion((desde: number) => api.del(`/api/tramos?productoId=${p.id}&desdeUds=${desde}`), "Tramo quitado");
  const quitarOferta = useAccion((id: number) => api.del(`/api/ofertas/${id}`), "Oferta retirada");
  return (
    <section aria-label={p.nombre} className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[20px] font-bold">{p.nombre}</h2>
          <p className="num text-[15px] text-tinta-2"><b className="text-[22px] text-tinta">{euros(p.precioCent)}</b> la unidad</p>
        </div>
        {admin && <Boton tamano="sm" onClick={() => editar({ tipo: "precio", p })}>Cambiar precio</Boton>}
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <TarjetaPlaca>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] font-semibold text-tinta-3">Calculadora</span>
            <Estrellas llenas={Math.min(5, uds)} tam={14} />
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button type="button" aria-label="Uno menos" onClick={() => setUds((u) => Math.max(1, u - 1))} className="size-11 rounded-xl border border-control text-[20px] font-bold hover:bg-hundido">−</button>
            <span className="num w-16 text-center text-[28px] font-bold" aria-live="polite">{uds}</span>
            <button type="button" aria-label="Uno más" onClick={() => setUds((u) => u + 1)} className="size-11 rounded-xl border border-control text-[20px] font-bold hover:bg-hundido">+</button>
            <span className="text-tinta-3">{uds === 1 ? "panel" : "paneles"}</span>
          </div>
          <div className="num mt-4 text-[38px] font-bold leading-none">{euros(presupuesto.totalCent)}</div>
          <p className="mt-1 text-[14px] text-tinta-2">{euros(Math.round(presupuesto.totalCent / uds))}/ud, {presupuesto.aplicado.toLowerCase()}{presupuesto.ahorroCent > 0 && <>, ahorra <b className="text-entra">{euros(presupuesto.ahorroCent)}</b></>}</p>
          <table className="num mt-4 text-[14px]">
            <tbody>
              {ejemplos.map((e) => (
                <tr key={e.uds} className="border-t border-borde">
                  <td className="py-1.5 text-tinta-3">{e.uds} ud{e.uds > 1 ? "s" : ""}</td>
                  <td className="py-1.5 text-right font-semibold">{euros(e.totalCent)}</td>
                  <td className="py-1.5 pl-3 text-right text-tinta-3">{euros(Math.round(e.totalCent / e.uds))}/ud</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TarjetaPlaca>
        <div className="space-y-5">
          <Seccion titulo="Tramos por cantidad" extra={admin && <button type="button" className="font-semibold text-tinta-2 hover:text-tinta" onClick={() => editar({ tipo: "tramo", p })}>Añadir</button>}>
            {p.tramos.length ? (
              <Tarjeta className="divide-y divide-borde">
                {p.tramos.map((t) => (
                  <div key={t.id} className="num flex items-center gap-3 px-4 py-2.5">
                    <span>Desde <b>{t.desdeUds}</b> uds</span>
                    <span className="ml-auto font-bold">{t.precioCent != null ? `${euros(t.precioCent)}/ud` : `−${pct(t.descuentoBp!)}`}</span>
                    {admin && <BotonIcono etiqueta={`Quitar el tramo desde ${t.desdeUds}`} onClick={() => quitarTramo.mutate(t.desdeUds)}><Trash size={17} /></BotonIcono>}
                  </div>
                ))}
              </Tarjeta>
            ) : (
              <p className="text-[14px] text-tinta-3">Sin tramos: siempre el precio de lista.</p>
            )}
          </Seccion>
          <Seccion titulo="Ofertas" extra={admin && <button type="button" className="font-semibold text-tinta-2 hover:text-tinta" onClick={() => editar({ tipo: "oferta", p })}>Añadir</button>}>
            {p.ofertas.length ? (
              <Tarjeta className="divide-y divide-borde">
                {p.ofertas.map((o) => (
                  <div key={o.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="min-w-0 flex-1"><b className="font-semibold">{o.descripcion}</b><span className="block text-[13px] text-tinta-3">{o.hasta ? `hasta el ${fecha(o.hasta, true)}` : "sin fecha de fin"}</span></span>
                    {admin && <BotonIcono etiqueta={`Retirar la oferta ${o.descripcion}`} onClick={() => quitarOferta.mutate(o.id)}><Trash size={17} /></BotonIcono>}
                  </div>
                ))}
              </Tarjeta>
            ) : (
              <p className="text-[14px] text-tinta-3">Sin ofertas.</p>
            )}
          </Seccion>
        </div>
      </div>
    </section>
  );
}

function FormTramo({ p, hecho }: { p: Producto; hecho: () => void }) {
  const [tipo, setTipo] = useState<"precio" | "descuento">("precio");
  const [desde, setDesde] = useState("");
  const [valor, setValor] = useState("");
  const [error, setError] = useState<string | null>(null);
  const m = useAccion((b: object) => api.put("/api/tramos", b), "Tramo guardado");
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const d = Number(desde);
        const cent = tipo === "precio" ? aCent(valor) : null;
        const bp = tipo === "descuento" ? Math.round(Number(valor.replace(",", ".").replace("%", "")) * 100) : null;
        if (!Number.isInteger(d) || d < 2) return setError("El tramo empieza como mínimo en 2 unidades.");
        if (tipo === "precio" && !cent) return setError("Pon el precio por unidad.");
        if (tipo === "descuento" && !(bp! > 0 && bp! <= 10_000)) return setError("El descuento va de 1 a 100 %.");
        m.mutate({ productoId: p.id, desdeUds: d, ...(cent ? { precioCent: cent } : { descuentoBp: bp }) }, { onSuccess: hecho });
      }}
    >
      <Opciones etiqueta="Tipo" valor={tipo} onChange={setTipo} opciones={[{ valor: "precio", texto: "Precio por unidad" }, { valor: "descuento", texto: "Descuento %" }]} />
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Desde (uds)" inputMode="numeric" value={desde} onChange={(e) => setDesde(e.target.value)} />
        <Campo etiqueta={tipo === "precio" ? "Precio por ud" : "Descuento"} inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} sufijo={tipo === "precio" ? "€" : "%"} />
      </div>
      {error && <p role="alert" className="text-[14px] font-medium text-sale">{error}</p>}
      <Boton type="submit" variante="primario" tamano="lg" className="w-full" cargando={m.isPending}>Guardar tramo</Boton>
    </form>
  );
}

function FormOferta({ p, hecho }: { p: Producto; hecho: () => void }) {
  const [tipo, setTipo] = useState<"nxm" | "pack" | "descuento">("pack");
  const [n, setN] = useState("");
  const [v, setV] = useState("");
  const [hasta, setHasta] = useState("");
  const [error, setError] = useState<string | null>(null);
  const m = useAccion((b: object) => api.post("/api/ofertas", b), "Oferta creada");
  const et = { nxm: ["Se lleva", "Paga"], pack: ["Unidades", "Precio del pack"], descuento: ["Desde (uds)", "Descuento"] }[tipo];
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const nn = Number(n);
        if (!Number.isInteger(nn) || nn < 1) return setError("Pon un número de unidades válido.");
        const extra = tipo === "nxm" ? { m: Number(v) } : tipo === "pack" ? { precioCent: aCent(v) } : { descuentoBp: Math.round(Number(v.replace(",", ".").replace("%", "")) * 100) };
        if (tipo === "nxm" && !(extra.m! >= 1 && extra.m! < nn)) return setError("En NxM se pagan menos de las que se llevan (3x2).");
        if (tipo === "pack" && !extra.precioCent) return setError("Pon el precio del pack.");
        m.mutate({ productoId: p.id, tipo, n: nn, ...extra, hasta: hasta || null }, { onSuccess: hecho });
      }}
    >
      <Opciones etiqueta="Tipo de oferta" columnas={3} valor={tipo} onChange={setTipo} opciones={[{ valor: "pack", texto: "Pack", detalle: "N por X €" }, { valor: "nxm", texto: "NxM", detalle: "3x2" }, { valor: "descuento", texto: "Volumen", detalle: "−% desde N" }]} />
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta={et[0]!} inputMode="numeric" value={n} onChange={(e) => setN(e.target.value)} />
        <Campo etiqueta={et[1]!} inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} sufijo={tipo === "pack" ? "€" : tipo === "descuento" ? "%" : undefined} />
      </div>
      <Campo etiqueta="Hasta (opcional)" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} ayuda="Termina sola ese día; el bot avisa 3 días antes." />
      {error && <p role="alert" className="text-[14px] font-medium text-sale">{error}</p>}
      <Boton type="submit" variante="primario" tamano="lg" className="w-full" cargando={m.isPending}>Crear oferta</Boton>
    </form>
  );
}

function FormPrecio({ p, hecho }: { p: Producto; hecho: () => void }) {
  const [v, setV] = useState((p.precioCent / 100).toString().replace(".", ","));
  const m = useAccion((c: number) => api.put(`/api/productos/${p.id}`, { precioCent: c }), "Precio cambiado");
  const c = aCent(v);
  return (
    <form className="space-y-4" onSubmit={(e) => (e.preventDefault(), c && m.mutate(c, { onSuccess: hecho }))}>
      <Campo etiqueta="Precio por unidad" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} sufijo="€" error={v && !c ? "Pon un importe válido." : null} className="!text-[24px] font-bold" />
      <Boton type="submit" variante="primario" tamano="lg" className="w-full" disabled={!c} cargando={m.isPending}>Guardar precio</Boton>
    </form>
  );
}

function FormProducto({ hecho }: { hecho: () => void }) {
  const [nombre, setNombre] = useState("");
  const [v, setV] = useState("");
  const m = useAccion(() => api.post("/api/productos", { nombre: nombre.trim(), precioCent: aCent(v) }), "Producto creado");
  return (
    <form className="space-y-4" onSubmit={(e) => (e.preventDefault(), nombre.trim() && aCent(v) && m.mutate(undefined, { onSuccess: hecho }))}>
      <Campo etiqueta="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} />
      <Campo etiqueta="Precio por unidad" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} sufijo="€" />
      <Boton type="submit" variante="primario" tamano="lg" className="w-full" disabled={!nombre.trim() || !aCent(v)} cargando={m.isPending}>Crear producto</Boton>
    </form>
  );
}
