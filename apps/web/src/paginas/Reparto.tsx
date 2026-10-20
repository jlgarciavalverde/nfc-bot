import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { euros, pct } from "../lib/formato";
import type { Reparto as TReparto } from "../lib/tipos";
import { Datos, Tabla, Titulo } from "../componentes/ui";

const MODO: Record<string, string> = { igual: "a partes iguales", porcentaje: "por porcentaje fijo", aportado: "en proporción a lo aportado" };

export function Reparto() {
  const q = useQuery({ queryKey: ["reparto"], queryFn: () => api.get<TReparto>("/api/reparto") });
  return (
    <Datos q={q}>
      {(r) => (
        <>
          <Titulo>Reparto entre socios</Titulo>
          <p className="mb-5 max-w-3xl text-tinta-2">
            Beneficio de <b className="num text-tinta">{euros(r.caja.beneficioCent)}</b>
            {r.comisionBp ? <>, del que sale primero una comisión del {pct(r.comisionBp)} para quien vende cada venta cobrada</> : null}. Se reparten{" "}
            <b className="num text-tinta">{euros(r.repartibleCent)}</b> {MODO[r.modoAplicado]}. El saldo es lo que le tocaría a cada uno si se liquidase hoy; entre todos suman la caja ({euros(r.caja.cajaCent)}).
          </p>
          {r.avisos.map((a) => <p key={a} role="alert" className="mb-3 text-sale">{a}</p>)}
          <Tabla etiqueta="Reparto">
            <thead>
              <tr><th>Socio</th><th className="text-right">Aportado</th><th className="text-right">Comisión</th><th className="text-right">Parte</th><th className="text-right">Peso</th><th className="text-right">Retirado</th><th className="text-right">Saldo</th></tr>
            </thead>
            <tbody className="num whitespace-nowrap">
              {r.lineas.map((l) => (
                <tr key={l.socioId}>
                  <td className="font-medium">{l.nombre}</td>
                  <td className="text-right">{euros(l.aportadoCent)}</td>
                  <td className="text-right">{euros(l.comisionCent)}</td>
                  <td className={`text-right ${l.parteCent < 0 ? "text-sale" : ""}`}>{euros(l.parteCent)}</td>
                  <td className="text-right text-tinta-2">{pct(l.pesoBp)}</td>
                  <td className="text-right">{euros(l.retiradoCent)}</td>
                  <td className="text-right text-[16px] font-semibold">{euros(l.saldoCent)}</td>
                </tr>
              ))}
            </tbody>
          </Tabla>
          <p className="mt-4 text-[13px] text-tinta-3">La regla se cambia desde el bot (admin): /config reparto igual|porcentaje|aportado y /config comision 10%.</p>
        </>
      )}
    </Datos>
  );
}
