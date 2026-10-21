import { useLayoutEffect, useRef, useState } from "react";
import { euros, fecha, mesLargo } from "../lib/formato";
import { ESTADOS, ORDEN_ESTADOS, type Estado } from "../lib/tipos";
import { PuntoEstado } from "../ui/Superficies";

/** Ancho real del contenedor: los gráficos se dibujan en píxeles para que el texto no escale con la pantalla. */
function useAncho<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [ancho, setAncho] = useState(600);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAncho(Math.max(240, Math.round(e!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, ancho] as const;
}

/** Escala «bonita» para el eje: 1, 2 o 5 × 10ⁿ. */
function techo(max: number) {
  if (max <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 5, 10]) if (m * p >= max) return m * p;
  return 10 * p;
}

/** Barras por semana (importe) con las visitas debajo. Accesible: tabla equivalente para lectores de pantalla. */
export function BarrasSemanas({ datos }: { datos: { semana: string; ventasCent: number; uds: number; visitas: number }[] }) {
  const [activa, setActiva] = useState<number | null>(null);
  const [ref, W] = useAncho<HTMLElement>();
  const max = techo(Math.max(...datos.map((d) => d.ventasCent)));
  const H = 190, base = 150, arriba = 18, ancho = W / datos.length;
  const cada = ancho < 34 ? 3 : ancho < 60 ? 2 : 1;
  const sel = activa != null ? datos[activa] : datos.at(-1);
  return (
    <figure className="w-full min-w-0" ref={ref}>
      <div className="num mb-1 h-5 text-[13px] text-tinta-2" aria-live="polite">
        {sel && (
          <>
            Semana del {fecha(sel.semana)}: <span className="font-semibold text-tinta">{euros(sel.ventasCent)}</span>, {sel.uds} paneles y {sel.visitas} visitas
          </>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" className="block" role="img" aria-label="Ventas por semana" onMouseLeave={() => setActiva(null)}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={0} x2={W} y1={base - f * (base - arriba)} y2={base - f * (base - arriba)} className="stroke-borde" strokeWidth={1} />
            {f > 0 && (
              <text x={W} y={base - f * (base - arriba) - 4} textAnchor="end" className="num fill-tinta-3 text-[11px]">
                {euros(max * f).replace(",00", "")}
              </text>
            )}
          </g>
        ))}
        {datos.map((d, i) => {
          const h = (d.ventasCent / max) * (base - arriba);
          const x = i * ancho;
          const resaltada = activa === i || (activa == null && i === datos.length - 1);
          return (
            <g key={d.semana} onMouseEnter={() => setActiva(i)} onFocus={() => setActiva(i)} tabIndex={-1}>
              <rect x={x} y={0} width={ancho} height={H} fill="transparent" />
              <rect x={x + ancho * 0.2} y={base - h} width={ancho * 0.6} height={Math.max(h, d.ventasCent ? 2 : 0)} rx={2} className={resaltada ? "fill-estrella" : "fill-base dark:fill-tinta-3"} />
              {d.visitas > 0 && (
                <text x={x + ancho / 2} y={base + 15} textAnchor="middle" className="num fill-tinta-3 text-[11px]">
                  {d.visitas}
                </text>
              )}
              {(datos.length - 1 - i) % cada === 0 && (
                <text x={x + ancho / 2} y={H - 4} textAnchor="middle" className="fill-tinta-3 text-[11px]">
                  {fecha(d.semana)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="text-[12px] text-tinta-3">Barras: ventas de cada semana (empieza en lunes). Números pequeños: visitas.</figcaption>
      <table className="sr-only">
        <caption>Ventas y visitas por semana</caption>
        <thead>
          <tr><th>Semana</th><th>Ventas</th><th>Paneles</th><th>Visitas</th></tr>
        </thead>
        <tbody>
          {datos.map((d) => (
            <tr key={d.semana}><td>{fecha(d.semana, true)}</td><td>{euros(d.ventasCent)}</td><td>{d.uds}</td><td>{d.visitas}</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Embudo como una barra apilada con la leyenda debajo. */
export function BarraEmbudo({ total }: { total: Record<Estado, number> }) {
  const suma = ORDEN_ESTADOS.reduce((a, k) => a + total[k], 0);
  const color: Record<Estado, string> = { pendiente: "bg-e-pendiente", interesado: "bg-e-interesado", si: "bg-e-si", no: "bg-e-no", cliente: "bg-e-cliente" };
  return (
    <div>
      <div className="flex h-3 w-full gap-px overflow-hidden rounded-sm bg-hundido" aria-hidden>
        {suma > 0 && ORDEN_ESTADOS.map((k) => total[k] > 0 && <div key={k} className={color[k]} style={{ width: `${(total[k] / suma) * 100}%` }} />)}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        {ORDEN_ESTADOS.map((k) => (
          <li key={k} className="flex items-center gap-2">
            <PuntoEstado estado={k} />
            <span className="text-tinta-2">{ESTADOS[k]}</span>
            <span className="num ml-auto font-semibold">{total[k]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Caja acumulada a fin de cada mes (línea escalonada simple). */
export function LineaCaja({ datos }: { datos: { mes: string; cajaCent: number; ingresosCent: number; gastosCent: number }[] }) {
  const [ref, W] = useAncho<HTMLElement>();
  if (datos.length < 2) return null;
  const H = 160, pad = 22;
  const vals = datos.map((d) => d.cajaCent);
  const min = Math.min(0, ...vals), max = Math.max(...vals, 1);
  const y = (v: number) => pad + (1 - (v - min) / (max - min || 1)) * (H - 2 * pad - 10);
  const x = (i: number) => (i / (datos.length - 1)) * (W - 12) + 6;
  const ruta = datos.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d.cajaCent)}`).join(" ");
  return (
    <figure className="w-full min-w-0" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" className="block" role="img" aria-label="Caja a final de cada mes">
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} className="stroke-borde-fuerte" strokeDasharray="3 3" />
        <path d={ruta} fill="none" className="stroke-tinta" strokeWidth={2} />
        {datos.map((d, i) => (
          <g key={d.mes}>
            <circle cx={x(i)} cy={y(d.cajaCent)} r={3} className="fill-tinta" />
            <text x={x(i)} y={H - 4} textAnchor={i === 0 ? "start" : i === datos.length - 1 ? "end" : "middle"} className="fill-tinta-3 text-[11px]">
              {mesLargo(d.mes).slice(0, 3)}
            </text>
          </g>
        ))}
        <text x={x(datos.length - 1)} y={y(vals.at(-1)!) - 8} textAnchor="end" className="num fill-tinta text-[12px] font-semibold">
          {euros(vals.at(-1)!)}
        </text>
      </svg>
      <table className="sr-only">
        <caption>Caja a final de mes</caption>
        <tbody>
          {datos.map((d) => (
            <tr key={d.mes}><td>{mesLargo(d.mes)}</td><td>{euros(d.cajaCent)}</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
