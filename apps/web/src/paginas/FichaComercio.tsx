import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Bell, MapPin, ContactlessPayment as Nfc, PencilSimple, Phone, Receipt, Star, Storefront, NavigationArrow } from "@phosphor-icons/react";
import { api } from "../lib/api";
import { euros, fecha, plural } from "../lib/formato";
import { useAccion } from "../lib/acciones";
import { useFicha, useYo } from "../lib/consultas";
import type { Comercio, Ficha } from "../lib/tipos";
import { useApuntar } from "../apuntar/Apuntar";
import { CobrarVenta, HechoRecordatorio } from "../componentes/AccionesRapidas";
import { Boton } from "../ui/Boton";
import { Campo } from "../ui/Campos";
import { Hoja } from "../ui/Hoja";
import { Cifra, Datos, Esqueleto, Sello, Seccion, Tarjeta, TarjetaPlaca, Vacio } from "../ui/Superficies";

const RESULTADO = { si: "Ha dicho que sí", no: "Ha dicho que no", luego: "Volver otro día", interesado: "Interesado" } as const;

export default function FichaComercio({ id }: { id: number }) {
  const q = useFicha(id);
  return (
    <>
      <Link href="/comercios" className="mb-3 inline-flex items-center gap-1.5 text-[14px] font-semibold text-tinta-3 hover:text-tinta">
        <ArrowLeft size={16} /> Comercios
      </Link>
      <Datos q={q} esqueleto={<Esqueleto lineas={4} alto="h-24" />}>{(f) => <Contenido f={f} />}</Datos>
    </>
  );
}

function Contenido({ f }: { f: Ficha }) {
  const c = f.comercio;
  const apuntar = useApuntar();
  const yo = useYo();
  const [editar, setEditar] = useState(false);
  const ref = { id: c.id, nombre: c.nombre };
  const mapa = c.mapsUrl ?? (c.lat != null ? `https://www.google.com/maps?q=${c.lat},${c.lon}` : null);
  const vendido = f.ventas.reduce((a, v) => a + v.totalCent, 0);
  const uds = f.ventas.reduce((a, v) => a + v.uds, 0);
  const escaneos = (f.placas ?? []).reduce((a, p) => a + p.escaneos, 0);

  // Línea de tiempo: visitas y ventas mezcladas, lo último arriba
  const tiempo = [
    ...f.visitas.map((v, i) => ({ k: `v${i}`, fecha: v.fecha, tipo: "visita" as const, v })),
    ...f.ventas.map((v) => ({ k: `s${v.id}`, fecha: v.fecha, tipo: "venta" as const, s: v })),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha));

  return (
    <div className="space-y-7">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Sello estado={c.estado} />
          {f.responsable && <span className="text-[13px] text-tinta-3">Lo lleva {f.responsable}</span>}
        </div>
        <h1 className="text-[28px] font-bold leading-tight sm:text-[34px]">{c.nombre}</h1>
        <p className="text-[14px] text-tinta-2">{[c.tipo, c.zona, c.direccion].filter(Boolean).join(", ") || "Sin datos de dirección"}</p>
        <div className="flex flex-wrap gap-2">
          {c.contacto && <a href={/\d{6,}/.test(c.contacto.replace(/\s/g, "")) ? `tel:${c.contacto.replace(/[^\d+]/g, "")}` : undefined} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-borde-fuerte px-3 text-[13px] font-semibold"><Phone size={15} /> {c.contacto}</a>}
          {mapa && <a href={mapa} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-borde-fuerte px-3 text-[13px] font-semibold"><NavigationArrow size={15} /> Cómo llegar</a>}
          {c.resenasUrl && <a href={c.resenasUrl} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-borde-fuerte px-3 text-[13px] font-semibold"><Star size={15} weight="fill" className="text-estrella" /> Sus reseñas</a>}
          <button type="button" onClick={() => setEditar(true)} className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-tinta-2 hover:bg-hundido"><PencilSimple size={15} /> Editar datos</button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Accion icono={<MapPin size={20} weight="bold" />} texto="Visita" onClick={() => apuntar({ tipo: "visita", comercio: ref })} acento />
        <Accion icono={<Receipt size={20} weight="bold" />} texto="Venta" onClick={() => apuntar({ tipo: "venta", comercio: ref })} />
        <Accion icono={<Nfc size={20} weight="bold" />} texto="Placa" onClick={() => apuntar({ tipo: "placa", comercio: ref })} />
        <Accion icono={<Bell size={20} weight="bold" />} texto="Recordar" onClick={() => apuntar({ tipo: "recordar", comercio: ref })} />
      </div>

      {f.recordatorios.length > 0 && (
        <TarjetaPlaca className="flex flex-wrap items-center gap-3">
          <Bell size={22} weight="fill" className="text-estrella" />
          <span className="min-w-0 flex-1 font-semibold">Volver el {f.recordatorios.map((r) => fecha(r.fecha, true)).join(", ")}{f.recordatorios[0]?.nota ? `: ${f.recordatorios[0].nota}` : ""}</span>
          <HechoRecordatorio id={f.recordatorios[0]!.id} comercio={c.nombre} />
        </TarjetaPlaca>
      )}

      <Tarjeta className="grid grid-cols-3 gap-4 p-4 sm:p-5">
        <Cifra etiqueta="Comprado" valor={euros(vendido)} nota={plural(uds, "panel", "paneles")} />
        <Cifra etiqueta="Visitas" valor={f.visitas.length} />
        <Cifra etiqueta="Escaneos" valor={escaneos} nota={plural(f.placas?.length ?? 0, "placa", "placas")} />
      </Tarjeta>

      {c.estado === "no" && c.motivoNo && <p className="rounded-[var(--radius-placa)] bg-hundido px-4 py-3 text-[14px]"><b>Motivo del no:</b> {c.motivoNo}</p>}
      {c.nota && <p className="rounded-[var(--radius-placa)] bg-hundido px-4 py-3 text-[14px]"><b>Nota:</b> {c.nota}</p>}

      <div className="grid grid-cols-1 gap-7 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Seccion titulo="Historia">
          {tiempo.length ? (
            <ol className="relative ml-3 border-l-2 border-borde pl-5">
              {tiempo.map((t) => (
                <li key={t.k} className="relative pb-5 last:pb-0">
                  <span aria-hidden className={`absolute -left-[29px] top-0.5 flex size-[18px] items-center justify-center rounded-full ring-4 ring-fondo ${t.tipo === "venta" ? "bg-estrella" : "bg-base dark:bg-tinta"}`} />
                  <div className="num text-[12px] font-semibold text-tinta-3">{fecha(t.fecha, true)}</div>
                  {t.tipo === "visita" ? (
                    <div className="text-[15px]"><b className="font-semibold">{RESULTADO[t.v.resultado]}</b> <span className="text-tinta-3">({t.v.socio})</span>{t.v.nota && <div className="text-tinta-2">{t.v.nota}</div>}</div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px]">
                      <span><b className="font-semibold">Venta #{t.s.id}</b>: {plural(t.s.uds, "panel", "paneles")} por <b className="num">{euros(t.s.totalCent)}</b></span>
                      {t.s.cobrada ? <span className="text-[13px] text-entra">cobrada</span> : <span className="text-[13px] font-semibold text-sale">pendiente</span>}
                      {!t.s.cobrada && (yo.data?.rol === "admin") && <CobrarVenta id={t.s.id} totalCent={t.s.totalCent} comercio={c.nombre} />}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <Vacio titulo="Sin visitas todavía" accion={<Boton variante="acento" onClick={() => apuntar({ tipo: "visita", comercio: ref })}>Apuntar la primera visita</Boton>} />
          )}
        </Seccion>
        <Seccion titulo="Placas" extra={<button type="button" onClick={() => apuntar({ tipo: "placa", comercio: ref })} className="font-semibold text-tinta-2 hover:text-tinta">Asignar otra</button>}>
          {f.placas?.length ? (
            <Tarjeta className="divide-y divide-borde">
              {f.placas.map((p) => (
                <div key={p.codigo} className="flex items-center gap-3 px-4 py-3">
                  <span className="rounded-md bg-base px-2 py-1 font-mono text-[14px] font-bold tracking-wider text-estrella dark:bg-hundido">{p.codigo}</span>
                  <span className="min-w-0 flex-1 text-[13px] text-tinta-3">{p.ultimoEscaneoAt ? `último escaneo el ${fecha(p.ultimoEscaneoAt.slice(0, 10))}` : "sin escaneos aún"}</span>
                  <span className="num font-bold">{p.escaneos}</span>
                </div>
              ))}
            </Tarjeta>
          ) : (
            <Vacio>Aún no tiene ninguna placa asignada.</Vacio>
          )}
          {!c.resenasUrl && (f.placas?.length ?? 0) > 0 && <p className="mt-2 text-[13px] font-semibold text-sale">Falta su enlace de reseñas: las placas aún no llevan a Google. Ponlo en «Editar datos».</p>}
        </Seccion>
      </div>

      <Hoja abierta={editar} onCerrar={() => setEditar(false)} titulo="Editar datos" descripcion={c.nombre}>
        <EditarDatos c={c} hecho={() => setEditar(false)} />
      </Hoja>
    </div>
  );
}

function Accion({ icono, texto, onClick, acento }: { icono: React.ReactNode; texto: string; onClick: () => void; acento?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`flex min-h-14 items-center justify-center gap-2 rounded-xl text-[15px] font-bold transition active:scale-[0.98] ${acento ? "bg-estrella text-base hover:brightness-95" : "border border-control bg-superficie hover:bg-hundido"}`}>
      {icono} {texto}
    </button>
  );
}

const CAMPOS = [
  ["nombre", "Nombre"],
  ["tipo", "Tipo"],
  ["zona", "Zona"],
  ["direccion", "Dirección"],
  ["contacto", "Contacto"],
  ["maps", "Enlace de Google Maps"],
  ["resenas", "Enlace de reseñas de Google"],
  ["nota", "Nota"],
] as const;

function EditarDatos({ c, hecho }: { c: Comercio; hecho: () => void }) {
  const inicial = { nombre: c.nombre, tipo: c.tipo ?? "", zona: c.zona ?? "", direccion: c.direccion ?? "", contacto: c.contacto ?? "", maps: c.mapsUrl ?? "", resenas: c.resenasUrl ?? "", nota: c.nota ?? "" };
  const [d, setD] = useState(inicial);
  const m = useAccion(() => {
    const cambios = Object.fromEntries(Object.entries(d).filter(([k, v]) => v !== inicial[k as keyof typeof inicial]));
    return api.patch(`/api/comercios/${c.id}`, cambios);
  }, "Datos guardados");
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate(undefined, { onSuccess: hecho });
      }}
    >
      {CAMPOS.map(([k, t]) => (
        <Campo key={k} etiqueta={t} value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} maxLength={500} autoComplete="off" {...(k === "maps" || k === "resenas" ? { type: "url", inputMode: "url" as const, autoCapitalize: "none", autoCorrect: "off", spellCheck: false } : { type: "text", autoCapitalize: k === "nota" ? "sentences" : "words" })} ayuda={k === "resenas" ? "El de «Pedir reseñas» del perfil de Google (https://g.page/r/…/review). Es adonde llevan sus placas." : undefined} />
      ))}
      {/* Pegado abajo: con el teclado abierto se puede guardar sin bajar hasta el final */}
      <div className="sticky bottom-0 -mx-5 bg-fondo px-5 pb-1 pt-3">
        <Boton type="submit" variante="primario" tamano="lg" className="w-full" cargando={m.isPending} icono={<Storefront size={18} />}>Guardar cambios</Boton>
      </div>
    </form>
  );
}
