import { beforeEach, describe, expect, it } from "vitest";
import { makeHass, makeState, mountCard, q, qa } from "./helpers.mjs";

// Importare il file registra gli elementi custom (effetto collaterale voluto).
await import("../../../custom_components/garbage_view/frontend/garbage-view-card.js");

beforeEach(() => {
  document.body.replaceChildren();
});

// Helper: imposta in quanti giorni è il prossimo ritiro di un tipo (come farebbe il backend).
const setUntil = (state, id, n) => {
  const t = state.attributes.types.find((x) => x.id === id);
  t.next = n === null ? null : { date: "2026-11-07", days_until: n };
};
const tileOf = (card, name) => qa(card, ".tile").find((t) => t.querySelector(".name").textContent === name);

describe("rendering base", () => {
  it("mostra una tessera per ogni tipo di rifiuto", () => {
    expect(qa(mountCard(), ".tile")).toHaveLength(4);
  });

  it("evidenzia solo i rifiuti di oggi", () => {
    const card = mountCard();
    const today = qa(card, ".tile.today");
    expect(today).toHaveLength(1);
    expect(today[0].textContent).toContain("Plastica");
    expect(today[0].querySelector(".badge").textContent).toBe("Oggi");
    expect(qa(card, ".tile.next")).toHaveLength(0); // "next" solo se oggi non c'è nulla
  });

  it("evidenzia più rifiuti nello stesso giorno", () => {
    const state = makeState((s) => setUntil(s, "umido", 0));
    const card = mountCard(state);
    const names = qa(card, ".tile.today .name").map((n) => n.textContent);
    expect(names).toEqual(["Umido", "Plastica"]);
  });

  it("se oggi non c'è nulla evidenzia il prossimo ritiro", () => {
    const state = makeState((s) => {
      setUntil(s, "plastica", 7);
      s.attributes.next_item = { id: "carta", date: "2026-11-09", days_until: 2 };
    });
    const card = mountCard(state);
    expect(qa(card, ".tile.today")).toHaveLength(0);
    const hl = qa(card, ".tile.next");
    expect(hl).toHaveLength(1);
    expect(hl[0].textContent).toContain("Carta");
  });

  it("mostra il titolo solo se configurato", () => {
    expect(q(mountCard(), ".title")).toBeNull();
    expect(q(mountCard(makeState(), { title: "Raccolta" }), ".title").textContent).toBe("Raccolta");
  });
});

describe("tessere: badge relativo", () => {
  it("mostra Oggi / Domani / N giorni", () => {
    const state = makeState((s) => setUntil(s, "umido", 1));
    const card = mountCard(state);
    const badge = (n) => tileOf(card, n).querySelector(".badge").textContent;
    expect([badge("Umido"), badge("Plastica"), badge("Carta"), badge("Vetro")]).toEqual(["Domani", "Oggi", "2 giorni", "5 giorni"]);
  });

  it("un tipo senza prossima occorrenza (next: null) non mostra badge", () => {
    const card = mountCard(makeState((s) => setUntil(s, "vetro", null)));
    expect(tileOf(card, "Vetro").querySelector(".badge")).toBeNull();
  });
});

describe("striscia dei giorni", () => {
  it("mostra 14 giorni di default, con oggi per primo", () => {
    const card = mountCard();
    expect(qa(card, ".day")).toHaveLength(14);
    const today = qa(card, ".day.today");
    expect(today).toHaveLength(1);
    expect(today[0]).toBe(qa(card, ".day")[0]);
    expect(q(card, ".day .cell").textContent).toBe("7");
  });

  it("days: 7 mostra solo i primi 7 giorni", () => {
    expect(qa(mountCard(makeState(), { days: 7 }), ".day")).toHaveLength(7);
  });

  it("valori di days non validi tornano a 14", () => {
    expect(qa(mountCard(makeState(), { days: 30 }), ".day")).toHaveLength(14);
  });

  it("solo i giorni con ritiro hanno la classe has", () => {
    const days = qa(mountCard(), ".day");
    expect(days[0].classList.contains("has")).toBe(true); // oggi: plastica
    expect(days[1].classList.contains("has")).toBe(false); // 8 nov: nulla
  });

  it("il tocco su un giorno mostra il dettaglio e un secondo tocco lo chiude", () => {
    const card = mountCard();
    const day = qa(card, ".day")[2]; // 9 novembre: carta
    day.click();
    expect(day.getAttribute("aria-pressed")).toBe("true");
    expect(q(card, ".detail").textContent).toContain("Carta");
    day.click();
    expect(day.getAttribute("aria-pressed")).toBe("false");
    expect(q(card, ".detail").textContent).toBe("");
  });

  it("i giorni sono <button> con aria-label descrittiva", () => {
    const today = q(mountCard(), ".day.today");
    expect(today.tagName).toBe("BUTTON");
    expect(today.getAttribute("aria-label")).toMatch(/^Oggi, .*Plastica$/);
  });
});

describe("barra riepilogo", () => {
  it("mostra il prossimo ritiro da next_item", () => {
    const bar = q(mountCard(), ".summary-bar");
    expect(bar.textContent).toContain("Prossimo: Plastica");
    expect(bar.textContent).toContain("oggi");
    expect(bar.querySelector("strong").textContent).toBe("Plastica");
  });

  it("show_summary: false la nasconde", () => {
    expect(q(mountCard(makeState(), { show_summary: false }), ".summary-bar")).toBeNull();
  });

  it("next_item null: mostra un testo neutro, senza nome", () => {
    const state = makeState((s) => (s.attributes.next_item = null));
    const bar = q(mountCard(state), ".summary-bar");
    expect(bar.querySelector("strong")).toBeNull();
  });
});

describe("stati di errore", () => {
  it("entità mancante", () => {
    const card = mountCard();
    card.setConfig({ entity: "sensor.non_esiste" });
    expect(q(card, ".message").textContent).toContain("sensor.non_esiste");
  });

  it("entità non disponibile", () => {
    const card = mountCard(makeState((s) => (s.state = "unavailable")));
    expect(q(card, ".message").textContent).toBe("Dati non disponibili.");
  });

  it("schema_version non supportata", () => {
    const card = mountCard(makeState((s) => (s.attributes.schema_version = 99)));
    expect(q(card, ".message").textContent).toContain("non supportata");
  });

  it("nessun tipo configurato", () => {
    const card = mountCard(makeState((s) => (s.attributes.types = [])));
    expect(q(card, ".message").textContent).toContain("Nessun tipo");
  });

  it("setConfig senza entity lancia un errore", () => {
    const card = document.createElement("garbage-view-card");
    expect(() => card.setConfig({})).toThrow();
  });
});

describe("preset e tema", () => {
  it("style apple è il default, homekit imposta data-style", () => {
    expect(mountCard().getAttribute("data-style")).toBe("apple");
    expect(mountCard(makeState(), { style: "homekit" }).getAttribute("data-style")).toBe("homekit");
    expect(mountCard(makeState(), { style: "boh" }).getAttribute("data-style")).toBe("apple");
  });

  it("segue il tema scuro di Home Assistant", () => {
    const card = mountCard();
    card.hass = makeHass(makeState(), { themes: { darkMode: true } });
    expect(card.hasAttribute("data-dark")).toBe(true);
    card.hass = makeHass(makeState(), { themes: { darkMode: false } });
    expect(card.hasAttribute("data-dark")).toBe(false);
  });
});

describe("performance: render solo se cambia l'entità", () => {
  it("non ridisegna se lo stato è lo stesso oggetto", () => {
    const state = makeState();
    const card = mountCard(state);
    const before = q(card, ".types");
    card.hass = makeHass(state); // stesso oggetto stato (altre entità potrebbero essere cambiate)
    expect(q(card, ".types")).toBe(before);
  });

  it("ridisegna se l'oggetto stato cambia", () => {
    const card = mountCard();
    const before = q(card, ".types");
    card.hass = makeHass(makeState());
    expect(q(card, ".types")).not.toBe(before);
  });
});

describe("sicurezza", () => {
  it("un nome con HTML viene mostrato come testo, non interpretato", () => {
    const state = makeState((s) => {
      s.attributes.types[0].name = '<img src=x onerror="window.__pwned=1">';
    });
    const card = mountCard(state);
    expect(card.shadowRoot.querySelector("img")).toBeNull();
    expect(qa(card, ".name")[0].textContent).toContain("<img");
    expect(window.__pwned).toBeUndefined();
  });

  it("colori non validi vengono ignorati", () => {
    const state = makeState((s) => {
      s.attributes.types[0].color = "red; background:url(http://evil)";
    });
    const tile = qa(mountCard(state), ".tile")[0];
    expect(tile.style.getPropertyValue("--c")).toBe("");
  });

  it("l'opzione css accetta solo variabili --gv-* sicure", () => {
    const css = [
      "--gv-radius: 18px",
      "--gv-accent: #34c759",
      "color: red", // non è --gv-*
      "--gv-bg: url(http://evil/x.png)", // url() vietato
      "--gv-font: expression(alert(1))",
      "--gv-shadow: 0 0 0 red \\\\9",
      "--other: 1px",
    ].join(";");
    const card = mountCard(makeState(), { css });
    expect(card.style.getPropertyValue("--gv-radius")).toBe("18px");
    expect(card.style.getPropertyValue("--gv-accent")).toBe("#34c759");
    expect(card.style.getPropertyValue("--gv-bg")).toBe("");
    expect(card.style.getPropertyValue("--gv-font")).toBe("");
    expect(card.style.getPropertyValue("--gv-shadow")).toBe("");
    expect(card.style.getPropertyValue("--other")).toBe("");
    expect(card.style.getPropertyValue("color")).toBe("");
  });

  it("cambiando css le vecchie variabili vengono rimosse", () => {
    const card = mountCard(makeState(), { css: "--gv-radius: 18px" });
    card.setConfig({ entity: "sensor.garbage_view_schedule", css: "--gv-gap: 4px" });
    expect(card.style.getPropertyValue("--gv-radius")).toBe("");
    expect(card.style.getPropertyValue("--gv-gap")).toBe("4px");
  });
});

describe("registrazione", () => {
  it("la card è nel catalogo delle custom cards", () => {
    expect(window.customCards.some((c) => c.type === "garbage-view-card")).toBe(true);
  });

  it("getConfigElement restituisce l'editor", () => {
    const Card = customElements.get("garbage-view-card");
    expect(Card.getConfigElement().tagName.toLowerCase()).toBe("garbage-view-card-editor");
  });

  it("getStubConfig trova l'entità di Garbage View", () => {
    const Card = customElements.get("garbage-view-card");
    const stub = Card.getStubConfig({ states: { "sensor.garbage_view_schedule": {}, "sensor.altro": {} } });
    expect(stub.entity).toBe("sensor.garbage_view_schedule");
  });
});
