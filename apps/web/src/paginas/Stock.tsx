import { euros, fecha } from "../lib/formato";
import { useStock } from "../lib/consultas";
import { useApuntar } from "../apuntar/Apuntar";
import { Boton } from "../ui/Boton";
import { Cifra, Datos, Esqueleto, Seccion, Tarjeta, TarjetaPlaca, Titulo, Vacio } from "../ui/Superficies";

export default function Stock() {
  const q = useStock();
  const apuntar = useApuntar();
  return (
    <>
      <Titulo accion={<Boton variante="primario" onClick={() => apuntar({ tipo: "compra" })}>Apuntar compra</Boton>}>Stock</Titulo>
      <Datos q={q} esqueleto={<Esqueleto lineas={3} />}>
        {({ stock, lotes }) => (
          <div className="space-y-7">
            {stock.length ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {stock.map((s) => (
                  <TarjetaPlaca key={s.productoId}>
                    <Cifra grande etiqueta={s.producto} valor={`${s.uds} uds`} nota={`valor ${euros(s.valorCent)}${s.uds ? `, ${euros(Math.round(s.valorCent / s.uds))}/ud` : ""}`} />
                    <div className="mt-3 h-2 rounded-full bg-hundido"><div className="h-full rounded-full bg-estrella" style={{ width: `${s.comprados ? Math.max(3, (s.uds / s.comprados) * 100) : 0}%` }} /></div>
                    <p className="num mt-1 text-[12px] text-tinta-3">{s.uds} de {s.comprados} comprados</p>
                  </TarjetaPlaca>
                ))}
              </div>
            ) : (
              <Vacio titulo="Aún no se lleva stock" accion={<Boton variante="acento" onClick={() => apuntar({ tipo: "compra" })}>Apuntar la primera compra</Boton>}>Empieza a contar al apuntar una compra de paneles. Las ventas gastan primero los más antiguos.</Vacio>
            )}
            {lotes.length > 0 && (
              <Seccion titulo="Compras">
                <Tarjeta className="divide-y divide-borde">
                  {lotes.map((l) => (
                    <div key={l.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{l.uds} × {l.producto}{l.proveedor ? `, ${l.proveedor}` : ""}</span>
                        <span className="num block text-[13px] text-tinta-3">{fecha(l.fecha, true)}, {euros(l.costeCent)} ({euros(Math.round(l.costeCent / l.uds))}/ud)</span>
                      </span>
                      <span className={`num text-right text-[14px] ${l.udsRestantes ? "font-bold" : "text-tinta-3"}`}>{l.udsRestantes ? `quedan ${l.udsRestantes}` : "agotado"}</span>
                    </div>
                  ))}
                </Tarjeta>
              </Seccion>
            )}
          </div>
        )}
      </Datos>
    </>
  );
}
