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
- **Tests** (v0.2): core 26, bot 21, api 7, e2e 6.
- Copias: `nfc-backup` diario (30 días) + `tools/pull-backups.sh` y simulacro de restauración en el Mac (launchd).

## v0.2.0 (2026-10-21)
- Bienvenida al entrar en el grupo con botones «Quiero ser socio» (= /unirme, una petición abierta por persona) y
  «Abrir chat privado» + chuleta de comandos. Al aprobar: chuleta en el grupo y guía completa por privado.
  `/config bienvenida …` (admin) cambia el texto (`{nombre}`). `/start` de alguien que aún no es socio le explica cómo entrar.
- IA: si Gemini está saturado, prueba el siguiente modelo (`GEMINI_MODELS`, por defecto flash → flash-lite) (v0.1.1).
- Copias en el VPS a las 4:00 con simulacro de restauración diario (`backups/simulacro.txt`).
- Producción: bot con token y Gemini, admin «Cheluisss» dado de alta, grupo «Billetes» vinculado.

## v0.3.0 (2026-10-21)
- **Buzón de avisos** (`avisos`): panel, copias (`nfc-backup` deja el resultado; si falla → admins), despliegues
  (`tools/deploy.mjs` publica `docs/novedades.md`), ofertas que terminan (3 días antes y al día siguiente), stock bajo.
  El bot lo envía cada 10 s. `/config avisos <tipo> si|no` silencia tipos. Cobros sin cobrar > 7 días → al vendedor a las 9:00.
  Resumen de los lunes incluye el estado de la última copia.
- **Sesión permanente**: 365 días renovados con el uso (como mucho una escritura al día). Código de 8 cifras en `/panel` para
  entrar desde la app instalada (PWA: manifest + iconos). `/panel cerrar` y página «Cuenta» con sesiones y «cerrar en los demás».
- **Panel para gestionar**: botón «Apuntar» (visita, venta, dinero, compra, comercio, recordatorio, con buscador y «Crear»),
  cobrar ventas, marcar recordatorios hechos, editar datos del comercio, actividad reciente con «Deshacer». Todo lo que se
  apunta en el panel avisa al grupo.
- Cloudflare: rutas `nfc`, `paquito` y `demo-paquito` creadas con el MCP de Cloudflare (acceso completo; preguntar antes de algo de pago).
- Tests: core 26, bot 25, api 12, e2e 9.

## v0.4.0 (2026-10-21)
### Mensajes que se borran solos
- Tabla `efimeros` (migración 0003): el bot programa el borrado de sus mensajes de un momento y los borra cada 10 s
  (Telegram solo deja borrar < 48 h). `/panel`: mensaje más explicativo, se borra a los 15 min y el nuevo borra el anterior
  (clave `panel:<socio>`). Preguntas Confirmar/Cancelar: se borran al contestar (cancelar = solo toast) o a los 30 min.
  Errores: 5 min. Avisos breves del grupo: 1 min. «Hoy te toca»: el de cada día borra el anterior (clave `dia:<socio>`).
  «Hecho» de un recordatorio quita ese botón en vez de mandar mensaje.

### Placas con código
- Cada placa impresa lleva un código de 5 caracteres (4 al azar + 1 de control, alfabeto sin 0/O/1/I/L) en el QR y la
  pegatina NFC: `/r/<código>` (también `/R/`, el QR va en mayúsculas para salir más pequeño). Redirige (302, sin caché)
  al enlace de reseñas del comercio asignado y cuenta el escaneo. Sin asignar o sin enlace: página «aún no activada».
  Límite: 60 escaneos/min por IP. Los códigos nunca asignados no crean filas.
- Tabla `placas` (fila al asignar) y `comercios.resenasUrl` (migración 0002_placas).
- Bot: `/placa K7M2Q Bar Pepe` (asigna; propone crear el comercio), `/placa K7M2Q` (info), `/placa K7M2Q quitar`, `/placas`,
  `/dato Bar Pepe | resenas | https://…`. La ficha muestra placas y escaneos. Se puede deshacer.
- Lotes en el Mac: `hardware/soporte-nfc/generar_lote.py N` (STL de placa con su QR + tapa con el código grabado + lote.csv
  con la URL de cada pegatina NFC). El carácter de control está duplicado en Python y en `servicios/placas.ts`.
- Falta: verlo en el panel web (la API de la ficha ya devuelve `placas`).

## Pendiente (lo tiene que hacer el usuario)
1. Crear el bot en @BotFather y poner `BOT_TOKEN` en el VPS (ver OPERACIONES). Desactivar *privacy mode* (`/setprivacy` → Disable)
   para que entienda frases en el grupo cuando le mencionan.
2. Ruta en Cloudflare: `nfc.redgarverde.com` → `http://nfc-web:3000`.
3. Clave de Gemini (opcional) en `GEMINI_API_KEY`.
4. `/start <SETUP_CODE>` por privado al bot, añadirlo al grupo, `/vincular`, que los demás hagan `/unirme`.
5. Meter precios reales: `/producto nuevo Panel NFC 25€`, tramos y ofertas.
6. (Opcional) `tools/install-launchd.sh` en el Mac para tener las copias también fuera del VPS. Por decisión del usuario, de momento solo en el VPS.

## Ideas para después
- Facturas/tickets PDF para el comercio. Mensaje de seguimiento a clientes (¿cuántas reseñas han conseguido?).
- Registrar el número de reseñas del comercio en Google antes/después (argumento de venta).
