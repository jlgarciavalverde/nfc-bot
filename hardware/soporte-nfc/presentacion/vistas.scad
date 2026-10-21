// Vistas para enseñar el soporte (no para imprimir): conjunto montado, despiece y cada pieza.
//   openscad -D 'vista="conjunto"' -o conjunto.png vistas.scad
// Usa el modelo real (../soporte_nfc.scad) con la placa de ejemplo M4PSN.
include <../modelo/soporte_nfc.scad>
include <qr_ejemplo.scad>

parte = "nada";     // que el modelo no dibuje su vista «todo»
codigo = "M4PSN";
vista = "conjunto"; // [conjunto, trasera, despiece, despiece_trasera, placa, placa_trasera, base, base_abajo, tapa]

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

// OpenSCAD ilumina desde la cámara: para las vistas traseras o de abajo se gira la pieza (no la cámara),
// así cada cara sale con su color real en vez de en sombra.
module montado() {
    color(C_BASE) base();
    en_ranura() { placa_color(); tapa_en_hueco(); }
}
module despiezado() {
    color(C_BASE) base();
    // la placa sale hacia arriba por la ranura; la pegatina y la tapa, hacia atrás
    en_ranura() translate([0, 55, 0]) {
        placa_color();
        translate([-75, 0, -20]) pegatina();
        translate([-115, 0, -20]) tapa_en_hueco();
    }
}
if (vista == "conjunto") montado();
if (vista == "trasera") rotate([-45, 0, 0]) rotate([0, 0, 180]) montado();
if (vista == "despiece") despiezado();
if (vista == "despiece_trasera") rotate([-45, 0, 0]) rotate([0, 0, 180]) despiezado();
if (vista == "placa") placa_color();
if (vista == "placa_trasera") rotate([0, 180, 0]) placa_color();
if (vista == "base") color(C_BASE) base();
if (vista == "base_abajo") rotate([0, 180, 0]) color(C_BASE) base();
if (vista == "tapa") rotate([0, 180, 0]) tapa_vista();
