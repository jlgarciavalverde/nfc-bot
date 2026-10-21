import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { pct } from "../lib/formato";
import { useAccion } from "../lib/acciones";
import { Boton } from "../ui/Boton";
import { Area, Campo, Interruptor, Opciones } from "../ui/Campos";
import { Datos, Esqueleto, Seccion, Tarjeta, Titulo } from "../ui/Superficies";

interface Ajustes { modoReparto: "igual" | "porcentaje" | "aportado"; comisionBp: number; stockMin: number; bienvenida: string | null; avisosSilenciados: string[] }

export default function AjustesPagina() {
  const q = useQuery({ queryKey: ["ajustes"], queryFn: () => api.get<{ ajustes: Ajustes; tiposAviso: Record<string, string> }>("/api/ajustes") });
  return (
    <>
      <Titulo detalle="Lo que antes se cambiaba con /config en el bot. Cada cambio se avisa en el grupo.">Ajustes</Titulo>
      <Datos q={q} esqueleto={<Esqueleto lineas={4} alto="h-24" />}>{(d) => <Formulario a={d.ajustes} tipos={d.tiposAviso} />}</Datos>
    </>
  );
}

function Formulario({ a, tipos }: { a: Ajustes; tipos: Record<string, string> }) {
  const [d, setD] = useState(a);
  useEffect(() => setD(a), [a]);
  const [comision, setComision] = useState(String(a.comisionBp / 100));
  const guardar = useAccion((cambios: Partial<Ajustes>) => api.put("/api/ajustes", cambios), "Ajustes guardados");
  const sucio = JSON.stringify(d) !== JSON.stringify(a) || Number(comision.replace(",", ".")) * 100 !== a.comisionBp;
  const enviar = () => {
    const bp = Math.round(Number(comision.replace(",", ".")) * 100);
    guardar.mutate({ ...d, comisionBp: Number.isFinite(bp) ? bp : a.comisionBp, bienvenida: d.bienvenida || null });
  };
  return (
    <div className="space-y-8 pb-24">
      <Seccion titulo="Reparto del beneficio">
        <Tarjeta className="space-y-4 p-4 sm:p-5">
          <Opciones
            etiqueta="Cómo se reparte"
            columnas={3}
            valor={d.modoReparto}
            onChange={(v) => setD({ ...d, modoReparto: v })}
            opciones={[
              { valor: "igual", texto: "A partes iguales", detalle: "Todos lo mismo" },
              { valor: "porcentaje", texto: "Porcentaje fijo", detalle: "Se pone en Socios" },
              { valor: "aportado", texto: "Según lo aportado", detalle: "Quien más pone, más se lleva" },
            ]}
          />
          <Campo etiqueta="Comisión para quien vende" inputMode="decimal" value={comision} onChange={(e) => setComision(e.target.value)} sufijo="%" ayuda={`Sale de cada venta cobrada antes de repartir. Ahora: ${pct(a.comisionBp)}.`} />
        </Tarjeta>
      </Seccion>
      <Seccion titulo="Stock">
        <Tarjeta className="p-4 sm:p-5">
          <Campo etiqueta="Avisar cuando queden menos de" type="number" inputMode="numeric" min={0} value={String(d.stockMin)} onChange={(e) => setD({ ...d, stockMin: Math.max(0, Number(e.target.value) || 0) })} sufijo="uds" />
        </Tarjeta>
      </Seccion>
      <Seccion titulo="Avisos automáticos en Telegram">
        <Tarjeta className="divide-y divide-borde px-4">
          {Object.entries(tipos).map(([k, t]) => (
            <Interruptor key={k} etiqueta={t} valor={!d.avisosSilenciados.includes(k)} onChange={(on) => setD({ ...d, avisosSilenciados: on ? d.avisosSilenciados.filter((x) => x !== k) : [...d.avisosSilenciados, k] })} />
          ))}
        </Tarjeta>
      </Seccion>
      <Seccion titulo="Bienvenida al grupo">
        <Tarjeta className="p-4 sm:p-5">
          <Area etiqueta="Texto al entrar alguien" value={d.bienvenida ?? ""} onChange={(e) => setD({ ...d, bienvenida: e.target.value })} placeholder="👋 ¡Bienvenido/a, {nombre}! Aquí llevamos todo el negocio…" maxLength={1000} rows={4} ayuda="{nombre} se cambia por el nombre de quien entra. Vacío: el texto de siempre." />
        </Tarjeta>
      </Seccion>
      <div className={`fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-20 border-t border-borde bg-superficie/95 px-4 py-3 backdrop-blur transition-transform lg:bottom-0 lg:left-[248px] ${sucio ? "translate-y-0" : "pointer-events-none translate-y-[200%]"}`}>
        <div className="mx-auto flex max-w-6xl items-center justify-end gap-2">
          <span className="mr-auto text-[14px] font-semibold">Cambios sin guardar</span>
          <Boton variante="plano" onClick={() => (setD(a), setComision(String(a.comisionBp / 100)))}>Descartar</Boton>
          <Boton variante="acento" cargando={guardar.isPending} onClick={enviar}>Guardar</Boton>
        </div>
      </div>
    </div>
  );
}
