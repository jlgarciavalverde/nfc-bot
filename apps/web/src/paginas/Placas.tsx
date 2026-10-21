import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { CaretRight, DownloadSimple, ContactlessPayment as Nfc, Plus, Printer } from "@phosphor-icons/react";
import { api } from "../lib/api";
import { cuando, fecha, plural } from "../lib/formato";
import { useAccion } from "../lib/acciones";
import { useYo } from "../lib/consultas";
import { useApuntar } from "../apuntar/Apuntar";
import { Boton, claseBoton } from "../ui/Boton";
import { Area, Campo, Chips } from "../ui/Campos";
import { Hoja } from "../ui/Hoja";
import { Cifra, Datos, Esqueleto, Seccion, Tarjeta, TarjetaPlaca, Titulo, Vacio } from "../ui/Superficies";

interface Placa {
  codigo: string; tandaId: number | null; comercioId: number | null; comercio: string | null; resenasUrl: string | null; escaneos: number;
  ultimoEscaneoAt: string | null; asignadaAt: string | null; nfcGrabadaAt: string | null; nfcBloqueadaAt: string | null; urlNfc: string;
}
interface Lote { id: number; n: number; nota: string | null; creadoAt: string; creadoPor: string | null; asignadas: number }
type Filtro = "todas" | "activas" | "libres" | "sin_enlace";

export default function Placas() {
  const q = useQuery({ queryKey: ["placas"], queryFn: () => api.get<{ placas: Placa[]; lotes: Lote[] }>("/api/placas") });
  const yo = useYo();
  const apuntar = useApuntar();
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [nuevoLote, setNuevoLote] = useState(false);
  const esAdmin = yo.data?.rol === "admin";
  return (
    <>
      <Titulo
        detalle="Cada placa lleva su código en el QR, en la pegatina y grabado en la tapa."
        accion={
          <>
            {esAdmin && <Boton icono={<Printer size={17} />} onClick={() => setNuevoLote(true)}>Nuevo lote</Boton>}
            <Boton variante="acento" icono={<Nfc size={17} weight="bold" />} onClick={() => apuntar({ tipo: "placa" })}>Activar placa</Boton>
          </>
        }
      >
        Placas
      </Titulo>
      <Datos q={q} esqueleto={<Esqueleto lineas={5} />}>
        {({ placas, lotes }) => <Contenido placas={placas} lotes={lotes} filtro={filtro} setFiltro={setFiltro} esAdmin={esAdmin} />}
      </Datos>
      <Hoja abierta={nuevoLote} onCerrar={() => setNuevoLote(false)} titulo="Nuevo lote de placas" descripcion="Reserva códigos nuevos para imprimir">
        <NuevoLote hecho={() => setNuevoLote(false)} />
      </Hoja>
    </>
  );
}

function Contenido({ placas, lotes, filtro, setFiltro, esAdmin }: { placas: Placa[]; lotes: Lote[]; filtro: Filtro; setFiltro: (f: Filtro) => void; esAdmin: boolean }) {
  const apuntar = useApuntar();
  const activas = placas.filter((p) => p.comercio);
  const libres = placas.filter((p) => !p.comercio);
  const sinEnlace = activas.filter((p) => !p.resenasUrl);
  const escaneos = placas.reduce((a, p) => a + p.escaneos, 0);
  const lista = useMemo(() => (filtro === "activas" ? activas : filtro === "libres" ? libres : filtro === "sin_enlace" ? sinEnlace : placas), [filtro, placas]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="space-y-7">
      <TarjetaPlaca className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Cifra etiqueta="Activas" valor={activas.length} nota="en un comercio" />
        <Cifra etiqueta="Libres" valor={libres.length} nota="impresas sin asignar" />
        <Cifra etiqueta="Escaneos" valor={escaneos} nota="en total" />
        <Cifra etiqueta="Sin enlace" valor={sinEnlace.length} tono={sinEnlace.length ? "sale" : undefined} nota="no llevan a Google" />
      </TarjetaPlaca>
      <div className="space-y-3">
        <Chips etiqueta="Filtro" valor={filtro} onChange={setFiltro} opciones={[{ valor: "todas", texto: `Todas ${placas.length}` }, { valor: "activas", texto: `Activas ${activas.length}` }, { valor: "libres", texto: `Libres ${libres.length}` }, { valor: "sin_enlace", texto: `Sin enlace ${sinEnlace.length}` }]} />
        {lista.length ? (
          <Tarjeta className="divide-y divide-borde">
            {lista.map((p) => (
              <button
                key={p.codigo}
                type="button"
                onClick={() => apuntar({ tipo: "placa", codigo: p.codigo, comercio: p.comercioId ? { id: p.comercioId, nombre: p.comercio! } : undefined })}
                aria-label={`${p.comercio ? "Gestionar" : "Activar"} la placa ${p.codigo}${p.comercio ? ` de ${p.comercio}` : ""}`}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-hundido"
              >
                <span className="shrink-0 rounded-md bg-base px-2 py-1 font-mono text-[15px] font-bold tracking-wider text-estrella dark:bg-hundido">{p.codigo}</span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate font-semibold ${p.comercio ? "" : "text-tinta-3"}`}>{p.comercio ?? "Libre"}</span>
                  <span className="block truncate text-[12px] text-tinta-3">
                    {p.comercio && !p.resenasUrl ? <span className="font-semibold text-sale">sin enlace de reseñas</span> : p.nfcBloqueadaAt ? "pegatina bloqueada" : p.nfcGrabadaAt ? "pegatina comprobada" : "pegatina sin comprobar"}
                    {p.ultimoEscaneoAt ? `, escaneada ${cuando(p.ultimoEscaneoAt)}` : ""}
                  </span>
                </span>
                <span className="num shrink-0 text-right"><span className="block text-[18px] font-bold leading-none">{p.escaneos}</span><span className="text-[11px] text-tinta-3">escaneos</span></span>
                <CaretRight size={16} className="shrink-0 text-tinta-3" aria-hidden />
              </button>
            ))}
          </Tarjeta>
        ) : (
          <Vacio titulo="Ninguna placa aquí">{placas.length ? "Prueba con otro filtro." : "Reserva un lote de códigos para imprimir, o activa una placa con su código."}</Vacio>
        )}
      </div>
      {lotes.length > 0 && (
        <Seccion titulo="Lotes impresos">
          <Tarjeta className="divide-y divide-borde">
            {lotes.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">Lote {l.id}{l.nota ? `: ${l.nota}` : ""}</span>
                  <span className="block text-[13px] text-tinta-3">{fecha(l.creadoAt.slice(0, 10), true)}{l.creadoPor ? `, ${l.creadoPor}` : ""}, {l.asignadas} de {plural(l.n, "placa activa", "placas activas")}</span>
                </span>
                {esAdmin && (
                  <span className="flex gap-1.5">
                    <a href={`/api/lotes/${l.id}/lote.csv`} download className={claseBoton("secundario", "sm")}><DownloadSimple size={15} /> CSV</a>
                    <a href={`/api/lotes/${l.id}/qr.zip`} download className={claseBoton("secundario", "sm")}><DownloadSimple size={15} /> QR</a>
                  </span>
                )}
              </div>
            ))}
          </Tarjeta>
        </Seccion>
      )}
    </div>
  );
}

function NuevoLote({ hecho }: { hecho: () => void }) {
  const [n, setN] = useState("10");
  const [nota, setNota] = useState("");
  const [resultado, setResultado] = useState<{ lote: { id: number }; codigos: string[] } | null>(null);
  const m = useAccion((b: { n: number; nota: string }) => api.post<{ lote: { id: number }; codigos: string[] }>("/api/lotes", b), (b) => `Reservados ${b.n} códigos`);
  if (resultado)
    return (
      <div className="space-y-4">
        <p className="text-[15px]">Lote <b>{resultado.lote.id}</b> con {resultado.codigos.length} códigos reservados. Nadie más los podrá usar.</p>
        <div className="flex flex-wrap gap-1.5">{resultado.codigos.map((c) => <span key={c} className="rounded-md bg-base px-2 py-1 font-mono text-[14px] font-bold tracking-wider text-estrella dark:bg-hundido">{c}</span>)}</div>
        <div className="grid grid-cols-2 gap-2">
          <a href={`/api/lotes/${resultado.lote.id}/lote.csv`} download className={claseBoton("primario", "lg")}><DownloadSimple size={18} /> lote.csv</a>
          <a href={`/api/lotes/${resultado.lote.id}/qr.zip`} download className={claseBoton("secundario", "lg")}><DownloadSimple size={18} /> QR (zip)</a>
        </div>
        <ol className="list-decimal space-y-1 pl-5 text-[14px] text-tinta-2">
          <li>En el Mac: <code className="font-mono text-[13px]">python generar_lote.py --lote lote-{resultado.lote.id}.csv</code> genera las placas y tapas con estos códigos.</li>
          <li>Imprime cada placa con su tapa (mismo código).</li>
          <li>Al instalarla en un comercio: «Activar placa» y graba la pegatina desde el móvil.</li>
        </ol>
        <Boton className="w-full" onClick={hecho}>Hecho</Boton>
      </div>
    );
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate({ n: Number(n), nota }, { onSuccess: (r) => setResultado(r as { lote: { id: number }; codigos: string[] }) });
      }}
    >
      <Campo etiqueta="¿Cuántas placas?" type="number" inputMode="numeric" min={1} max={200} value={n} onChange={(e) => setN(e.target.value)} className="!text-[24px] font-bold" ayuda="De 1 a 200. Los códigos no se repiten nunca." />
      <Area etiqueta="Nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Impresión de octubre, color crema…" maxLength={200} rows={2} />
      <Boton type="submit" variante="acento" tamano="lg" className="w-full" icono={<Plus size={18} weight="bold" />} cargando={m.isPending}>Reservar códigos</Boton>
    </form>
  );
}
