import { expect, test, type Page } from "@playwright/test";
import ExcelJS from "exceljs";
import { createDb, crearEnlacePanel } from "@nfc/core";

const { db } = createDb("postgres://nfc:nfc@127.0.0.1:5434/nfc_e2e");

async function entrar(page: Page, socioId = 1) {
  await page.goto(`/entrar#${(await crearEnlacePanel(db, socioId)).token}`);
  await expect(page.getByRole("heading", { name: "Resumen" })).toBeVisible();
}

test("sin sesión explica cómo entrar; enlace usado no vale", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("form", { name: "Entrar con código" })).toBeVisible();
  const { token: t } = await crearEnlacePanel(db, 2);
  await page.goto(`/entrar#${t}`);
  await expect(page.getByRole("heading", { name: "Resumen" })).toBeVisible();
  // el token no se queda en la URL
  expect(page.url()).not.toContain(t);
  await page.getByRole("navigation", { name: "Secciones" }).getByRole("link", { name: "Cuenta" }).click();
  await page.getByRole("button", { name: "Cerrar sesión aquí" }).click();
  await page.goto(`/entrar#${t}`);
  await expect(page.getByRole("alert")).toContainText("ya no vale");
});

test("resumen y navegación por todas las secciones sin desbordar en el móvil", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await entrar(page);
  await expect(page.getByRole("main").getByText("Caja", { exact: true })).toBeVisible();
  for (const s of ["Comercios", "Mapa", "Ventas", "Caja", "Stock", "Reparto", "Precios", "Cuenta", "Resumen"]) {
    await page.getByRole("navigation", { name: "Secciones" }).getByRole("link", { name: s, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    const ancho = await page.evaluate(() => {
      const fuera = [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > innerWidth + 1 && !e.closest("[role=region],nav,.leaflet-container"));
      return { scroll: document.documentElement.scrollWidth, fuera: fuera.slice(0, 3).map((e) => `${e.tagName}.${e.className}`.slice(0, 80)) };
    });
    expect(ancho, `en ${s}`).toEqual({ scroll: 375, fuera: [] });
  }
});

test("comercios: filtrar, buscar y abrir la ficha", async ({ page }) => {
  await entrar(page);
  await page.getByRole("link", { name: "Comercios" }).click();
  await page.getByText("Ha dicho no").first().click();
  await expect(page.getByRole("button", { name: "Panadería López" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Peluquería Marta" })).toBeVisible();
  await page.getByText("Todos").click();
  await page.getByLabel("Buscar").fill("panaderia");
  await page.getByRole("button", { name: "Panadería López" }).click();
  const hoja = page.getByRole("dialog", { name: "Panadería López" });
  await expect(hoja.getByText("quiere 2")).toBeVisible();
  await expect(hoja.getByText("Cliente")).toBeVisible();
  await hoja.getByRole("button", { name: "Cerrar" }).click();
  await expect(hoja).toBeHidden();
});

test("precios: un admin añade un tramo y la calculadora lo aplica", async ({ page }) => {
  await entrar(page, 1);
  await page.getByRole("link", { name: "Precios" }).click();
  const form = page.getByRole("form", { name: "Añadir tramo" });
  await form.getByLabel("Desde (uds)").fill("2");
  await form.getByLabel("€ por ud").fill("24");
  await form.getByRole("button", { name: "Añadir tramo" }).click();
  await expect(page.getByText("Desde 2 uds")).toBeVisible();
  await page.getByLabel("Paneles").fill("2");
  await expect(page.getByText("48,00 €").first()).toBeVisible();
  await page.getByRole("button", { name: "Quitar el tramo desde 2" }).click();
  await expect(page.getByText("Desde 2 uds")).toHaveCount(0);
});

test("un socio no admin no ve los formularios de precios", async ({ page }) => {
  await entrar(page, 2);
  await page.getByRole("link", { name: "Precios" }).click();
  await expect(page.getByRole("heading", { name: "Precios y bonos" })).toBeVisible();
  await expect(page.getByRole("form", { name: "Añadir tramo" })).toHaveCount(0);
});

test("descarga el Excel", async ({ page }) => {
  await entrar(page);
  const [descarga] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Excel", exact: true }).click()]);
  expect(descarga.suggestedFilename()).toMatch(/^nfc-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(await descarga.path());
  expect(wb.getWorksheet("Comercios")!.rowCount).toBe(19);
  expect(wb.getWorksheet("Ventas")!.rowCount).toBe(9);
});

test("entrar con el código de 8 cifras (app instalada)", async ({ page }) => {
  const { codigo } = await crearEnlacePanel(db, 2);
  await page.goto("/");
  await page.getByRole("textbox", { name: "Código" }).fill(`${codigo.slice(0, 4)} ${codigo.slice(4)}`);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Resumen" })).toBeVisible();
  await page.getByRole("navigation", { name: "Secciones" }).getByRole("link", { name: "Cuenta" }).click();
  await expect(page.getByText("este", { exact: true })).toBeVisible();
});

test("apuntar una venta a un comercio nuevo, cobrarla y deshacer el cobro", async ({ page }) => {
  await entrar(page, 2);
  await page.getByRole("button", { name: "Apuntar", exact: true }).click();
  const hoja = page.getByRole("dialog", { name: "Apuntar" });
  await hoja.getByRole("textbox", { name: "Comercio" }).fill("Kiosko Prueba E2E");
  await hoja.getByRole("button", { name: "Crear «Kiosko Prueba E2E»" }).click();
  await hoja.getByLabel("Paneles").fill("2");
  await expect(hoja.getByText("Total:")).toContainText("€");
  await hoja.getByText("Pendiente", { exact: true }).click();
  await hoja.getByRole("button", { name: "Apuntar venta" }).click();
  await expect(page.getByRole("status").getByText("Venta apuntada")).toBeVisible();
  await expect(hoja).toBeHidden();

  const venta = page.getByRole("listitem").filter({ hasText: "Kiosko Prueba E2E" }).filter({ has: page.getByRole("button", { name: /Cobrar/ }) });
  await venta.getByRole("button", { name: /Cobrar/ }).click();
  await page.getByRole("group", { name: "Cómo ha pagado Kiosko Prueba E2E" }).getByRole("button", { name: "Bizum" }).click();
  await expect(page.getByRole("status").getByText(/cobrada/)).toBeVisible();
  await expect(page.getByText(/cobrada la venta #\d+ de Kiosko Prueba E2E/i)).toBeVisible();
  await page.getByRole("button", { name: "Deshacer" }).click();
  await expect(page.getByRole("status").getByText("Deshecho")).toBeVisible();
  await expect(page.getByRole("button", { name: "Cobrar la venta", exact: false }).first()).toBeVisible();
});

test("apuntar una visita desde la ficha del comercio y editar sus datos", async ({ page }) => {
  await entrar(page, 3);
  await page.getByRole("navigation", { name: "Secciones" }).getByRole("link", { name: "Comercios" }).click();
  await page.getByRole("button", { name: "Zapatería Paso" }).click();
  const ficha = page.getByRole("dialog", { name: "Zapatería Paso" });
  await ficha.getByRole("button", { name: "Apuntar visita" }).click();
  const hoja = page.getByRole("dialog", { name: "Apuntar" });
  await hoja.getByText("Volver otro día").click();
  await hoja.getByLabel("Nota").fill("vuelve el encargado");
  await hoja.getByRole("button", { name: "Apuntar visita" }).click();
  await expect(page.getByRole("status").getByText("Visita apuntada")).toBeVisible();
  await expect(ficha.getByText("vuelve el encargado")).toBeVisible();
  await ficha.getByRole("button", { name: "Editar datos" }).click();
  await ficha.getByLabel("Contacto").fill("Lola 600111222");
  await ficha.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(ficha.getByText("Lola 600111222")).toBeVisible();
});
