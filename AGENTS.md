# AGENTS.md — fuente única de verdad para cualquier agente

> **Antes de tocar nada lee `docs/ESTADO.md`.** Al terminar, actualízalo.

## Qué es
Bot de Telegram (+ panel web) para un grupo de amigos que vende **paneles NFC de reseñas de Google** a pequeños comercios.
Lleva precios/bonos, comercios visitados (sí/no/luego), ventas, caja, stock, recordatorios y reparto entre socios.
Interfaz, código de dominio y documentación en **español**. Plan original: `~/.claude/plans/purrfect-orbiting-boot.md`.

## Stack
| Pieza | Tecnología |
|---|---|
| Monorepo | pnpm 12, Node 22 |
| `packages/core` | Dominio + BD: Drizzle + `postgres`, Postgres 17. **Única definición de tablas** en `src/db/schema.ts`; migraciones en `drizzle/` |
| `apps/bot` | grammY (long polling), avisos programados, IA (Gemini plan gratuito, `AI_FAKE=1` en tests) |
| `apps/api` | Fastify 5: login por enlace mágico, datos del panel, precios (admin), exportación .xlsx (exceljs). Sirve la web |
| `apps/web` | React 19 + Vite + TanStack Query + wouter + Tailwind v4 + Leaflet |
| Despliegue | Una imagen, dos procesos (`nfc-web`, `nfc-bot`) + `nfc-db` + `nfc-backup` en joseluis-vps |

## Comandos
```sh
pnpm db:up                                   # Postgres dev en 127.0.0.1:5434 (BDs nfc, nfc_test, nfc_e2e)
pnpm typecheck && pnpm test                  # unitarios + integración (BD real nfc_test, en serie)
pnpm --filter @nfc/web build && pnpm e2e     # e2e del panel (Playwright, BD nfc_e2e sembrada)
pnpm tsx tools/sembrar.ts                    # datos de ejemplo en la BD local
pnpm --filter @nfc/core db:generate --name x # tras cambiar schema.ts
node tools/deploy.mjs X.Y.Z                  # despliegue (docs/OPERACIONES.md)
```
Desarrollo: `cp deploy/.env.example .env` (BOT_TOKEN de un bot de pruebas, `AI_FAKE=1`), `pnpm dev:api`, `pnpm dev:web`, `pnpm dev:bot`.

## Convenciones
1. **Dinero en céntimos** (enteros) y porcentajes en **puntos básicos** (1 % = 100). Nunca floats.
2. **Nada se borra**: los registros se anulan (`anuladoAt`) y toda consulta filtra `anuladoAt is null`.
3. Toda escritura registra una **operación** (`registrarOperacion`) con lo necesario para `/deshacer` (10 min, solo lo propio).
4. Errores para el usuario: `throw new ErrorNegocio("mensaje en español, tuteando")`. Se muestran tal cual.
5. Comandos: `apps/bot/src/comandos.ts` traduce texto → `Accion` (zod, `acciones.ts`); `ejecutor.ts` la ejecuta. La IA produce
   la misma `Accion` y **las escrituras de la IA siempre piden confirmación** con botón. Comercio desconocido → botón «Crear».
6. Fechas de calendario en **hora de Madrid** (`hoy()`, `relojMadrid()`); el ejecutor pasa `fecha: ctx.hoy` a los servicios.
7. Acceso: el bot calla con quien no es socio y en grupos no vinculados. Comandos de admin en `SOLO_ADMIN`.
8. Panel: sesión por cookie `__Host-sid` (prod), cambios solo con `Origin` = `PUBLIC_URL`.
9. Diseño del panel: «la marca de la placa» (negro de la base, crema de la placa, ámbar de las estrellas, Montserrat;
   verde/rojo solo para dinero). Componentes en `apps/web/src/ui/` (Radix, vaul, cmdk); formularios por pasos con `ui/Pasos`.
   Evitar los tics de diseño generado (sobretítulos en mayúsculas, sombras en tarjetas, degradados, «A · B · C», flechas en
   botones): lo vigila `apps/web/src/diseno.test.ts`. Muestrario en `/galeria`.
11. API: toda ruta `/api/*` declara `regla("publica"|"socio"|"admin")` (`apps/api/src/acceso.ts`); sin regla → 403.
    La matriz de permisos se prueba sola en `seguridad.test.ts`. «Solo lo tuyo» (cobrar) se comprueba en el servicio con `esAdmin`.
10. Secretos: nunca en el repo ni en el chat (`read -rsp` en el VPS). Hook gitleaks en `.githooks/`.

## Trampas conocidas
- Drizzle omite el nombre de la tabla en `select` de una sola tabla: en subconsultas SQL a mano, `${tabla.columna}` puede
  acabar refiriéndose a la tabla de dentro. Mejor consultas agrupadas por separado (ver `resumen.ts`).
- `@fastify/static` con `wildcard: false` registra los archivos al arrancar: tras recompilar la web, reinicia la API.
- `pnpm test` va en serie (`--workspace-concurrency=1`): core, bot y api comparten la BD `nfc_test`.
- Avisos: nunca enviar a Telegram desde la API ni desde scripts: dejar el mensaje en `avisos` (`avisar()` o un `insert`)
  y lo envía el bot. Texto en HTML de Telegram (escapar con `html()`).
- El contenedor `nfc-backup` y `tools/deploy.mjs` escriben en `avisos` por SQL: si cambia esa tabla, revisarlos.
- `hardware/soporte-nfc/` es el producto físico (OpenSCAD + scripts Python, ver su README). Las STL de `lotes/` no se
  versionan (se regeneran). El cálculo del carácter de control de los códigos está repetido en
  `packages/core/src/servicios/placas.ts`, `apps/web/src/lib/nfc.ts` y `hardware/soporte-nfc/scripts/generar_lote.py`.
