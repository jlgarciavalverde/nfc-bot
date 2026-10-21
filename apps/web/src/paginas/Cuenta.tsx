import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DeviceMobile, Desktop, SignOut } from "@phosphor-icons/react";
import { api } from "../lib/api";
import { cuando } from "../lib/formato";
import { useAccion } from "../lib/acciones";
import { useYo } from "../lib/consultas";
import { Boton } from "../ui/Boton";
import { Datos, Esqueleto, Seccion, Tarjeta, Titulo } from "../ui/Superficies";

interface Sesion { dispositivo: string | null; ultimoUsoAt: string | null; creadoAt: string; actual: boolean }

export default function Cuenta() {
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
      <Titulo detalle={yo.data?.rol === "admin" ? "Admin" : "Socio"} accion={<Boton icono={<SignOut size={17} />} onClick={salir}>Cerrar sesión aquí</Boton>}>{yo.data?.nombre}</Titulo>
      <div className="grid grid-cols-1 gap-7 lg:grid-cols-2">
        <Seccion titulo="Dónde tienes el panel abierto">
          <Datos q={q} esqueleto={<Esqueleto lineas={2} />}>
            {(ss) => (
              <>
                <Tarjeta className="divide-y divide-borde">
                  {ss.map((s, i) => {
                    const movil = /iPhone|Android|iPad/.test(s.dispositivo ?? "");
                    return (
                      <div key={i} className="flex items-center gap-3 px-4 py-3">
                        {movil ? <DeviceMobile size={22} className="text-tinta-3" /> : <Desktop size={22} className="text-tinta-3" />}
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold">{s.dispositivo ?? "Dispositivo"}{s.actual && <span className="ml-2 rounded-md bg-estrella px-1.5 py-0.5 text-[11px] font-bold text-base">este</span>}</span>
                          <span className="block text-[13px] text-tinta-3">{s.ultimoUsoAt ? `usado ${cuando(s.ultimoUsoAt)}` : `desde ${cuando(s.creadoAt)}`}</span>
                        </span>
                      </div>
                    );
                  })}
                </Tarjeta>
                {ss.length > 1 && <Boton className="mt-3" variante="peligro" cargando={cerrarOtras.isPending} onClick={() => cerrarOtras.mutate(undefined)}>Cerrar en los demás dispositivos</Boton>}
              </>
            )}
          </Datos>
          <p className="mt-3 text-[13px] text-tinta-3">No caduca mientras la uses (se cierra tras un año sin entrar). Cada inicio de sesión nuevo te llega por Telegram. Si pierdes el móvil, escribe /panel cerrar al bot.</p>
        </Seccion>
        <Seccion titulo="Tenerlo como app">
          <Tarjeta className="space-y-3 p-4 text-[14px] sm:p-5">
            <p><b>iPhone</b>: en Safari, botón Compartir y «Añadir a pantalla de inicio».</p>
            <p><b>Android</b>: en Chrome, menú ⋮ e «Instalar aplicación».</p>
            <p className="text-tinta-3">La app instalada pide entrar una vez: escribe /panel al bot y pon el código de 8 cifras. Para grabar pegatinas NFC desde la app hace falta Android con Chrome.</p>
          </Tarjeta>
        </Seccion>
      </div>
    </>
  );
}
