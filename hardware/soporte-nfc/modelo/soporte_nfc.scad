// Soporte NFC para reseñas v2: placa (impresa en plano) + base con ranura + tapa del hueco NFC.
// Exportar:  openscad -D 'parte="placa"' -o placa_nfc.stl soporte_nfc.scad
//            openscad -D 'parte="base"'  -o base_nfc.stl  soporte_nfc.scad
//            openscad -D 'parte="tapa"'  -o tapa_nfc.stl  soporte_nfc.scad
// QR: uv run --with segno python generar_qr.py "<enlace de reseñas>"

use <fonts/Montserrat-Medium.ttf>
use <fonts/Montserrat-SemiBold.ttf>
include <qr_datos.scad>

/* [Qué exportar] */
parte = "todo"; // [todo, placa, base, tapa]

/* [Placa] */
ancho = 100;
recorte_sin_qr = 48;   // lo que se acorta la placa sin QR
grosor = 4;
radio_esquina = 10;
chaflan = 0.6;
lengueta = 8;          // tramo inferior que entra en la ranura
angulo = 70;

/* [Relieve frontal] */
relieve = 0.6;
linea = 0.8;           // grosor de marco y trazos finos
margen_marco = 4;
mostrar_qr = true;
lado_qr = 28;

/* [Código de placa] */
codigo = "";          // lo pone generar_lote.py; va grabado en la tapa

/* [Textos] */
texto_pre = "¿Te ha gustado?";
texto_titulo = "Déjanos tu reseña";
texto_nfc = "Acerca tu móvil";
texto_qr = "Escanea el código";
fuente_titulo = "Montserrat:style=SemiBold";
fuente_texto = "Montserrat:style=Medium";

/* [Etiqueta NFC] */
diam_etiqueta = 30;
centro_nfc_con_qr = 100; // altura del centro sobre la placa
pared_frontal = 1.0;
hueco_pegatina = 0.8;
holgura_tapa = 0.15;

/* [Base] */
ancho_base = 112;
fondo_delante = 30;    // base por delante de la ranura
fondo_detras = 46;     // base por detrás de la ranura
alto_bordes = 8;
alto_centro = 13;
suelo_ranura = 3;
holgura_ranura = 0.2;
lastre = false;        // hueco inferior para monedas o arandelas

$fn = 72;

d_hueco = diam_etiqueta + 1;
prof_hueco = grosor - pared_frontal;
d_tapa = d_hueco - 2 * holgura_tapa;
grosor_tapa = prof_hueco - hueco_pegatina;
y_marco = lengueta + 6;
dy = mostrar_qr ? 0 : -recorte_sin_qr;  // desplazamiento del bloque superior
alto = 165 + dy;
centro_nfc = centro_nfc_con_qr + dy;
centro_qr = 44;

if (mostrar_qr && qr_provisional && parte != "base" && parte != "tapa")
    echo("AVISO: QR PROVISIONAL. Ejecuta generar_qr.py con el enlace real antes de imprimir.");

// ---------- Placa ----------

module contorno() {
    hull() {
        for (s = [-1, 1]) {
            translate([s * (ancho / 2 - 1), 1]) circle(1);
            translate([s * (ancho / 2 - radio_esquina), alto - radio_esquina]) circle(radio_esquina);
        }
    }
}

module rect_redondo(w, h, r) {
    offset(r) offset(delta = -r) square([w, h], center = true);
}

module trazo_rect(w, h, r, t) {
    difference() { rect_redondo(w, h, r); rect_redondo(w - 2 * t, h - 2 * t, max(r - t, 0.1)); }
}

module estrella(r) {
    polygon([for (i = [0:9]) let(a = 90 + i * 36, rr = i % 2 ? r * 0.45 : r) [rr * cos(a), rr * sin(a)]]);
}

module icono_movil() {
    translate([-4.5, 0]) {
        trazo_rect(11, 19, 2, 1.1);
        translate([0, 7.3]) rect_redondo(3.5, 0.9, 0.45);
    }
    // ondas
    translate([2, 0]) for (r = [4.5, 7.5, 10.5])
        intersection() {
            difference() { circle(r); circle(r - 1.1); }
            polygon([[0, 0], [20, 14], [20, -14]]);
        }
}

module texto(t, y, tam, f) {
    translate([0, y]) text(t, size = tam, font = f, halign = "center", valign = "center");
}

module qr() {
    m = lado_qr / qr_modulos;
    translate([-lado_qr / 2, centro_qr + lado_qr / 2])
        for (t = qr_tramos)
            translate([t[1] * m, -(t[0] + 1) * m]) square([t[2] * m + 0.001, m + 0.001]);
}

module frontal() {
    translate([0, (y_marco + alto - margen_marco) / 2])
        trazo_rect(ancho - 2 * margen_marco, alto - margen_marco - y_marco, radio_esquina - margen_marco, linea);
    texto(texto_pre, 150 + dy, 4.4, fuente_texto);
    texto(texto_titulo, 139 + dy, 6.2, fuente_titulo);
    for (i = [-2:2]) translate([i * 11, 126 + dy]) estrella(4.2);
    translate([0, centro_nfc]) {
        difference() { circle(18); circle(18 - linea); }
        icono_movil();
    }
    texto(texto_nfc, 74 + dy, 4.6, fuente_texto);
    if (mostrar_qr) {
        translate([0, 64.5]) {
            for (s = [-1, 1]) translate([s * 18, 0]) square([24, 0.6], center = true);
            text("o", size = 4, font = fuente_texto, halign = "center", valign = "center");
        }
        qr();
        texto(texto_qr, 22, 4.2, fuente_texto);
    }
}

module cuerpo_placa() {
    difference() {
        hull() {
            linear_extrude(grosor - chaflan) contorno();
            linear_extrude(grosor) offset(delta = -chaflan) contorno();
        }
        translate([0, centro_nfc, -0.01]) cylinder(d = d_hueco, h = prof_hueco + 0.01);
        // muesca para sacar la tapa con la uña
        translate([d_hueco / 2 - 1, centro_nfc - 3, -0.01]) cube([4, 6, 1.2]);
    }
}

module relieve_placa() {
    translate([0, 0, grosor - 0.01]) linear_extrude(relieve + 0.01) frontal();
}

module placa() {
    cuerpo_placa();
    relieve_placa();
}

// ---------- Base ----------

module fila_base(y, z) {
    r = 3;
    for (s = [-1, 1]) translate([s * (ancho_base / 2 - 8), y, 0]) {
        cylinder(r = 8, h = 1);
        translate([0, 0, z - r]) rotate_extrude() translate([8 - r, 0]) circle(r);
    }
}

// Coloca la placa con su canto inferior trasero en el fondo de la ranura
module en_ranura() {
    translate([0, 0, suelo_ranura]) rotate([angulo, 0, 0]) children();
}

module base() {
    difference() {
        hull() {
            fila_base(-fondo_delante + 8, alto_bordes);
            fila_base(0, alto_centro);
            fila_base(fondo_detras - 8, alto_bordes);
        }
        en_ranura() translate([-ancho / 2 - holgura_ranura, -holgura_ranura, -holgura_ranura])
            cube([ancho + 2 * holgura_ranura, 40, grosor + 2 * holgura_ranura]);
        // alojamientos para pies de goma
        for (sx = [-1, 1], y = [-fondo_delante + 12, fondo_detras - 12])
            translate([sx * (ancho_base / 2 - 12), y, -0.01]) cylinder(d = 10.4, h = 1);
        if (lastre) translate([-35, 8, -0.01]) cube([70, fondo_detras - 18, 5]);
    }
}

// ---------- Tapa ----------

module tapa() {
    difference() {
        cylinder(d = d_tapa, h = grosor_tapa);
        translate([0, 0, grosor_tapa - 0.4]) difference() {
            cylinder(d = d_tapa + 1, h = 1);
            cylinder(d1 = d_tapa, d2 = d_tapa - 1.2, h = 0.6);
        }
        // código grabado en la cara que queda a la vista (la de la cama; el chaflán entra primero en el hueco),
        // en espejo para leerse bien. Es lo que se escribe en el bot: /placa K7M2Q Bar Pepe
        // Ancho fijo (72 % de la tapa) sea cual sea el código: «M4PSN» medía 29,9 mm en una tapa de 30,7 y se cortaba.
        if (codigo != "") translate([0, 0, -0.01]) mirror([1, 0, 0])
            linear_extrude(0.61) resize([d_tapa * 0.72, 0], auto = true)
                text(codigo, size = 5.5, font = fuente_titulo, halign = "center", valign = "center", spacing = 1.1);
    }
}

// ---------- Salida ----------

if (parte == "placa") placa();
if (parte == "base") base();
if (parte == "tapa") tapa();
if (parte == "todo") {
    color("#2b2b2e") base();
    en_ranura() {
        color("#f4f1ea") cuerpo_placa();
        color("#1d1d1f") relieve_placa();
    }
    color("#f4f1ea") translate([ancho_base / 2 + 25, 0, 0]) tapa();
}
