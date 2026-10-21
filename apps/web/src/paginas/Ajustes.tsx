import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ejemploEstilo, TONOS, type Tono } from "@nfc/core/estilo";
import { api } from "../lib/api";
import { pct } from "../lib/formato";
import { useAccion } from "../lib/acciones";
import { Boton } from "../ui/Boton";
import { Area, Campo, Interruptor, Opciones, Selector } from "../ui/Campos";
import { Datos, Esqueleto, Seccion, Tarjeta, Titulo } from "../ui/Superficies";

interface Limpieza { consultasMin: number; apuntesMin: number; erroresMin: number; borrarComandos: boolean; consultasPorPrivado: boolean }
interface Ajustes {
  modoReparto: "igual" | "porcentaje" | "aportado";
  comisionBp: number;
  stockMin: number;
  bienvenida: string | null;
  avisosSilenciados: string[];
  nombreAsistente: string | null;
  tono: Tono;
  emojis: boolean;
  instruccionesIa: string | null;
  limpieza: Limpieza;
}

const PLAZOS = [
  { valor: "0", texto: "Nunca" },
  { valor: "1", texto: "Al minuto" },
  { valor: "10", texto: "A los 10 minutos" },
  { valor: "60", texto: "A la hora" },
  { valor: "1440", texto: "Al día siguiente" },
];
/** Si se puso otro plazo desde el bot (/config limpieza consultas 30), que aparezca en la lista. */
const plazos = (n: number) => (PLAZOS.some((p) => p.valor === String(n)) ? PLAZOS : [...PLAZOS, { valor: String(n), texto: `A los ${n} minutos` }]);

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
    guardar.mutate({ ...d, comisionBp: Number.isFinite(bp) ? bp : a.comisionBp, bienvenida: d.bienvenida || null, nombreAsistente: d.nombreAsistente?.trim() || null, instruccionesIa: d.instruccionesIa?.trim() || null });
  };
  const lim = (cambio: Partial<Limpieza>) => setD({ ...d, limpieza: { ...d.limpieza, ...cambio } });
  const plazo = (k: "consultasMin" | "apuntesMin" | "erroresMin", etiqueta: string, ayuda: string) => (
    <Selector etiqueta={etiqueta} ayuda={ayuda} valor={String(d.limpieza[k])} opciones={plazos(d.limpieza[k])} onChange={(v) => lim({ [k]: Number(v) })} />
  );
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
      <Seccion titulo="Personalidad del asistente">
        <Tarjeta className="space-y-4 p-4 sm:p-5">
          <Campo etiqueta="Cómo se presenta" value={d.nombreAsistente ?? ""} onChange={(e) => setD({ ...d, nombreAsistente: e.target.value })} placeholder="el asistente del negocio" maxLength={40} ayuda="Un nombre o apodo para el bot. Vacío: «el asistente del negocio»." />
          <Opciones etiqueta="Tono" columnas={3} valor={d.tono} onChange={(v) => setD({ ...d, tono: v })} opciones={(Object.keys(TONOS) as Tono[]).map((t) => ({ valor: t, texto: TONOS[t].texto, detalle: TONOS[t].detalle }))} />
          <Interruptor etiqueta="Usar emojis" detalle="Sin emojis, los mensajes quedan más sobrios." valor={d.emojis} onChange={(v) => setD({ ...d, emojis: v })} />
          <Area etiqueta="Notas para la IA" value={d.instruccionesIa ?? ""} onChange={(e) => setD({ ...d, instruccionesIa: e.target.value })} placeholder="Responde en una sola línea. Llámanos «equipo»." maxLength={500} rows={3} ayuda="Cómo quieres que conteste cuando le hablas normal. No cambia lo que puede hacer: lo que apunte lo sigue confirmando con un botón." />
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-tinta-2">Así sonará</p>
            <p data-testid="vista-estilo" className="whitespace-pre-wrap rounded-xl bg-hundido p-3.5 text-[14px] leading-relaxed">{ejemploEstilo(d)}</p>
          </div>
        </Tarjeta>
      </Seccion>
      <Seccion titulo="Limpieza del chat">
        <Tarjeta className="space-y-4 p-4 sm:p-5">
          {plazo("consultasMin", "Respuestas a consultas en el grupo", "/caja, /ventas, /ficha, /precios… Lo útil un rato y luego estorba.")}
          {plazo("apuntesMin", "Confirmaciones de lo apuntado en el grupo", "«Venta #12 apuntada», «Visita a Bar Pepe apuntada»…")}
          {plazo("erroresMin", "Errores y avisos de un momento", "En el grupo y por privado.")}
          <div className="divide-y divide-borde">
            <Interruptor etiqueta="Borrar también el mensaje del socio" detalle="El /caja o «@bot …» se va junto con la respuesta. El bot tiene que ser admin del grupo con permiso para eliminar mensajes." valor={d.limpieza.borrarComandos} onChange={(v) => lim({ borrarComandos: v })} />
            <Interruptor etiqueta="Contestar las consultas por privado" detalle="En el grupo solo queda «Te lo he mandado por privado» un minuto. A quien no haya abierto el chat con el bot se le contesta en el grupo." valor={d.limpieza.consultasPorPrivado} onChange={(v) => lim({ consultasPorPrivado: v })} />
          </div>
          <p className="text-[13px] text-tinta-3">Nunca se borran el resumen de los lunes, los avisos, las bienvenidas ni las ventas anunciadas al grupo. En el grupo, /limpiar borra ya lo pendiente.</p>
        </Tarjeta>
      </Seccion>
      <Seccion titulo="Bienvenida al grupo">
        <Tarjeta className="p-4 sm:p-5">
          <Area etiqueta="Texto al entrar alguien" value={d.bienvenida ?? ""} onChange={(e) => setD({ ...d, bienvenida: e.target.value })} placeholder="👋 ¡Bienvenido/a, {nombre}! Aquí llevamos todo el negocio…" maxLength={1000} rows={4} ayuda="{nombre} se cambia por el nombre de quien entra y {bot} por el del asistente. Vacío: el texto de siempre." />
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
