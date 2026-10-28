# Guía rápida para los socios

[← Documentación](README.md) · [README del proyecto](../README.md)

Todo se apunta en el grupo de Telegram (o por privado al bot). Si te equivocas: `/deshacer` (10 minutos).

**Al visitar un comercio**
- `/visita Bar Pepe si` · `/visita Bar Pepe no muy caro` · `/visita Bar Pepe luego volver en 2 semanas`
- Si no existe, el bot pregunta si lo crea. Mándale después tu 📍 ubicación y la guarda en ese comercio.

**Al vender**
- `/venta Bar Pepe 3 pagado bizum` (pone el precio con tramos y ofertas, descuenta stock y apunta el dinero)
- Si aún no han pagado: `/venta Bar Pepe 3 pendiente` y luego `/cobrado 12 bizum`
- Precio especial: `/venta Bar Pepe 5 por 90€ pagado`

**Dinero**
- Pones dinero: `/aporto 50` · Pagas algo: `/gasto 30 imprenta` · Te llevas dinero: `/retiro 100`
- Ver cómo vamos: `/caja`, `/mes`, `/reparto`

**Consultas**: `/precios`, `/precio 5`, `/ficha Bar Pepe`, `/embudo`, `/pendientes`, `/stock`, `/ventas pendientes`

**Hablarle normal**: «hemos vendido 3 paneles al Bar Pepe, pagado por bizum». En el grupo, menciónalo o respóndele.
Siempre te pide confirmar antes de apuntar.

**Panel web**: `/panel` y abre el enlace que te llega por privado. La sesión se queda abierta en ese móvil u ordenador.
Para tenerlo como app: «Añadir a pantalla de inicio» y entra con el código de 8 cifras que te da `/panel`.
Desde el panel también se apunta todo (botón «Apuntar»), se cobran ventas pendientes y se ve quién ha hecho qué.
Lo que apuntes en el panel lo aviso en el grupo. ¿Móvil perdido? `/panel cerrar`.

Cada mañana a las 9:00 el bot te escribe por privado a quién te toca volver (ábrele un chat privado y pulsa Iniciar).
Los lunes publica en el grupo el resumen de la semana.

**Personalizar el bot** (admins, también en el panel → Ajustes):
- Nombre y tono: `/config nombre Billetes`, `/config tono cercano|serio|gracioso`, `/config emojis no`
- Notas para cuando le habláis normal: `/config ia responde en una línea`
- Menos ruido en el grupo: `/config limpieza` enseña cómo está. Por ejemplo, `/config limpieza consultas 10` borra a los
  10 minutos las respuestas a `/caja`, `/ventas`…; `/config limpieza privado si` contesta las consultas por privado.
- Para que borre también vuestros mensajes (`/config limpieza comandos si`), haced al bot admin del grupo con permiso
  «Eliminar mensajes» (en Telegram: grupo → Administradores → Añadir administrador).
- `/limpiar` en el grupo borra ya lo que tenía pendiente.
