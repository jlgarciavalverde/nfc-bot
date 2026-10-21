# Estado

## v0.1.0 (2026-10-21)
Hecho todo el plan (F0–F6):
- **Bot**: alta del primer admin con `SETUP_CODE`, `/vincular` el grupo, `/unirme` + aprobación; precios/tramos/ofertas,
  comercios/visitas/embudo/zonas/ubicaciones, ventas (precio automático, FIFO de stock, ingreso, estado cliente),
  cobros pendientes, caja (`/aporto`, `/gasto`, `/ingreso`, `/retiro`, `/caja`, `/mes`), `/compra` + `/stock` con aviso de
  stock bajo, recordatorios (`/pendientes`, `/recordar`, aviso diario a las 9:00 por privado), resumen semanal los lunes en el
  grupo, `/reparto` (igual / porcentaje / aportado + comisión de venta), `/deshacer`, `/panel`, lenguaje natural con Gemini
  y confirmación por botón.
- **Panel** (`nfc.redgarverde.com`): resumen con gráficas, comercios + ficha, mapa, ventas, caja, stock, reparto,
  precios (edición para admin, calculadora) y Excel con 7 hojas.
- **Tests**: core 26, bot 21, api 7, e2e 6.
- Copias: `nfc-backup` diario (30 días) + `tools/pull-backups.sh` y simulacro de restauración en el Mac (launchd).

## v0.2.0 (2026-10-21)
- Bienvenida al entrar en el grupo con botones «Quiero ser socio» (= /unirme, una petición abierta por persona) y
  «Abrir chat privado» + chuleta de comandos. Al aprobar: chuleta en el grupo y guía completa por privado.
  `/config bienvenida …` (admin) cambia el texto (`{nombre}`). `/start` de alguien que aún no es socio le explica cómo entrar.
- IA: si Gemini está saturado, prueba el siguiente modelo (`GEMINI_MODELS`, por defecto flash → flash-lite) (v0.1.1).
- Producción: bot con token y Gemini, admin «Cheluisss» dado de alta, grupo «Billetes» vinculado.

## Pendiente (lo tiene que hacer el usuario)
1. Crear el bot en @BotFather y poner `BOT_TOKEN` en el VPS (ver OPERACIONES). Desactivar *privacy mode* (`/setprivacy` → Disable)
   para que entienda frases en el grupo cuando le mencionan.
2. Ruta en Cloudflare: `nfc.redgarverde.com` → `http://nfc-web:3000`.
3. Clave de Gemini (opcional) en `GEMINI_API_KEY`.
4. `/start <SETUP_CODE>` por privado al bot, añadirlo al grupo, `/vincular`, que los demás hagan `/unirme`.
5. Meter precios reales: `/producto nuevo Panel NFC 25€`, tramos y ofertas.
6. `tools/install-launchd.sh` en el Mac para traer las copias.

## Ideas para después
- Facturas/tickets PDF para el comercio. Mensaje de seguimiento a clientes (¿cuántas reseñas han conseguido?).
- Registrar el número de reseñas del comercio en Google antes/después (argumento de venta).
