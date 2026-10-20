import { and, eq, gt, isNull, sql } from "drizzle-orm";
import {
  altaSocio, apuntarMovimiento, buscarComercio, cambiarDatoComercio, cambiarPrecio, cambiarSocio, comercioPorId, comprarLote,
  crearComercio, crearOferta, crearProducto, crearRecordatorio, describirOferta, embudo, ErrorNegocio, ESTADOS, estadoStock, euros,
  fechaCorta, fichaComercio, guardarAjuste, guardarTramo, borrarTramo, html, leerAjustes, listarComercios, listarMovimientos,
  listarProductos, listarSocios, listarVentas, marcarCobrada, ofertasDe, parsePorcentaje, pct, plural, ponerUbicacion,
  presupuesto, quitarOferta, recordatoriosPendientes, registrarVenta, registrarVisita, reparto, resolverProducto, resumenCaja,
  socioPorNombre, sumarDias, sumarMeses, tablas, tramosDe, DIAS_LUEGO, type Comercio, type DB, type ModoReparto, type Socio,
} from "@nfc/core";
import { Accion, ESCRITURA, SOLO_ADMIN } from "./acciones";
import { ayuda } from "./ayuda";
import { b, cajaTexto, embudoTexto, ICONO_ESTADO, ICONO_RESULTADO, presupuestoTexto, tablaPrecios } from "./formato";

export interface Boton {
  texto: string;
  data: string;
}
export interface Respuesta {
  texto: string;
  botones?: Boton[][];
  /** Mensaje adicional para el grupo (p. ej. aviso de stock bajo). */
  grupo?: string;
}
export interface Contexto {
  db: DB;
  socio: Socio;
  hoy: string;
  /** «ia» si la acción la ha propuesto la IA (las escrituras necesitan confirmación). */
  origen: "bot" | "ia";
}

/** Lo que guarda una acción pendiente de confirmar. */
interface Pendiente {
  a: Accion;
  /** Crear antes este comercio y usarlo en la acción. */
  crear?: string;
  lote: string;
}

const MINUTOS_PENDIENTE = 30;
const { pendientes } = tablas;

async function proponer(ctx: Contexto, texto: string, opciones: { etiqueta: string; p: Omit<Pendiente, "lote"> }[], telegramId?: number): Promise<Respuesta> {
  const lote = crypto.randomUUID();
  const ids: number[] = [];
  for (const o of opciones) {
    const [r] = await ctx.db
      .insert(pendientes)
      .values({ socioId: telegramId ? null : ctx.socio.id, telegramId: telegramId ?? null, accion: { ...o.p, lote }, expiraAt: new Date(Date.now() + MINUTOS_PENDIENTE * 60_000) })
      .returning({ id: pendientes.id });
    ids.push(r!.id);
  }
  const botones = opciones.map((o, i) => [{ texto: o.etiqueta, data: `ok:${ids[i]}` }]);
  botones.push([{ texto: "✖ Cancelar", data: `no:${ids[0]}` }]);
  return { texto, botones };
}

/** Acepta o cancela una acción pendiente (botón). Solo quien la propuso; las altas, cualquier admin. */
export async function resolverPendiente(ctx: Omit<Contexto, "origen">, id: number, aceptar: boolean): Promise<Respuesta> {
  const p = await ctx.db.transaction(async (tx) => {
    const [fila] = await tx
      .select()
      .from(pendientes)
      .where(and(eq(pendientes.id, id), isNull(pendientes.resueltaAt), gt(pendientes.expiraAt, new Date())))
      .for("update");
    if (!fila) throw new ErrorNegocio("Esto ya no está pendiente (caducó o ya se resolvió).");
    const datos = fila.accion as Pendiente;
    const esAlta = datos.a.t === "alta";
    if (esAlta ? ctx.socio.rol !== "admin" : fila.socioId !== ctx.socio.id) throw new ErrorNegocio(esAlta ? "Solo un admin puede aprobar altas." : "Solo puede confirmarlo quien lo pidió.");
    await tx.update(pendientes).set({ resueltaAt: new Date() }).where(and(isNull(pendientes.resueltaAt), sql`${pendientes.accion}->>'lote' = ${datos.lote}`));
    return datos;
  });
  if (!aceptar) return { texto: "Cancelado." };
  const c: Contexto = { ...ctx, origen: "bot" };
  let a = p.a;
  if (p.crear) {
    const nuevo = await crearComercio(ctx.db, { nombre: p.crear }, ctx.socio.id);
    a = { ...a, comercio: nuevo.id } as Accion;
  }
  return ejecutar(c, a);
}

type ConComercio = Extract<Accion, { comercio: string | number }>;

/**
 * Comercio de la acción. Si el nombre no es único, devuelve botones para elegir; si no existe y `crear`,
 * propone crearlo y seguir con la acción.
 */
async function comercioDe(ctx: Contexto, a: ConComercio, crear: boolean): Promise<Comercio | Respuesta> {
  if (typeof a.comercio === "number") return comercioPorId(ctx.db, a.comercio);
  const { unico, opciones } = await buscarComercio(ctx.db, a.comercio);
  if (unico) return unico;
  if (opciones.length) {
    return proponer(
      ctx,
      `Hay varios comercios que encajan con «${html(a.comercio)}». ¿Cuál?`,
      opciones.slice(0, 8).map((o) => ({ etiqueta: `${ICONO_ESTADO[o.estado]} ${o.nombre}${o.zona ? ` (${o.zona})` : ""}`, p: { a: { ...a, comercio: o.id } as Accion } })),
    );
  }
  if (!crear) throw new ErrorNegocio(`No encuentro ningún comercio «${a.comercio}». Prueba con /buscar.`);
  return proponer(ctx, `No tengo apuntado «${b(a.comercio)}». ¿Lo creo y sigo?`, [{ etiqueta: `➕ Crear «${a.comercio}»`, p: { a, crear: a.comercio } }]);
}

const esRespuesta = (x: unknown): x is Respuesta => typeof x === "object" && x !== null && "texto" in x;

/** Frase para pedir confirmación de lo que ha entendido la IA. */
async function describir(ctx: Contexto, a: Accion): Promise<string> {
  const c = "comercio" in a ? (typeof a.comercio === "number" ? (await comercioPorId(ctx.db, a.comercio)).nombre : a.comercio) : "";
  switch (a.t) {
    case "venta": {
      const prod = await resolverProducto(ctx.db, a.producto);
      const total = a.pactadoCent ?? (await presupuesto(ctx.db, a.uds, prod)).totalCent;
      return `Apuntar venta: ${b(plural(a.uds, prod.nombre, prod.nombre))} a ${b(c)} por ${b(euros(total))}, ${a.cobrada ? `cobrada${a.metodo ? ` (${a.metodo})` : ""}` : "pendiente de cobro"}${a.nota ? `. Nota: ${html(a.nota)}` : ""}`;
    }
    case "visita":
      return `Apuntar visita a ${b(c)}: ${ICONO_RESULTADO[a.resultado]}${a.nota ? `. Nota: ${html(a.nota)}` : ""}${a.proxima ? `. Volver el ${fechaCorta(a.proxima)}` : ""}`;
    case "movimiento": {
      const tipo = { aportacion: "Aportación tuya", gasto: "Gasto", ingreso: "Ingreso", retirada: "Retirada tuya" }[a.tipo];
      return `${tipo} de ${b(euros(a.cent))}${a.nota ? `: ${html(a.nota)}` : ""}`;
    }
    case "compra":
      return `Compra de ${b(plural(a.uds, "panel", "paneles"))} por ${b(euros(a.cent))}${a.proveedor ? ` a ${html(a.proveedor)}` : ""}`;
    case "cobrado":
      return `Marcar como cobrada la venta ${b(`#${a.ventaId}`)}${a.metodo ? ` (${a.metodo})` : ""}`;
    case "nuevo":
      return `Crear el comercio ${b(a.nombre)}${a.zona ? ` en ${html(a.zona)}` : ""}`;
    case "dato":
      return `Cambiar ${a.campo} de ${b(c)} a «${html(a.valor)}»`;
    case "recordar":
      return `Recordatorio para ${b(c)} el ${fechaCorta(a.fecha)}${a.nota ? `: ${html(a.nota)}` : ""}`;
    default:
      return `Hacer: ${html(JSON.stringify(a))}`;
  }
}

/** Ejecuta una acción y devuelve la respuesta para el chat. */
export async function ejecutar(ctx: Contexto, entrada: Accion): Promise<Respuesta> {
  const a = Accion.parse(entrada);
  if (SOLO_ADMIN.has(a.t) && ctx.socio.rol !== "admin") throw new ErrorNegocio("Eso solo lo puede hacer un admin.");
  if (ctx.origen === "ia" && ESCRITURA.has(a.t)) {
    if ("comercio" in a) {
      const c = await comercioDe(ctx, a, a.t === "visita" || a.t === "venta");
      if (esRespuesta(c)) return c;
      return proponer(ctx, `${await describir(ctx, { ...a, comercio: c.id } as Accion)}\n¿Lo apunto?`, [{ etiqueta: "✅ Confirmar", p: { a: { ...a, comercio: c.id } as Accion } }]);
    }
    return proponer(ctx, `${await describir(ctx, a)}\n¿Lo apunto?`, [{ etiqueta: "✅ Confirmar", p: { a } }]);
  }
  const { db, socio, hoy } = ctx;

  switch (a.t) {
    case "ayuda":
      return { texto: ayuda(a.tema, socio.rol === "admin") };

    case "precios": {
      const prods = await listarProductos(db);
      const datos = await Promise.all(prods.map(async (p) => ({ ...p, tramos: await tramosDe(db, p.id), ofertas: await ofertasDe(db, p.id, hoy) })));
      const ejemplos = await Promise.all(prods.map((p) => Promise.all([1, 3, 5, 10].map((n) => presupuesto(db, n, p, hoy)))));
      return { texto: tablaPrecios(datos, ejemplos) };
    }
    case "precio": {
      const p = await resolverProducto(db, a.producto);
      return { texto: presupuestoTexto(await presupuesto(db, a.uds, p, hoy), p.nombre) };
    }

    case "ficha": {
      const c = await comercioDe(ctx, a, false);
      if (esRespuesta(c)) return c;
      const f = await fichaComercio(db, c.id);
      const l = [`${ICONO_ESTADO[c.estado]} ${b(c.nombre)} — ${ESTADOS[c.estado]}`];
      const datos = [c.tipo, c.zona, c.direccion].filter(Boolean).map((x) => html(x)).join(" · ");
      if (datos) l.push(datos);
      if (c.contacto) l.push(`📞 ${html(c.contacto)}`);
      if (c.mapsUrl) l.push(`📍 <a href="${html(c.mapsUrl)}">Google Maps</a>`);
      else if (c.lat != null) l.push(`📍 <a href="https://www.google.com/maps?q=${c.lat},${c.lon}">Ubicación</a>`);
      if (f.responsable) l.push(`Lo lleva: ${html(f.responsable)}`);
      if (c.estado === "no" && c.motivoNo) l.push(`Motivo del no: ${html(c.motivoNo)}`);
      if (c.nota) l.push(`Nota: ${html(c.nota)}`);
      if (f.recordatorios.length) l.push(`⏰ Volver el ${f.recordatorios.map((r) => fechaCorta(r.fecha)).join(", ")}`);
      if (f.ventas.length) {
        l.push("", b("Ventas"));
        for (const v of f.ventas) l.push(`#${v.id} ${fechaCorta(v.fecha)}: ${v.uds} uds, ${euros(v.totalCent)}${v.cobrada ? "" : " ⏳ pendiente"}`);
      }
      if (f.visitas.length) {
        l.push("", b("Visitas"));
        for (const v of f.visitas) l.push(`${fechaCorta(v.fecha)} ${html(v.socio)}: ${ICONO_RESULTADO[v.resultado]}${v.nota ? ` — ${html(v.nota)}` : ""}`);
      }
      return { texto: l.join("\n") };
    }
    case "buscar": {
      const { opciones } = await buscarComercio(db, a.texto);
      if (!opciones.length) return { texto: `No hay ningún comercio con «${html(a.texto)}».` };
      return { texto: opciones.map((c) => `${ICONO_ESTADO[c.estado]} ${html(c.nombre)}${c.zona ? ` (${html(c.zona)})` : ""}`).join("\n") };
    }
    case "lista": {
      const cs = await listarComercios(db, { estado: a.estado, zona: a.zona });
      const titulo = a.zona ? `Comercios en «${html(a.zona)}»` : a.estado ? ESTADOS[a.estado] : "Comercios";
      if (!cs.length) return { texto: `${b(titulo)}: ninguno.` };
      const max = 60;
      const l = cs.slice(0, max).map((c) => `${ICONO_ESTADO[c.estado]} ${html(c.nombre)}${!a.zona && c.zona ? ` (${html(c.zona)})` : ""}`);
      if (cs.length > max) l.push(`… y ${cs.length - max} más (los tienes todos en el panel: /panel)`);
      return { texto: `${b(`${titulo} (${cs.length})`)}\n${l.join("\n")}` };
    }
    case "embudo":
      return { texto: embudoTexto(await embudo(db)) };
    case "caja":
      return { texto: cajaTexto(await resumenCaja(db), "Caja desde el principio") };
    case "mes": {
      const mes = a.mes ?? hoy.slice(0, 7);
      const desde = `${mes}-01`;
      const hasta = sumarDias(sumarMeses(desde, 1), -1);
      return { texto: cajaTexto(await resumenCaja(db, desde, hasta), `Mes de ${fechaCorta(desde, true).slice(2)}`) };
    }
    case "stock": {
      const s = await estadoStock(db);
      const { stockMin } = await leerAjustes(db);
      if (!s.some((x) => x.lotes)) return { texto: "Aún no se lleva stock. Empieza registrando una compra: /compra 50 180€ proveedor" };
      return {
        texto: s
          .filter((x) => x.lotes)
          .map((x) => `${x.uds < stockMin ? "⚠️" : "📦"} ${b(x.producto)}: ${b(plural(x.uds, "ud", "uds"))} (valor ${euros(x.valorCent)}${x.uds ? `, ${euros(Math.round(x.valorCent / x.uds))}/ud` : ""})`)
          .join("\n"),
      };
    }
    case "ventas": {
      const vs = await listarVentas(db, { limite: 20, pendientes: a.pendientes });
      if (!vs.length) return { texto: a.pendientes ? "No hay nada pendiente de cobro. 👌" : "Aún no hay ventas." };
      const total = vs.reduce((x, v) => x + v.totalCent, 0);
      return {
        texto: [
          b(a.pendientes ? `Pendiente de cobro: ${euros(total)}` : "Últimas ventas"),
          ...vs.map((v) => `#${v.id} ${fechaCorta(v.fecha)} ${html(v.comercio)}: ${v.uds} uds, ${euros(v.totalCent)} (${html(v.socio)})${v.cobrada ? "" : " ⏳"}`),
        ].join("\n"),
      };
    }
    case "movimientos": {
      const ms = await listarMovimientos(db, { limite: 20 });
      if (!ms.length) return { texto: "Aún no hay movimientos de caja." };
      const signo = { aportacion: "＋", ingreso: "＋", gasto: "－", retirada: "－" };
      return { texto: [b("Últimos movimientos"), ...ms.map((m) => `${fechaCorta(m.fecha)} ${signo[m.tipo]}${euros(m.importeCent)} ${m.tipo} · ${html(m.socio)}${m.nota ? ` · ${html(m.nota)}` : ""}`)].join("\n") };
    }
    case "pendientes": {
      const rs = await recordatoriosPendientes(db, sumarDias(hoy, 7), a.todos ? undefined : socio.id);
      if (!rs.length) return { texto: "No tienes nada pendiente para los próximos 7 días. 👌" };
      return {
        texto: [b(a.todos ? "Pendientes de todos (7 días)" : "Tus pendientes (7 días)"), ...rs.map((r) => `${r.fecha <= hoy ? "🔔" : "🗓"} ${fechaCorta(r.fecha)} ${html(r.comercio)}${a.todos ? ` (${html(r.socio)})` : ""}${r.nota ? ` — ${html(r.nota)}` : ""}`)].join("\n"),
        botones: rs.filter((r) => r.fecha <= hoy && r.socioId === socio.id).slice(0, 8).map((r) => [{ texto: `✅ Hecho: ${r.comercio}`, data: `hecho:${r.id}` }]),
      };
    }
    case "reparto": {
      const r = await reparto(db);
      const modo = { igual: "a partes iguales", porcentaje: "por porcentaje fijo", aportado: "según lo aportado" }[r.modoAplicado];
      const l = [b("Reparto entre socios"), `Beneficio: ${euros(r.caja.beneficioCent)}${r.comisionBp ? ` · comisión de venta ${pct(r.comisionBp)}` : ""} · repartible ${euros(r.repartibleCent)} ${modo}`, ""];
      for (const x of r.lineas) {
        l.push(`${b(x.nombre)}: ${b(euros(x.saldoCent))}`);
        l.push(`  aportado ${euros(x.aportadoCent)}${x.comisionCent ? ` + comisión ${euros(x.comisionCent)}` : ""} ${x.parteCent >= 0 ? "+" : "−"} parte ${euros(Math.abs(x.parteCent))} (${pct(x.pesoBp)})${x.retiradoCent ? ` − retirado ${euros(x.retiradoCent)}` : ""}`);
      }
      l.push("", `Saldo = lo que le tocaría a cada uno si se liquidase hoy. Caja: ${euros(r.caja.cajaCent)}.`);
      if (r.caja.valorStockCent) l.push(`El stock sin vender (${euros(r.caja.valorStockCent)}) ya está descontado como gasto.`);
      l.push(...r.avisos.map((x) => `⚠️ ${html(x)}`));
      return { texto: l.join("\n") };
    }
    case "socios": {
      const ss = await listarSocios(db);
      const aj = await leerAjustes(db);
      return {
        texto: [
          b("Socios"),
          ...ss.map((s) => `${s.rol === "admin" ? "👑" : "👤"} ${html(s.nombre)}${s.username ? ` @${html(s.username)}` : ""}${aj.modoReparto === "porcentaje" ? ` · ${pct(s.pctReparto)}` : ""}`),
          "",
          `Reparto: ${aj.modoReparto}${aj.comisionBp ? ` · comisión ${pct(aj.comisionBp)}` : ""} · aviso de stock por debajo de ${aj.stockMin}`,
          "Para entrar, la persona escribe /unirme en el grupo y un admin la aprueba.",
        ].join("\n"),
      };
    }

    // ── Escrituras ──
    case "nuevo": {
      const c = await crearComercio(db, { nombre: a.nombre, tipo: a.tipo, zona: a.zona, contacto: a.contacto, direccion: a.direccion }, socio.id, ctx.origen);
      return { texto: `➕ Apuntado ${b(c.nombre)}. Cuando lo visites: /visita ${html(c.nombre)} si|no|luego` };
    }
    case "dato": {
      const c = await comercioDe(ctx, a, false);
      if (esRespuesta(c)) return c;
      const r = await cambiarDatoComercio(db, c.id, a.campo, a.valor, socio.id, ctx.origen);
      return { texto: `✏️ ${b(r.nombre)}: ${a.campo} actualizado.` };
    }
    case "visita": {
      const c = await comercioDe(ctx, a, true);
      if (esRespuesta(c)) return c;
      const r = await registrarVisita(db, { comercioId: c.id, resultado: a.resultado, nota: a.nota, proximaFecha: a.proxima, fecha: hoy }, socio.id, ctx.origen);
      const l = [`${ICONO_RESULTADO[a.resultado]} Visita a ${b(c.nombre)} apuntada.`];
      if (r.comercio.estado !== c.estado) l.push(`Estado: ${ESTADOS[c.estado]} → ${b(ESTADOS[r.comercio.estado])}`);
      if (r.proxima) l.push(`⏰ Te lo recuerdo el ${b(fechaCorta(r.proxima))}${!a.proxima ? ` (en ${DIAS_LUEGO} días; cámbialo con /recordar ${html(c.nombre)} el lunes)` : ""}.`);
      if (a.resultado === "si") l.push(`Cuando se cierre: /venta ${html(c.nombre)} 1 pagado bizum`);
      return { texto: l.join("\n") };
    }
    case "venta": {
      const c = await comercioDe(ctx, a, true);
      if (esRespuesta(c)) return c;
      const producto = await resolverProducto(db, a.producto);
      const r = await registrarVenta(db, { comercioId: c.id, producto, uds: a.uds, totalPactadoCent: a.pactadoCent, cobrada: a.cobrada, metodo: a.metodo, nota: a.nota, fecha: hoy }, socio.id, ctx.origen);
      const v = r.venta;
      const l = [`⭐ Venta ${b(`#${v.id}`)} a ${b(c.nombre)}: ${plural(v.uds, producto.nombre, producto.nombre)} por ${b(euros(v.totalCent))}`, html(v.aplicado)];
      l.push(v.cobrada ? `✅ Cobrada${v.metodo ? ` por ${v.metodo}` : ""}` : `⏳ Pendiente de cobro. Cuando paguen: /cobrado ${v.id} bizum`);
      if (v.costeCent != null) l.push(`Margen: ${euros(v.totalCent - v.costeCent)}`);
      let grupo: string | undefined;
      if (v.costeCent != null) {
        const { stockMin } = await leerAjustes(db);
        const s = (await estadoStock(db)).find((x) => x.productoId === producto.id);
        if (s && s.uds < stockMin) grupo = `⚠️ Quedan ${b(plural(s.uds, "panel", "paneles"))} de ${html(producto.nombre)}. Toca pedir más.`;
      }
      return { texto: l.join("\n"), grupo };
    }
    case "cobrado": {
      const r = await marcarCobrada(db, a.ventaId, a.metodo ?? null, socio.id, ctx.origen);
      return { texto: `✅ Venta #${r.venta.id} a ${b(r.comercio)} cobrada: ${euros(r.venta.totalCent)}${a.metodo ? ` por ${a.metodo}` : ""}.` };
    }
    case "movimiento": {
      await apuntarMovimiento(db, { tipo: a.tipo, importeCent: a.cent, socioId: socio.id, categoria: a.categoria, nota: a.nota, fecha: hoy }, socio.id, ctx.origen);
      const caja = await resumenCaja(db);
      const txt = { aportacion: "💶 Aportación", gasto: "📉 Gasto", ingreso: "📈 Ingreso", retirada: "↩️ Retirada" }[a.tipo];
      return { texto: `${txt} de ${b(euros(a.cent))} apuntada${a.nota ? ` (${html(a.nota)})` : ""}.\nCaja: ${euros(caja.cajaCent)} · Beneficio: ${euros(caja.beneficioCent)}` };
    }
    case "compra": {
      const producto = await resolverProducto(db, a.producto);
      const l = await comprarLote(db, { producto, uds: a.uds, costeCent: a.cent, proveedor: a.proveedor, fecha: hoy }, socio.id, ctx.origen);
      const s = (await estadoStock(db)).find((x) => x.productoId === producto.id);
      return { texto: `📦 Compra apuntada: ${plural(l.uds, "panel", "paneles")} por ${euros(l.costeCent)} (${euros(Math.round(l.costeCent / l.uds))}/ud). Stock: ${b(s?.uds ?? l.uds)} uds.` };
    }
    case "recordar": {
      const c = await comercioDe(ctx, a, false);
      if (esRespuesta(c)) return c;
      if (a.fecha < hoy) throw new ErrorNegocio("Esa fecha ya ha pasado.");
      await crearRecordatorio(db, { comercioId: c.id, fecha: a.fecha, nota: a.nota }, socio.id);
      return { texto: `⏰ Te recuerdo ${b(c.nombre)} el ${b(fechaCorta(a.fecha))}.` };
    }
    case "ubicacion": {
      const c = await ponerUbicacion(db, a.comercio, a.lat, a.lon, socio.id);
      return { texto: `📍 Ubicación guardada en ${b(c.nombre)}.` };
    }

    // ── Admin ──
    case "producto": {
      if (a.nuevo) {
        const p = await crearProducto(db, a.nombre, a.cent, socio.id);
        return { texto: `🏷 Producto ${b(p.nombre)} a ${euros(p.precioCent)}/ud. Añade tramos con /tramo y ofertas con /oferta.` };
      }
      const p = await resolverProducto(db, a.nombre);
      await cambiarPrecio(db, p.id, a.cent, socio.id);
      return { texto: `🏷 ${b(p.nombre)}: ${euros(p.precioCent)} → ${b(euros(a.cent))}/ud.` };
    }
    case "tramo": {
      const p = await resolverProducto(db, a.producto);
      if (a.borrar) {
        await borrarTramo(db, p.id, a.desde, socio.id);
        return { texto: `Tramo desde ${a.desde} uds borrado.` };
      }
      await guardarTramo(db, p.id, a.desde, a.cent ? { precioCent: a.cent } : { descuentoBp: a.descuentoBp! }, socio.id);
      const ej = await presupuesto(db, a.desde, p, hoy);
      return { texto: `📊 Tramo guardado: desde ${a.desde} uds ${a.cent ? `a ${euros(a.cent)}/ud` : `-${pct(a.descuentoBp!)}`}.\nEjemplo: ${presupuestoTexto(ej, p.nombre)}` };
    }
    case "oferta": {
      const p = await resolverProducto(db, a.producto);
      const datos = { tipo: a.tipo, n: a.n, m: a.m ?? null, precioCent: a.cent ?? null, descuentoBp: a.descuentoBp ?? null, desde: hoy, hasta: a.hasta ?? null };
      const o = await crearOferta(db, p.id, { ...datos, nombre: describirOferta(datos) }, socio.id);
      return { texto: `🎁 Oferta #${o.id} creada: ${b(o.nombre)}${o.hasta ? ` hasta el ${fechaCorta(o.hasta)}` : ""}. Se aplica sola cuando sale más barata. Mira /precios.` };
    }
    case "quitarOferta": {
      const o = await quitarOferta(db, a.id, socio.id);
      return { texto: `Oferta «${html(o.nombre)}» retirada.` };
    }
    case "config":
      return configurar(ctx, a);
    case "alta": {
      const s = await altaSocio(db, { telegramId: a.telegramId, nombre: a.nombre, username: a.username }, socio.id);
      return { texto: `👋 ${b(s.nombre)} ya es socio. Escribe /ayuda para ver qué puedo hacer.` };
    }
  }
}

async function configurar(ctx: Contexto, a: Extract<Accion, { t: "config" }>): Promise<Respuesta> {
  const { db, socio } = ctx;
  const v = a.valor.trim();
  switch (a.clave) {
    case "reparto": {
      const modos: ModoReparto[] = ["igual", "porcentaje", "aportado"];
      const m = modos.find((x) => x === v.toLowerCase());
      if (!m) throw new ErrorNegocio("Modos de reparto: igual, porcentaje o aportado.");
      await guardarAjuste(db, "modoReparto", m);
      return { texto: `Reparto: ${b(m)}.${m === "porcentaje" ? " Pon el de cada socio con /config porcentaje Ana 50%" : ""}` };
    }
    case "comision": {
      const bp = v === "0" || v === "0%" ? 0 : parsePorcentaje(v);
      if (bp === null) throw new ErrorNegocio("Así: /config comision 10%");
      await guardarAjuste(db, "comisionBp", bp);
      return { texto: bp ? `Comisión de venta: ${b(pct(bp))} del total de cada venta cobrada, para quien la vende.` : "Sin comisión de venta." };
    }
    case "porcentaje": {
      const s = await socioPorNombre(db, a.socio ?? "");
      const bp = v === "0%" ? 0 : parsePorcentaje(v);
      if (bp === null) throw new ErrorNegocio("Así: /config porcentaje Ana 50%");
      await cambiarSocio(db, s.id, { pctReparto: bp }, socio.id);
      const suma = (await listarSocios(db)).reduce((x, y) => x + y.pctReparto, 0);
      return { texto: `${b(s.nombre)}: ${pct(bp)}. Entre todos: ${pct(suma)}${suma !== 10_000 ? " ⚠️ (tiene que sumar 100 %)" : " ✅"}.` };
    }
    case "stock": {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0) throw new ErrorNegocio("Así: /config stock 5");
      await guardarAjuste(db, "stockMin", n);
      return { texto: `Aviso cuando queden menos de ${b(n)} paneles.` };
    }
    case "admin":
    case "socio": {
      const s = await socioPorNombre(db, v);
      await cambiarSocio(db, s.id, { rol: a.clave }, socio.id);
      return { texto: `${b(s.nombre)} ahora es ${a.clave}.` };
    }
    case "baja": {
      const s = await socioPorNombre(db, v);
      await cambiarSocio(db, s.id, { activo: false }, socio.id);
      return { texto: `${b(s.nombre)} ya no es socio (sus datos se conservan).` };
    }
    case "producto": {
      const p = await resolverProducto(db, v);
      await guardarAjuste(db, "productoDefectoId", p.id);
      return { texto: `Producto por defecto: ${b(p.nombre)}.` };
    }
  }
}

/** Para el botón de recordatorio hecho. */
export { marcarHecho } from "@nfc/core";
export { proponer };
