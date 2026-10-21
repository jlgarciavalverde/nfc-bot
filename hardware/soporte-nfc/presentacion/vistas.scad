// Vistas para enseñar el soporte (no para imprimir): conjunto montado, despiece y cada pieza.
//   openscad -D 'vista="conjunto"' -o conjunto.png vistas.scad
// Usa el modelo real (../soporte_nfc.scad) con la placa de ejemplo M4PSN.
include <../modelo/soporte_nfc.scad>
include <qr_ejemplo.scad>

parte = "nada";     // que el modelo no dibuje su vista «todo»
codigo = "M4PSN";
vista = "conjunto"; // [conjunto, trasera, despiece, placa, placa_trasera, base, base_abajo, tapa]

C_BASE = "#26262a";
C_PLACA = "#efebe3";
C_RELIEVE = "#18181b";
C_PEGATINA = "#c9a227";

module placa_color() {
    color(C_PLACA) cuerpo_placa();
    color(C_RELIEVE) relieve_placa();
}
// El grabado del código, relleno en oscuro para que se vea en las imágenes (en la pieza real es un hueco de 0,6 mm)
module codigo_relleno() {
    color(C_RELIEVE) translate([0, 0, -0.03]) mirror([1, 0, 0]) linear_extrude(0.5)
        resize([d_tapa * 0.72, 0], auto = true) text(codigo, size = 5.5, font = fuente_titulo, halign = "center", valign = "center", spacing = 1.1);
}
module tapa_vista() { color(C_PLACA) tapa(); codigo_relleno(); }
module tapa_en_hueco() { translate([0, centro_nfc, 0]) tapa_vista(); }
module pegatina() { color(C_PEGATINA) translate([0, centro_nfc, grosor_tapa + 0.05]) cylinder(d = diam_etiqueta, h = 0.6); }

if (vista == "conjunto" || vista == "trasera") {
    color(C_BASE) base();
    en_ranura() { placa_color(); tapa_en_hueco(); }
}
if (vista == "despiece") {
    color(C_BASE) base();
    // la placa sale hacia arriba por la ranura; la pegatina y la tapa, hacia atrás
    en_ranura() translate([0, 55, 0]) {
        placa_color();
        translate([0, 0, -30]) pegatina();
        translate([0, 0, -62]) tapa_en_hueco();
    }
}
if (vista == "placa" || vista == "placa_trasera") placa_color();
if (vista == "base" || vista == "base_abajo") color(C_BASE) base();
if (vista == "tapa") tapa_vista();
