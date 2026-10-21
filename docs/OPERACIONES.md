# Operaciones

## Primera instalación
1. `node tools/deploy.mjs 0.1.0` desde el Mac. Crea `~/servicios/nfc/` con `.env` (contraseña de BD, `SETUP_CODE` y
   `PUBLIC_URL` generados) y arranca panel + BD + copias. Sin `BOT_TOKEN` no arranca el bot.
2. Token del bot (en una terminal normal, por SSH al VPS; **nunca pegarlo en un chat**):
   ```sh
   cd ~/servicios/nfc && read -rsp "Token de @BotFather: " T && echo && sed -i '/^BOT_TOKEN=/d' .env && echo "BOT_TOKEN=$T" >> .env && unset T && docker compose up -d
   ```
   Igual para `GEMINI_API_KEY` (clave gratuita de https://aistudio.google.com/apikey).
3. Código de alta: `grep SETUP_CODE ~/servicios/nfc/.env`. Por privado al bot: `/start <código>` (solo sirve con la BD vacía).
4. Cloudflare Zero Trust → Tunnels → el túnel existente → Public hostname: `nfc` · `redgarverde.com` → `HTTP` `nfc-web:3000`.

## Día a día
- Desplegar: `node tools/deploy.mjs X.Y.Z` (tests, imagen amd64, copia previa de la BD, arranque, `/health`; vuelve atrás si falla).
- Logs: `ssh joseluis@192.168.18.7 'docker logs nfc-bot --tail 50'` (o `nfc-web`).
- Salud del bot: `docker exec nfc-bot node -e "fetch('http://127.0.0.1:3001').then(r=>r.text()).then(console.log)"`.
- Copias: `~/servicios/nfc/backups/` en el VPS: diaria a las 4:00 (30 días) + `pre-X.Y.Z` en cada despliegue (90 días).
  Tras cada copia diaria, `nfc-backup` la restaura en una BD aparte y deja el resultado en `backups/simulacro.txt`
  (`cat ~/servicios/nfc/backups/simulacro.txt`). Opcional, copia fuera del VPS: `tools/install-launchd.sh` en el Mac.
- Restaurar: `gunzip -c copia.sql.gz | docker exec -i nfc-db psql -U nfc -d nfc` sobre una BD vacía.

## Si algo falla
- El bot no contesta en el grupo: ¿`/vincular` hecho en ese grupo? ¿el que escribe es socio (`/socios`)?
- No entiende frases en el grupo: hay que mencionarle (`@bot …`) o responder a un mensaje suyo, y *privacy mode* desactivado.
- «La IA ha llegado a su límite»: el plan gratuito de Gemini tiene cupo diario; los comandos siguen funcionando.
