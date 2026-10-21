/**
 * Web NFC (Chrome en Android, HTTPS): grabar la URL de una placa en su pegatina, leerla para comprobar y bloquearla.
 * En iPhone y en el ordenador no existe: la web lo detecta y ofrece copiar la URL para grabarla con NFC Tools.
 */

interface NDEFRecord {
  recordType: string;
  data?: DataView;
}
interface NDEFReadingEvent extends Event {
  serialNumber: string;
  message: { records: NDEFRecord[] };
}
interface NDEFReaderLike extends EventTarget {
  scan(o?: { signal?: AbortSignal }): Promise<void>;
  write(m: { records: { recordType: string; data: string }[] }, o?: { signal?: AbortSignal; overwrite?: boolean }): Promise<void>;
  makeReadOnly(o?: { signal?: AbortSignal }): Promise<void>;
}
declare global {
  interface Window {
    NDEFReader?: new () => NDEFReaderLike;
    BarcodeDetector?: new (o: { formats: string[] }) => { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> };
  }
}

export const hayNfc = () => typeof window !== "undefined" && "NDEFReader" in window && window.isSecureContext;
export const hayLectorQr = () => typeof window !== "undefined" && "BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia;

/** Mensajes de error de Web NFC en español (los nombres de error del navegador no son para el usuario). */
export function errorNfc(e: unknown): string {
  const n = (e as { name?: string })?.name;
  if (n === "NotAllowedError") return "Has denegado el permiso de NFC. Actívalo para esta web en los ajustes del navegador.";
  if (n === "NotSupportedError") return "Este móvil no tiene NFC o lo tiene desactivado. Actívalo en Ajustes → Conexiones → NFC.";
  if (n === "NotReadableError") return "No se ha podido leer la pegatina. Vuelve a acercarla, sin moverla.";
  if (n === "NetworkError") return "La pegatina se ha alejado antes de terminar. Mantén el móvil quieto encima un segundo.";
  if (n === "AbortError") return "Cancelado.";
  if (n === "InvalidStateError") return "Hay otra operación de NFC en marcha. Espera un momento.";
  return "No se ha podido usar el NFC. Prueba otra vez.";
}

function urlDe(ev: NDEFReadingEvent): string | null {
  for (const r of ev.message.records) {
    if ((r.recordType === "url" || r.recordType === "absolute-url") && r.data) return new TextDecoder().decode(r.data);
  }
  return null;
}

/** Espera a que acerquen una pegatina y devuelve la URL que lleva (o null si está vacía). */
export async function leerPegatina(signal?: AbortSignal): Promise<{ url: string | null; serie: string }> {
  const r = new window.NDEFReader!();
  await r.scan({ signal });
  return new Promise((ok, mal) => {
    const fuera = () => mal(Object.assign(new Error("cancelado"), { name: "AbortError" }));
    signal?.addEventListener("abort", fuera, { once: true });
    r.addEventListener("readingerror", () => mal(Object.assign(new Error("lectura"), { name: "NotReadableError" })), { once: true });
    r.addEventListener("reading", (e) => ok({ url: urlDe(e as NDEFReadingEvent), serie: (e as NDEFReadingEvent).serialNumber }), { once: true });
  });
}

/** Graba la URL en la pegatina que acerquen (sobrescribe lo que tuviera). */
export async function grabarPegatina(url: string, signal?: AbortSignal) {
  const r = new window.NDEFReader!();
  await r.write({ records: [{ recordType: "url", data: url }] }, { signal, overwrite: true });
}

/** Bloquea la pegatina para siempre (nadie podrá cambiar su URL). No se puede deshacer. */
export async function bloquearPegatina(signal?: AbortSignal) {
  const r = new window.NDEFReader!();
  await r.makeReadOnly({ signal });
}

/** Saca el código de placa de una URL /r/<código> (o /R/…). */
export function codigoDeUrl(url: string | null): string | null {
  const m = url ? /\/r\/([A-Za-z0-9-]{4,8})\/?$/i.exec(url.trim()) : null;
  return m ? m[1]!.toUpperCase() : null;
}

/**
 * Lee un QR con la cámara (BarcodeDetector). `video` debe estar en el DOM; devuelve el texto del primer QR.
 * Para la cámara al terminar o al cancelar.
 */
export async function leerQr(video: HTMLVideoElement, signal: AbortSignal): Promise<string> {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
  video.srcObject = stream;
  await video.play();
  const det = new window.BarcodeDetector!({ formats: ["qr_code"] });
  try {
    while (!signal.aborted) {
      const [r] = await det.detect(video).catch(() => []);
      if (r?.rawValue) return r.rawValue;
      await new Promise((ok) => setTimeout(ok, 180));
    }
    throw Object.assign(new Error("cancelado"), { name: "AbortError" });
  } finally {
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  }
}

/** Mismo cálculo que el servidor y generar_lote.py: valida el carácter de control mientras se escribe. */
const ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export function codigoValido(texto: string): string | null {
  const c = texto.toUpperCase().replace(/[\s-]/g, "");
  if (!/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/.test(c)) return null;
  let s = 0;
  for (let i = 0; i < 4; i++) s += (i + 1) * ALFABETO.indexOf(c[i]!);
  return ALFABETO[s % ALFABETO.length] === c[4] ? c : null;
}
