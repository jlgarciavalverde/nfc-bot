# Soporte NFC para reseñas (v2)

Atril de mostrador en dos piezas: una placa de 100 × 165 mm con relieve en otro color y QR de respaldo, y una base esculpida con ranura a 70°. Lleva además una tapa para el hueco de la pegatina NFC (Ø 25–30 mm).

## Carpetas
| Carpeta | Qué hay |
|---|---|
| `modelo/` | El diseño: `soporte_nfc.scad` (OpenSCAD, paramétrico), `qr_datos.scad` (QR de una placa suelta) y `fonts/` (Montserrat, OFL) |
| `scripts/` | `generar_lote.py` (placas con código, en tandas) y `generar_qr.py` (placa suelta con un enlace fijo) |
| `para-imprimir/` | Piezas genéricas listas: `base_nfc.stl` (igual para todas), placa sin QR, tapa sin código, instrucciones para Cura |
| `lotes/` | Una carpeta por tanda impresa (`<fecha>_<n>/`: placa y tapa de cada código, la base y `lote.csv`) y `codigos.txt` |
| `presentacion/` | Para enseñar: ficha en PDF (vistas, medidas comprobadas, ajustes, montaje), `imagenes/`, `stl/` de ejemplo y `vistas.scad` |
| `entregas/` | Lo que se manda fuera: `Soporte_NFC_para_la_impresora.zip` |

## Lotes de placas con código (lo normal)
Cada placa lleva su propio código, que va en el QR, en la pegatina NFC y grabado en la tapa. Ese código redirige, a través del panel, a las reseñas del comercio al que se asigne. Así se imprime para tener en stock, sin saber todavía para quién es cada placa.
1. En el panel (nfc.redgarverde.com → Placas → Nuevo lote, solo admins) reserva N códigos y descarga `lote.csv`.
   Así la base de datos es el registro único de códigos y las placas ya aparecen en el panel como «libres».
2. En el Mac, desde esta carpeta:
```sh
uv run --with segno python scripts/generar_lote.py --lote ~/Downloads/lote-2.csv
```
Se crea `lotes/<fecha>_<n>/` con `placa_<código>.stl` y `tapa_<código>.stl` de cada placa, `base_nfc.stl` (igual para
todas) y `lote.csv` (columna `url_nfc`: qué URL grabar en cada pegatina; también se graba desde el panel con el móvil).
Sin panel: `scripts/generar_lote.py 10` inventa 10 códigos (quedan en `lotes/codigos.txt`; no borres ese archivo).

Para cada placa:
1. Imprime la placa y su tapa, sin mezclar códigos entre una placa y otra.
2. Graba la pegatina NFC con la URL de su código, sacada de `lote.csv`.
3. Al venderla, apúntalo en el bot: `/placa <código> Bar Pepe` y `/dato Bar Pepe | resenas | https://g.page/r/…/review`. Hasta que lo hagas, quien escanee la placa ve una página de «aún no activada».

## Placa con un enlace fijo (sin código)
Para hacer una placa suelta que lleve directamente a un enlace concreto:
`modelo/qr_datos.scad` trae un QR **provisional** (example.com). Para poner el enlace:
```sh
uv run --with segno python scripts/generar_qr.py "https://g.page/r/XXXX/review"
openscad -D 'parte="placa"' -o placa_nfc.stl modelo/soporte_nfc.scad
```

## Imprimir
| Pieza | Orientación | Notas |
|---|---|---|
| Placa | En plano, cara del texto **hacia arriba** | Activa el planchado (ironing) en la cara superior. **Cambio de filamento a Z = 4.0 mm** (M600 o pausa) para el relieve |
| Base | Tal cual, apoyada en la cara plana | Sin soportes; 4 perímetros y un 25 % de relleno para que pese |
| Tapa | En plano | Del mismo color que la placa |

- Capa de 0.2 mm y PLA, sin soportes en ninguna pieza.
- La placa necesita una cama de al menos 100 × 165 mm (vale cualquiera de 180 mm o más).
- Colores: el **relieve tiene que ser oscuro sobre una placa clara** (o con mucho contraste) para que el QR se lea. Combinaciones recomendadas: blanco y negro, o crema y negro, con la base negra.

## Montaje
1. Programa la pegatina con la URL de reseñas (NFC Tools → Escribir → URL). Usa la misma URL que en el QR.
2. Pégala en el fondo del hueco trasero de la placa y mete la tapa a presión (la muesca sirve para sacarla).
3. Encaja la placa en la ranura de la base. Si queda floja, pon una gota de cola.
4. Pega 4 pies de goma de Ø10 mm debajo de la base. Si activas `lastre = true`, se abre un hueco inferior de 70 × 28 × 5 mm para pegar monedas o arandelas.

## Medidas
Comprobadas sobre el modelo (intersecciones vacías entre piezas, holguras, estabilidad, QR y grosor de trazos): ver la
página «Medidas comprobadas» de `presentacion/Soporte_NFC_ficha_impresion.pdf`. Resumen: placa 100 × 165 × 4,6, base
112 × 76 × 13, tapa Ø 30,7 × 2,2; ranura 4,4 para placa de 4,0; tapa a presión con 0,15 por lado. Textos pequeños con
trazos de 0,56 mm: boquilla 0,4 y «Imprimir paredes finas».

## Ajustes habituales
- La tapa no entra: sube `holgura_tapa` a 0.2.
- La placa no entra en la ranura: sube `holgura_ranura` a 0.3.
- El móvil no lee la etiqueta: baja `pared_frontal` a 0.8.
- Textos y tamaños: están en el bloque `[Textos]` y en `frontal()`. El ancho útil dentro del marco es de unos 84 mm.

## Paquete para la impresora
`entregas/Soporte_NFC_para_la_impresora.zip`: ficha en PDF, imágenes y STL de ejemplo (placa M4PSN). Para regenerar las
imágenes: `cd presentacion && openscad -D 'vista="conjunto"' -o imagenes/conjunto.png vistas.scad` (vistas: conjunto,
trasera, despiece, placa, placa_trasera, base, base_abajo, tapa).

`para-imprimir/soporte_nfc_para_imprimir.zip` (Cura) incluye los STL binarios, la versión **sin QR** (placa de 100 × 117 mm, `-D mostrar_qr=false`) y `LEEME_CURA.txt` con la pausa para el cambio de color. La placa con QR se añade cuando haya enlace: `placa_nfc_con_qr.stl`.
