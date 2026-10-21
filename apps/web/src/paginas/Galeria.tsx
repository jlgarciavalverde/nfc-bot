import { useState } from "react";
import { ContactlessPayment as Nfc, Plus } from "@phosphor-icons/react";
import { Boton } from "../ui/Boton";
import { Campo, Chips, Importe, Interruptor, Opciones } from "../ui/Campos";
import { Cifra, Estrellas, Sello, Seccion, Tarjeta, TarjetaPlaca, Titulo, Vacio } from "../ui/Superficies";
import { ORDEN_ESTADOS } from "../lib/tipos";

/** Todos los componentes en una página: para revisar el diseño (claro/oscuro, móvil/escritorio) y capturarlo. */
export default function Galeria() {
  const [op, setOp] = useState<"a" | "b" | "c">("a");
  const [chip, setChip] = useState("todos");
  const [on, setOn] = useState(true);
  return (
    <div className="space-y-8">
      <Titulo detalle="La marca de la placa: negro de la base, crema de la placa, ámbar de las estrellas, Montserrat.">Galería</Titulo>
      <Seccion titulo="Colores">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {["bg-base", "bg-fondo", "bg-superficie", "bg-hundido", "bg-estrella", "bg-tinta"].map((c) => <div key={c} className={`h-16 rounded-xl border border-borde ${c}`} title={c} />)}
        </div>
      </Seccion>
      <Seccion titulo="Botones">
        <div className="flex flex-wrap gap-2">
          <Boton variante="acento" icono={<Plus size={17} weight="bold" />}>Acento</Boton>
          <Boton variante="primario">Primario</Boton>
          <Boton>Secundario</Boton>
          <Boton variante="plano">Plano</Boton>
          <Boton variante="peligro">Peligro</Boton>
          <Boton cargando>Cargando</Boton>
          <Boton tamano="lg" variante="primario" icono={<Nfc size={18} />}>Grande</Boton>
        </div>
      </Seccion>
      <Seccion titulo="Tarjetas y cifras">
        <div className="grid gap-3 sm:grid-cols-2">
          <TarjetaPlaca><Cifra grande etiqueta="Caja" valor="461,00 €" nota="lo que debería haber" /></TarjetaPlaca>
          <Tarjeta className="p-4"><Cifra etiqueta="Beneficio" valor="81,00 €" tono="entra" /><Estrellas llenas={3.5} tam={18} etiqueta="3,5 estrellas" /></Tarjeta>
        </div>
      </Seccion>
      <Seccion titulo="Estados">
        <div className="flex flex-wrap gap-2">{ORDEN_ESTADOS.map((e) => <Sello key={e} estado={e} />)}</div>
      </Seccion>
      <Seccion titulo="Formularios">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Nombre" placeholder="Bar Pepe" ayuda="Texto de ayuda" />
          <Campo etiqueta="Con error" defaultValue="xx" error="Esto no vale" />
          <Importe etiqueta="Importe" placeholder="0" />
          <Opciones etiqueta="Opciones" valor={op} onChange={setOp} opciones={[{ valor: "a", texto: "Sí", detalle: "Quiere la placa" }, { valor: "b", texto: "No" }, { valor: "c", texto: "Luego" }]} />
          <Chips etiqueta="Fichas" valor={chip} onChange={setChip} opciones={[{ valor: "todos", texto: "Todos" }, { valor: "uno", texto: "Uno" }, { valor: "dos", texto: "Dos" }]} />
          <Interruptor etiqueta="Interruptor" detalle="Con detalle" valor={on} onChange={setOn} />
        </div>
      </Seccion>
      <Seccion titulo="Vacío"><Vacio titulo="Nada por aquí">Texto que explica qué hacer.</Vacio></Seccion>
    </div>
  );
}
