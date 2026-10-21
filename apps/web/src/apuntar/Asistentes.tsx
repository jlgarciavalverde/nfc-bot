import { calcularPrecio } from "@nfc/core/precios";
import { api } from "../lib/api";
import { aCent, euros, fecha as fechaCorta } from "../lib/formato";
import { useAccion } from "../lib/acciones";
import { usePrecios } from "../lib/consultas";
import { Area, Campo, Importe, Opciones, Selector } from "../ui/Campos";
import { Pasos, useBorrador } from "../ui/Pasos";
import { ElegirComercio, enDias, hoyMadrid, idComercio, nombreEleccion, Resumen, type Eleccion } from "./Comun";

interface Props {
  comercio?: { id: number; nombre: string };
  hecho: () => void;
}
const sinComercio = (c: Eleccion | null) => (c ? null : "Elige el comercio (o escribe su nombre para crearlo).");

const RESULTADOS = {
  si: { texto: "Sí", detalle: "Quiere la placa" },
  no: { texto: "No", detalle: "No le interesa" },
  luego: { texto: "Volver otro día", detalle: "Hay que pasar de nuevo" },
  interesado: { texto: "Interesado", detalle: "Le gusta, lo piensa" },
} as const;
type Resultado = keyof typeof RESULTADOS;

export function AsistenteVisita({ comercio, hecho }: Props) {
  const [d, poner, limpiar, borrador] = useBorrador<{ comercio: Eleccion | null; resultado: Resultado | null; nota: string; proxima: string }>(`visita:${comercio?.id ?? ""}`, { comercio: comercio ?? null, resultado: null, nota: "", proxima: enDias(14) });
  const volver = d.resultado === "luego" || d.resultado === "interesado";
  const m = useAccion(
    async () => api.post("/api/visitas", { comercioId: await idComercio(d.comercio!), resultado: d.resultado, nota: d.nota, proxima: volver ? d.proxima : null }),
    `Visita a ${nombreEleccion(d.comercio)} apuntada`,
    { deshacer: true },
  );
  return (
    <Pasos
      borrador={borrador}
      textoFinal="Apuntar visita"
      ocupado={m.isPending}
      onTerminar={() => m.mutate(undefined, { onSuccess: () => (limpiar(), hecho()) })}
      pasos={[
        { titulo: "¿Qué comercio?", omitir: !!comercio, validar: () => sinComercio(d.comercio), contenido: (av) => <ElegirComercio valor={d.comercio} onChange={(c) => poner({ comercio: c })} avanzar={av} /> },
        {
          titulo: `¿Qué ha dicho ${nombreEleccion(d.comercio)}?`,
          validar: () => (d.resultado ? null : "Elige qué ha dicho."),
          contenido: (av) => (
            <Opciones etiqueta="Resultado" oculta valor={d.resultado} onChange={(r) => (poner({ resultado: r }), av())} opciones={(Object.keys(RESULTADOS) as Resultado[]).map((k) => ({ valor: k, ...RESULTADOS[k] }))} />
          ),
        },
        {
          titulo: d.resultado === "no" ? "¿Por qué no?" : "Detalles",
          contenido: () => (
            <div className="space-y-4">
              <Area etiqueta={d.resultado === "no" ? "Motivo" : "Nota"} autoCapitalize="sentences" placeholder={d.resultado === "no" ? "Muy caro, ya tiene QR…" : "Vuelve el dueño, pide precio para 5…"} value={d.nota} onChange={(e) => poner({ nota: e.target.value })} maxLength={500} />
              {volver && <Campo etiqueta="Volver el" type="date" min={enDias(1)} value={d.proxima} onChange={(e) => poner({ proxima: e.target.value })} ayuda="Ese día a las 9:00 te lo recuerdo por Telegram." />}
            </div>
          ),
          validar: () => (volver && (!d.proxima || d.proxima <= hoyMadrid()) ? "La fecha para volver tiene que ser a partir de mañana." : null),
        },
      ]}
    />
  );
}

const COBROS = { bizum: "Bizum", efectivo: "Efectivo", transferencia: "Transferencia", tarjeta: "Tarjeta", pendiente: "Pendiente" } as const;
type Cobro = keyof typeof COBROS;

export function AsistenteVenta({ comercio, hecho }: Props) {
  const precios = usePrecios();
  const [d, poner, limpiar, borrador] = useBorrador<{ comercio: Eleccion | null; productoId: string; uds: string; pactado: string; cobro: Cobro | null; nota: string }>(`venta:${comercio?.id ?? ""}`, { comercio: comercio ?? null, productoId: "", uds: "1", pactado: "", cobro: null, nota: "" });
  const prods = precios.data ?? [];
  const p = prods.find((x) => String(x.id) === d.productoId) ?? prods[0];
  const n = Number(d.uds);
  const presupuesto = p && Number.isInteger(n) && n > 0 && n <= 10_000 ? calcularPrecio(n, p.precioCent, p.tramos, p.ofertas, hoyMadrid()) : null;
  const pactadoCent = d.pactado ? aCent(d.pactado) : null;
  const total = pactadoCent ?? presupuesto?.totalCent ?? 0;
  const m = useAccion(
    async () => api.post("/api/ventas", { comercioId: await idComercio(d.comercio!), productoId: p?.id, uds: n, cobrada: d.cobro !== "pendiente", metodo: d.cobro === "pendiente" ? null : d.cobro, pactadoCent, nota: d.nota }),
    `Venta a ${nombreEleccion(d.comercio)} apuntada (${euros(total)})`,
    { deshacer: true },
  );
  if (precios.isSuccess && !prods.length) return <p className="text-tinta-2">Antes hay que crear el producto en Precios.</p>;
  return (
    <Pasos
      borrador={borrador}
      textoFinal={`Apuntar venta de ${euros(total)}`}
      ocupado={m.isPending}
      onTerminar={() => m.mutate(undefined, { onSuccess: () => (limpiar(), hecho()) })}
      pasos={[
        { titulo: "¿A qué comercio?", omitir: !!comercio, validar: () => sinComercio(d.comercio), contenido: (av) => <ElegirComercio valor={d.comercio} onChange={(c) => poner({ comercio: c })} avanzar={av} /> },
        {
          titulo: "¿Cuántos paneles?",
          validar: () => (!presupuesto ? "Pon cuántos paneles (un número entero)." : d.pactado && !pactadoCent ? "El precio pactado no es un importe válido." : null),
          contenido: () => (
            <div className="space-y-4">
              {prods.length > 1 && <Selector etiqueta="Producto" valor={String(p?.id ?? "")} onChange={(v) => poner({ productoId: v })} opciones={prods.map((x) => ({ valor: String(x.id), texto: x.nombre }))} />}
              <div className="flex items-center gap-3">
                <button type="button" aria-label="Uno menos" onClick={() => poner({ uds: String(Math.max(1, n - 1)) })} className="size-14 shrink-0 rounded-xl border border-control text-[24px] font-bold hover:bg-hundido">−</button>
                <Campo etiqueta="Paneles" oculta type="number" inputMode="numeric" min={1} max={10000} value={d.uds} onChange={(e) => poner({ uds: e.target.value })} className="!min-h-14 text-center !text-[28px] font-bold" />
                <button type="button" aria-label="Uno más" onClick={() => poner({ uds: String((Number.isFinite(n) ? n : 0) + 1) })} className="size-14 shrink-0 rounded-xl border border-control text-[24px] font-bold hover:bg-hundido">+</button>
              </div>
              {presupuesto && (
                <div className="tarjeta-placa p-4" aria-live="polite">
                  <div className="num text-[32px] font-bold leading-none">{euros(pactadoCent ?? presupuesto.totalCent)}</div>
                  <div className="mt-1 text-[13px] text-tinta-3">
                    {pactadoCent ? `Precio pactado (tarifa: ${euros(presupuesto.totalCent)})` : `${euros(Math.round(presupuesto.totalCent / n))}/ud, ${presupuesto.aplicado.toLowerCase()}`}
                    {!pactadoCent && presupuesto.ahorroCent > 0 && <>, ahorra {euros(presupuesto.ahorroCent)}</>}
                  </div>
                </div>
              )}
              <Campo etiqueta="Precio pactado (opcional)" inputMode="decimal" autoComplete="off" placeholder="Solo si habéis acordado otro precio" value={d.pactado} onChange={(e) => poner({ pactado: e.target.value })} sufijo="€" />
            </div>
          ),
        },
        {
          titulo: "¿Cómo ha pagado?",
          validar: () => (d.cobro ? null : "Elige cómo ha pagado (o «Pendiente»)."),
          contenido: (av) => (
            <Opciones etiqueta="Cobro" oculta columnas={2} valor={d.cobro} onChange={(c) => (poner({ cobro: c }), av())} opciones={(Object.keys(COBROS) as Cobro[]).map((k) => ({ valor: k, texto: COBROS[k], detalle: k === "pendiente" ? "Aún no ha pagado" : undefined }))} />
          ),
        },
        {
          titulo: "Repasa la venta",
          contenido: () => (
            <div className="space-y-4">
              <Resumen filas={[["Comercio", nombreEleccion(d.comercio)], ["Paneles", n], ["Total", euros(total)], ["Cobro", d.cobro ? COBROS[d.cobro] : "—"]]} />
              <Campo etiqueta="Nota (opcional)" autoCapitalize="sentences" autoComplete="off" value={d.nota} onChange={(e) => poner({ nota: e.target.value })} maxLength={500} />
            </div>
          ),
        },
      ]}
    />
  );
}

const DINERO = {
  gasto: { texto: "Gasto", detalle: "Lo paga el negocio" },
  aportacion: { texto: "Pongo dinero", detalle: "Inviertes en el negocio" },
  ingreso: { texto: "Ingreso", detalle: "Entra y no es una venta" },
  retirada: { texto: "Me llevo dinero", detalle: "Del negocio para ti" },
} as const;
type TipoDinero = keyof typeof DINERO;

export function AsistenteDinero({ hecho }: Props) {
  const [d, poner, limpiar, borrador] = useBorrador<{ tipo: TipoDinero | null; importe: string; categoria: string; nota: string }>("dinero", { tipo: null, importe: "", categoria: "", nota: "" });
  const cent = aCent(d.importe);
  const m = useAccion(() => api.post("/api/movimientos", { tipo: d.tipo, cent, categoria: d.categoria, nota: d.nota }), `${d.tipo ? DINERO[d.tipo].texto : "Movimiento"} de ${euros(cent ?? 0)} apuntado`, { deshacer: true });
  return (
    <Pasos
      borrador={borrador}
      textoFinal="Apuntar"
      ocupado={m.isPending}
      onTerminar={() => m.mutate(undefined, { onSuccess: () => (limpiar(), hecho()) })}
      pasos={[
        { titulo: "¿Qué es?", validar: () => (d.tipo ? null : "Elige qué tipo de movimiento es."), contenido: (av) => <Opciones etiqueta="Tipo" oculta valor={d.tipo} onChange={(t) => (poner({ tipo: t }), av())} opciones={(Object.keys(DINERO) as TipoDinero[]).map((k) => ({ valor: k, ...DINERO[k] }))} /> },
        { titulo: "¿Cuánto?", escribir: true, validar: () => (cent ? null : "Pon un importe válido, p. ej. 30 o 12,50."), contenido: () => <Importe etiqueta="Importe" placeholder="0" value={d.importe} onChange={(e) => poner({ importe: e.target.value })} /> },
        {
          titulo: d.tipo === "gasto" ? "¿En qué?" : "Nota",
          contenido: () => (
            <div className="space-y-4">
              {d.tipo === "gasto" && (
                <>
                  <div className="flex flex-wrap gap-2">
                    {["imprenta", "gasolina", "material", "publicidad", "envíos"].map((c) => (
                      <button key={c} type="button" onClick={() => poner({ categoria: c })} aria-pressed={d.categoria === c} className="min-h-11 rounded-full border border-borde-fuerte px-3.5 py-2 text-[14px] font-semibold capitalize aria-pressed:border-base aria-pressed:bg-base aria-pressed:text-sobre-base">{c}</button>
                    ))}
                  </div>
                  <Campo etiqueta="Categoría" autoCapitalize="none" autoComplete="off" value={d.categoria} onChange={(e) => poner({ categoria: e.target.value })} maxLength={60} />
                </>
              )}
              <Campo etiqueta="Nota (opcional)" autoCapitalize="sentences" autoComplete="off" value={d.nota} onChange={(e) => poner({ nota: e.target.value })} maxLength={500} />
            </div>
          ),
        },
      ]}
    />
  );
}

export function AsistenteComercio({ hecho }: Props) {
  const [d, poner, limpiar, borrador] = useBorrador("comercio", { nombre: "", tipo: "", zona: "", direccion: "", contacto: "", mapsUrl: "", lat: null as number | null, lon: null as number | null });
  const m = useAccion(() => api.post("/api/comercios", { ...d, lat: d.lat ?? undefined, lon: d.lon ?? undefined }), `Comercio «${d.nombre}» apuntado`, { deshacer: true });
  const ubicar = () =>
    navigator.geolocation?.getCurrentPosition(
      (p) => poner({ lat: p.coords.latitude, lon: p.coords.longitude, mapsUrl: d.mapsUrl || `https://www.google.com/maps?q=${p.coords.latitude.toFixed(6)},${p.coords.longitude.toFixed(6)}` }),
      () => undefined,
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  return (
    <Pasos
      borrador={borrador}
      textoFinal="Apuntar comercio"
      ocupado={m.isPending}
      onTerminar={() => m.mutate(undefined, { onSuccess: () => (limpiar(), hecho()) })}
      pasos={[
        {
          titulo: "¿Cómo se llama?",
          escribir: true,
          validar: () => (d.nombre.trim() ? null : "Falta el nombre."),
          contenido: () => (
            <div className="space-y-4">
              <Campo etiqueta="Nombre" value={d.nombre} onChange={(e) => poner({ nombre: e.target.value })} maxLength={120} autoComplete="off" autoCapitalize="words" />
              <div className="flex flex-wrap gap-2">
                {["bar", "restaurante", "cafetería", "peluquería", "tienda", "clínica"].map((t) => (
                  <button key={t} type="button" onClick={() => poner({ tipo: t })} aria-pressed={d.tipo === t} className="min-h-11 rounded-full border border-borde-fuerte px-3.5 py-2 text-[14px] font-semibold capitalize aria-pressed:border-base aria-pressed:bg-base aria-pressed:text-sobre-base">{t}</button>
                ))}
              </div>
              <Campo etiqueta="Tipo" autoCapitalize="none" autoComplete="off" value={d.tipo} onChange={(e) => poner({ tipo: e.target.value })} maxLength={60} />
            </div>
          ),
        },
        {
          titulo: "¿Dónde está?",
          validar: () => (d.mapsUrl && !d.mapsUrl.startsWith("https://") ? "El enlace de Google Maps tiene que empezar por https://" : null),
          contenido: () => (
            <div className="space-y-4">
              <button type="button" onClick={ubicar} className="tarjeta-placa flex w-full items-center gap-3 p-4 text-left font-semibold">
                <span aria-hidden className="text-[22px]">📍</span>
                <span className="min-w-0 flex-1">{d.lat ? "Ubicación guardada" : "Usar mi ubicación (estoy en el comercio)"}
                  {d.lat && <span className="num block text-[12px] font-normal text-tinta-3">{d.lat.toFixed(5)}, {d.lon!.toFixed(5)}</span>}</span>
              </button>
              <Campo etiqueta="Zona o barrio" autoCapitalize="words" autoComplete="off" value={d.zona} onChange={(e) => poner({ zona: e.target.value })} maxLength={120} />
              <Campo etiqueta="Dirección (opcional)" autoComplete="off" value={d.direccion} onChange={(e) => poner({ direccion: e.target.value })} maxLength={200} />
              <Campo etiqueta="Enlace de Google Maps (opcional)" type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" placeholder="https://maps.app.goo.gl/…" value={d.mapsUrl} onChange={(e) => poner({ mapsUrl: e.target.value })} />
            </div>
          ),
        },
        { titulo: "¿Con quién hablar?", contenido: () => <Campo etiqueta="Contacto (opcional)" autoComplete="off" placeholder="Nombre y teléfono" value={d.contacto} onChange={(e) => poner({ contacto: e.target.value })} maxLength={200} /> },
      ]}
    />
  );
}

export function AsistenteCompra({ hecho }: Props) {
  const [d, poner, limpiar, borrador] = useBorrador("compra", { uds: "", coste: "", proveedor: "" });
  const n = Number(d.uds), c = aCent(d.coste);
  const m = useAccion(() => api.post("/api/compras", { uds: n, cent: c, proveedor: d.proveedor }), `Compra de ${n} paneles apuntada`, { deshacer: true });
  return (
    <Pasos
      borrador={borrador}
      textoFinal="Apuntar compra"
      ocupado={m.isPending}
      onTerminar={() => m.mutate(undefined, { onSuccess: () => (limpiar(), hecho()) })}
      pasos={[
        { titulo: "¿Cuántos paneles?", escribir: true, validar: () => (Number.isInteger(n) && n > 0 ? null : "Pon cuántos paneles."), contenido: () => <Campo etiqueta="Paneles" type="number" inputMode="numeric" min={1} value={d.uds} onChange={(e) => poner({ uds: e.target.value })} className="!text-[24px] font-bold" /> },
        { titulo: "¿Cuánto costaron en total?", escribir: true, validar: () => (c ? null : "Pon el coste total."), contenido: () => <div className="space-y-3"><Importe etiqueta="Coste total" placeholder="0" value={d.coste} onChange={(e) => poner({ coste: e.target.value })} />{n > 0 && c && <p className="num text-tinta-3">{euros(Math.round(c / n))} por panel</p>}</div> },
        { titulo: "¿A quién?", contenido: () => <div className="space-y-3"><Campo etiqueta="Proveedor (opcional)" autoCapitalize="words" autoComplete="off" value={d.proveedor} onChange={(e) => poner({ proveedor: e.target.value })} maxLength={120} /><p className="text-[13px] text-tinta-3">Se apunta como gasto y suma al stock. Las ventas gastan primero los paneles más antiguos.</p></div> },
      ]}
    />
  );
}

export function AsistenteRecordar({ comercio, hecho }: Props) {
  const [d, poner, limpiar, borrador] = useBorrador<{ comercio: Eleccion | null; fecha: string; nota: string }>(`recordar:${comercio?.id ?? ""}`, { comercio: comercio ?? null, fecha: enDias(7), nota: "" });
  const m = useAccion(async () => api.post("/api/recordatorios", { comercioId: await idComercio(d.comercio!), fecha: d.fecha, nota: d.nota }), `Te recuerdo ${nombreEleccion(d.comercio)} el ${fechaCorta(d.fecha)}`);
  return (
    <Pasos
      borrador={borrador}
      textoFinal="Guardar recordatorio"
      ocupado={m.isPending}
      onTerminar={() => m.mutate(undefined, { onSuccess: () => (limpiar(), hecho()) })}
      pasos={[
        { titulo: "¿Qué comercio?", omitir: !!comercio, validar: () => sinComercio(d.comercio), contenido: (av) => <ElegirComercio valor={d.comercio} onChange={(c) => poner({ comercio: c })} avanzar={av} permitirNuevo={false} /> },
        {
          titulo: "¿Cuándo?",
          validar: () => (d.fecha >= hoyMadrid() ? null : "Esa fecha ya ha pasado."),
          contenido: () => (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {[["Mañana", 1], ["En 3 días", 3], ["En una semana", 7], ["En dos semanas", 14]].map(([t, n]) => (
                  <button key={t} type="button" onClick={() => poner({ fecha: enDias(n as number) })} aria-pressed={d.fecha === enDias(n as number)} className="min-h-11 rounded-full border border-borde-fuerte px-3.5 py-2 text-[14px] font-semibold aria-pressed:border-base aria-pressed:bg-base aria-pressed:text-sobre-base">{t}</button>
                ))}
              </div>
              <Campo etiqueta="Día" type="date" min={hoyMadrid()} value={d.fecha} onChange={(e) => poner({ fecha: e.target.value })} ayuda="Ese día a las 9:00 te llega por privado en Telegram." />
              <Campo etiqueta="Nota (opcional)" autoCapitalize="sentences" autoComplete="off" placeholder="Llamar al dueño…" value={d.nota} onChange={(e) => poner({ nota: e.target.value })} maxLength={500} />
            </div>
          ),
        },
      ]}
    />
  );
}
