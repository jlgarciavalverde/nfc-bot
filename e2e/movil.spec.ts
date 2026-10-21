import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createDb, crearEnlacePanel } from "@nfc/core";

// Móvil pequeño (proyecto «movil»: 375×667, táctil). El teclado se simula encogiendo el viewport a 375×380, que es lo que
// hace Android con `interactive-widget=resizes-content`.
const { db } = createDb("postgres://nfc:nfc@127.0.0.1:5434/nfc_e2e");
const ANA = 1;
const ALTO = 667, CON_TECLADO = 380;

async function entrar(page: Page) {
  await page.goto(`/entrar#${(await crearEnlacePanel(db, ANA)).token}`);
  await expect(page.getByRole("heading", { name: /^Hola,/ })).toBeVisible();
}

/** Captura para revisar a mano (solo con CAPTURAS=carpeta). */
async function foto(page: Page, nombre: string) {
  if (process.env.CAPTURAS) await page.screenshot({ path: `${process.env.CAPTURAS}/${nombre}.png` });
}

const teclado = async (page: Page, abierto: boolean) => {
  await page.setViewportSize({ width: 375, height: abierto ? CON_TECLADO : ALTO });
  await page.waitForTimeout(150);
};

async function abrir(page: Page, tipo: string) {
  await page.getByRole("button", { name: "Apuntar", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: new RegExp(`^${tipo}`) }).click();
}

const hoja = (page: Page) => page.getByRole("dialog");
const siguiente = (page: Page) => hoja(page).locator("form button[type=submit]");

/** Con el teclado abierto se ve el campo enfocado y el botón de seguir; la barra inferior no estorba. */
async function bienConTeclado(page: Page, campo: ReturnType<Page["getByRole"]>, nombre: string) {
  await campo.focus();
  await teclado(page, true);
  await foto(page, nombre);
  await expect(campo).toBeInViewport();
  await expect(siguiente(page)).toBeInViewport();
  await expect(page.getByRole("navigation", { name: "Secciones" }).filter({ visible: true })).toHaveCount(0);
  await teclado(page, false);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.clear());
  await entrar(page);
});

test("venta a un comercio nuevo con el teclado abierto en cada paso", async ({ page }) => {
  await abrir(page, "Venta");
  const buscar = hoja(page).getByRole("textbox", { name: "Buscar comercio" });
  await bienConTeclado(page, buscar, "venta-1-comercio");
  await buscar.fill("Heladería Polo");
  await teclado(page, true);
  await expect(hoja(page).getByRole("button", { name: "Crear «Heladería Polo»" })).toBeInViewport();
  await teclado(page, false);
  await hoja(page).getByRole("button", { name: "Crear «Heladería Polo»" }).click();
  await bienConTeclado(page, hoja(page).getByRole("textbox", { name: "Precio pactado (opcional)" }), "venta-2-cantidad");
  await siguiente(page).click();
  await hoja(page).getByRole("radio", { name: /Bizum/ }).click();
  await bienConTeclado(page, hoja(page).getByRole("textbox", { name: "Nota (opcional)" }), "venta-4-resumen");
  await foto(page, "venta-4-resumen-sin-teclado");
  await siguiente(page).click();
  await expect(page.getByRole("status").getByText(/Venta a Heladería Polo apuntada/)).toBeInViewport();
  await foto(page, "venta-5-toast");
});

test("dinero: importe y nota con el teclado; el error de validación se ve", async ({ page }) => {
  await abrir(page, "Dinero");
  await hoja(page).getByRole("radio", { name: /Gasto/ }).click();
  const importe = hoja(page).getByRole("textbox", { name: "Importe" });
  await importe.focus();
  await teclado(page, true);
  await siguiente(page).click();
  await foto(page, "dinero-2-error");
  await expect(hoja(page).getByRole("alert")).toBeInViewport();
  await teclado(page, false);
  await importe.fill("12,50");
  await siguiente(page).click();
  await bienConTeclado(page, hoja(page).getByRole("textbox", { name: "Categoría" }), "dinero-3-categoria");
});

test("comercio nuevo: todos los campos con el teclado", async ({ page }) => {
  await abrir(page, "Comercio");
  await bienConTeclado(page, hoja(page).getByRole("textbox", { name: "Nombre" }), "comercio-1-nombre");
  await hoja(page).getByRole("textbox", { name: "Nombre" }).fill("Óptica Sol");
  await siguiente(page).click();
  for (const c of ["Zona o barrio", "Dirección (opcional)", "Enlace de Google Maps (opcional)"]) await bienConTeclado(page, hoja(page).getByRole("textbox", { name: c }), `comercio-2-${c.split(" ")[0]}`);
  await siguiente(page).click();
  await bienConTeclado(page, hoja(page).getByRole("textbox", { name: "Contacto (opcional)" }), "comercio-3-contacto");
});

test("visita, compra y recordatorio con el teclado", async ({ page }) => {
  await abrir(page, "Visita");
  await hoja(page).getByRole("list", { name: "Últimos visitados" }).getByRole("button").first().click();
  await hoja(page).getByRole("radio", { name: /Volver otro día/ }).click();
  await bienConTeclado(page, hoja(page).getByRole("textbox", { name: "Nota" }), "visita-3-nota");
  await page.keyboard.press("Escape");

  await abrir(page, "Compra de stock");
  await bienConTeclado(page, hoja(page).getByRole("spinbutton", { name: "Paneles" }), "compra-1");
  await page.keyboard.press("Escape");

  await abrir(page, "Recordatorio");
  await hoja(page).getByRole("list", { name: "Últimos visitados" }).getByRole("button").first().click();
  await bienConTeclado(page, hoja(page).getByRole("textbox", { name: "Nota (opcional)" }), "recordar-2");
});

test("buscador con el teclado: el primer resultado se ve", async ({ page }) => {
  await page.getByRole("button", { name: /^Buscar/ }).click();
  await teclado(page, true);
  await page.getByRole("combobox").fill("bar");
  await foto(page, "buscador");
  await expect(page.getByRole("option").first()).toBeInViewport();
});

test("ninguna página desborda a lo ancho", async ({ page }) => {
  for (const ruta of ["/", "/comercios", "/comercios?vista=mapa", "/caja", "/ventas", "/placas", "/stock", "/precios", "/ajustes", "/socios", "/auditoria", "/cuenta", "/mas"]) {
    await page.goto(ruta);
    await page.waitForLoadState("networkidle");
    await foto(page, `pagina${ruta.replace(/[/?=]/g, "_")}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), ruta).toBeLessThanOrEqual(375);
  }
});

test("iOS (simulado): el teclado tapa sin encoger la ventana y la hoja sube encima de él", async ({ page }) => {
  // Safari no encoge la ventana: solo el visual viewport. Se simula su alto.
  await page.evaluate(() => {
    const vv = window.visualViewport!;
    (window as any).__alto = innerHeight;
    Object.defineProperty(vv, "height", { get: () => (window as any).__alto });
  });
  await abrir(page, "Dinero");
  await hoja(page).getByRole("radio", { name: /Gasto/ }).click();
  await hoja(page).getByRole("textbox", { name: "Importe" }).focus();
  await page.evaluate(() => ((window as any).__alto = 380, window.visualViewport!.dispatchEvent(new Event("resize"))));
  await expect(page.locator("html")).toHaveAttribute("data-teclado", "");
  await foto(page, "ios-dinero");
  const caja = await siguiente(page).boundingBox();
  expect(caja!.y + caja!.height).toBeLessThanOrEqual(380);
  await expect(page.getByRole("navigation", { name: "Secciones" }).filter({ visible: true })).toHaveCount(0);
});

test("lo que se deja a medias se recupera, y se puede empezar de cero", async ({ page }) => {
  await abrir(page, "Comercio");
  await hoja(page).getByRole("textbox", { name: "Nombre" }).fill("Bar a medias");
  await page.keyboard.press("Escape");
  await abrir(page, "Comercio");
  await expect(hoja(page).getByText("Sigues con lo que dejaste a medias.")).toBeVisible();
  await expect(hoja(page).getByRole("textbox", { name: "Nombre" })).toHaveValue("Bar a medias");
  await hoja(page).getByRole("button", { name: "Empezar de cero" }).click();
  await expect(hoja(page).getByRole("textbox", { name: "Nombre" })).toHaveValue("");
});

test("en el paso de buscar comercio, Enter elige el primero", async ({ page }) => {
  await abrir(page, "Visita");
  const buscar = hoja(page).getByRole("textbox", { name: "Buscar comercio" });
  await buscar.fill("rincón");
  await buscar.press("Enter");
  await expect(hoja(page).getByRole("heading", { name: /¿Qué ha dicho Bar El Rincón\?/ })).toBeVisible();
});

test("editar datos de un comercio con el teclado: Guardar siempre a mano", async ({ page }) => {
  await page.goto("/comercios");
  await page.getByRole("link", { name: /Zapatería Paso/ }).click();
  await page.getByRole("button", { name: "Editar datos" }).click();
  const ed = page.getByRole("dialog", { name: "Editar datos" });
  for (const c of ["Nombre", "Contacto", "Enlace de reseñas de Google"]) {
    await ed.getByRole("textbox", { name: c }).focus();
    await teclado(page, true);
    await expect(ed.getByRole("textbox", { name: c })).toBeInViewport();
    await expect(ed.getByRole("button", { name: "Guardar cambios" })).toBeInViewport();
    await teclado(page, false);
  }
  await foto(page, "ficha-editar");
});

for (const esquema of ["light", "dark"] as const) {
  test(`hojas del móvil accesibles (${esquema})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: esquema });
    await abrir(page, "Venta");
    await page.waitForTimeout(400);
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(r.violations.map((v) => `${v.id} (${v.nodes.length}) ${v.nodes[0]?.target}`)).toEqual([]);
  });
}
