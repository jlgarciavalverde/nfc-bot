import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { euros, fecha, normalizar } from "../lib/formato";
import { ESTADOS, ORDEN_ESTADOS, type Comercio, type Estado, type Ficha } from "../lib/tipos";
import { Campo, Datos, EtiquetaEstado, Filtro, Hoja, Tabla, Titulo, Vacio } from "../componentes/ui";

const RESULTADO = { si: "Sí", no: "No", luego: "Volver", interesado: "Interesado" } as const;

export function Comercios() {
  const q = useQuery({ queryKey: ["comercios"], queryFn: () => api.get<{ comercios: Comercio[] }>("/api/comercios").then((r) => r.comercios) });
  const [estado, setEstado] = useState<Estado | "todos">("todos");
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState<Comercio | null>(null);
  return (
    <Datos q={q}>
      {(cs) => <Lista cs={cs} estado={estado} setEstado={setEstado} texto={texto} setTexto={setTexto} abrir={setAbierto} abierto={abierto} />}
    </Datos>
  );
}

function Lista({ cs, estado, setEstado, texto, setTexto, abrir, abierto }: {
  cs: Comercio[]; estado: Estado | "todos"; setEstado: (e: Estado | "todos") => void; texto: string; setTexto: (t: string) => void; abrir: (c: Comercio | null) => void; abierto: Comercio | null;
}) {
  const filtrados = useMemo(() => {
    const t = normalizar(texto.trim());
    return cs.filter((c) => (estado === "todos" || c.estado === estado) && (!t || normalizar([c.nombre, c.zona, c.tipo, c.responsable].filter(Boolean).join(" ")).includes(t)));
  }, [cs, estado, texto]);
  const cuenta = (e: Estado) => cs.filter((c) => c.estado === e).length;
  return (
    <>
      <Titulo>Comercios <span className="num font-normal text-tinta-3">{cs.length}</span></Titulo>
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <Filtro
          etiqueta="Estado"
          valor={estado}
          onChange={setEstado}
          opciones={[{ valor: "todos" as const, texto: "Todos" }, ...ORDEN_ESTADOS.map((e) => ({ valor: e, texto: <>{ESTADOS[e]} <span className="num opacity-70">{cuenta(e)}</span></> }))]}
        />
        <div className="md:w-72"><Campo etiqueta="Buscar" type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Nombre, zona, tipo o socio" /></div>
      </div>
      {filtrados.length ? (
        <Tabla etiqueta="Comercios">
          <thead>
            <tr><th>Nombre</th><th>Estado</th><th>Zona</th><th>Tipo</th><th>Lo lleva</th><th>Última visita</th><th>Visitas</th></tr>
          </thead>
          <tbody>
            {filtrados.map((c) => (
              <tr key={c.id} className="hover:bg-papel">
                <td className="min-w-40">
                  <button type="button" className="text-left font-medium underline decoration-regla-2 underline-offset-2 hover:decoration-tinta" onClick={() => abrir(c)}>{c.nombre}</button>
                  {c.estado === "no" && c.motivoNo && <div className="text-[13px] text-tinta-3">{c.motivoNo}</div>}
                </td>
                <td><EtiquetaEstado estado={c.estado} /></td>
                <td>{c.zona ?? "—"}</td>
                <td>{c.tipo ?? "—"}</td>
                <td>{c.responsable ?? "—"}</td>
                <td className="num whitespace-nowrap">{fecha(c.ultimaVisita)}</td>
                <td className="num">{c.visitas}</td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      ) : (
        <Vacio>{cs.length ? "Ningún comercio con ese filtro." : "Aún no hay comercios. Se apuntan desde el bot: /visita Bar Pepe si"}</Vacio>
      )}
      <Hoja abierta={!!abierto} onCerrar={() => abrir(null)} titulo={abierto?.nombre ?? ""}>
        {abierto && <FichaComercio id={abierto.id} />}
      </Hoja>
    </>
  );
}

function FichaComercio({ id }: { id: number }) {
  const q = useQuery({ queryKey: ["comercio", id], queryFn: () => api.get<Ficha>(`/api/comercios/${id}`) });
  return (
    <Datos q={q}>
      {(f) => {
        const c = f.comercio;
        const mapa = c.mapsUrl ?? (c.lat != null ? `https://www.google.com/maps?q=${c.lat},${c.lon}` : null);
        return (
          <div className="space-y-5 text-sm">
            <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-y-1.5">
              <dt className="text-tinta-2">Estado</dt><dd><EtiquetaEstado estado={c.estado} /></dd>
              {[["Tipo", c.tipo], ["Zona", c.zona], ["Dirección", c.direccion], ["Contacto", c.contacto], ["Lo lleva", f.responsable], ["Motivo del no", c.estado === "no" ? c.motivoNo : null], ["Nota", c.nota]].map(
                ([k, v]) => v && (<Fragment key={k}><dt className="text-tinta-2">{k}</dt><dd className="break-words">{v}</dd></Fragment>),
              )}
              {f.recordatorios.length > 0 && (<><dt className="text-tinta-2">Volver el</dt><dd>{f.recordatorios.map((r) => fecha(r.fecha, true)).join(", ")}</dd></>)}
            </dl>
            {mapa && <a href={mapa} target="_blank" rel="noreferrer" className="inline-block underline underline-offset-2">Abrir en Google Maps</a>}
            <div>
              <h3 className="mb-1 font-semibold">Ventas</h3>
              {f.ventas.length ? (
                <ul className="divide-y divide-regla">
                  {f.ventas.map((v) => (
                    <li key={v.id} className="num flex gap-3 py-1.5"><span className="text-tinta-3">#{v.id}</span><span>{fecha(v.fecha, true)}</span><span>{v.uds} uds</span><span className="ml-auto font-medium">{euros(v.totalCent)}</span>{!v.cobrada && <span className="text-sale">pendiente</span>}</li>
                  ))}
                </ul>
              ) : <p className="text-tinta-3">Ninguna.</p>}
            </div>
            <div>
              <h3 className="mb-1 font-semibold">Visitas</h3>
              {f.visitas.length ? (
                <ul className="divide-y divide-regla">
                  {f.visitas.map((v, i) => (
                    <li key={i} className="py-1.5"><span className="num text-tinta-2">{fecha(v.fecha, true)}</span>, {v.socio}: <b className="font-medium">{RESULTADO[v.resultado]}</b>{v.nota && <span className="block text-tinta-2">{v.nota}</span>}</li>
                  ))}
                </ul>
              ) : <p className="text-tinta-3">Ninguna.</p>}
            </div>
          </div>
        );
      }}
    </Datos>
  );
}
