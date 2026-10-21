import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { cuando } from "../lib/formato";
import { useAccion } from "../lib/acciones";
import { useYo } from "../App";
import { Boton, Datos, Seccion, Titulo } from "../componentes/ui";

interface Sesion { dispositivo: string | null; ultimoUsoAt: string | null; creadoAt: string; actual: boolean }

export function Cuenta() {
  const yo = useYo();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["sesiones"], queryFn: () => api.get<{ sesiones: Sesion[] }>("/api/sesiones").then((r) => r.sesiones) });
  const cerrarOtras = useAccion(() => api.del<{ cerradas: number }>("/api/sesiones"), "Sesiones cerradas en los demás dispositivos");
  const salir = async () => {
    await api.post("/api/salir");
    qc.clear();
    location.href = "/";
  };
  return (
    <>
      <Titulo accion={<Boton onClick={salir}>Cerrar sesión aquí</Boton>}>{yo.data?.nombre}</Titulo>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Seccion titulo="Dónde tienes el panel abierto">
          <Datos q={q}>
            {(ss) => (
              <>
                <ul className="divide-y divide-regla text-sm">
                  {ss.map((s, i) => (
                    <li key={i} className="flex items-baseline gap-3 py-2">
                      <span className="font-medium">{s.dispositivo ?? "Dispositivo"}</span>
                      {s.actual && <span className="text-[13px] text-estrella-texto">este</span>}
                      <span className="ml-auto text-tinta-3">{s.ultimoUsoAt ? `usado ${cuando(s.ultimoUsoAt)}` : `desde ${cuando(s.creadoAt)}`}</span>
                    </li>
                  ))}
                </ul>
                {ss.length > 1 && (
                  <Boton className="mt-3" variante="peligro" disabled={cerrarOtras.isPending} onClick={() => cerrarOtras.mutate(undefined)}>
                    Cerrar en los demás dispositivos
                  </Boton>
                )}
              </>
            )}
          </Datos>
          <p className="mt-3 text-[13px] text-tinta-3">La sesión no caduca mientras la uses (se cierra tras un año sin entrar). Si pierdes el móvil, escribe /panel cerrar al bot.</p>
        </Seccion>
        <Seccion titulo="Tenerlo como app en el móvil">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-tinta-2">
            <li><b className="font-medium text-tinta">iPhone</b>: en Safari, botón Compartir y «Añadir a pantalla de inicio».</li>
            <li><b className="font-medium text-tinta">Android</b>: en Chrome, menú ⋮ e «Instalar aplicación» (o «Añadir a pantalla de inicio»).</li>
            <li>La app instalada pide entrar una vez: escribe /panel al bot y pon el código de 8 cifras que te manda.</li>
          </ul>
        </Seccion>
      </div>
    </>
  );
}
