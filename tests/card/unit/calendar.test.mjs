import { beforeEach, describe, expect, it } from "vitest";
import { makeState, mountCard, q, qa } from "./helpers.mjs";

await import("../../../custom_components/garbage_view/frontend/garbage-view-card.js");

beforeEach(() => {
  document.body.replaceChildren();
});

// Fixture: oggi = sabato 2026-11-07. Regole: umido mar+ven, plastica sab,
// carta lun ogni 2 settimane (ancora 9/11), vetro 2° giovedì del mese.
const cal = (config = {}, state = makeState()) => mountCard(state, { view: "calendar", ...config });
const click = (node) => node.dispatchEvent(new Event("click", { bubbles: true }));
const cell = (card, iso) => qa(card, ".cal-day").find((c) => c.getAttribute("aria-label").includes(iso)) ?? null;
const cellOf = (card, n) => qa(card, ".cal-day")[n];
const names = (c) => [...c.querySelectorAll(".cal-icons .icon")].length;

describe("vista calendario", () => {
  it("di default la card è compatta e c'è l'interruttore", () => {
    const card = mountCard();
    expect(qa(card, ".tile")).toHaveLength(4);
    expect(q(card, ".cal")).toBeNull();
    const btns = qa(card, ".header .seg button");
    expect(btns.map((b) => b.textContent)).toEqual(["Compatta", "Calendario"]);
    expect(btns[0].getAttribute("aria-pressed")).toBe("true");
  });

  it("view: calendar mostra la settimana corrente (lun 2/11 – dom 8/11)", () => {
    const card = cal();
    expect(qa(card, ".tile")).toHaveLength(0);
    expect(qa(card, ".cal-day")).toHaveLength(7);
    expect(q(card, ".range").textContent).toBe("2–8 nov 2026");
    expect(qa(card, ".cal-day .num").map((n) => n.textContent)).toEqual(["2", "3", "4", "5", "6", "7", "8"]);
  });

  it("oggi è evidenziato, i giorni passati sono attenuati", () => {
    const card = cal();
    expect(qa(card, ".cal-day.today")).toHaveLength(1);
    expect(q(card, ".cal-day.today .num").textContent).toBe("7");
    expect(qa(card, ".cal-day.past")).toHaveLength(5); // lun..ven
  });

  it("ogni giorno mostra le icone dei rifiuti (calcolate dalle regole)", () => {
    const card = cal();
    // lun - (carta è nella settimana dopo), mar umido, ven umido, sab plastica
    const counts = qa(card, ".cal-day").map(names);
    expect(counts).toEqual([0, 1, 0, 0, 1, 1, 0]);
    expect(cellOf(card, 5).getAttribute("aria-label")).toContain("Plastica");
  });

  it("prossima settimana: calendar_mode next_week", () => {
    const card = cal({ calendar_mode: "next_week" });
    expect(q(card, ".range").textContent).toBe("9–15 nov 2026");
    // lun 9 carta, mar 10 umido, gio 12 vetro, ven 13 umido, sab 14 plastica
    expect(qa(card, ".cal-day").map(names)).toEqual([1, 1, 0, 1, 1, 1, 0]);
    expect(qa(card, ".cal-day.today")).toHaveLength(0);
  });

  it("mese: griglia completa a settimane intere, giorni fuori mese sfumati", () => {
    const card = cal({ calendar_mode: "month" });
    expect(q(card, ".range").textContent.toLowerCase()).toBe("novembre 2026");
    const days = qa(card, ".cal-day");
    expect(days).toHaveLength(42); // nov 2026 inizia di domenica: 6 righe (26/10 … 6/12)
    expect(days[0].querySelector(".num").textContent).toBe("26");
    expect(qa(card, ".cal-day.out")).toHaveLength(12); // 6 di ottobre + 6 di dicembre
    expect(qa(card, ".cal-day.today")).toHaveLength(1);
    // vetro: 2° giovedì = 12/11
    expect(cellOf(card, 3 + 14).getAttribute("aria-label")).toContain("Vetro");
  });

  it("oltre 3 icone in un giorno del mese mostra +N", () => {
    const state = makeState((s) => {
      s.attributes.types.forEach((t) => (t.rule = { type: "weekly", weekdays: [0, 1, 2, 3, 4, 5, 6] }));
    });
    const card = cal({ calendar_mode: "month" }, state);
    const first = cellOf(card, 10);
    expect(names(first)).toBe(3);
    expect(first.querySelector(".more").textContent).toBe("+1");
  });
});

describe("navigazione", () => {
  it("le frecce spostano di una settimana e il segmento attivo cambia", () => {
    const card = cal();
    click(q(card, '[data-key="nav-next"]'));
    expect(q(card, ".range").textContent).toBe("9–15 nov 2026");
    expect(q(card, '[data-key="cal-next_week"]').getAttribute("aria-pressed")).toBe("true");
    click(q(card, '[data-key="nav-next"]'));
    expect(q(card, ".range").textContent).toBe("16–22 nov 2026");
    expect(qa(card, ".seg [aria-pressed='true']").filter((b) => b.dataset.key.startsWith("cal-"))).toHaveLength(0);
    click(q(card, '[data-key="cal-week"]')); // torna a questa settimana
    expect(q(card, ".range").textContent).toBe("2–8 nov 2026");
  });

  it("una settimana a cavallo di due mesi ha l'etichetta completa", () => {
    const card = cal();
    for (let i = 0; i < 3; i++) click(q(card, '[data-key="nav-next"]'));
    expect(q(card, ".range").textContent).toBe("23–29 nov 2026");
    click(q(card, '[data-key="nav-next"]'));
    expect(q(card, ".range").textContent).toBe("30 nov – 6 dic 2026");
  });

  it("nel mese le frecce passano da un mese all'altro, anche indietro e oltre l'anno", () => {
    const card = cal({ calendar_mode: "month" });
    click(q(card, '[data-key="nav-prev"]'));
    expect(q(card, ".range").textContent.toLowerCase()).toBe("ottobre 2026");
    for (let i = 0; i < 3; i++) click(q(card, '[data-key="nav-next"]'));
    expect(q(card, ".range").textContent.toLowerCase()).toBe("gennaio 2027");
    // le ricorrenze funzionano anche lontano dalla finestra del sensore (14 giorni)
    expect(qa(card, ".cal-day .cal-icons .icon").length).toBeGreaterThan(10);
  });

  it("dopo il click il focus torna sul controllo premuto (tastiera)", () => {
    const card = cal();
    document.body.focus();
    click(q(card, '[data-key="nav-next"]'));
    expect(card.shadowRoot.activeElement?.dataset.key).toBe("nav-next");
  });

  it("l'interruttore passa da calendario a compatta e viceversa", () => {
    const card = mountCard();
    click(q(card, '[data-key="view-calendar"]'));
    expect(q(card, ".cal")).not.toBeNull();
    expect(qa(card, ".tile")).toHaveLength(0);
    click(q(card, '[data-key="view-compact"]'));
    expect(qa(card, ".tile")).toHaveLength(4);
  });

  it("show_view_toggle: false nasconde l'interruttore", () => {
    const card = cal({ show_view_toggle: false });
    expect(qa(card, ".header .seg")).toHaveLength(0);
    expect(q(card, ".cal")).not.toBeNull();
  });

  it("un nuovo setConfig con gli stessi valori non azzera la navigazione", () => {
    const card = cal();
    click(q(card, '[data-key="nav-next"]'));
    card.setConfig({ entity: "sensor.garbage_view_schedule", view: "calendar", title: "Casa" });
    expect(q(card, ".range").textContent).toBe("9–15 nov 2026");
  });
});

describe("dettaglio e accessibilità", () => {
  it("toccare un giorno mostra i nomi dei rifiuti", () => {
    const card = cal();
    click(cellOf(card, 5));
    expect(cellOf(card, 5).getAttribute("aria-pressed")).toBe("true");
    expect(q(card, ".detail").textContent).toContain("Plastica");
    click(cellOf(card, 5));
    expect(q(card, ".detail").textContent).toBe("");
  });

  it("c'è una legenda con tutti i tipi", () => {
    expect(qa(cal(), ".legend > span")).toHaveLength(4);
  });

  it("le etichette per screen reader contengono data e rifiuti", () => {
    const label = cellOf(cal(), 5).getAttribute("aria-label");
    expect(label).toContain("Oggi");
    expect(label).toContain("sabato 7 novembre");
  });

  it("inglese: testi e giorni tradotti", () => {
    const card = cal();
    card.hass = { ...card._hass, language: "en", locale: { language: "en" }, states: { "sensor.garbage_view_schedule": makeState() } };
    expect(q(card, ".header .seg button").textContent).toBe("Compact");
    expect(q(card, ".cal-head span").textContent).toBe("Mon");
  });

  it("senza `rule` (vecchio backend) usa i giorni esposti dal sensore", () => {
    const state = makeState((s) => s.attributes.types.forEach((t) => delete t.rule));
    const card = cal({}, state);
    expect(qa(card, ".cal-day").map(names)).toEqual([0, 0, 0, 0, 0, 1, 0]); // `days` parte da oggi: prima di sabato non c'è nulla
  });

  it("nomi con HTML non vengono interpretati", () => {
    const state = makeState((s) => (s.attributes.types[0].name = "<img src=x onerror=alert(1)>"));
    const card = cal({}, state);
    expect(card.shadowRoot.querySelector("img")).toBeNull();
  });
});
