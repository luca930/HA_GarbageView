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
      await expect(card.locator(".day")).toHaveCount(7);
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

  await editor.getByLabel("Giorni mostrati nella striscia").selectOption("14");
  await expect(card.locator(".day")).toHaveCount(14);

  await editor.getByLabel("Stile").selectOption("homekit");
  await expect(card).toHaveAttribute("data-style", "homekit");

  await editor.getByLabel("Titolo (facoltativo)").fill("Casa mia");
  await expect(card.locator(".title")).toHaveText("Casa mia");

  await editor.getByLabel('Mostra la barra "Prossimo"').uncheck();
  await expect(card.locator(".summary-bar")).toHaveCount(0);

  const config = await page.evaluate(() => window.lastConfig);
  expect(config).toMatchObject({ style: "homekit", days: 14, show_summary: false, title: "Casa mia" });

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

// --- Tessere che riempiono la larghezza (0.2.2) -----------------------------
// Per 1–8 tessere e larghezze strette/larghe: ogni riga arriva fino ai bordi,
// nessuna tessera è sotto il minimo, nessun overflow, righe bilanciate
// (la riga più corta ha al massimo una tessera in meno di quella più lunga).
const manyTypes = (n) => {
  const s = structuredClone(state);
  const base = s.attributes.types;
  s.attributes.types = Array.from({ length: n }, (_, i) => ({
    ...base[i % base.length],
    id: `tipo_${i}`,
    name: i === 4 ? "Plastica e lattine" : `Tipo ${i + 1}`,
  }));
  return s;
};

for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
  for (const width of [260, 360, 407, 600, 900]) {
    test(`tessere: ${n} tessere in ${width}px riempiono le righe`, async ({ page }) => {
      await page.setViewportSize({ width: width + 40, height: 900 });
      await page.goto(harness);
      await page.evaluate(([c, s]) => window.mountCard(c, s), [{ ...base, style: "apple" }, manyTypes(n)]);
      await expect(page.locator("garbage-view-card .tile")).toHaveCount(n);
      await page.waitForTimeout(700);
      const m = await page.locator("garbage-view-card").evaluate((card) => {
        const grid = card.shadowRoot.querySelector(".types");
        // offset* = misure di layout: non risentono del "respiro" (transform) della tessera di oggi
        const g = { left: grid.offsetLeft, right: grid.offsetLeft + grid.offsetWidth };
        const min = parseFloat(getComputedStyle(grid.firstElementChild).minWidth);
        const rows = new Map();
        for (const t of grid.children) {
          const r = { left: t.offsetLeft, right: t.offsetLeft + t.offsetWidth, width: t.offsetWidth };
          (rows.get(t.offsetTop) || rows.set(t.offsetTop, []).get(t.offsetTop)).push(r);
        }
        return {
          min,
          gridLeft: g.left, gridRight: g.right,
          scrollOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          rows: [...rows.values()].map((r) => ({ n: r.length, left: Math.min(...r.map((x) => x.left)), right: Math.max(...r.map((x) => x.right)), minW: Math.min(...r.map((x) => x.width)) })),
        };
      });
      expect(m.scrollOverflow).toBe(false);
      for (const row of m.rows) {
        expect(Math.abs(row.left - m.gridLeft)).toBeLessThan(1.5);
        expect(Math.abs(row.right - m.gridRight)).toBeLessThan(1.5);
        if (width >= 2 * m.min + 10) expect(row.minW).toBeGreaterThanOrEqual(m.min - 1);
      }
      // righe bilanciate: differiscono al massimo di una tessera, quindi nessuna tessera sola in fondo
      const counts = m.rows.map((r) => r.n);
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    });
  }
}

// --- Font più grandi (0.2.3): niente overflow né testo tagliato ---------------
for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
  for (const [style, scale, width] of [["apple", 1, 300], ["homekit", 1, 300], ["apple", 1.5, 360], ["homekit", 1.5, 600]]) {
    test(`font: ${n} tessere ${style} x${scale} in ${width}px senza overflow (nomi lunghi)`, async ({ page }) => {
      await page.setViewportSize({ width: width + 40, height: 1000 });
      await page.goto(harness);
      const s = manyTypes(n);
      s.attributes.types.forEach((t, i) => { if (i % 2 === 0) t.name = "Vetro e lattine misti"; });
      s.attributes.types[0].name = "Raccoltadifferenziatamoltolunga";
      await page.evaluate(([c, st]) => window.mountCard(c, st), [{ ...base, style, font_scale: scale, start_expanded: true }, s]);
      await page.waitForTimeout(900);
      const bad = await page.locator("garbage-view-card").evaluate((card) => {
        const out = [];
        const root = card.shadowRoot;
        const check = (el, label) => { if (el.scrollWidth > el.clientWidth + 1) out.push(`${label} ${el.scrollWidth}>${el.clientWidth}`); };
        root.querySelectorAll(".tile").forEach((t) => { check(t, "tile"); t.querySelectorAll(".name,.badge,.when").forEach((e) => check(e, e.className)); });
        root.querySelectorAll(".cal-day,.summary-bar").forEach((e) => check(e, e.className));
        const tiles = [...root.querySelectorAll(".tile")];
        tiles.forEach((t) => { const r = t.getBoundingClientRect(); if (r.right > window.innerWidth + 1 || r.left < -1) out.push("tile fuori viewport"); });
        if (document.documentElement.scrollWidth > document.documentElement.clientWidth) out.push("scroll orizzontale");
        return out;
      });
      expect(bad).toEqual([]);
    });
  }
}

test("font_scale ingrandisce i testi delle tessere", async ({ page }) => {
  await page.goto(harness);
  const size = async (fs) => {
    await page.evaluate(([c, s]) => window.mountCard(c, s), [{ ...base, style: "apple", ...(fs ? { font_scale: fs } : {}) }, state]);
    return page.locator("garbage-view-card .tile .name").first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  };
  const normal = await size();
  expect(normal).toBeGreaterThanOrEqual(14); // più grande della 0.2.2 (12,5px)
  expect(await size(1.5)).toBeCloseTo(normal * 1.5, 0);
  expect(await size(0.8)).toBeCloseTo(normal * 0.8, 0);
});

test("tile_min_width allarga il minimo e porta a capo prima", async ({ page }) => {
  await page.setViewportSize({ width: 447, height: 900 });
  await page.goto(harness);
  await page.evaluate(([c, s]) => window.mountCard(c, s), [{ ...base, style: "apple", tile_min_width: 150 }, manyTypes(4)]);
  await page.waitForTimeout(700);
  const widths = await page.locator("garbage-view-card .tile").evaluateAll((t) => t.map((x) => x.offsetWidth));
  for (const w of widths) expect(w).toBeGreaterThanOrEqual(149);
  const tops = await page.locator("garbage-view-card .tile").evaluateAll((t) => new Set(t.map((x) => x.offsetTop)).size);
  expect(tops).toBe(2);
});

test("screenshot tessere: 5 tessere, stretto e largo", async ({ page }) => {
  for (const [name, w, dark] of [["tessere-5-stretto", 407, true], ["tessere-5-largo", 760, false]]) {
    await page.setViewportSize({ width: w + 40, height: 900 });
    await page.goto(harness);
    await page.evaluate(([c, s, d]) => window.mountCard(c, s, { dark: d }), [{ ...base, style: "apple" }, manyTypes(5), dark]);
    await page.waitForTimeout(1500);
    await page.locator("garbage-view-card").screenshot({ path: join(shots, `${name}.png`), animations: "disabled" });
  }
});

test("orario di ritiro: tessere e barra accese solo quando due_now", async ({ page }) => {
  const withDue = (ids) => {
    const s = structuredClone(state);
    s.attributes.types.forEach((t) => (t.due_now = ids.includes(t.id)));
    return s;
  };
  await page.goto(harness);
  const glow = (sel) => page.locator(`garbage-view-card ${sel}`).first().evaluate((e) => getComputedStyle(e).boxShadow);

  // Spento: nessuna tessera accesa, la barra è tenue (nessun contorno accent).
  await page.evaluate(([c, s]) => window.mountCard(c, s), [{ ...base, style: "apple" }, withDue([])]);
  await expect(page.locator("garbage-view-card .tile.today")).toHaveCount(0);
  await expect(page.locator("garbage-view-card .summary-bar.muted")).toHaveCount(1);
  expect(await glow(".summary-bar")).toBe("none");

  // Sera prima: si accende il ritiro di domani mattina.
  await page.evaluate(([c, s]) => window.mountCard(c, s), [{ ...base, style: "apple" }, withDue(["umido"])]);
  await expect(page.locator("garbage-view-card .tile.today")).toHaveCount(1);
  await expect(page.locator("garbage-view-card .tile.today .name")).toHaveText("Umido");

  // Barra accesa quando il «prossimo» è due_now.
  await page.evaluate(([c, s]) => window.mountCard(c, s), [{ ...base, style: "apple" }, withDue(["plastica"])]);
  await expect(page.locator("garbage-view-card .summary-bar.due")).toHaveCount(1);
  expect(await glow(".summary-bar")).not.toBe("none");
});
