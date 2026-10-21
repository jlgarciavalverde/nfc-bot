# El negocio

## Producto
Soporte de mostrador (placa + base + tapa, impresos en 3D) con pegatina NFC y QR. El cliente del comercio acerca el móvil
o escanea el QR y llega a la página de reseñas de Google del comercio. Cada placa lleva un código (p. ej. M4PSN) que
redirige desde nuestro panel: se puede cambiar el comercio o el enlace sin reimprimir ni regrabar nada, y se cuentan los
escaneos. Diseño y piezas: `hardware/soporte-nfc/`.

## Precios (desde el 21-10-2026)
| Paneles | Precio por panel | Total |
|---|---|---|
| 1 | 20 € | 20 € |
| desde 3 | 18 € | 54 € |
| desde 5 | 16 € | 80 € |

Oferta de lanzamiento: **pack de 2 por 35 €**, hasta el 31-12-2026. Las ofertas no se suman: a cada venta se le aplica lo
más barato para el cliente (por eso, hasta fin de año, 3 paneles salen a 53 € y 4 a 70 €).
Referencia de mercado (octubre 2026): placas sencillas online 10–25 €, mayorista recomienda ~30 €, marcas ~50 €.
Coste estimado por soporte: 2–4 € (PLA + pegatina NFC).

## Reparto
A partes iguales, sin comisión para quien vende. Se cambia en el panel (Ajustes) o con `/config reparto`.

## Quién puede hacer qué
- Todos los socios: apuntar visitas, ventas, dinero, comercios, recordatorios; activar y grabar placas; cobrar **sus** ventas.
- Admins: precios y ofertas, lotes de placas, ajustes, socios y auditoría; cobrar cualquier venta.

## Día a día
1. Visitar comercios y apuntarlo (bot `/visita` o panel «+»).
2. Al vender: venta + activar la placa (código de la tapa, enlace de reseñas, grabar la pegatina).
3. Cada mañana el bot recuerda a quién volver y los cobros pendientes; los lunes, resumen de la semana en el grupo.
