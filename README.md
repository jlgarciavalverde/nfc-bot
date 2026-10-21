# Paneles NFC de reseñas

Negocio con amigos: vender a pequeños comercios un soporte con placa NFC y QR que lleva a sus reseñas de Google.
Todo el proyecto está en esta carpeta.

## Dónde está cada cosa
| Carpeta | Qué hay |
|---|---|
| `docs/` | **Para leer**: [guía para los socios](docs/guia-socios.md), [el negocio](docs/negocio.md) (precios, bonos, reparto), [estado](docs/ESTADO.md), [operaciones](docs/OPERACIONES.md), [novedades](docs/novedades.md) |
| `hardware/soporte-nfc/` | **El producto físico**: diseño 3D, scripts de lotes, piezas para imprimir, ficha para la impresora ([README](hardware/soporte-nfc/README.md)) |
| `apps/bot/` | Bot de Telegram (@asistente_billetes_bot, grupo «Billetes») |
| `apps/web/` | Panel web (nfc.redgarverde.com) |
| `apps/api/` | Servidor del panel y de las placas (`/r/<código>`) |
| `packages/core/` | Lógica común y base de datos |
| `deploy/`, `tools/` | Despliegue en el servidor casero, copias, datos de ejemplo |
| `e2e/` | Pruebas del panel en el navegador |

## Enlaces
- Panel: https://nfc.redgarverde.com (entra con `/panel` en el bot)
- Lo que se manda a la impresora: `hardware/soporte-nfc/entregas/Soporte_NFC_para_la_impresora.zip`

Para desarrollar: [AGENTS.md](AGENTS.md).
