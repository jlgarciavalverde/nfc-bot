#!/bin/sh
# Simulacro de restauración: restaura la última copia en un Postgres desechable (Docker local) y comprueba que
# está completa. Deja el resultado en ~/Backups/nfc-bot/simulacro.txt y avisa con una notificación si falla.
set -u
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
DEST="$HOME/Backups/nfc-bot"
REPORT="$DEST/simulacro.txt"
NAME="nfc-restore-drill"
# La más reciente de las diarias (nfc-*) y las previas a cada despliegue (pre-*).
last=$(ls -t "$DEST"/nfc-*.sql.gz "$DEST"/pre-*.sql.gz 2>/dev/null | head -1 || true)
fail() {
  echo "$(date '+%F %T') FALLO: $1" | tee "$REPORT"
  osascript -e "display notification \"$1\" with title \"Bot NFC: la copia de seguridad NO se restaura\"" 2>/dev/null || true
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  exit 1
}
[ -n "$last" ] || fail "no hay copias en $DEST"
docker info >/dev/null 2>&1 || { colima start >/dev/null 2>&1 || fail "Docker no está disponible"; }
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=drill -e POSTGRES_USER=nfc -e POSTGRES_DB=nfc postgres:17-alpine >/dev/null || fail "no arranca Postgres"
for i in $(seq 1 30); do docker exec "$NAME" pg_isready -U nfc >/dev/null 2>&1 && break; sleep 1; done
gunzip -c "$last" | docker exec -i "$NAME" psql -q -v ON_ERROR_STOP=1 -U nfc -d nfc >/dev/null 2>"$DEST/.drill-err" || fail "error al restaurar $(basename "$last"): $(head -c 200 "$DEST/.drill-err")"
# Filas de cada tabla (las que existan en esa copia) y número de migraciones aplicadas.
counts=$(docker exec "$NAME" psql -U nfc -d nfc -tA -F' ' -c "
  select table_name, (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', table_name), false, true, '')))[1]::text
  from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name") || fail "no se pueden leer las tablas"
migs=$(docker exec "$NAME" psql -U nfc -d nfc -tA -c "select count(*) from drizzle.__drizzle_migrations") || fail "falta la tabla de migraciones"
[ "$(echo "$counts" | grep -c .)" -ge 5 ] || fail "la copia tiene muy pocas tablas"
docker rm -f "$NAME" >/dev/null
{
  echo "$(date '+%F %T') OK: $(basename "$last") restaurada en un Postgres limpio."
  echo "  migraciones aplicadas: $migs"
  echo "$counts" | sed 's/^/  /'
} | tee "$REPORT"
rm -f "$DEST/.drill-err"
