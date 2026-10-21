"""Genera qr_datos.scad con la matriz del QR para el soporte NFC.

Uso (desde hardware/soporte-nfc/): uv run --with segno python scripts/generar_qr.py "https://g.page/r/XXXX/review"
Sin argumento genera un QR provisional de ejemplo.
Para placas con código (redirección desde el panel) usa generar_lote.py.
"""
import sys
from pathlib import Path

import segno

PROVISIONAL = "https://example.com/pon-aqui-tu-enlace-de-resenas"


def datos_qr(url: str):
    """(versión, módulos por lado, tramos) con los tramos horizontales [fila, columna_inicio, longitud]."""
    qr = segno.make(url, error="m", micro=False)
    filas = [[1 if c else 0 for c in fila] for fila in qr.matrix]
    tramos = []
    for y, fila in enumerate(filas):
        x = 0
        while x < len(fila):
            if fila[x]:
                ini = x
                while x < len(fila) and fila[x]:
                    x += 1
                tramos.append([y, ini, x - ini])
            else:
                x += 1
    return qr.version, len(filas), tramos


if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 else PROVISIONAL
    version, modulos, tramos = datos_qr(url)
    salida = Path(__file__).resolve().parent.parent / "modelo" / "qr_datos.scad"
    salida.write_text(
        "// Generado por generar_qr.py — no editar a mano\n"
        f"qr_url = \"{url}\";\n"
        f"qr_provisional = {'true' if url == PROVISIONAL else 'false'};\n"
        f"qr_modulos = {modulos};\n"
        f"qr_tramos = {tramos};\n"
    )
    print(f"{salida.name}: versión {version}, {modulos}×{modulos} módulos, {url}")
