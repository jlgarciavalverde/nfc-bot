# Arquitectura

[← Documentación](README.md) · [README del proyecto](../README.md)

Un monorepo pnpm con dos procesos (bot y web) que comparten la lógica de negocio y una base de datos Postgres.

| Paquete | Qué es |
|---|---|
| `packages/core` | Lógica de negocio y base de datos: esquema Drizzle, migraciones y servicios (ventas, caja, stock, placas, reparto, avisos, recordatorios…). Los dos procesos llaman a estos servicios: ninguno escribe SQL por su cuenta. |
| `apps/bot` | Bot de Telegram (grammY): comandos, lenguaje natural con Gemini, confirmación por botón, programador de avisos y limpieza de mensajes. |
| `apps/api` | Fastify: API del panel, control de acceso por ruta, exportación a Excel y redirección de las placas (`/r/<código>`). Sirve también la web. |
| `apps/web` | Panel en React 19 + Vite + TanStack Query + wouter + Tailwind 4 (PWA): Hoy, Comercios con mapa (Leaflet), Ventas, Caja, Stock, Placas (Web NFC), Precios, Socios, Ajustes y Auditoría. |
| `hardware/soporte-nfc` | El producto físico: modelo 3D en OpenSCAD, generador de lotes (STL con el QR y el código de cada placa) y ficha para la impresora. |

## Contexto

```mermaid
flowchart LR
  socios["Socios<br/>(Telegram y panel)"]
  cliente["Clientes de los comercios"]
  subgraph sistema["Paneles NFC"]
    bot["Bot de Telegram"]
    panel["Panel web"]
    redir["/r/código"]
  end
  tg[(Telegram)]
  gem[(Gemini)]
  google[(Reseñas de Google)]

  socios <--> tg <--> bot
  socios --> panel
  bot -- "texto libre → acción" --> gem
  cliente -- "acerca el móvil a la placa / escanea el QR" --> redir -- "302" --> google
```

## Contenedores

```mermaid
flowchart TB
  subgraph vps["VPS casero · Docker Compose"]
    subgraph app["imagen nfc-bot"]
      web["web<br/>Fastify + panel React"]
      bot["bot<br/>grammY + programador"]
    end
    core["@nfc/core<br/>servicios + Drizzle"]
    db[("db<br/>Postgres 17")]
    backup["backup<br/>pg_dump diario 4:00<br/>+ simulacro de restauración"]
    web --> core
    bot --> core
    core --> db
    backup --> db
  end
  cf["Cloudflare Tunnel<br/>nfc.redgarverde.com"] --> web
  bot <-- "long polling" --> telegram[(API de Telegram)]
  mac["Mac: tools/pull-backups.sh (launchd)"] -- "copia externa" --> backup
```

El bot y la web comparten imagen y arrancan con comandos distintos. La base de datos no tiene puerto publicado: solo la ven los contenedores de la red interna.

## Modelo de datos

```mermaid
erDiagram
  socios ||--o{ sesiones : "entra al panel"
  socios ||--o{ visitas : hace
  socios ||--o{ ventas : vende
  socios ||--o{ movimientos : "aporta / gasta"
  socios ||--o{ recordatorios : tiene
  socios ||--o{ operaciones : "registro + deshacer"
  comercios ||--o{ visitas : recibe
  comercios ||--o{ ventas : compra
  comercios ||--o{ placas : "tiene asignadas"
  comercios ||--o{ recordatorios : sobre
  tandas_placas ||--o{ placas : agrupa
  productos ||--o{ tramos : "precio por cantidad"
  productos ||--o{ ofertas : tiene
  productos ||--o{ lotes : "compras de stock"
  productos ||--o{ ventas : vendido
  ventas ||--o{ consumos : "gasta stock (FIFO)"
  lotes ||--o{ consumos : "se consume en"
  ventas ||--o{ movimientos : "ingreso en caja"

  placas {
    int id PK
    text codigo UK "5 caracteres, 1 de control"
    int comercio_id FK
    int tanda_id FK
    timestamp nfc_bloqueada_at
    int escaneos
  }
  comercios {
    int id PK
    text nombre
    text resenas_url
    real lat
    real lon
    enum estado "pendiente | interesado | si | no | cliente"
    timestamp anulado_at
  }
  ventas {
    int id PK
    int uds
    int total_cent "precio por tramo u oferta"
    int coste_cent "coste FIFO del stock"
    bool cobrada
    enum metodo "efectivo | bizum | transferencia | tarjeta | otro"
    timestamp anulado_at
  }
  movimientos {
    int id PK
    enum tipo "aportacion | gasto | ingreso | retirada"
    int importe_cent
    timestamp anulado_at
  }
```

El dinero va siempre en céntimos (enteros) y los porcentajes en puntos básicos. Nada se borra: los registros se anulan (`anulado_at`) y todas las consultas los filtran.

Tablas de soporte: `ajustes` (tono del asistente, limpieza, avisos), `pendientes` (peticiones para ser socio), `enlaces_panel` (códigos de entrada desde el bot), `avisos` (buzón que el bot envía cada 10 s), `efimeros` (mensajes que el bot borra solo), `envios` y `uso_ia` (consumo de Gemini).

## Seguridad

```mermaid
flowchart LR
  req[Petición] --> h["helmet + Permissions-Policy"] --> rl["límite por IP<br/>y por socio"] --> acc{"acceso.ts<br/>regla de la ruta"}
  acc -- "sin regla → 403" --> no[Denegado]
  acc -- "socio / admin" --> sv[Servicio de core]
  sv --> audit[(operaciones<br/>auditoría)]
```

- Acceso denegado por defecto: cada ruta declara quién puede usarla y un test genera la matriz de permisos.
- Entrada por enlace mágico o código de 8 cifras que da el bot (`/panel`); cookie `__Host-sid` y cambios solo con `Origin` propio.
- Sesiones de 365 días que se renuevan con el uso; aviso por Telegram de cada inicio de sesión; «cerrar en los demás».
- Un socio solo cobra sus propias ventas, tanto en el bot como en el panel.
- `gitleaks` en un hook de pre-commit (`.githooks`).

## Decisiones

| Decisión | Por qué |
|---|---|
| Telegram como interfaz principal | Los socios ya viven en el grupo: apuntar una venta es escribir un mensaje. El panel queda para consultar y gestionar. |
| Lenguaje natural con confirmación | Gemini traduce «he vendido 2 a Bar Pepe» a una acción, pero no se ejecuta nada sin pulsar «Confirmar». |
| Lógica solo en `core` | Bot y panel aplican las mismas reglas (precio automático, FIFO de stock, permisos), y se prueban una sola vez. |
| Código corto con dígito de control | Cabe en un QR pequeño y en la tapa impresa, y detecta erratas al teclearlo. |
| Redirección 302 sin caché | Se puede cambiar el enlace de una placa ya entregada sin tocar la placa. |
| Todo se puede deshacer | Cada operación queda en `operaciones` con lo necesario para revertirla (10 min, solo lo propio). |
