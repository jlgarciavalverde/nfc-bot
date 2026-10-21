import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import ExcelJS from "exceljs";
import { createDb, crearEnlacePanel, placasPanel } from "@nfc/core";

const { db } = createDb("postgres://nfc:nfc@127.0.0.1:5434/nfc_e2e");
// Sembrado (tools/sembrar.ts): 1 Ana (admin), 2 Bea, 3 Carlos; 18 comercios; 8 ventas; un lote de 8 placas (4 activas)
const ANA = 1, BEA = 2, CARLOS = 3;

async function entrar(page: Page, socioId = ANA) {
  await page.goto(`/entrar#${(await crearEnlacePanel(db, socioId)).token}`);
  await expect(page.getByRole("heading", { name: /^Hola,/ })).toBeVisible();
}
const nav = (page: Page) => page.getByRole("navigation", { name: "Secciones" }).filter({ visible: true });

async function accesible(page: Page, donde: string) {
  await page.waitForTimeout(350); // animaciones de entrada (opacidad) dan falsos fallos de contraste
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).exclude(".leaflet-container").analyze();
  expect(r.violations.map((v) => `${donde}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target}`)).toEqual([]);
}

test("sin sesión: entrar con código; el enlace usado no vale", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("form", { name: "Entrar con código" })).toBeVisible();
  await accesible(page, "entrar");
  const { codigo, token } = await crearEnlacePanel(db, BEA);
  await page.getByRole("textbox", { name: "Código" }).fill(`${codigo.slice(0, 4)} ${codigo.slice(4)}`);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Hola, Bea" })).toBeVisible();
  await page.goto(`/entrar#${token}`);
  await expect(page.getByRole("alert")).toContainText("ya no vale");
});

for (const esquema of ["light", "dark"] as const) {
  test(`móvil (${esquema}): barra inferior, Más, accesible y sin desbordar`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: esquema });
    await page.setViewportSize({ width: 375, height: 812 });
    await entrar(page);
    await accesible(page, "hoy");
    for (const [enlace, titulo] of [["Comercios", "Comercios"], ["Caja", "Caja"], ["Más", "Más"]] as const) {
      await nav(page).getByRole("link", { name: enlace, exact: true }).click();
      await expect(page.getByRole("heading", { level: 1, name: titulo })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), enlace).toBe(true);
      await accesible(page, enlace);
    }
    for (const sec of ["Ventas", "Placas", "Stock", "Precios", "Ajustes", "Socios", "Auditoría", "Cuenta"]) {
      await page.goto("/mas");
      await page.getByRole("main").getByRole("link", { name: sec, exact: true }).click();
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      await page.waitForLoadState("networkidle");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), sec).toBe(true);
      if (esquema === "light") await accesible(page, sec);
    }
  });
}

test("escritorio: barra lateral y buscador ⌘K", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await entrar(page);
  await expect(nav(page).getByRole("link", { name: "Auditoría" })).toBeVisible();
  await page.keyboard.press("ControlOrMeta+k");
  const buscar = page.getByRole("dialog", { name: "Buscar" });
  await buscar.getByRole("combobox").fill("panaderia");
  await buscar.getByRole("option", { name: /Panadería López/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Panadería López" })).toBeVisible();
  await expect(page).toHaveURL(/\/comercios\/\d+$/);
});

test("asistente de venta a un comercio nuevo, cobrarla y deshacer el cobro", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await entrar(page, BEA);
  await page.getByRole("button", { name: "Apuntar" }).last().click();
  const hoja = page.getByRole("dialog", { name: "Apuntar" });
  await hoja.getByRole("button", { name: /^Venta/ }).click();
  await hoja.getByRole("textbox", { name: "Buscar comercio" }).fill("Kiosko E2E");
  await hoja.getByRole("button", { name: "Crear «Kiosko E2E»" }).click();
  await expect(hoja.getByRole("heading", { name: "¿Cuántos paneles?" })).toBeVisible();
  await hoja.getByRole("button", { name: "Uno más" }).click();
  await expect(hoja.getByText(/€\/ud/)).toBeVisible();
  await hoja.getByRole("button", { name: "Siguiente" }).click();
  await hoja.getByRole("radio", { name: /Pendiente/ }).click();
  await expect(hoja.getByRole("heading", { name: "Repasa la venta" })).toBeVisible();
  await hoja.getByRole("button", { name: /Apuntar venta de/ }).click();
  await expect(page.getByRole("status").getByText(/Venta a Kiosko E2E apuntada/)).toBeVisible();

  const fila = page.getByRole("main").locator("div").filter({ hasText: /^Kiosko E2E/ }).filter({ has: page.getByRole("button", { name: /Cobrar la venta/ }) }).last();
  await fila.getByRole("button", { name: /Cobrar la venta/ }).click();
  await page.getByRole("group", { name: "Cómo ha pagado Kiosko E2E" }).getByRole("button", { name: "Bizum" }).click();
  const aviso = page.getByRole("status").getByText(/^Cobrados/).locator("..");
  await expect(aviso).toBeVisible();
  await aviso.getByRole("button", { name: "Deshacer" }).click();
  await expect(page.getByRole("status").getByText(/Deshecho: Cobrada la venta/)).toBeVisible();
});

test("visita desde la ficha (con fecha para volver) y editar datos", async ({ page }) => {
  await entrar(page, CARLOS);
  await page.goto("/comercios");
  await page.getByRole("link", { name: /Zapatería Paso/ }).click();
  await page.getByRole("button", { name: "Visita", exact: true }).click();
  const hoja = page.getByRole("dialog", { name: "Apuntar visita" });
  await hoja.getByRole("radio", { name: /Volver otro día/ }).click();
  await hoja.getByRole("textbox", { name: "Nota" }).fill("vuelve el encargado");
  await hoja.getByRole("button", { name: "Apuntar visita" }).click();
  await expect(page.getByText("vuelve el encargado").first()).toBeVisible();
  await expect(page.getByText(/Volver el/)).toBeVisible();
  await page.getByRole("button", { name: "Editar datos" }).click();
  const ed = page.getByRole("dialog", { name: "Editar datos" });
  await ed.getByRole("textbox", { name: "Contacto" }).fill("Lola 600111222");
  await ed.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByRole("link", { name: /Lola 600111222/ })).toBeVisible();
});

test("activar una placa libre grabando la pegatina con NFC (simulado) y bloqueándola", async ({ page }) => {
  // NDEFReader de pega: guarda lo grabado y lo devuelve al leer
  await page.addInitScript(() => {
    const w = window as unknown as { __nfc: { url: string | null; bloqueada: boolean }; NDEFReader: unknown };
    w.__nfc = { url: null, bloqueada: false };
    class Lector extends EventTarget {
      async scan() {
        setTimeout(() => {
          const data = w.__nfc.url ? new DataView(new TextEncoder().encode(w.__nfc.url).buffer) : undefined;
          this.dispatchEvent(Object.assign(new Event("reading"), { serialNumber: "04:aa", message: { records: data ? [{ recordType: "url", data }] : [] } }));
        }, 30);
      }
      async write(m: { records: { data: string }[] }) {
        if (w.__nfc.bloqueada) throw Object.assign(new Error("ro"), { name: "NotAllowedError" });
        w.__nfc.url = m.records[0]!.data;
      }
      async makeReadOnly() {
        w.__nfc.bloqueada = true;
      }
    }
    w.NDEFReader = Lector;
  });
  const libre = (await placasPanel(db)).find((p) => !p.comercioId)!.codigo;
  await page.setViewportSize({ width: 390, height: 844 });
  await entrar(page, BEA);
  await page.goto("/placas");
  await page.getByRole("button", { name: `Activar la placa ${libre}` }).click();
  const hoja = page.getByRole("dialog", { name: "Placa NFC" });
  await expect(hoja.getByText("Placa libre, lista para activar.")).toBeVisible();
  await hoja.getByRole("button", { name: "Siguiente" }).click();
  await hoja.getByRole("textbox", { name: "Buscar comercio" }).fill("Estética Luna");
  await hoja.getByRole("button", { name: /Estética Luna/ }).click();
  await hoja.getByRole("textbox", { name: "Enlace o ID del sitio" }).fill("https://maps.app.goo.gl/abc");
  await expect(hoja.getByText(/Ese es el enlace del mapa/)).toBeVisible();
  await hoja.getByRole("textbox", { name: "Enlace o ID del sitio" }).fill("ChIJN1t_tDeuEmsRUsoyG83frY4");
  await hoja.getByRole("button", { name: "Siguiente" }).click();
  await hoja.getByRole("checkbox").check();
  await hoja.getByRole("button", { name: "Grabar pegatina" }).click();
  await page.getByRole("alertdialog", { name: "¿Bloquear la pegatina?" }).or(page.getByRole("dialog", { name: "¿Bloquear la pegatina?" })).getByRole("button", { name: "Grabar y bloquear" }).click();
  await expect(hoja.getByText("Pegatina grabada, comprobada y bloqueada.")).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __nfc: { url: string } }).__nfc.url)).toBe(`http://localhost:4320/r/${libre}`);
  await hoja.getByRole("button", { name: "Siguiente" }).click();
  await hoja.getByRole("button", { name: "Activar placa" }).click();
  await expect(page.getByRole("status").getByText(`Placa ${libre} activada para Estética Luna`)).toBeVisible();
  const r = await page.request.get(`/r/${libre}`, { maxRedirects: 0 });
  expect(r.status()).toBe(302);
  expect(r.headers().location).toBe("https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4");
});

test("sin NFC (iPhone/ordenador): enseña la URL para copiar", async ({ page }) => {
  await entrar(page, BEA);
  await page.goto("/placas");
  const libre = (await placasPanel(db)).find((p) => !p.comercioId)!.codigo;
  await page.getByRole("button", { name: `Activar la placa ${libre}` }).click();
  const hoja = page.getByRole("dialog", { name: "Placa NFC" });
  await hoja.getByRole("button", { name: "Siguiente" }).click();
  await hoja.getByRole("textbox", { name: "Buscar comercio" }).fill("Óptica");
  await hoja.getByRole("button", { name: /Óptica Visión/ }).click();
  await hoja.getByRole("button", { name: "Siguiente" }).click();
  await expect(hoja.getByText(`/r/${libre}`)).toBeVisible();
  await expect(hoja.getByRole("button", { name: "Copiar" })).toBeVisible();
});

test("admin: nuevo lote de placas y descarga del CSV", async ({ page }) => {
  await entrar(page, ANA);
  await page.goto("/placas");
  await page.getByRole("button", { name: "Nuevo lote" }).click();
  const hoja = page.getByRole("dialog", { name: "Nuevo lote de placas" });
  await hoja.getByRole("spinbutton", { name: "¿Cuántas placas?" }).fill("3");
  await hoja.getByRole("button", { name: "Reservar códigos" }).click();
  await expect(hoja.getByText(/con 3 códigos reservados/)).toBeVisible();
  const [d] = await Promise.all([page.waitForEvent("download"), hoja.getByRole("link", { name: "lote.csv" }).click()]);
  const csv = (await import("node:fs")).readFileSync(await d.path(), "utf8");
  expect(csv.trim().split("\n")).toHaveLength(4);
});

test("un socio no admin no ve Ajustes, Socios ni Auditoría, ni puede editar precios", async ({ page }) => {
  await entrar(page, BEA);
  await page.goto("/mas");
  await expect(page.getByRole("main").getByRole("link", { name: "Ajustes" })).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("link", { name: "Auditoría" })).toHaveCount(0);
  await page.goto("/auditoria");
  await expect(page.getByRole("heading", { name: /^Hola,/ })).toBeVisible();
  await page.goto("/precios");
  await expect(page.getByRole("button", { name: "Cambiar precio" })).toHaveCount(0);
});

test("admin: tramo de precio y ajustes con aviso de cambios sin guardar", async ({ page }) => {
  await entrar(page, ANA);
  await page.goto("/precios");
  await page.getByRole("button", { name: "Añadir" }).first().click();
  const hoja = page.getByRole("dialog", { name: "Nuevo tramo" });
  await hoja.getByRole("textbox", { name: "Desde (uds)" }).fill("8");
  await hoja.getByRole("textbox", { name: "Precio por ud" }).fill("15");
  await hoja.getByRole("button", { name: "Guardar tramo" }).click();
  await expect(page.getByText("Desde 8 uds")).toBeVisible();
  await page.goto("/ajustes");
  await page.getByRole("spinbutton", { name: "Avisar cuando queden menos de" }).fill("4");
  await expect(page.getByText("Cambios sin guardar")).toBeVisible();
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("status").getByText("Ajustes guardados")).toBeVisible();
});

test("descarga el Excel", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await entrar(page);
  const [d] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Descargar Excel" }).click()]);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(await d.path());
  expect(wb.worksheets.map((w) => w.name)).toContain("Ventas");
});
