import { useQuery, type QueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { api } from "./api";
import type { Comercio, Ficha, Movimiento, Producto, Reparto, Resumen, Socio, Stock, Venta } from "./tipos";

/** Todas las consultas del panel en un sitio: misma clave en todas partes y precarga al pasar por un enlace. */
export const Q = {
  yo: { queryKey: ["yo"], queryFn: () => api.get<{ socio: Socio }>("/api/yo").then((r) => r.socio) },
  resumen: { queryKey: ["resumen"], queryFn: () => api.get<Resumen>("/api/resumen") },
  comercios: { queryKey: ["comercios"], queryFn: () => api.get<{ comercios: Comercio[] }>("/api/comercios").then((r) => r.comercios) },
  ficha: (id: number) => ({ queryKey: ["comercio", id], queryFn: () => api.get<Ficha>(`/api/comercios/${id}`) }),
  ventas: { queryKey: ["ventas"], queryFn: () => api.get<{ ventas: Venta[] }>("/api/ventas").then((r) => r.ventas) },
  movimientos: { queryKey: ["movimientos"], queryFn: () => api.get<{ movimientos: Movimiento[] }>("/api/movimientos").then((r) => r.movimientos) },
  stock: { queryKey: ["stock"], queryFn: () => api.get<Stock>("/api/stock") },
  reparto: { queryKey: ["reparto"], queryFn: () => api.get<Reparto>("/api/reparto") },
  precios: { queryKey: ["precios"], queryFn: () => api.get<{ productos: Producto[] }>("/api/precios").then((r) => r.productos) },
};

const POR_RUTA: Record<string, (keyof typeof Q)[]> = {
  "/": ["resumen", "ventas"],
  "/comercios": ["comercios"],
  "/caja": ["resumen", "movimientos", "reparto"],
  "/ventas": ["ventas"],
  "/stock": ["stock"],
  "/precios": ["precios"],
};

export function precargar(qc: QueryClient, href: string) {
  for (const k of POR_RUTA[href] ?? []) {
    const q = Q[k];
    if (typeof q === "object" && "queryKey" in q) void qc.prefetchQuery({ ...q, staleTime: 15_000 } as never);
  }
}

export function useYo() {
  const [ruta] = useLocation();
  return useQuery({ ...Q.yo, staleTime: 300_000, enabled: ruta !== "/entrar" });
}
export const useResumen = () => useQuery(Q.resumen);
export const useComercios = () => useQuery(Q.comercios);
export const useFicha = (id: number) => useQuery(Q.ficha(id));
export const useVentas = () => useQuery(Q.ventas);
export const useMovimientos = () => useQuery(Q.movimientos);
export const useStock = () => useQuery(Q.stock);
export const useReparto = () => useQuery(Q.reparto);
export const usePrecios = () => useQuery(Q.precios);
