import { beforeEach, describe, expect, it } from "vitest";
import { makeHass, makeState } from "./helpers.mjs";

await import("../../../custom_components/garbage_view/frontend/garbage-view-card.js");

beforeEach(() => {
  document.body.replaceChildren();
});

// Crea l'editor, lo collega al DOM e registra gli eventi "config-changed".
function mountEditor(config = { type: "custom:garbage-view-card", entity: "sensor.garbage_view_schedule" }) {
  const editor = document.createElement("garbage-view-card-editor");
  const events = [];
  editor.addEventListener("config-changed", (e) => events.push(e.detail.config));
  editor.setConfig(config);
  editor.hass = makeHass(makeState(), {
    states: {
      "sensor.garbage_view_schedule": makeState(),
      "sensor.temperatura": { state: "20", attributes: {} },
    },
  });
  document.body.append(editor);
  return { editor, events, $: (sel) => editor.shadowRoot.querySelector(sel) };
}

// Simula l'utente che scrive in un campo di testo.
function type(input, value) {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function choose(select, value) {
  select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("editor visuale", () => {
  it("mostra i valori della config", () => {
    const { editor, $ } = mountEditor({
      entity: "sensor.garbage_view_schedule",
      title: "Raccolta",
      style: "homekit",
      days: 7,
      show_summary: false,
      css: "--gv-radius: 10px",
    });
    expect($("input[list]").value).toBe("sensor.garbage_view_schedule");
    expect($("input[maxlength='80']").value).toBe("Raccolta");
    expect($("select").value).toBe("homekit");
    expect($("select:nth-of-type(1)").value).toBe("homekit");
    expect(editor.shadowRoot.querySelectorAll("select")[1].value).toBe("7");
    expect($("input[type=checkbox]").checked).toBe(false);
    expect($("textarea").value).toBe("--gv-radius: 10px");
  });

  it("suggerisce solo le entità di Garbage View quando ci sono", () => {
    const { $ } = mountEditor();
    const options = [...$("datalist").children].map((o) => o.value);
    expect(options).toEqual(["sensor.garbage_view_schedule"]);
  });

  it("cambiare lo stile emette config-changed con il nuovo valore", () => {
    const { $, events } = mountEditor();
    choose($("select"), "homekit");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "custom:garbage-view-card",
      entity: "sensor.garbage_view_schedule",
      style: "homekit",
    });
  });

  it("l'evento attraversa lo shadow DOM (bubbles + composed)", () => {
    const { editor, $ } = mountEditor();
    let heard = false;
    document.body.addEventListener("config-changed", () => (heard = true));
    choose($("select"), "homekit");
    expect(heard).toBe(true);
    expect(editor.isConnected).toBe(true);
  });

  it("non salva campi vuoti o uguali al default", () => {
    const { $, events } = mountEditor();
    type($("input[maxlength='80']"), "Casa");
    expect(events.at(-1).title).toBe("Casa");
    type($("input[maxlength='80']"), "   ");
    expect(events.at(-1)).not.toHaveProperty("title");
    expect(events.at(-1)).not.toHaveProperty("days");
    expect(events.at(-1)).not.toHaveProperty("show_summary");
    expect(events.at(-1)).not.toHaveProperty("css");
  });

  it("days e show_summary vengono salvati quando cambiano", () => {
    const { editor, events } = mountEditor();
    const selects = editor.shadowRoot.querySelectorAll("select");
    choose(selects[1], "7");
    expect(events.at(-1).days).toBe(7);
    choose(selects[1], "14"); // torna al default: il campo sparisce
    expect(events.at(-1)).not.toHaveProperty("days");
    const check = editor.shadowRoot.querySelector("input[type=checkbox]");
    check.checked = false;
    check.dispatchEvent(new Event("change", { bubbles: true }));
    expect(events.at(-1).show_summary).toBe(false);
  });

  it("mantiene i campi sconosciuti della config", () => {
    const { $, events } = mountEditor({ type: "custom:garbage-view-card", entity: "sensor.x", card_mod: { style: "a" } });
    choose($("select"), "homekit");
    expect(events.at(-1).card_mod).toEqual({ style: "a" });
  });

  it("avvisa se manca l'entità", () => {
    const { $ } = mountEditor({ type: "custom:garbage-view-card" });
    expect($("input[list]").getAttribute("aria-invalid")).toBe("true");
    type($("input[list]"), "sensor.garbage_view_schedule");
    expect($("input[list]").getAttribute("aria-invalid")).toBe("false");
  });

  it("conta le variabili css valide e segnala quelle scartate", () => {
    const { $ } = mountEditor();
    type($("textarea"), "--gv-radius: 18px; color: red");
    const hint = $("textarea").closest("label").querySelector(".hint");
    expect(hint.textContent).toContain("1 di 2");
    expect(hint.classList.contains("error")).toBe(true);
  });

  it("setConfig successivi non ricreano i campi (il cursore non si perde)", () => {
    const { editor, $ } = mountEditor();
    const input = $("input[maxlength='80']");
    editor.setConfig({ type: "custom:garbage-view-card", entity: "sensor.garbage_view_schedule", title: "Nuovo" });
    expect($("input[maxlength='80']")).toBe(input);
    expect(input.value).toBe("Nuovo");
  });
});

describe("editor: opzioni del calendario", () => {
  const field = (editor, label) =>
    [...editor.shadowRoot.querySelectorAll("label.field")].find((l) => l.textContent.startsWith(label))?.querySelector("select");

  const check = (editor, text) =>
    [...editor.shadowRoot.querySelectorAll("label.check")].find((l) => l.textContent.includes(text))?.querySelector("input");

  it("mostra i valori della config (view: calendar vale come start_expanded)", () => {
    const { editor } = mountEditor({ entity: "sensor.x", view: "calendar", calendar_mode: "month", show_view_toggle: false });
    expect(check(editor, "già espanso").checked).toBe(true);
    expect(field(editor, "Periodo iniziale").value).toBe("month");
    expect(check(editor, "pulsante").checked).toBe(false);
  });

  it("salva start_expanded e calendar_mode solo se diversi dal default, e toglie view", () => {
    const { editor, events } = mountEditor({ entity: "sensor.x", view: "calendar" });
    const exp = check(editor, "già espanso");
    exp.checked = false;
    exp.dispatchEvent(new Event("change", { bubbles: true }));
    expect(events.at(-1)).not.toHaveProperty("view");
    expect(events.at(-1)).not.toHaveProperty("start_expanded");
    exp.checked = true;
    exp.dispatchEvent(new Event("change", { bubbles: true }));
    expect(events.at(-1).start_expanded).toBe(true);
    choose(field(editor, "Periodo iniziale"), "next_week");
    expect(events.at(-1).calendar_mode).toBe("next_week");
    choose(field(editor, "Periodo iniziale"), "week");
    expect(events.at(-1)).not.toHaveProperty("calendar_mode");
    expect(events.at(-1)).not.toHaveProperty("show_view_toggle");
  });
});
