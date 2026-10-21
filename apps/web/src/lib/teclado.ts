import { useEffect } from "react";

/** Por debajo de esto no es un teclado (barras del navegador que aparecen y desaparecen al hacer scroll). */
const MINIMO = 120;

/**
 * Lo que tapa el teclado. Dos casos:
 * - iOS (y Android sin `interactive-widget`): el layout no cambia y el *visual viewport* encoge → `tapado`.
 * - Android con `interactive-widget=resizes-content`: encoge la ventana entera → `encogido` respecto al alto sin teclado.
 */
export function altoTeclado(v: { alto: number; vvAlto: number; vvArriba: number; altoBase: number; escribiendo: boolean }) {
  const tapado = Math.max(0, Math.round(v.alto - v.vvAlto - v.vvArriba));
  const encogido = Math.max(0, v.altoBase - v.alto);
  return { tapado: tapado >= MINIMO ? tapado : 0, abierto: v.escribiendo && (tapado >= MINIMO || encogido >= MINIMO) };
}

const editable = (el: Element | null): el is HTMLElement =>
  !!el && (el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && !["checkbox", "radio", "button", "submit", "range", "color", "file"].includes(el.type)) || (el as HTMLElement).isContentEditable);

/**
 * Publica en `<html>` lo que hace el teclado del móvil: `--vvh` (alto visible), `--teclado` (lo que tapa por abajo)
 * y `data-teclado` mientras está abierto. Además, al abrirse, centra el campo enfocado si se ha quedado tapado.
 */
export function useTeclado() {
  useEffect(() => {
    const vv = window.visualViewport;
    const raiz = document.documentElement;
    let altoBase = window.innerHeight, ancho = window.innerWidth, abierto = false;
    const medir = () => {
      // Al girar el móvil cambia el ancho: nueva referencia
      if (window.innerWidth !== ancho) (ancho = window.innerWidth), (altoBase = window.innerHeight);
      const escribiendo = editable(document.activeElement);
      if (!escribiendo) altoBase = Math.max(altoBase, window.innerHeight);
      const r = altoTeclado({ alto: window.innerHeight, vvAlto: vv?.height ?? window.innerHeight, vvArriba: vv?.offsetTop ?? 0, altoBase, escribiendo });
      raiz.style.setProperty("--vvh", `${Math.round(vv?.height ?? window.innerHeight)}px`);
      raiz.style.setProperty("--teclado", `${r.tapado}px`);
      if (r.abierto) raiz.dataset.teclado = "";
      else delete raiz.dataset.teclado;
      if (r.abierto && !abierto) requestAnimationFrame(centrar);
      abierto = r.abierto;
    };
    const centrar = () => {
      const el = document.activeElement;
      if (!editable(el)) return;
      const caja = el.getBoundingClientRect();
      const visible = vv ? vv.height + vv.offsetTop : window.innerHeight;
      // Respeta el scroll-padding del contenedor (la barra de botones de los asistentes)
      if (caja.bottom > visible - 80 || caja.top < 0) el.scrollIntoView({ block: "nearest" });
    };
    const alEnfocar = () => setTimeout(() => (medir(), abierto && centrar()), 250);
    medir();
    vv?.addEventListener("resize", medir);
    vv?.addEventListener("scroll", medir);
    window.addEventListener("resize", medir);
    document.addEventListener("focusin", alEnfocar);
    document.addEventListener("focusout", alEnfocar);
    return () => {
      vv?.removeEventListener("resize", medir);
      vv?.removeEventListener("scroll", medir);
      window.removeEventListener("resize", medir);
      document.removeEventListener("focusin", alEnfocar);
      document.removeEventListener("focusout", alEnfocar);
    };
  }, []);
}
