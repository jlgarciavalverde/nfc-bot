# Requisitos

[← Documentación](README.md) · [README del proyecto](../README.md)

## Actores

| Actor | Canal | Qué hace |
|---|---|---|
| Administrador | Bot y panel | Todo lo del socio, más aprobar socios, editar precios, reservar lotes de placas, ajustes y auditoría. |
| Socio | Grupo y chat privado del bot, panel | Apunta visitas, ventas, cobros, compras de stock y dinero. Consulta caja, stock, pendientes y reparto. |
| Cliente final | Su móvil | Acerca el móvil a la placa NFC o escanea el QR y llega a las reseñas de Google del comercio. |

## Requisitos funcionales

| ID | Requisito |
|---|---|
| RF-01 | El primer administrador se da de alta con el `SETUP_CODE`. El grupo se vincula con `/vincular`. |
| RF-02 | Para hacerse socio se pide entrar (`/unirme` o el botón de bienvenida) y lo aprueba un administrador. |
| RF-03 | Se registran comercios con zona, ubicación y estado en el embudo de venta, y sus visitas. |
| RF-04 | Una venta calcula el precio sola según los tramos y las ofertas vigentes, descuenta stock por FIFO y anota el ingreso. |
| RF-05 | Se registran los cobros pendientes y se avisa al vendedor si siguen sin cobrar pasados 7 días. |
| RF-06 | Caja: aportaciones, gastos, ingresos, retiros, saldo y resumen del mes. |
| RF-07 | Stock: compras por lotes y aviso cuando queda poco. |
| RF-08 | Reparto de beneficios a partes iguales, por porcentaje o según lo aportado, con comisión por venta. |
| RF-09 | Recordatorios, con un aviso diario a las 9:00 por privado y un resumen semanal los lunes en el grupo. |
| RF-10 | Las órdenes se pueden dar en lenguaje natural. El bot propone la acción y espera a que se confirme. |
| RF-11 | Cada socio puede deshacer sus propias operaciones durante 10 minutos. Nada se borra: se anula. |
| RF-12 | Cada placa tiene un código único: `/r/<código>` redirige a las reseñas del comercio asignado y cuenta el escaneo. |
| RF-13 | Desde el panel se graba y bloquea la pegatina NFC (Web NFC) y se reservan lotes de códigos con su `lote.csv` y `qr.zip`. |
| RF-14 | El panel muestra un resumen con gráficas, un mapa de comercios, la ficha con su historia y una exportación a Excel. |
| RF-15 | Desde Ajustes se personalizan el nombre, el tono y los emojis del asistente, la limpieza de mensajes y los avisos. |

## Requisitos no funcionales

| ID | Categoría | Requisito |
|---|---|---|
| RNF-01 | Seguridad | Acceso denegado por defecto en cada ruta, con matriz de permisos generada y comprobada en los tests. |
| RNF-02 | Seguridad | Límite de 60 escaneos por minuto e IP en `/r/`, límite de escrituras por socio y freno global a los códigos de entrada. |
| RNF-03 | Seguridad | Aviso por Telegram de cada inicio de sesión en el panel y auditoría de las operaciones. |
| RNF-04 | Privacidad | El bot borra solo sus mensajes efímeros (consultas, errores, confirmaciones) para no llenar el grupo. |
| RNF-05 | Disponibilidad | Copia diaria de Postgres con simulacro de restauración y copia externa en el Mac. |
| RNF-06 | Resiliencia | Si un modelo de Gemini está saturado, se usa el siguiente de la lista. |
| RNF-07 | Accesibilidad | Panel WCAG 2.1 AA en tema claro y oscuro, comprobado con axe. |
| RNF-08 | Usabilidad | El panel se instala como app (PWA) y en el móvil se maneja con asistentes de un paso por pantalla. |

## Fuera de alcance

- Venta online o pasarela de pago: los cobros se hacen en mano y se apuntan.
- Gestión de las reseñas en sí: la placa solo lleva al formulario de Google.
