// Despliega en joseluis-vps: tests → imagen amd64 → subida por SSH → migraciones al arrancar → /health.
// Si la versión nueva no responde, vuelve sola a la anterior (sigue cargada en el VPS).
//
//   node tools/deploy.mjs <X.Y.Z> [--skip-tests]
//
// Requisitos: Docker en marcha, `ssh-add --apple-use-keychain ~/.ssh/id_ed25519` hecho en una terminal normal.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const HOST = "joseluis@192.168.18.7";
const DIR = "~/servicios/nfc";
const IMAGE = "nfc-bot";
const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error("Uso: node tools/deploy.mjs <X.Y.Z>");

const root = resolve(import.meta.dirname, "..");
const sh = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit", cwd: root });
const out = (cmd, args) => execFileSync(cmd, args, { cwd: root, encoding: "utf8" }).trim();
const ssh = (c) => sh("ssh", [HOST, c]);

if (!process.argv.includes("--skip-tests")) {
  console.log("→ Typecheck y tests…");
  sh("pnpm", ["typecheck"]);
  sh("pnpm", ["test"]);
}

console.log(`→ Imagen ${IMAGE}:${version} (linux/amd64)…`);
sh("docker", ["buildx", "build", "--platform", "linux/amd64", "--build-arg", `APP_VERSION=${version}`, "-t", `${IMAGE}:${version}`, "--load", "."]);

console.log("→ Subiendo la imagen al VPS…");
execFileSync("sh", ["-c", `docker save ${IMAGE}:${version} | gzip | ssh ${HOST} 'docker load'`], { stdio: "inherit" });

const previous = out("ssh", [HOST, `grep -o 'image: ${IMAGE}:[^ ]*' ${DIR}/docker-compose.yml 2>/dev/null | head -1 | cut -d: -f3 || true`]);
ssh(`mkdir -p ${DIR}/backups && chmod 700 ${DIR}`);
sh("scp", ["deploy/docker-compose.yml", `${HOST}:${DIR}/docker-compose.yml`]);
sh("scp", ["deploy/.env.example", `${HOST}:${DIR}/.env.example`]);

// .env: contraseña de la BD y código de alta se generan en el VPS sin salir de él. El token del bot lo pone el usuario.
ssh(
  `cd ${DIR} && touch .env && chmod 600 .env && ` +
    `{ grep -q '^POSTGRES_PASSWORD=.' .env || { sed -i '/^POSTGRES_PASSWORD=/d' .env; echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)" >> .env; }; } && ` +
    `{ grep -q '^SETUP_CODE=.' .env || { sed -i '/^SETUP_CODE=/d' .env; echo "SETUP_CODE=$(openssl rand -hex 6)" >> .env; }; } && ` +
    `{ grep -q '^PUBLIC_URL=.' .env || { sed -i '/^PUBLIC_URL=/d' .env; echo "PUBLIC_URL=https://nfc.redgarverde.com" >> .env; }; } && ` +
    `{ grep -q '^APP_VERSION=' .env || echo "APP_VERSION=${version}" >> .env; }`,
);
const hayToken = out("ssh", [HOST, `grep -q '^BOT_TOKEN=.' ${DIR}/.env && echo si || echo no`]) === "si";

if (previous) {
  console.log(`→ Copia de la base de datos antes de actualizar (versión actual: ${previous})…`);
  try {
    ssh(`cd ${DIR} && docker exec nfc-db pg_dump -U nfc -d nfc --no-owner | gzip > backups/pre-${version}-$(date +%s).sql.gz`);
  } catch {
    console.warn("  ⚠ No se pudo hacer la copia previa (¿la base de datos no estaba en marcha?).");
  }
}

// Sin token, el bot no arranca: se levanta todo menos él (el panel y la BD ya quedan listos).
const servicios = hayToken ? "" : "web db backup";
console.log(`→ Arrancando ${version}${hayToken ? "" : " (sin el bot: falta BOT_TOKEN en .env)"}…`);
const up = (v) => `cd ${DIR} && sed -i "s|image: ${IMAGE}:.*|image: ${IMAGE}:${v}|" docker-compose.yml && sed -i "s|^APP_VERSION=.*|APP_VERSION=${v}|" .env && docker compose up -d ${servicios}`;
ssh(up(version));

console.log("→ Verificando /health…");
const salud = (contenedor, puerto, ruta) => {
  for (let i = 0; i < 20; i++) {
    try {
      const body = out("ssh", [HOST, `sleep 3; docker exec ${contenedor} node -e "fetch('http://127.0.0.1:${puerto}${ruta}').then(r=>r.text()).then(console.log)"`]);
      const h = JSON.parse(body);
      if (h.version === version && h.db === "ok") return h;
    } catch {
      // arrancando
    }
  }
  return null;
};
if (!salud("nfc-web", 3000, "/health")) {
  ssh("docker logs nfc-web --tail 40");
  if (previous && previous !== version) {
    console.error(`✗ ${version} no responde: volviendo a ${previous}…`);
    ssh(up(previous));
  }
  throw new Error(`Despliegue de ${version} fallido.`);
}
if (hayToken) {
  const b = salud("nfc-bot", 3001, "/");
  if (!b) {
    ssh("docker logs nfc-bot --tail 40");
    console.warn("  ⚠ El bot no responde (el panel sí). Revisa el token y los logs.");
  } else console.log(`  bot: telegram ${b.telegram}, IA ${b.ia}`);
} else {
  console.log(`\n  Falta el token del bot. En el VPS:\n    cd ${DIR} && read -rsp "Token de @BotFather: " T && echo && sed -i '/^BOT_TOKEN=/d' .env && echo "BOT_TOKEN=$T" >> .env && unset T && docker compose up -d`);
}
// Novedades de esta versión al grupo (por el buzón de avisos del bot), solo si es una versión nueva
const notas = readFileSync(resolve(root, "docs/novedades.md"), "utf8").split(/^## /m).find((b) => b.startsWith(`${version}\n`));
if (notas && previous !== version) {
  const lineas = notas.split("\n").slice(1).filter((l) => l.startsWith("- ")).map((l) => `• ${l.slice(2).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}`);
  const texto = [`🆕 <b>Me he actualizado (versión ${version})</b>`, ...lineas].join("\n");
  const tag = `nfc${randomBytes(6).toString("hex")}`;
  const sql = `insert into avisos (tipo, destino, texto, silencioso) values ('version', 'grupo', $${tag}$${texto}$${tag}$, coalesce((select valor from ajustes where clave = 'avisosSilenciados') ? 'version', false));`;
  execFileSync("ssh", [HOST, "docker exec -i nfc-db psql -q -U nfc -d nfc -v ON_ERROR_STOP=1"], { input: sql, stdio: ["pipe", "inherit", "inherit"] });
  console.log("  novedades enviadas al grupo");
}
ssh("docker ps --filter name=nfc- --format 'table {{.Names}}\\t{{.Status}}'");
console.log(`\n✓ ${IMAGE}:${version} desplegada.`);
