import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Crown } from "@phosphor-icons/react";
import { api } from "../lib/api";
import { fecha, pct } from "../lib/formato";
import { useAccion } from "../lib/acciones";
import { useYo } from "../lib/consultas";
import { Boton } from "../ui/Boton";
import { Confirmar } from "../ui/Hoja";
import { Datos, Esqueleto, Tarjeta, Titulo } from "../ui/Superficies";

interface S { id: number; nombre: string; rol: "admin" | "socio"; username?: string | null; pctReparto: number; desde: string }

export default function Socios() {
  const q = useQuery({ queryKey: ["socios"], queryFn: () => api.get<{ socios: S[] }>("/api/socios").then((r) => r.socios) });
  const yo = useYo();
  const [baja, setBaja] = useState<S | null>(null);
  const cambiar = useAccion(({ id, cambios }: { id: number; cambios: object; texto: string }) => api.patch(`/api/socios/${id}`, cambios), (x) => x.texto);
  return (
    <>
      <Titulo detalle="Para entrar, la persona pulsa «Quiero ser socio» en el grupo de Telegram y un admin la aprueba.">Socios</Titulo>
      <Datos q={q} esqueleto={<Esqueleto lineas={3} />}>
        {(ss) => (
          <Tarjeta className="divide-y divide-borde">
            {ss.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5">
                <span aria-hidden className="flex size-10 items-center justify-center rounded-full bg-base text-[15px] font-bold text-estrella dark:bg-hundido">{s.nombre.charAt(0).toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 font-semibold">{s.nombre}{s.rol === "admin" && <Crown size={15} weight="fill" className="text-estrella" aria-label="admin" />}</span>
                  <span className="block text-[13px] text-tinta-3">{s.username ? `@${s.username}, ` : ""}desde el {fecha(s.desde.slice(0, 10), true)}{s.pctReparto ? `, ${pct(s.pctReparto)} del reparto` : ""}</span>
                </span>
                {s.id !== yo.data?.id && (
                  <span className="flex gap-1.5">
                    <Boton tamano="sm" onClick={() => cambiar.mutate({ id: s.id, cambios: { rol: s.rol === "admin" ? "socio" : "admin" }, texto: `${s.nombre} ahora es ${s.rol === "admin" ? "socio" : "admin"}` })}>{s.rol === "admin" ? "Quitar admin" : "Hacer admin"}</Boton>
                    <Boton tamano="sm" variante="peligro" onClick={() => setBaja(s)}>Dar de baja</Boton>
                  </span>
                )}
              </div>
            ))}
          </Tarjeta>
        )}
      </Datos>
      <Confirmar
        abierta={!!baja}
        onCerrar={() => setBaja(null)}
        titulo={`¿Dar de baja a ${baja?.nombre}?`}
        texto="Deja de ser socio: el bot no le responde y se cierran sus sesiones del panel. Todo lo que apuntó se conserva."
        accion="Dar de baja"
        peligro
        onConfirmar={() => baja && cambiar.mutate({ id: baja.id, cambios: { activo: false }, texto: `${baja.nombre} ya no es socio` })}
      />
    </>
  );
}
