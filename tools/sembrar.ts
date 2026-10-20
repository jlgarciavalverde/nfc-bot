// Datos de ejemplo para desarrollo y capturas (NUNCA contra producción).
//   DATABASE_URL=postgres://nfc:nfc@127.0.0.1:5434/nfc pnpm tsx tools/sembrar.ts
import {
  altaSocio, apuntarMovimiento, comprarLote, crearComercio, crearOferta, crearProducto, createDb, guardarAjuste, guardarTramo,
  hoy, ponerUbicacion, registrarVenta, registrarVisita, runMigrations, sumarDias,
} from "@nfc/core";
import { vaciar } from "@nfc/core/testing";

const url = process.env.DATABASE_URL ?? "postgres://nfc:nfc@127.0.0.1:5434/nfc";
if (!/127\.0\.0\.1|localhost/.test(url)) throw new Error("sembrar.ts solo se usa con una base de datos local");
const { db, sql } = createDb(url);
await runMigrations(db);
await vaciar(db);

const [ana, bea, carlos] = [
  await altaSocio(db, { telegramId: 1001, nombre: "Ana" }, null),
  await altaSocio(db, { telegramId: 1002, nombre: "Bea" }, null),
  await altaSocio(db, { telegramId: 1003, nombre: "Carlos" }, null),
];
const h = hoy();
const d = (n: number) => sumarDias(h, -n);
const panel = await crearProducto(db, "Panel NFC", 2500, ana.id);
await guardarTramo(db, panel.id, 5, { precioCent: 2200 }, ana.id);
await guardarTramo(db, panel.id, 10, { precioCent: 1900 }, ana.id);
await crearOferta(db, panel.id, { nombre: "3x2", tipo: "nxm", n: 3, m: 2, precioCent: null, descuentoBp: null, desde: null, hasta: sumarDias(h, 40) }, ana.id);
await guardarAjuste(db, "comisionBp", 1000);

for (const [s, c] of [[ana, 15000], [bea, 15000], [carlos, 10000]] as const) await apuntarMovimiento(db, { tipo: "aportacion", importeCent: c, socioId: s.id, nota: "inversión inicial", fecha: d(60) }, s.id);
await comprarLote(db, { producto: panel, uds: 40, costeCent: 16000, proveedor: "AliExpress", fecha: d(58) }, ana.id);
await apuntarMovimiento(db, { tipo: "gasto", importeCent: 3500, socioId: bea.id, categoria: "imprenta", nota: "tarjetas y flyers", fecha: d(55) }, bea.id);
await apuntarMovimiento(db, { tipo: "gasto", importeCent: 1200, socioId: carlos.id, categoria: "gasolina", fecha: d(20) }, carlos.id);

const sitios: [string, string, string, number, number][] = [
  ["Bar El Rincón", "bar", "Centro", 37.9849, -1.1287],
  ["Panadería López", "panadería", "Centro", 37.9862, -1.1305],
  ["Peluquería Marta", "peluquería", "Santa Eulalia", 37.9878, -1.1251],
  ["Frutería La Huerta", "frutería", "El Carmen", 37.9798, -1.1302],
  ["Taller Hnos. García", "taller", "El Palmar", 37.9425, -1.1612],
  ["Cafetería Floridablanca", "cafetería", "El Carmen", 37.9807, -1.1321],
  ["Clínica Dental Sonríe", "clínica", "Centro", 37.9871, -1.1325],
  ["Restaurante La Tapa", "restaurante", "Santa Eulalia", 37.9883, -1.1238],
  ["Librería Diego Marín", "librería", "Centro", 37.9858, -1.1279],
  ["Ferretería Moderna", "ferretería", "Vistabella", 37.9822, -1.1182],
  ["Gimnasio Fit Murcia", "gimnasio", "Juan Carlos I", 38.0005, -1.1452],
  ["Pizzería Napoli", "restaurante", "Juan Carlos I", 37.9998, -1.1441],
  ["Floristería Rosa", "floristería", "Vistabella", 37.9831, -1.1195],
  ["Óptica Visión", "óptica", "Centro", 37.9866, -1.1299],
  ["Heladería Sirvent", "heladería", "Centro", 37.9853, -1.1316],
  ["Zapatería Paso", "tienda", "El Carmen", 37.9791, -1.1288],
  ["Bar Los Zagales", "bar", "Centro", 37.9845, -1.1301],
  ["Estética Luna", "estética", "Santa Eulalia", 37.9889, -1.1262],
];
const cs = [];
for (const [nombre, tipo, zona, lat, lon] of sitios) {
  const c = await crearComercio(db, { nombre, tipo, zona }, ana.id);
  await ponerUbicacion(db, c.id, lat, lon, ana.id);
  cs.push(c);
}
const quien = [ana, bea, carlos];
const plan: [number, "si" | "no" | "luego" | "interesado", number, string | null][] = [
  [0, "si", 50, null], [1, "si", 48, "quiere 2"], [2, "no", 45, "ya tiene QR en el mostrador"], [3, "luego", 40, "vuelve el dueño la semana que viene"],
  [4, "si", 38, null], [5, "si", 30, null], [6, "interesado", 25, "lo consulta con su socio"], [7, "si", 21, null], [8, "no", 18, "no le interesan las reseñas"],
  [9, "luego", 12, "pasar por la mañana"], [10, "si", 9, null], [11, "si", 6, null], [12, "no", 4, "muy caro"], [13, "interesado", 2, "pide precio para 5"], [14, "si", 1, null],
];
for (const [i, r, hace, nota] of plan) {
  const c = cs[i]!;
  await registrarVisita(db, { comercioId: c.id, resultado: r, nota, fecha: d(hace), proximaFecha: r === "luego" || r === "interesado" ? sumarDias(h, (i % 5) - 1) : null }, quien[i % 3]!.id);
}
const ventas: [number, number, number, boolean, "bizum" | "efectivo" | null][] = [
  [0, 1, 49, true, "bizum"], [1, 2, 47, true, "efectivo"], [4, 3, 37, true, "bizum"], [5, 1, 29, true, "bizum"], [7, 5, 20, true, "transferencia" as never],
  [10, 2, 8, true, "bizum"], [11, 1, 5, false, null], [14, 3, 0, false, null],
];
for (const [i, uds, hace, cobrada, metodo] of ventas) {
  await registrarVenta(db, { comercioId: cs[i]!.id, producto: panel, uds, cobrada, metodo, fecha: d(hace) }, quien[i % 3]!.id);
}
await apuntarMovimiento(db, { tipo: "retirada", importeCent: 2000, socioId: bea.id, nota: "cena de socios", fecha: d(3) }, bea.id);
console.log(`Sembrado: ${cs.length} comercios, ${ventas.length} ventas.`);
await sql.end();
