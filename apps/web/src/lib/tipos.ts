export type Estado = "pendiente" | "interesado" | "si" | "no" | "cliente";
export const ESTADOS: Record<Estado, string> = { pendiente: "Por visitar", interesado: "Interesado", si: "Ha dicho sí", no: "Ha dicho no", cliente: "Cliente" };
export const ORDEN_ESTADOS: Estado[] = ["pendiente", "interesado", "si", "no", "cliente"];

export interface Socio { id: number; nombre: string; rol: "admin" | "socio" }
export interface Caja {
  aportadoCent: number; ingresosCent: number; gastosCent: number; retiradoCent: number; beneficioCent: number; cajaCent: number;
  pendienteCobroCent: number; ventas: number; uds: number; facturadoCent: number; margenCent: number; valorStockCent: number;
  gastosPorCategoria: { categoria: string; cent: number }[];
}
export interface Embudo {
  total: Record<Estado, number>; visitados: number; conversionBp: number;
  porSocio: ({ socio: string; visitados: number; conversionBp: number } & Record<Estado, number>)[];
}
export interface Semana { desde: string; hasta: string; visitas: number; ventas: number; uds: number; vendidoCent: number; comerciosNuevos: number; ranking: { socio: string; visitas: number; ventas: number; vendidoCent: number }[] }
export interface Resumen {
  hoy: string;
  caja: Caja;
  embudo: Embudo;
  semana: Semana;
  semanaAnterior?: Semana;
  series: { semana: string; ventasCent: number; uds: number; visitas: number }[];
  mensual: { mes: string; ingresosCent: number; gastosCent: number; cajaCent: number }[];
  pendientes: { id: number; fecha: string; nota: string | null; comercioId: number; comercio: string; zona: string | null; socio: string }[];
}
export interface Comercio {
  id: number; nombre: string; tipo: string | null; zona: string | null; direccion: string | null; contacto: string | null; mapsUrl: string | null;
  nota: string | null; lat: number | null; lon: number | null; estado: Estado; motivoNo: string | null; responsable: string | null;
  ultimaVisita: string | null; visitas: number; resenasUrl?: string | null;
}
export interface Ficha {
  comercio: Comercio;
  visitas: { fecha: string; resultado: "si" | "no" | "luego" | "interesado"; nota: string | null; socio: string }[];
  ventas: { id: number; fecha: string; uds: number; totalCent: number; cobrada: boolean; aplicado: string }[];
  recordatorios: { id: number; fecha: string; nota: string | null }[];
  responsable: string | null;
  placas?: { codigo: string; escaneos: number; ultimoEscaneoAt: string | null }[];
}
export interface Venta {
  id: number; fecha: string; comercio: string; comercioId: number; socio: string; socioId: number; producto: string; uds: number; totalCent: number;
  precioListaCent: number; costeCent: number | null; aplicado: string; cobrada: boolean; metodo: string | null; nota: string | null;
}
export interface Movimiento { id: number; fecha: string; tipo: "aportacion" | "gasto" | "ingreso" | "retirada"; importeCent: number; socio: string; categoria: string | null; nota: string | null; ventaId: number | null }
export interface Stock {
  stock: { productoId: number; producto: string; uds: number; valorCent: number; comprados: number }[];
  lotes: { id: number; fecha: string; producto: string; uds: number; udsRestantes: number; costeCent: number; proveedor: string | null }[];
}
export interface Reparto {
  modo: string; modoAplicado: string; comisionBp: number; repartibleCent: number; avisos: string[]; caja: Caja;
  lineas: { socioId: number; nombre: string; aportadoCent: number; comisionCent: number; parteCent: number; retiradoCent: number; saldoCent: number; pesoBp: number }[];
}
export interface Tramo { id: number; desdeUds: number; precioCent: number | null; descuentoBp: number | null }
export interface Oferta { id: number; nombre: string; descripcion: string; tipo: "nxm" | "pack" | "descuento"; n: number; m: number | null; precioCent: number | null; descuentoBp: number | null; desde: string | null; hasta: string | null; activa: boolean }
export interface Producto { id: number; nombre: string; precioCent: number; tramos: Tramo[]; ofertas: Oferta[] }
