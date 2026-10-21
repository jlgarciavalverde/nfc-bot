import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle, Copy, ContactlessPayment as Nfc, QrCode, LockSimple, WarningCircle, ArrowSquareOut } from "@phosphor-icons/react";
import { api } from "../lib/api";
import { useAccion, useAviso } from "../lib/acciones";
import { useComercios } from "../lib/consultas";
import { bloquearPegatina, codigoDeUrl, codigoValido, errorNfc, grabarPegatina, hayLectorQr, hayNfc, leerPegatina, leerQr } from "../lib/nfc";
import { Boton } from "../ui/Boton";
import { Campo } from "../ui/Campos";
import { Confirmar } from "../ui/Hoja";
import { Pasos, useBorrador } from "../ui/Pasos";
import { ElegirComercio, idComercio, nombreEleccion, Resumen, type Eleccion } from "./Comun";

interface InfoPlaca {
  codigo: string;
  placa: { comercioId: number | null; escaneos: number } | null;
  comercio: string | null;
  resenasUrl: string | null;
  urlNfc: string;
}

/** Enlace de reseñas aceptado: el de «Pedir reseñas» del perfil (g.page/r/…/review) o el de writereview con Place ID. */
export function enlaceResenas(texto: string): { url: string | null; error: string | null } {
  const t = texto.trim();
  if (!t) return { url: null, error: null };
  // Solo el ID de sitio (ChIJ…): se construye el enlace
  if (/^ChIJ[\w-]{10,}$/.test(t)) return { url: `https://search.google.com/local/writereview?placeid=${t}`, error: null };
  if (!/^https:\/\//.test(t)) return { url: null, error: "Tiene que empezar por https:// (o pega solo el ID que empieza por ChIJ)." };
  if (/^https:\/\/g\.page\/r\/[\w-]+\/review\/?$/.test(t)) return { url: t, error: null };
  if (/^https:\/\/search\.google\.com\/local\/writereview\?placeid=[\w-]+$/.test(t)) return { url: t, error: null };
  if (/maps\.app\.goo\.gl|google\.[a-z.]+\/maps/.test(t)) return { url: null, error: "Ese es el enlace del mapa, no el de reseñas. Sigue los pasos de abajo para sacar el de «escribir una reseña»." };
  return { url: t, error: null };
}

export function AsistentePlaca({ comercio, codigo: codigoInicial, hecho }: { comercio?: { id: number; nombre: string }; codigo?: string; hecho: () => void }) {
  const avisar = useAviso();
  const comercios = useComercios();
  const [d, poner, limpiar, borrador] = useBorrador<{ codigo: string; comercio: Eleccion | null; resenas: string; grabada: boolean; bloqueada: boolean }>(`placa:${comercio?.id ?? ""}:${codigoInicial ?? ""}`, {
    codigo: codigoInicial ?? "",
    comercio: comercio ?? null,
    resenas: "",
    grabada: false,
    bloqueada: false,
  });
  const codigo = codigoValido(d.codigo);
  const info = useQuery({ queryKey: ["placa", codigo], queryFn: () => api.get<InfoPlaca>(`/api/placas/${codigo}`), enabled: !!codigo });
  const elegido = d.comercio && "id" in d.comercio ? comercios.data?.find((c) => c.id === (d.comercio as { id: number }).id) : null;
  const enlace = enlaceResenas(d.resenas || elegido?.resenasUrl || "");
  const m = useAccion(
    async () => {
      const comercioId = await idComercio(d.comercio!);
      return api.post(`/api/placas/${codigo}/asignar`, { comercioId, resenasUrl: enlace.url && enlace.url !== elegido?.resenasUrl ? enlace.url : null });
    },
    `Placa ${codigo} activada para ${nombreEleccion(d.comercio)}`,
    { deshacer: true },
  );
  // Si la placa ya es de un comercio, se propone ese
  useEffect(() => {
    const p = info.data;
    if (p?.placa?.comercioId && p.comercio && !d.comercio) poner({ comercio: { id: p.placa.comercioId, nombre: p.comercio } });
  }, [info.data]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Pasos
      borrador={borrador}
      textoFinal="Activar placa"
      ocupado={m.isPending}
      onTerminar={() =>
        m.mutate(undefined, {
          onSuccess: () => {
            limpiar();
            hecho();
            if (!enlace.url) avisar("Placa activada, pero sin enlace de reseñas: quien la escanee verá «aún no configurado».", "error");
          },
        })
      }
      pasos={[
        {
          titulo: "¿Qué placa?",
          validar: () => (!codigo ? "Escribe el código de la tapa (5 letras y números) o acerca la pegatina." : info.isError ? info.error.message : null),
          contenido: (av) => <PasoCodigo valor={d.codigo} onChange={(c) => poner({ codigo: c })} info={info.data} cargando={info.isFetching} avanzar={av} />,
        },
        { titulo: "¿Para qué comercio?", omitir: !!comercio, validar: () => (d.comercio ? null : "Elige el comercio."), contenido: (av) => <ElegirComercio valor={d.comercio} onChange={(c) => poner({ comercio: c })} avanzar={av} /> },
        {
          titulo: "Enlace de reseñas de Google",
          validar: () => enlace.error,
          contenido: () => <PasoResenas valor={d.resenas} actual={elegido?.resenasUrl ?? null} onChange={(v) => poner({ resenas: v })} enlace={enlace} nombre={nombreEleccion(d.comercio)} />,
        },
        {
          titulo: "Graba la pegatina",
          contenido: () => <PasoGrabar codigo={codigo!} url={info.data?.urlNfc ?? `${location.origin}/r/${codigo}`} grabada={d.grabada} bloqueada={d.bloqueada} onGrabada={(b) => poner({ grabada: true, bloqueada: b })} />,
        },
        {
          titulo: "Todo listo",
          contenido: () => (
            <Resumen
              filas={[
                ["Placa", <span className="font-mono">{codigo}</span>],
                ["Comercio", nombreEleccion(d.comercio)],
                ["Reseñas", enlace.url ? "Enlace puesto" : <span className="text-sale">Sin enlace</span>],
                ["Pegatina", d.bloqueada ? "Grabada y bloqueada" : d.grabada ? "Grabada" : "Sin comprobar"],
              ]}
            />
          ),
        },
      ]}
    />
  );
}

function PasoCodigo({ valor, onChange, info, cargando, avanzar }: { valor: string; onChange: (c: string) => void; info?: InfoPlaca; cargando: boolean; avanzar: () => void }) {
  const [estado, setEstado] = useState<string | null>(null);
  const [camara, setCamara] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const corte = useRef<AbortController | null>(null);
  useEffect(() => () => corte.current?.abort(), []);
  const cod = codigoValido(valor);
  const escrito = valor.replace(/[\s-]/g, "");

  const conCodigo = (url: string | null) => {
    const c = codigoDeUrl(url);
    if (!c) return setEstado(url ? "Esa pegatina o QR no es de una de nuestras placas." : "La pegatina está vacía: escribe el código de la tapa.");
    setEstado(null);
    onChange(c);
    avanzar();
  };
  const tocar = async () => {
    corte.current?.abort();
    corte.current = new AbortController();
    setEstado("Acerca la pegatina a la parte de atrás del móvil…");
    try {
      const r = await leerPegatina(corte.current.signal);
      conCodigo(r.url);
    } catch (e) {
      setEstado(errorNfc(e));
    }
  };
  const escanear = async () => {
    corte.current?.abort();
    corte.current = new AbortController();
    setCamara(true);
    try {
      await new Promise((r) => setTimeout(r, 50));
      conCodigo(await leerQr(video.current!, corte.current.signal));
    } catch (e) {
      if ((e as { name?: string }).name !== "AbortError") setEstado("No se ha podido usar la cámara. Escribe el código de la tapa.");
    } finally {
      setCamara(false);
    }
  };

  return (
    <div className="space-y-4">
      {(hayNfc() || hayLectorQr()) && (
        <div className="grid grid-cols-2 gap-2">
          {hayNfc() && (
            <button type="button" onClick={tocar} className="tarjeta-placa flex flex-col items-start gap-2 p-4 text-left font-semibold">
              <Nfc size={26} weight="bold" className="text-estrella-texto" /> Acercar la pegatina
            </button>
          )}
          {hayLectorQr() && (
            <button type="button" onClick={escanear} className="tarjeta-placa flex flex-col items-start gap-2 p-4 text-left font-semibold">
              <QrCode size={26} weight="bold" className="text-estrella-texto" /> Escanear el QR
            </button>
          )}
        </div>
      )}
      {camara && (
        <div className="relative overflow-hidden rounded-[var(--radius-placa)] bg-base">
          <video ref={video} playsInline muted className="aspect-square w-full object-cover" aria-label="Cámara" />
          <div aria-hidden className="pointer-events-none absolute inset-[18%] rounded-2xl border-2 border-estrella" />
          <Boton className="absolute bottom-3 left-1/2 -translate-x-1/2" onClick={() => corte.current?.abort()}>Cancelar</Boton>
        </div>
      )}
      {estado && <p className="rounded-lg bg-hundido px-3 py-2 text-[14px]" role="status">{estado}</p>}
      <Campo
        etiqueta="Código de la tapa"
        value={valor}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        placeholder="K7M2Q"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={7}
        className="!font-mono !text-[24px] tracking-[0.25em] uppercase"
        error={escrito.length >= 5 && !cod ? "Ese código no existe: revisa las letras (no hay 0, O, 1, I ni L)." : null}
        ayuda="Está grabado en la tapa redonda de detrás de la placa."
      />
      {cod && (
        <div className="flex items-center gap-2 text-[14px]" aria-live="polite">
          {cargando ? (
            <span className="text-tinta-3">Comprobando…</span>
          ) : info?.comercio ? (
            <><WarningCircle size={18} className="text-estrella-texto" /> Esta placa ya es de <b>{info.comercio}</b> ({info.placa?.escaneos ?? 0} escaneos). Si sigues, la cambias de comercio.</>
          ) : info ? (
            <><CheckCircle size={18} weight="fill" className="text-entra" /> Placa libre, lista para activar.</>
          ) : null}
        </div>
      )}
    </div>
  );
}

function PasoResenas({ valor, actual, onChange, enlace, nombre }: { valor: string; actual: string | null; onChange: (v: string) => void; enlace: { url: string | null; error: string | null }; nombre: string }) {
  return (
    <div className="space-y-4">
      {actual && !valor && (
        <div className="tarjeta-placa p-4 text-[14px]">
          <p className="font-semibold">{nombre} ya tiene enlace de reseñas</p>
          <p className="mt-1 break-all text-tinta-3">{actual}</p>
          <p className="mt-2 text-tinta-2">Sigue sin cambiar nada, o pega otro abajo para sustituirlo.</p>
        </div>
      )}
      <Campo etiqueta="Enlace o ID del sitio" placeholder="https://g.page/r/…/review o ChIJ…" value={valor} onChange={(e) => onChange(e.target.value)} error={enlace.error} inputMode="url" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      {enlace.url && !enlace.error && valor && (
        <a href={enlace.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 text-[14px] font-semibold underline underline-offset-2">
          Probar el enlace <ArrowSquareOut size={15} />
        </a>
      )}
      <details className="rounded-[var(--radius-placa)] border border-borde bg-superficie p-4 text-[14px] [&[open]>summary]:mb-3">
        <summary className="cursor-pointer font-semibold">¿Cómo saco el enlace?</summary>
        <p className="mb-2 font-semibold">Si el dueño está delante (lo mejor)</p>
        <ol className="mb-4 list-decimal space-y-1 pl-5 text-tinta-2">
          <li>En su móvil, que abra Google Maps y toque su negocio (o busque «Mi negocio» en Google).</li>
          <li>«Pedir reseñas» y después «Compartir» o «Copiar enlace».</li>
          <li>Que te lo mande por WhatsApp y pégalo aquí. Empieza por <code className="font-mono">https://g.page/r/</code>.</li>
        </ol>
        <p className="mb-2 font-semibold">Sin el dueño</p>
        <ol className="list-decimal space-y-1 pl-5 text-tinta-2">
          <li>
            Abre el{" "}
            <a className="font-semibold underline" href="https://developers.google.com/maps/documentation/places/web-service/place-id" target="_blank" rel="noreferrer noopener">
              buscador de ID de sitios de Google
            </a>
            .
          </li>
          <li>Escribe el nombre del comercio en el mapa y elígelo.</li>
          <li>Copia el «Place ID» (empieza por <code className="font-mono">ChIJ</code>) y pégalo aquí: el enlace se crea solo.</li>
        </ol>
      </details>
      <p className="text-[13px] text-tinta-3">Puedes seguir sin enlace y ponerlo después: mientras tanto, quien escanee verá «aún no configurado».</p>
    </div>
  );
}

function PasoGrabar({ codigo, url, grabada, bloqueada, onGrabada }: { codigo: string; url: string; grabada: boolean; bloqueada: boolean; onGrabada: (bloqueada: boolean) => void }) {
  const avisar = useAviso();
  const [estado, setEstado] = useState<{ t: string; tono: "info" | "ok" | "error" } | null>(null);
  const [bloquear, setBloquear] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const corte = useRef<AbortController | null>(null);
  useEffect(() => () => corte.current?.abort(), []);
  const apuntar = useAccion((b: boolean) => api.post(`/api/placas/${codigo}/nfc`, { bloqueada: b }), (b) => (b ? "Pegatina grabada y bloqueada" : "Pegatina grabada y comprobada"));

  const grabar = async (conBloqueo: boolean) => {
    corte.current?.abort();
    corte.current = new AbortController();
    const s = corte.current.signal;
    try {
      setEstado({ t: "Acerca la pegatina a la parte de atrás del móvil y no la muevas…", tono: "info" });
      await grabarPegatina(url, s);
      setEstado({ t: "Grabada. Ahora la leo para comprobarla: vuelve a acercarla…", tono: "info" });
      const r = await leerPegatina(s);
      if (r.url !== url) throw Object.assign(new Error("distinta"), { name: "Distinta" });
      if (conBloqueo) {
        setEstado({ t: "Comprobada. Bloqueándola: mantenla un momento más…", tono: "info" });
        await bloquearPegatina(s);
      }
      setEstado({ t: conBloqueo ? "Pegatina grabada, comprobada y bloqueada." : "Pegatina grabada y comprobada.", tono: "ok" });
      onGrabada(conBloqueo);
      apuntar.mutate(conBloqueo);
    } catch (e) {
      const n = (e as { name?: string }).name;
      setEstado({ t: n === "Distinta" ? "Al leerla sale otra dirección: puede que sea otra pegatina o que esté bloqueada. Prueba otra vez." : errorNfc(e), tono: "error" });
    }
  };

  if (!hayNfc()) {
    return (
      <div className="space-y-4 text-[14px]">
        <p className="text-tinta-2">Este navegador no puede grabar NFC (solo Chrome en Android). Grábala con la app <b>NFC Tools</b>: en «Escribir», «Añadir registro» y «URL», pega esta dirección:</p>
        <div className="flex items-center gap-2 rounded-[12px] border border-borde bg-superficie p-3">
          <code className="min-w-0 flex-1 break-all font-mono text-[13px]">{url}</code>
          <Boton tamano="sm" icono={<Copy size={16} />} onClick={() => navigator.clipboard?.writeText(url).then(() => avisar("Dirección copiada"))}>Copiar</Boton>
        </div>
        <p className="text-tinta-3">Si ya está grabada, sigue.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-[14px] text-tinta-2">Se graba la dirección de la placa <b className="font-mono">{codigo}</b> (no la de Google): así podéis cambiar el comercio o su enlace sin volver a grabarla.</p>
      <label className="flex items-start gap-3 rounded-[12px] border border-borde bg-superficie p-3 text-[14px]">
        <input type="checkbox" checked={bloquear} onChange={(e) => setBloquear(e.target.checked)} className="mt-0.5 size-5 accent-[var(--color-base)]" />
        <span>
          <span className="flex items-center gap-1.5 font-semibold"><LockSimple size={16} /> Bloquear la pegatina</span>
          <span className="text-tinta-3">Nadie podrá cambiarla (ni con una app). Recomendado para placas que se quedan en un comercio. No se puede deshacer.</span>
        </span>
      </label>
      <Boton variante="primario" tamano="lg" className="w-full" icono={<Nfc size={20} weight="bold" />} onClick={() => (bloquear ? setConfirmar(true) : grabar(false))}>
        {grabada ? "Grabar otra vez" : "Grabar pegatina"}
      </Boton>
      {estado && (
        <p role="status" className={`rounded-lg px-3 py-2 text-[14px] font-medium ${estado.tono === "ok" ? "bg-entra/10 text-entra" : estado.tono === "error" ? "bg-sale/10 text-sale" : "bg-hundido"}`}>
          {estado.t}
        </p>
      )}
      {grabada && !estado && <p className="text-[14px] font-medium text-entra">{bloqueada ? "Ya grabada y bloqueada." : "Ya grabada."}</p>}
      <Confirmar
        abierta={confirmar}
        onCerrar={() => setConfirmar(false)}
        titulo="¿Bloquear la pegatina?"
        texto={<>Después de grabarla, nadie podrá cambiarla nunca. Si te equivocas de pegatina, habrá que tirarla.</>}
        accion="Grabar y bloquear"
        peligro
        onConfirmar={() => grabar(true)}
      />
    </div>
  );
}
