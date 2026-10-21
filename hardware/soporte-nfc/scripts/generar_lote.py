"""Genera un lote de placas con código: cada una con su QR (→ /r/<código>) y el código grabado en la tapa.

Uso (desde hardware/soporte-nfc/):
  uv run --with segno python scripts/generar_lote.py --lote lote-3.csv   ← lo normal: códigos reservados en el panel
  uv run --with segno python scripts/generar_lote.py 10                   ← códigos inventados aquí (sin pasar por el panel)
  [--url https://nfc.redgarverde.com]

Crea lotes/<fecha>_<n>/ con placa_<código>.stl, tapa_<código>.stl, base_nfc.stl y lote.csv (qué URL programar en cada
pegatina NFC). Lo normal es reservar el lote en el panel (Placas → Nuevo lote → lote.csv): así la base de datos es el
registro único de códigos y las placas ya aparecen en el panel. Con N, los códigos solo quedan en lotes/codigos.txt y
hay que darlos de alta en el panel después.
Al venderla: /placa <código> <comercio> en el bot, y el enlace de reseñas del comercio con /dato … | resenas | …
"""
import argparse
import csv
import datetime
import secrets
import shutil
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from generar_qr import datos_qr

# Mismo alfabeto y carácter de control que packages/core/src/servicios/placas.ts
ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
RAIZ = Path(__file__).resolve().parent.parent
MODELO = RAIZ / "modelo" / "soporte_nfc.scad"
BASE = RAIZ / "para-imprimir" / "base_nfc.stl"
REGISTRO = RAIZ / "lotes" / "codigos.txt"


def control(base: str) -> str:
    return ALFABETO[sum((i + 1) * ALFABETO.index(c) for i, c in enumerate(base)) % len(ALFABETO)]


def codigos_nuevos(n: int, usados: set[str]) -> list[str]:
    nuevos: list[str] = []
    while len(nuevos) < n:
        base = "".join(secrets.choice(ALFABETO) for _ in range(4))
        c = base + control(base)
        if c not in usados and c not in nuevos:
            nuevos.append(c)
    return nuevos


def openscad(parte: str, salida: Path, defs: dict[str, str]):
    args = ["openscad", "--backend=manifold", "--export-format=binstl", "-D", f'parte="{parte}"', "-o", str(salida)]
    for k, v in defs.items():
        args += ["-D", f"{k}={v}"]
    subprocess.run([*args, str(MODELO)], check=True, capture_output=True)


def codigos_de_csv(ruta: Path) -> list[str]:
    """Códigos de un lote.csv descargado del panel (columna «codigo»), comprobando el carácter de control."""
    with ruta.open(newline="") as f:
        cods = [fila["codigo"].strip().upper() for fila in csv.DictReader(f) if fila.get("codigo")]
    malos = [c for c in cods if len(c) != 5 or any(x not in ALFABETO for x in c) or control(c[:4]) != c[4]]
    if malos or not cods:
        raise SystemExit(f"El CSV no tiene códigos válidos: {malos or 'ninguno'}")
    return cods


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("n", type=int, nargs="?", help="cuántas placas (si no usas --lote)")
    ap.add_argument("--lote", type=Path, help="lote.csv descargado del panel (códigos ya reservados)")
    ap.add_argument("--url", default="https://nfc.redgarverde.com", help="dirección pública del panel")
    a = ap.parse_args()

    if not a.lote and not a.n:
        ap.error("di cuántas placas (p. ej. 10) o pasa --lote lote.csv")
    REGISTRO.parent.mkdir(exist_ok=True)
    usados = set(REGISTRO.read_text().split()) if REGISTRO.exists() else set()
    codigos = codigos_de_csv(a.lote) if a.lote else codigos_nuevos(a.n, usados)
    n = len(codigos)
    lote = RAIZ / "lotes" / f"{datetime.date.today()}_{n}"
    i = 2
    while lote.exists():
        lote = lote.with_name(f"{datetime.date.today()}_{n}-{i}")
        i += 1
    lote.mkdir(parents=True)
    # Se reservan antes de generar: un código impreso no debe repetirse nunca
    with REGISTRO.open("a") as f:
        f.writelines(f"{c}\n" for c in codigos if c not in usados)

    host = a.url.rstrip("/")
    filas = []

    def una(c: str):
        # En el QR, todo en mayúsculas: modo alfanumérico, QR más pequeño y fácil de leer (el panel acepta /R/)
        url_qr = f"{host}/R/{c}".upper()
        _, modulos, tramos = datos_qr(url_qr)
        qr = {"mostrar_qr": "true", "qr_provisional": "false", "qr_url": f'"{url_qr}"', "qr_modulos": str(modulos), "qr_tramos": str(tramos)}
        openscad("placa", lote / f"placa_{c}.stl", qr)
        openscad("tapa", lote / f"tapa_{c}.stl", {"codigo": f'"{c}"'})
        print(f"  {c}")
        return {"codigo": c, "url_nfc": f"{host}/r/{c}", "url_qr": url_qr}

    print(f"Generando {n} placas en {lote.relative_to(RAIZ)} …")
    with ThreadPoolExecutor(max_workers=4) as ex:
        filas = list(ex.map(una, codigos))

    with (lote / "lote.csv").open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["codigo", "url_nfc", "url_qr"])
        w.writeheader()
        w.writerows(filas)
    shutil.copy(BASE, lote / "base_nfc.stl")
    print(f"Listo: {len(filas)} placas en {lote.relative_to(RAIZ)} (con base_nfc.stl, igual para todas). Pegatinas NFC: lote.csv (columna url_nfc).")
    if not a.lote:
        print("Ojo: estos códigos no están en el panel. Lo normal es reservarlos allí (Placas → Nuevo lote) y usar --lote.")


if __name__ == "__main__":
    main()
