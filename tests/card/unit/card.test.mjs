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
// Backend < 0.2.2: nessun `due_now` sui tipi (la card ripiega sul vecchio comportamento).
const legacy = (s) => s.attributes.types.forEach((t) => { delete t.due_now; delete t.pickup; });
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
    const state = makeState((s) => { legacy(s); setUntil(s, "umido", 0); });
    const card = mountCard(state);
    const names = qa(card, ".tile.today .name").map((n) => n.textContent);
    expect(names).toEqual(["Umido", "Plastica"]);
  });

  it("se oggi non c'è nulla evidenzia il prossimo ritiro", () => {
    const state = makeState((s) => {
      legacy(s);
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

describe("orario di ritiro: evidenza guidata da due_now", () => {
  const setDue = (s, ids) => s.attributes.types.forEach((t) => (t.due_now = ids.includes(t.id)));
  const names = (card, sel) => qa(card, sel).map((n) => n.querySelector(".name").textContent);

  it("si accende solo il tipo con due_now (ritiro serale di oggi)", () => {
    const card = mountCard(makeState((s) => setDue(s, ["plastica"])));
    expect(names(card, ".tile.today")).toEqual(["Plastica"]);
    expect(qa(card, ".tile.next")).toHaveLength(0);
  });

  it("ritiro di oggi già passato (due_now false): resta spenta, senza animazione", () => {
    const card = mountCard(makeState((s) => setDue(s, [])));
    expect(qa(card, ".tile.today")).toHaveLength(0);
    expect(qa(card, ".tile.next")).toHaveLength(0);
    expect(qa(card, ".tile")).toHaveLength(4);
  });

  it("ritiro di domani mattina acceso dalla sera prima (due_now con days_until = 1)", () => {
    const card = mountCard(makeState((s) => { setUntil(s, "umido", 1); setDue(s, ["umido"]); }));
    expect(names(card, ".tile.today")).toEqual(["Umido"]);
    expect(tileOf(card, "Umido").querySelector(".badge").textContent).toBe("Domani");
  });

  it("più tipi accesi insieme", () => {
    const card = mountCard(makeState((s) => setDue(s, ["umido", "carta"])));
    expect(names(card, ".tile.today")).toEqual(["Umido", "Carta"]);
  });

  it("la barra «Prossimo» segue il tipo: accesa se due_now, spenta altrimenti", () => {
    const on = q(mountCard(makeState((s) => setDue(s, ["plastica"]))), ".summary-bar");
    expect(on.classList.contains("due")).toBe(true);
    expect(on.classList.contains("muted")).toBe(false);
    document.body.replaceChildren();
    const off = q(mountCard(makeState((s) => setDue(s, []))), ".summary-bar");
    expect(off.classList.contains("muted")).toBe(true);
    expect(off.classList.contains("due")).toBe(false);
  });

  it("la barra mostra il ritiro da mettere fuori ora, non un ritiro mattutino già passato", () => {
    // domenica sera: next_item è ancora la carta di stamattina (non più due_now), ma l'umido di domani è acceso
    const card = mountCard(makeState((s) => {
      s.attributes.next_item = { id: "carta", date: "2026-11-07", days_until: 0, pickup: "morning" };
      setUntil(s, "umido", 1);
      setDue(s, ["umido"]);
    }));
    const bar = q(card, ".summary-bar");
    expect(bar.classList.contains("due")).toBe(true);
    expect(bar.querySelector("strong").textContent).toBe("Umido");
  });

  it("mostra il momento del ritiro (mattina/sera) nella barra e nell'aria-label", () => {
    const state = makeState((s) => { setDue(s, []); s.attributes.next_item.pickup = "evening"; });
    const card = mountCard(state);
    expect(q(card, ".summary-bar").textContent).toContain("sera");
    expect(tileOf(card, "Umido").getAttribute("aria-label")).toContain("mattina");
    expect(tileOf(card, "Umido").querySelector(".when").textContent).toContain("mattina");
  });

  it("backend vecchio (nessun due_now): comportamento precedente, barra senza stato", () => {
    const card = mountCard(makeState(legacy));
    expect(names(card, ".tile.today")).toEqual(["Plastica"]);
    const bar = q(card, ".summary-bar");
    expect(bar.classList.contains("due") || bar.classList.contains("muted")).toBe(false);
  });

  it("si aggiorna quando il sensore cambia due_now", () => {
    const state = makeState((s) => setDue(s, []));
    const card = mountCard(state);
    expect(qa(card, ".tile.today")).toHaveLength(0);
    const next = makeState((s) => setDue(s, ["vetro"]));
    card.hass = makeHass(next);
    expect(names(card, ".tile.today")).toEqual(["Vetro"]);
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
  it("mostra 7 giorni di default, con oggi per primo", () => {
    const card = mountCard();
    expect(qa(card, ".day")).toHaveLength(7);
    const today = qa(card, ".day.today");
    expect(today).toHaveLength(1);
    expect(today[0]).toBe(qa(card, ".day")[0]);
    expect(q(card, ".day .cell").textContent).toBe("7");
  });

  it("di default la striscia mostra 7 giorni (la settimana corrente)", () => {
    expect(qa(mountCard(), ".day")).toHaveLength(7);
  });

  it("days: 14 mostra 14 giorni", () => {
    expect(qa(mountCard(makeState(), { days: 14 }), ".day")).toHaveLength(14);
  });

  it("valori di days non validi tornano a 7", () => {
    expect(qa(mountCard(makeState(), { days: 30 }), ".day")).toHaveLength(7);
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

describe("tessere: colonne bilanciate e larghezza minima", () => {
  const { tileRows, clampTileMin } = globalThis.__gv;

  it("tileRows: 5 tessere dove ne starebbero 4 diventano 3 + 2, non 4 + 1", () => {
    // 407px, minimo 76, gap 10 → ne starebbero 4 per riga
    expect(tileRows(5, 407, 76, 10)).toEqual([3, 2]);
    expect(tileRows(4, 407, 76, 10)).toEqual([4]);
    expect(tileRows(6, 407, 76, 10)).toEqual([3, 3]);
    expect(tileRows(7, 407, 76, 10)).toEqual([4, 3]);
    expect(tileRows(8, 407, 76, 10)).toEqual([4, 4]);
  });

  it("tileRows: 7 tessere dove ne starebbero 3 diventano 3 + 2 + 2, non 3 + 3 + 1", () => {
    expect(tileRows(7, 300, 76, 10)).toEqual([3, 2, 2]);
  });

  it("tileRows: poche tessere non creano colonne vuote e lo spazio stretto dà una colonna", () => {
    expect(tileRows(1, 900, 76, 10)).toEqual([1]);
    expect(tileRows(2, 900, 76, 10)).toEqual([2]);
    expect(tileRows(3, 100, 76, 10)).toEqual([1, 1, 1]);
    expect(tileRows(0, 900, 76, 10)).toEqual([]);
    expect(tileRows(8, 900, 76, 10)).toEqual([8]);
  });

  it("tileRows: somma = n, righe ≤ quelle che ci stanno, differenza tra righe al massimo 1", () => {
    for (let n = 1; n <= 12; n++) {
      for (const w of [150, 280, 360, 407, 520, 700, 1000]) {
        const fit = Math.max(1, Math.floor((w + 10) / (76 + 10)));
        const rows = tileRows(n, w, 76, 10);
        expect(rows.reduce((a, b) => a + b, 0)).toBe(n);
        expect(Math.max(...rows)).toBeLessThanOrEqual(fit);
        expect(Math.max(...rows) - Math.min(...rows)).toBeLessThanOrEqual(1);
        expect(rows.length).toBe(Math.ceil(n / Math.min(fit, n)));
      }
    }
  });

  it("tile_min_width: valori validi (anche come stringa) sono limitati a 60–240, il resto è ignorato", () => {
    expect(clampTileMin(100)).toBe(100);
    expect(clampTileMin("120")).toBe(120);
    expect(clampTileMin(10)).toBe(60);
    expect(clampTileMin(9999)).toBe(240);
    for (const bad of [undefined, null, "", "abc", NaN, {}, [], true]) expect(clampTileMin(bad)).toBeNull();
  });

  it("tile_min_width imposta --gv-tile-min-width; rimossa l'opzione torna al preset", () => {
    const card = mountCard(makeState(), { tile_min_width: 110 });
    expect(card.style.getPropertyValue("--gv-tile-min-width")).toBe("110px");
    card.setConfig({ entity: "sensor.garbage_view_schedule" });
    expect(card.style.getPropertyValue("--gv-tile-min-width")).toBe("");
  });

  it("tile_min_width non valido viene ignorato (nessuna variabile)", () => {
    const card = mountCard(makeState(), { tile_min_width: "100px; color:red" });
    expect(card.style.getPropertyValue("--gv-tile-min-width")).toBe("");
  });
});
