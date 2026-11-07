// Utilità condivise dai test: carica la card e costruisce un finto `hass`.
import { readFileSync } from "node:fs";
import { join } from "node:path";

// vitest gira dalla radice del repo, quindi il percorso parte da lì.
export const fixture = JSON.parse(
  readFileSync(join(process.cwd(), "tests/fixtures/schedule_example.json"), "utf8")
);

// Copia profonda della fixture, così ogni test può modificarla senza effetti collaterali.
export function makeState(mutate) {
  const state = structuredClone(fixture);
  if (mutate) mutate(state);
  return state;
}

// Finto oggetto `hass` con una sola entità.
export function makeHass(state, extra = {}) {
  return {
    states: { "sensor.garbage_view_schedule": state },
    language: "it",
    ...extra,
  };
}

// Crea una card già configurata e collegata al DOM.
export function mountCard(state = makeState(), config = {}) {
  const card = document.createElement("garbage-view-card");
  card.setConfig({ entity: "sensor.garbage_view_schedule", ...config });
  card.hass = makeHass(state);
  document.body.append(card);
  return card;
}

// Scorciatoia per cercare dentro lo shadow DOM della card.
export const q = (card, sel) => card.shadowRoot.querySelector(sel);
export const qa = (card, sel) => [...card.shadowRoot.querySelectorAll(sel)];
