import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import { Link } from "wouter";
import { ESTADOS, type Comercio, type Estado } from "../lib/tipos";

// Mismos colores que los tokens --color-e-* (Leaflet pinta en SVG con colores explícitos)
const COLOR: Record<Estado, string> = { pendiente: "#8f8a80", interesado: "#c98f00", si: "#2b8552", no: "#c0392b", cliente: "#141414" };

export default function MapaComercios({ comercios }: { comercios: Comercio[] }) {
  const con = comercios.filter((c) => c.lat != null && c.lon != null);
  if (!con.length) return <p className="rounded-[var(--radius-placa)] border border-dashed border-borde-fuerte p-6 text-center text-tinta-3">Ningún comercio de la lista tiene ubicación. Al apuntar uno nuevo, toca «Usar mi ubicación»; o desde Telegram, manda al bot tu ubicación tras la visita.</p>;
  return (
    <div className="h-[62dvh] min-h-80 overflow-hidden rounded-[var(--radius-placa)] border border-borde">
      <MapContainer bounds={con.map((c) => [c.lat!, c.lon!] as [number, number])} boundsOptions={{ padding: [40, 40], maxZoom: 16 }} className="h-full w-full" scrollWheelZoom>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {con.map((c) => (
          <CircleMarker key={c.id} center={[c.lat!, c.lon!]} radius={c.estado === "cliente" ? 10 : 8} pathOptions={{ color: c.estado === "cliente" ? "#f2b01e" : "#fff", weight: c.estado === "cliente" ? 3 : 2, fillColor: COLOR[c.estado], fillOpacity: 1 }}>
            <Popup>
              <Link href={`/comercios/${c.id}`} className="font-semibold">{c.nombre}</Link>
              <br />
              {ESTADOS[c.estado]}
              {c.responsable ? `, lo lleva ${c.responsable}` : ""}
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
