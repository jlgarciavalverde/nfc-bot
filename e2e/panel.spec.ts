import { expect, test, type Page } from "@playwright/test";
import ExcelJS from "exceljs";
import { createDb, crearEnlacePanel } from "@nfc/core";

const { db } = createDb("postgres://nfc:nfc@127.0.0.1:5434/nfc_e2e");

async function entrar(page: Page, socioId = 1) {
  await page.goto(`/entrar#${await crearEnlacePanel(db, socioId)}`);
  await expect(page.getByRole("heading", { name: "Resumen" })).toBeVisible();
}

test("sin sesión explica cómo entrar; enlace usado no vale", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("/panel")).toBeVisible();
  const t = await crearEnlacePanel(db, 2);
  await page.goto(`/entrar#${t}`);
  await expect(page.getByRole("heading", { name: "Resumen" })).toBeVisible();
  // el token no se queda en la URL
  expect(page.url()).not.toContain(t);
  await page.getByRole("button", { name: "Salir" }).click();
  await page.goto(`/entrar#${t}`);
  await expect(page.getByRole("alert")).toContainText("ya no vale");
});

test("resumen y navegación por todas las secciones sin desbordar en el móvil", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await entrar(page);
  await expect(page.getByRole("main").getByText("Caja", { exact: true })).toBeVisible();
  for (const s of ["Comercios", "Mapa", "Ventas", "Caja", "Stock", "Reparto", "Precios", "Resumen"]) {
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
  const [descarga] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Descargar Excel" }).click()]);
  expect(descarga.suggestedFilename()).toMatch(/^nfc-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(await descarga.path());
  expect(wb.getWorksheet("Comercios")!.rowCount).toBe(19);
  expect(wb.getWorksheet("Ventas")!.rowCount).toBe(9);
});
