import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const state = JSON.parse(readFileSync(join(here, "../../fixtures/schedule_example.json"), "utf8"));
const harness = pathToFileURL(join(here, "harness.html")).href;
const shots = join(here, "../../../docs/screenshots");

const base = { entity: "sensor.garbage_view_schedule", title: "Raccolta differenziata" };

// Un test per ogni combinazione preset x tema: controlla che non ci siano errori
// in console e salva lo screenshot in docs/screenshots/.
for (const style of ["apple", "homekit"]) {
  for (const dark of [false, true]) {
    const theme = dark ? "scuro" : "chiaro";
    test(`screenshot ${style} ${theme}`, async ({ page }) => {
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

      await page.goto(harness);
      await page.evaluate(([c, s, d]) => window.mountCard(c, s, { dark: d }), [{ ...base, style }, state, dark]);

      const card = page.locator("garbage-view-card");
      await expect(card.locator(".tile")).toHaveCount(4);
      await expect(card.locator(".day")).toHaveCount(14);
      await expect(card.locator(".tile.today")).toHaveCount(1);
      await page.waitForTimeout(1500); // fine delle animazioni d'ingresso
      await card.screenshot({ path: join(shots, `${style}-${theme}.png`), animations: "disabled" });
      expect(errors).toEqual([]);
    });
  }
}

test("la card è usabile da tastiera e i bersagli sono >= 44px", async ({ page }) => {
  await page.goto(harness);
  await page.evaluate(([c, s]) => window.mountCard(c, s), [{ ...base, style: "apple" }, state]);
  const day = page.locator("garbage-view-card .day").nth(2);
  await day.focus();
  await page.keyboard.press("Enter");
  await expect(day).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("garbage-view-card .strip + .detail")).toContainText("Carta");
  const box = await day.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
});

test("con prefers-reduced-motion le animazioni sono disattivate", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(harness);
  await page.evaluate(([c, s]) => window.mountCard(c, s), [{ ...base, style: "apple" }, state]);
  const anim = await page.locator("garbage-view-card .tile.today").evaluate((e) => getComputedStyle(e).animationName);
  expect(anim).toBe("none");
});

test("l'editor modifica la card in diretta", async ({ page }) => {
  await page.goto(harness);
  await page.evaluate(([c, s]) => window.mountCard(c, s, { editor: true }), [{ ...base, style: "apple" }, state]);
  const editor = page.locator("garbage-view-card-editor");
  const card = page.locator("garbage-view-card");

  await editor.getByLabel("Giorni mostrati nella striscia").selectOption("7");
  await expect(card.locator(".day")).toHaveCount(7);

  await editor.getByLabel("Stile").selectOption("homekit");
  await expect(card).toHaveAttribute("data-style", "homekit");

  await editor.getByLabel("Titolo (facoltativo)").fill("Casa mia");
  await expect(card.locator(".title")).toHaveText("Casa mia");

  await editor.getByLabel('Mostra la barra "Prossimo"').uncheck();
  await expect(card.locator(".summary-bar")).toHaveCount(0);

  const config = await page.evaluate(() => window.lastConfig);
  expect(config).toMatchObject({ style: "homekit", days: 7, show_summary: false, title: "Casa mia" });

  await page.screenshot({ path: join(shots, "editor.png"), animations: "disabled", fullPage: true });
});

// ---- Calendario grande ----
// Screenshot della vista settimana e mese, nei due stili e temi.
for (const [mode, style, dark] of [
  ["week", "apple", false], ["month", "apple", false], ["month", "apple", true], ["month", "homekit", false],
]) {
  const theme = dark ? "scuro" : "chiaro";
  test(`screenshot calendario ${mode} ${style} ${theme}`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

    await page.goto(harness);
    await page.evaluate(([c, s, d]) => window.mountCard(c, s, { dark: d }), [
      { ...base, style, start_expanded: true, calendar_mode: mode }, state, dark,
    ]);
    const card = page.locator("garbage-view-card");
    await expect(card.locator(".cal-day")).toHaveCount(mode === "week" ? 7 : 42);
    await expect(card.locator(".cal-day.today")).toHaveCount(1);
    await expect(card.locator(".cal-day .icon").first()).toBeVisible();
    await page.waitForTimeout(1500); // fine delle animazioni d'ingresso
    await card.screenshot({ path: join(shots, `calendario-${mode}-${style}-${theme}.png`), animations: "disabled" });
    expect(errors).toEqual([]);
  });
}

test("calendario: navigazione con tastiera e target >= 44px", async ({ page }) => {
  await page.goto(harness);
  await page.evaluate(([c, s]) => window.mountCard(c, s), [{ ...base, style: "apple" }, state]);
  const card = page.locator("garbage-view-card");

  // dal pulsante espandi al calendario, solo con la tastiera
  const expander = card.locator(".expander");
  await expect(card.locator(".cal")).toHaveCount(0);
  await expander.focus();
  await page.keyboard.press("Enter");
  await expect(expander).toHaveAttribute("aria-expanded", "true");
  await expect(card.locator(".cal")).toBeVisible();
  await expect(card.locator(".range")).toHaveText("2–8 nov 2026");
  // il calendario cresce in altezza (animazione) e la striscia si chiude
  await expect(card.locator(".strip")).toBeHidden();

  const next = card.getByRole("button", { name: "Periodo successivo" });
  const box = await next.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await next.focus();
  await page.keyboard.press("Enter");
  await expect(card.locator(".range")).toHaveText("9–15 nov 2026");
  await expect(next).toBeFocused(); // il focus non si perde dopo il ridisegno

  await card.getByRole("button", { name: "Mese" }).click();
  await expect(card.locator(".range")).toHaveText(/novembre 2026/i);
  const day = card.locator(".cal-day").nth(20);
  expect((await day.boundingBox()).height).toBeGreaterThanOrEqual(44);

  // toccare un giorno apre il dettaglio (sab 7/11: Plastica)
  await card.locator(".cal-day.today").click();
  await expect(card.locator(".cal .detail")).toContainText("Plastica");

  // comprimi: torna la striscia, il calendario sparisce
  await expander.focus();
  await page.keyboard.press("Space");
  await expect(expander).toHaveAttribute("aria-expanded", "false");
  await expect(card.locator(".strip")).toBeVisible();
  await expect(card.locator(".cal")).toBeHidden();
});

test("espansione: altezza animata, istantanea con prefers-reduced-motion", async ({ page }) => {
  await page.goto(harness);
  await page.evaluate(([c, s]) => window.mountCard(c, s), [{ ...base, style: "apple" }, state]);
  const card = page.locator("garbage-view-card");
  const panel = card.locator("#gv-calendar");
  await card.getByRole("button", { name: "Mostra calendario" }).click();
  await page.waitForTimeout(80);
  const mid = (await panel.boundingBox())?.height ?? 0; // a metà transizione
  await page.waitForTimeout(600);
  const full = (await panel.boundingBox()).height;
  expect(mid).toBeLessThan(full);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(harness);
  await page.evaluate(([c, s]) => window.mountCard(c, s), [{ ...base, style: "apple" }, state]);
  await page.locator("garbage-view-card").getByRole("button", { name: "Mostra calendario" }).click();
  await page.waitForTimeout(50);
  expect((await page.locator("garbage-view-card #gv-calendar").boundingBox()).height).toBeGreaterThan(200);
});

test("calendario: l'editor cambia espansione e periodo in diretta", async ({ page }) => {
  await page.goto(harness);
  await page.evaluate(([c, s]) => window.mountCard(c, s, { editor: true }), [{ ...base, style: "apple" }, state]);
  const editor = page.locator("garbage-view-card-editor");
  const card = page.locator("garbage-view-card");

  await editor.getByLabel("Apri con il calendario già espanso").check();
  await expect(card.locator(".cal")).toBeVisible();
  await editor.getByLabel("Periodo iniziale del calendario").selectOption("month");
  await expect(card.locator(".cal-day")).toHaveCount(42);
  const config = await page.evaluate(() => window.lastConfig);
  expect(config).toMatchObject({ start_expanded: true, calendar_mode: "month" });
  expect(config).not.toHaveProperty("view");
});
