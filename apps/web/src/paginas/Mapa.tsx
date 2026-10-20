import "leaflet/dist/leaflet.css";
import { useQuery } from "@tanstack/react-query";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import { api } from "../lib/api";
import { ESTADOS, ORDEN_ESTADOS, type Comercio, type Estado } from "../lib/tipos";
import { Datos, PuntoEstado, Titulo, Vacio } from "../componentes/ui";

// Mismos colores que los tokens --color-e-* (Leaflet pinta en SVG con colores explícitos)
const COLOR: Record<Estado, string> = { pendiente: "#9a9a92", interesado: "#d29a00", si: "#2f8f4e", no: "#c4382c", cliente: "#161616" };

export default function Mapa() {
  const q = useQuery({ queryKey: ["comercios"], queryFn: () => api.get<{ comercios: Comercio[] }>("/api/comercios").then((r) => r.comercios) });
  return (
    <Datos q={q}>
      {(cs) => {
        const conSitio = cs.filter((c) => c.lat != null && c.lon != null);
        const sinSitio = cs.length - conSitio.length;
        return (
          <>
            <Titulo>Mapa</Titulo>
            <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-tinta-2">
              {ORDEN_ESTADOS.map((e) => <li key={e} className="flex items-center gap-1.5"><PuntoEstado estado={e} />{ESTADOS[e]}</li>)}
            </ul>
            {conSitio.length ? (
              <div className="h-[65dvh] min-h-80 overflow-hidden rounded-md border border-regla">
                <MapContainer bounds={conSitio.map((c) => [c.lat!, c.lon!] as [number, number])} boundsOptions={{ padding: [40, 40], maxZoom: 16 }} className="h-full w-full" scrollWheelZoom>
                  <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  {conSitio.map((c) => (
                    <CircleMarker key={c.id} center={[c.lat!, c.lon!]} radius={8} pathOptions={{ color: "#fff", weight: 2, fillColor: COLOR[c.estado], fillOpacity: 1 }}>
                      <Popup>
                        <b>{c.nombre}</b>
                        <br />
                        {ESTADOS[c.estado]}
                        {c.responsable ? `, lo lleva ${c.responsable}` : ""}
                      </Popup>
                    </CircleMarker>
                  ))}
                </MapContainer>
              </div>
            ) : (
              <Vacio>Aún no hay comercios con ubicación. Desde Telegram, manda al bot una ubicación (📎 → Ubicación) justo después de apuntar la visita.</Vacio>
            )}
            {sinSitio > 0 && conSitio.length > 0 && <p className="mt-2 text-sm text-tinta-3">{sinSitio} comercios no tienen ubicación todavía.</p>}
          </>
        );
      }}
    </Datos>
  );
}
