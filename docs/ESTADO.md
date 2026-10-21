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

## v0.5.0 (2026-10-21): renovación del panel
- Diseño «la marca de la placa», carcasa nueva (barra inferior con «+» en el móvil, lateral en el ordenador, buscador ⌘K
  que ignora tildes), páginas rehechas (Hoy, Comercios + mapa, ficha `/comercios/:id` con historia, Caja con pestañas,
  Ventas, Stock, Placas, Precios, Cuenta, Más) y nuevas de admin (Ajustes, Socios, Auditoría).
- Asistentes por pasos (`ui/Pasos`, borrador en sessionStorage): visita, venta, dinero, comercio (geolocalización),
  compra, recordatorio y **placa** (leer pegatina/QR o escribir código, comercio, enlace de reseñas guiado o Place ID,
  grabar + comprobar + bloquear con Web NFC; sin Web NFC, URL para NFC Tools).
- Lotes de placas en la BD (`tandas_placas`, `placas.tanda_id`, migración 0004): reservar desde el panel (admin),
  descargar `lote.csv` y `qr.zip`. Los 3 códigos del lote de ejemplo del Mac (M4PSN, GNDAT, P3MCS) importados como lote.
- Seguridad: `acceso.ts` (regla por ruta, denegado por defecto), matriz de permisos generada, límite de escrituras por
  socio, freno global a códigos de entrada, aviso por Telegram de cada inicio de sesión, auditoría (admin),
  Permissions-Policy. Un socio solo cobra sus ventas (también en el bot).
- Tests: core 33, api 25, bot 30, web 5, e2e 12 (axe AA claro y oscuro, NFC simulado).
- `hardware/soporte-nfc/` reorganizado (modelo/, scripts/, para-imprimir/, lotes/, presentacion/, entregas/);
  `scripts/generar_lote.py --lote lote.csv` usa los códigos reservados en el panel; medidas comprobadas y ficha en PDF
  para la impresora; código de la tapa ajustado al 72 % del diámetro (antes se salía).

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

## v0.6.0 (2026-10-21): personalizar el chat
- Ajustes nuevos (tabla `ajustes`, sin migración): `nombreAsistente`, `tono` (cercano/serio/gracioso), `emojis`,
  `instruccionesIa` (≤ 500, se añaden al final del prompt sin cambiar las reglas) y `limpieza`
  (`consultasMin`, `apuntesMin`, `erroresMin` 0–2820, `borrarComandos`, `consultasPorPrivado`). `leerAjustes` completa
  `limpieza` con `LIMPIEZA_DEFECTO`.
- `packages/core/src/estilo.ts` (también `@nfc/core/estilo` para la web): `frase(estilo, clave)` con las frases más vistas por
  tono, `aplicarEstilo` (quita emojis) y `ejemploEstilo` (vista previa en Ajustes).
- Bot: el middleware deja `ctx.ajustes`; `enviar()` aplica el estilo a todo lo que sale y decide el borrado por
  `Respuesta.clase` (`consulta`/`apunte` según `ESCRITURA`, `error` en `correr`). Consultas y apuntes solo se borran en el
  grupo; errores en cualquier chat. El modo privado manda la consulta entera por privado y deja un aviso de 1 min.
  `/limpiar` (admin, grupo) usa `vaciarEfimeros`. El programador aplica el estilo a avisos, recordatorios y resumen (que
  nunca se borran).
- `/config nombre|tono|emojis|ia|limpieza`; `PUT /api/ajustes` valida los campos nuevos; Ajustes del panel con
  «Personalidad del asistente» (vista previa) y «Limpieza del chat».
- `borrarComandos` necesita que el bot sea admin del grupo con «Eliminar mensajes»; si no, Telegram lo rechaza sin más.
- e2e: `LOGIN_RATE_LIMIT=100` en `playwright.config.ts` (con 14 tests se pasaba de 10 inicios/min).

## v0.6.1 (2026-10-21): usabilidad en el móvil
- Teclado: viewport `interactive-widget=resizes-content` (Android encoge la ventana) y `lib/teclado.ts` (`useTeclado` en
  `App.tsx`): publica `--vvh`, `--teclado` (lo que tapa en iOS) y `html[data-teclado]`; variante Tailwind `teclado:`.
  La hoja del móvil (`.hoja-movil`) se apoya encima del teclado; cabecera compacta; `scroll-pb-28` para que el campo enfocado
  no quede bajo la barra de botones. Barra inferior oculta con teclado; toast y barra de Ajustes se recolocan.
- `Pasos`: el aviso de error va pegado a los botones; en pantallas táctiles solo se abre el teclado al cambiar de paso si el
  paso tiene `escribir: true`; `ContextoPaso` pone `enterKeyHint` (next/done) a `Campo` e `Importe`; aviso de borrador
  recuperado con «Empezar de cero» (`useBorrador` devuelve un 4.º elemento).
- Campos: `autoCapitalize`/`autoComplete`/`inputMode` revisados; Enter en «¿Qué comercio?» elige el primero; chips de 44 px;
  `Cifra` sin `truncate` (tamaño con `clamp`); editar datos del comercio con «Guardar» pegado abajo.
- e2e: proyectos `escritorio` y `movil` (375×667 táctil, `e2e/movil.spec.ts`): teclado simulado encogiendo el viewport
  (Android) y simulando `visualViewport` (iOS), sin desbordes en ninguna página, borrador, axe en hojas. Con
  `CAPTURAS=carpeta` guarda capturas para revisar.

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
