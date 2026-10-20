#!/bin/sh
# Instala (o reinstala) en este Mac la tarea diaria que trae las copias del VPS y hace el simulacro de restauración
# (13:05 y al iniciar sesión). Desinstalar: tools/install-launchd.sh --quitar
set -eu
REPO=$(cd "$(dirname "$0")/.." && pwd)
AGENTS="$HOME/Library/LaunchAgents"
label="com.redgarverde.nfc-backups"
mkdir -p "$AGENTS" "$HOME/Backups/nfc-bot"
launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
if [ "${1:-}" = "--quitar" ]; then rm -f "$AGENTS/$label.plist"; echo "quitado $label"; exit 0; fi
sed "s|__REPO__|$REPO|g; s|__HOME__|$HOME|g" "$REPO/deploy/launchd/$label.plist" > "$AGENTS/$label.plist"
plutil -lint "$AGENTS/$label.plist" >/dev/null
launchctl bootstrap "gui/$(id -u)" "$AGENTS/$label.plist"
echo "instalado $label"
