import ExcelJS from "exceljs";
import { ESTADOS, embudo, estadoStock, hoy, listarLotes, listarMovimientos, listarVentas, reparto, type Tx } from "@nfc/core";
import { comerciosPanel, visitasPanel } from "./datos";

const EUR = '#,##0.00 "€"';
const fecha = (f: string | null) => (f ? new Date(`${f}T12:00:00Z`) : null);
const eur = (c: number | null) => (c == null ? null : c / 100);

type Col = { header: string; key: string; width?: number; fmt?: string };

function hoja(wb: ExcelJS.Workbook, nombre: string, cols: Col[], filas: Record<string, unknown>[]) {
  const ws = wb.addWorksheet(nombre, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 14, style: c.fmt ? { numFmt: c.fmt } : {} }));
  ws.addRows(filas);
  ws.getRow(1).font = { bold: true };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  return ws;
}

/** Libro con una hoja por tabla y un resumen. Los importes van en euros con formato numérico (se pueden sumar en Excel). */
export async function exportarExcel(db: Tx) {
  const [cs, vis, vts, movs, lotes, stock, rep, emb] = await Promise.all([
    comerciosPanel(db),
    visitasPanel(db),
    listarVentas(db, { limite: 100_000 }),
    listarMovimientos(db, { limite: 100_000 }),
    listarLotes(db),
    estadoStock(db),
    reparto(db),
    embudo(db),
  ]);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Bot NFC reseñas";
  wb.created = new Date();
  const c = rep.caja;

  const res = wb.addWorksheet("Resumen");
  res.columns = [{ width: 38 }, { width: 16, style: { numFmt: EUR } }];
  res.addRows([
    ["Exportado el", fecha(hoy())],
    [],
    ["Invertido por los socios", eur(c.aportadoCent)],
    ["Ingresos", eur(c.ingresosCent)],
    ["Gastos", eur(c.gastosCent)],
    ["Beneficio (ingresos − gastos)", eur(c.beneficioCent)],
    ["Retirado por socios", eur(c.retiradoCent)],
    ["Caja", eur(c.cajaCent)],
    ["Pendiente de cobro", eur(c.pendienteCobroCent)],
    ["Valor del stock sin vender", eur(c.valorStockCent)],
    [],
    ["Ventas", c.ventas],
    ["Paneles vendidos", c.uds],
    [],
    ...(["pendiente", "interesado", "si", "no", "cliente"] as const).map((k) => [ESTADOS[k], emb.total[k]]),
  ]);
  res.getCell("B1").numFmt = "dd/mm/yyyy";
  for (const r of [12, 13, 15, 16, 17, 18, 19]) res.getCell(`B${r}`).numFmt = "0";
  res.getColumn(1).font = { bold: true };

  hoja(
    wb,
    "Comercios",
    [
      { header: "Nombre", key: "nombre", width: 30 },
      { header: "Estado", key: "estado", width: 20 },
      { header: "Tipo", key: "tipo" },
      { header: "Zona", key: "zona" },
      { header: "Dirección", key: "direccion", width: 30 },
      { header: "Contacto", key: "contacto", width: 22 },
      { header: "Responsable", key: "responsable" },
      { header: "Visitas", key: "visitas", width: 9 },
      { header: "Última visita", key: "ultimaVisita", fmt: "dd/mm/yyyy" },
      { header: "Motivo del no", key: "motivoNo", width: 30 },
      { header: "Nota", key: "nota", width: 30 },
      { header: "Google Maps", key: "mapsUrl", width: 30 },
    ],
    cs.map((x) => ({ ...x, estado: ESTADOS[x.estado], ultimaVisita: fecha(x.ultimaVisita) })),
  );
  hoja(
    wb,
    "Visitas",
    [
      { header: "Fecha", key: "fecha", fmt: "dd/mm/yyyy" },
      { header: "Comercio", key: "comercio", width: 30 },
      { header: "Socio", key: "socio" },
      { header: "Resultado", key: "resultado" },
      { header: "Nota", key: "nota", width: 40 },
      { header: "Volver el", key: "proxima", fmt: "dd/mm/yyyy" },
    ],
    vis.map((v) => ({ ...v, fecha: fecha(v.fecha), proxima: fecha(v.proxima) })),
  );
  hoja(
    wb,
    "Ventas",
    [
      { header: "Nº", key: "id", width: 6 },
      { header: "Fecha", key: "fecha", fmt: "dd/mm/yyyy" },
      { header: "Comercio", key: "comercio", width: 30 },
      { header: "Vendedor", key: "socio" },
      { header: "Producto", key: "producto", width: 18 },
      { header: "Uds", key: "uds", width: 6 },
      { header: "Total", key: "total", fmt: EUR },
      { header: "Precio de lista", key: "lista", fmt: EUR },
      { header: "Coste", key: "coste", fmt: EUR },
      { header: "Margen", key: "margen", fmt: EUR },
      { header: "Precio aplicado", key: "aplicado", width: 34 },
      { header: "Cobrada", key: "cobrada", width: 9 },
      { header: "Método", key: "metodo" },
      { header: "Nota", key: "nota", width: 30 },
    ],
    vts.map((v) => ({
      ...v,
      fecha: fecha(v.fecha),
      total: eur(v.totalCent),
      lista: eur(v.precioListaCent),
      coste: eur(v.costeCent),
      margen: v.costeCent == null ? null : eur(v.totalCent - v.costeCent),
      cobrada: v.cobrada ? "Sí" : "No",
    })),
  );
  hoja(
    wb,
    "Movimientos",
    [
      { header: "Fecha", key: "fecha", fmt: "dd/mm/yyyy" },
      { header: "Tipo", key: "tipo" },
      { header: "Importe", key: "importe", fmt: EUR },
      { header: "Con signo", key: "signo", fmt: EUR },
      { header: "Socio", key: "socio" },
      { header: "Categoría", key: "categoria" },
      { header: "Nota", key: "nota", width: 40 },
      { header: "Venta", key: "ventaId", width: 8 },
    ],
    movs.map((m) => ({
      ...m,
      fecha: fecha(m.fecha),
      importe: eur(m.importeCent),
      signo: eur(m.tipo === "gasto" || m.tipo === "retirada" ? -m.importeCent : m.importeCent),
    })),
  );
  hoja(
    wb,
    "Stock",
    [
      { header: "Fecha", key: "fecha", fmt: "dd/mm/yyyy" },
      { header: "Producto", key: "producto", width: 18 },
      { header: "Uds compradas", key: "uds" },
      { header: "Quedan", key: "udsRestantes" },
      { header: "Coste total", key: "coste", fmt: EUR },
      { header: "Coste por ud", key: "unit", fmt: EUR },
      { header: "Proveedor", key: "proveedor", width: 20 },
    ],
    lotes.map((l) => ({ ...l, fecha: fecha(l.fecha), coste: eur(l.costeCent), unit: eur(Math.round(l.costeCent / l.uds)) })),
  );
  const st = wb.getWorksheet("Stock")!;
  st.addRow([]);
  for (const s of stock.filter((x) => x.lotes)) st.addRow([null, s.producto, null, s.uds, eur(s.valorCent)]).font = { bold: true };

  hoja(
    wb,
    "Reparto",
    [
      { header: "Socio", key: "nombre", width: 20 },
      { header: "Aportado", key: "aportado", fmt: EUR },
      { header: "Comisión", key: "comision", fmt: EUR },
      { header: "Parte del beneficio", key: "parte", fmt: EUR, width: 18 },
      { header: "Retirado", key: "retirado", fmt: EUR },
      { header: "Saldo", key: "saldo", fmt: EUR },
    ],
    rep.lineas.map((l) => ({ nombre: l.nombre, aportado: eur(l.aportadoCent), comision: eur(l.comisionCent), parte: eur(l.parteCent), retirado: eur(l.retiradoCent), saldo: eur(l.saldoCent) })),
  );
  return Buffer.from(await wb.xlsx.writeBuffer());
}
