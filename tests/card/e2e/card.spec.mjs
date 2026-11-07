import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const state = JSON.parse(readFileSync(join(here, "../../fixtures/schedule_example.json"), "utf8"));
const harness = "file://" + join(here, "harness.html");
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
  await expect(page.locator("garbage-view-card .detail")).toContainText("Carta");
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
