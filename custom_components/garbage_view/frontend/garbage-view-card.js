/**
 * Garbage View Card  (custom:garbage-view-card)
 *
 * Card Lovelace "vanilla": nessuna dipendenza, nessun build step.
 * Contratto dati: docs/CONTRACT.md (schema_version 1).
 *
 * Come è organizzato questo file (dall'alto in basso):
 *   1. STRINGS      testi tradotti it/en
 *   2. STYLES       CSS della card. I due preset (apple / homekit) sono solo
 *                   variabili CSS `--gv-*`: cambiare stile = cambiare variabili.
 *   3. Helper       sanificazione, date, creazione elementi
 *   4. GarbageViewCard   la classe della card (setConfig / set hass / render)
 *
 * SICUREZZA: i dati dell'utente (nomi, colori, icone) non passano mai da
 * `innerHTML`. Si usano solo `textContent`, `setAttribute` e `style.setProperty`
 * dopo aver validato il valore con una regex.
 */

const CARD_VERSION = "0.1.0";
const SUPPORTED_SCHEMA = 1;

/* ------------------------------------------------------------------ *
 * 1. STRINGS
 * ------------------------------------------------------------------ */
const STRINGS = {
  it: {
    today: "Oggi",
    nothing_today: "Niente da buttare oggi",
    out_today: (n) => (n === 1 ? "Oggi si butta 1 tipo" : `Oggi si buttano ${n} tipi`),
    nothing_day: "Nessuna raccolta",
    next: "Prossimo",
    week: "Settimana",
    no_types: "Nessun tipo di rifiuto configurato.",
    no_entity: (e) => `Entità non trovata: ${e}`,
    unavailable: "Dati non disponibili.",
    bad_schema: "Versione dati non supportata: aggiorna l'integrazione o la card.",
  },
  en: {
    today: "Today",
    nothing_today: "Nothing to put out today",
    out_today: (n) => (n === 1 ? "1 type to put out today" : `${n} types to put out today`),
    nothing_day: "No collection",
    next: "Next",
    week: "Week",
    no_types: "No waste types configured.",
    no_entity: (e) => `Entity not found: ${e}`,
    unavailable: "Data not available.",
    bad_schema: "Unsupported data version: update the integration or the card.",
  },
};

/* ------------------------------------------------------------------ *
 * 2. STYLES
 *
 * Tutte le personalizzazioni passano da variabili `--gv-*` definite su :host.
 * Si possono sovrascrivere con card-mod oppure con l'opzione `css` della card.
 * ------------------------------------------------------------------ */
const STYLES = `
  :host {
    /* ---- Preset "apple" (default) ---- */
    --gv-font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
    --gv-bg: var(--ha-card-background, var(--card-background-color, #ffffff));
    --gv-text: #1d1d1f;
    --gv-text-secondary: #6e6e73;
    --gv-tile-bg: #f2f2f7;
    --gv-tile-size: 76px;
    --gv-radius: 20px;
    --gv-gap: 10px;
    --gv-accent: #0a84ff;
    --gv-shadow: 0 1px 2px rgba(0, 0, 0, .06), 0 4px 16px rgba(0, 0, 0, .06);
    --gv-anim-duration: 280ms;
    display: block;
  }
  /* HomeKit: tessere più grandi, angoli molto arrotondati, ombra più morbida */
  :host([data-style="homekit"]) {
    --gv-tile-bg: #ffffff;
    --gv-tile-size: 88px;
    --gv-radius: 26px;
    --gv-gap: 12px;
    --gv-accent: #ff9f0a;
    --gv-bg: var(--ha-card-background, var(--card-background-color, #e9e9ee));
    --gv-shadow: 0 2px 8px rgba(0, 0, 0, .10);
  }
  /* Dark mode (data-dark è impostato dalla card in base al tema HA / sistema) */
  :host([data-dark]) {
    --gv-text: #f5f5f7;
    --gv-text-secondary: #a1a1a6;
    --gv-tile-bg: #2c2c2e;
    --gv-shadow: 0 1px 2px rgba(0, 0, 0, .4), 0 4px 16px rgba(0, 0, 0, .3);
  }
  :host([data-style="homekit"][data-dark]) {
    --gv-bg: var(--ha-card-background, var(--card-background-color, #1c1c1e));
    --gv-tile-bg: #3a3a3c;
  }

  ha-card, .card {
    background: var(--gv-bg);
    color: var(--gv-text);
    font-family: var(--gv-font);
    border-radius: calc(var(--gv-radius) + 4px);
    padding: 16px;
    box-sizing: border-box;
  }
  .header { display: flex; align-items: baseline; justify-content: space-between; margin: 0 4px 12px; }
  .title { font-size: 1.15rem; font-weight: 600; letter-spacing: -.01em; margin: 0; }
  .summary { font-size: .85rem; color: var(--gv-text-secondary); }

  /* ---- Riga dei tipi di rifiuto ---- */
  .types {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--gv-tile-size), 1fr));
    gap: var(--gv-gap);
  }
  .tile {
    /* --c = colore del rifiuto (già validato come #RRGGBB) */
    --c: var(--gv-accent);
    position: relative;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 6px;
    min-height: var(--gv-tile-size);   /* >= 44px: target tocco comodo */
    padding: 10px 6px;
    border-radius: var(--gv-radius);
    background: var(--gv-tile-bg);
    color: var(--gv-text);
    box-shadow: var(--gv-shadow);
    box-sizing: border-box;
    text-align: center;
    transition: transform var(--gv-anim-duration) cubic-bezier(.34, 1.56, .64, 1),
                box-shadow var(--gv-anim-duration) ease,
                opacity var(--gv-anim-duration) ease;
    animation: gv-pop var(--gv-anim-duration) cubic-bezier(.34, 1.56, .64, 1) both;
    animation-delay: calc(var(--i, 0) * 40ms);
  }
  .tile .icon { color: var(--c); --mdc-icon-size: 28px; font-size: 1.6rem; line-height: 1; font-weight: 700; }
  .tile .name { font-size: .78rem; font-weight: 500; line-height: 1.15; overflow-wrap: anywhere; }
  .tile .when { font-size: .68rem; color: var(--gv-text-secondary); }
  /* Non in scadenza oggi: leggermente attenuata per far risaltare quelle di oggi */
  .types.has-today .tile:not(.today) { opacity: .62; }
  /* In scadenza oggi: sfondo del colore del rifiuto, testo bianco, leggero "respiro" */
  .tile.today {
    background: var(--c);
    color: var(--on-c, #fff);   /* bianco o nero, scelto in base al contrasto */
    transform: scale(1.04);
    box-shadow: 0 6px 20px color-mix(in srgb, var(--c) 45%, transparent);
    animation: gv-pop var(--gv-anim-duration) cubic-bezier(.34, 1.56, .64, 1) both,
               gv-pulse 2.6s ease-in-out 1s infinite;
    animation-delay: calc(var(--i, 0) * 40ms), 1s;
  }
  .tile.today .icon { color: var(--on-c, #fff); }
  .tile.today .when { color: var(--on-c, #fff); opacity: .85; }
  .badge {
    position: absolute; top: 6px; right: 8px;
    font-size: .6rem; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;
    background: rgba(128, 128, 128, .28); border-radius: 999px; padding: 1px 6px;
  }

  /* ---- Riga dei giorni ---- */
  .week { margin-top: 16px; }
  .week-label { font-size: .75rem; color: var(--gv-text-secondary); margin: 0 4px 8px; text-transform: uppercase; letter-spacing: .06em; }
  .days { display: grid; grid-template-columns: repeat(7, 1fr); gap: calc(var(--gv-gap) / 2); }
  .day {
    all: unset;                         /* reset del <button> */
    box-sizing: border-box;
    display: flex; flex-direction: column; align-items: center; justify-content: space-between;
    gap: 4px;
    min-height: 56px; padding: 8px 2px;
    border-radius: calc(var(--gv-radius) * .7);
    background: var(--gv-tile-bg);
    color: var(--gv-text);
    cursor: pointer;
    transition: transform var(--gv-anim-duration) cubic-bezier(.34, 1.56, .64, 1), background var(--gv-anim-duration) ease;
  }
  .day:hover { transform: translateY(-2px); }
  .day:active { transform: scale(.95); }
  .day:focus-visible { outline: 3px solid var(--gv-accent); outline-offset: 2px; }
  .day .dow { font-size: .68rem; text-transform: uppercase; color: var(--gv-text-secondary); font-weight: 600; }
  .day .num { font-size: 1.05rem; font-weight: 600; }
  .dots { display: flex; gap: 3px; min-height: 8px; flex-wrap: wrap; justify-content: center; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--c); }
  .day.today { background: var(--gv-accent); color: #fff; }
  .day.today .dow { color: rgba(255, 255, 255, .85); }
  .day.today .dot { box-shadow: 0 0 0 1.5px #fff; }
  .day[aria-pressed="true"]:not(.today) { box-shadow: inset 0 0 0 2px var(--gv-accent); }

  /* ---- Dettaglio del giorno toccato ---- */
  .detail { margin: 12px 4px 0; font-size: .9rem; animation: gv-fade var(--gv-anim-duration) ease both; }
  .detail:empty { display: none; }
  .detail .d-title { font-weight: 600; margin-bottom: 6px; text-transform: capitalize; }
  .detail ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  .detail li { display: flex; align-items: center; gap: 8px; }
  .detail li .dot { flex: none; }
  .detail .none { color: var(--gv-text-secondary); }

  .message { padding: 16px; color: var(--gv-text-secondary); font-size: .9rem; }

  /* ---- Animazioni ---- */
  @keyframes gv-pop   { from { opacity: 0; transform: scale(.85); } }
  @keyframes gv-fade  { from { opacity: 0; transform: translateY(-4px); } }
  @keyframes gv-pulse { 50% { transform: scale(1.07); } }

  /* Accessibilità: chi preferisce meno movimento non vede animazioni */
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation: none !important; transition: none !important; }
  }
`;

/* ------------------------------------------------------------------ *
 * 3. Helper
 * ------------------------------------------------------------------ */

// Colore ammesso: solo #RRGGBB (stessa regex del backend).
const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
// Icona ammessa: solo "mdi:nome-icona".
const ICON_RE = /^mdi:[a-z0-9-]+$/;
// Id ammesso (slug).
const ID_RE = /^[a-z0-9_]{1,32}$/;
// Data ISO "YYYY-MM-DD".
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Sanifica l'opzione `css`: accetta solo dichiarazioni "--gv-nome: valore".
 * Restituisce una lista di [nome, valore] sicuri. Tutto il resto è scartato.
 *
 *  - il nome deve iniziare con `--gv-`
 *  - il valore può contenere solo caratteri "innocui" (lettere, numeri, spazi,
 *    # . , % ( ) - + / ' ") e non può contenere url(), image-set(), @import,
 *    expression(), backslash, `{` `}` `<` `>` o `;`.
 *
 * Non scriviamo mai questa stringa in un <style>: la applichiamo con
 * style.setProperty(), che non può "uscire" dalla singola proprietà.
 */
function parseSafeCss(css) {
  if (typeof css !== "string") return [];
  const out = [];
  for (const decl of css.slice(0, 2000).split(";")) {
    const idx = decl.indexOf(":");
    if (idx < 0) continue;
    const name = decl.slice(0, idx).trim();
    const value = decl.slice(idx + 1).trim();
    if (!/^--gv-[a-z0-9-]{1,40}$/.test(name)) continue;
    if (!value || value.length > 200) continue;
    if (!/^[\w\s#.,%()+\-/'"]+$/.test(value)) continue;
    if (/url\s*\(|image-set|@import|expression|\\/i.test(value)) continue;
    out.push([name, value]);
  }
  return out;
}

// "2026-11-07" -> Date locale (evita lo sfasamento di fuso di new Date("YYYY-MM-DD")).
function parseDate(iso) {
  if (typeof iso !== "string" || !DATE_RE.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Testo bianco o nero sopra un colore, in base alla luminanza (contrasto WCAG).
function readableOn(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#1d1d1f" : "#ffffff";
}

// Crea un elemento con classi e testo (sempre via textContent: niente HTML).
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/* ------------------------------------------------------------------ *
 * 4. La card
 * ------------------------------------------------------------------ */
class GarbageViewCard extends HTMLElement {
  constructor() {
    super();
    this._root = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = STYLES;
    this._content = el("div", "card");
    this._root.append(style, this._content);
    this._selected = null; // data ISO del giorno toccato
    this._lastStateObj = undefined;
  }

  // Chiamato da HA con la configurazione YAML della card.
  setConfig(config) {
    if (!config || !config.entity) throw new Error("entity è obbligatorio");
    const style = config.style === "homekit" ? "homekit" : "apple";
    this._config = {
      title: typeof config.title === "string" ? config.title.slice(0, 80) : "",
      week_start: config.week_start === "sunday" ? "sunday" : "monday",
      show_week: config.show_week !== false,
      style,
      entity: String(config.entity),
      css: config.css,
    };
    this.setAttribute("data-style", style);
    this._applyCustomCss();
    this._lastStateObj = undefined; // forza il re-render
    this._render();
  }

  // Chiamato da HA ad ogni cambio di QUALSIASI entità: ridisegniamo solo se
  // è cambiata la nostra (controllo per identità dell'oggetto stato).
  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;
    const dark = hass.themes && typeof hass.themes.darkMode === "boolean"
      ? hass.themes.darkMode
      : window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    this.toggleAttribute("data-dark", !!dark);
    const stateObj = hass.states[this._config.entity];
    if (stateObj === this._lastStateObj) return;
    this._lastStateObj = stateObj;
    this._render();
  }

  getCardSize() { return this._config && this._config.show_week ? 5 : 2; }

  static getStubConfig(hass) {
    const entity = hass && Object.keys(hass.states).find((e) => e.startsWith("sensor.garbage_view"));
    return { entity: entity || "sensor.garbage_view_schedule", style: "apple", show_week: true };
  }

  // Applica le variabili --gv-* dell'opzione `css` (già filtrate).
  _applyCustomCss() {
    for (const prev of this._customProps || []) this.style.removeProperty(prev);
    this._customProps = [];
    for (const [name, value] of parseSafeCss(this._config.css)) {
      this.style.setProperty(name, value);
      this._customProps.push(name);
    }
  }

  _t() {
    const lang = ((this._hass && (this._hass.locale?.language || this._hass.language)) || "it").slice(0, 2);
    return STRINGS[lang] || STRINGS.en;
  }

  _lang() {
    return (this._hass && (this._hass.locale?.language || this._hass.language)) || "it";
  }

  // Mostra un messaggio (errore / stato vuoto) al posto del contenuto.
  _showMessage(text) {
    this._content.replaceChildren(el("div", "message", text));
  }

  _render() {
    if (!this._config || !this._hass) return;
    const t = this._t();
    const stateObj = this._hass.states[this._config.entity];
    if (!stateObj) return this._showMessage(t.no_entity(this._config.entity));
    if (stateObj.state === "unavailable" || stateObj.state === "unknown") return this._showMessage(t.unavailable);

    const a = stateObj.attributes || {};
    if (a.schema_version !== SUPPORTED_SCHEMA) return this._showMessage(t.bad_schema);

    // Dati validati: scartiamo tutto ciò che non rispetta il contratto.
    const types = (Array.isArray(a.types) ? a.types : []).filter((x) => x && ID_RE.test(x.id));
    if (!types.length) return this._showMessage(t.no_types);
    const byId = new Map(types.map((x) => [x.id, x]));
    const todayItems = new Set(Array.isArray(a.today_items) ? a.today_items : []);

    const frag = document.createDocumentFragment();

    // Intestazione: titolo + riepilogo di oggi
    const header = el("div", "header");
    if (this._config.title) header.append(el("h2", "title", this._config.title));
    const nToday = types.filter((x) => todayItems.has(x.id)).length;
    header.append(el("span", "summary", nToday ? t.out_today(nToday) : t.nothing_today));
    frag.append(header);

    // Quadrati dei tipi di rifiuto
    const grid = el("div", "types" + (nToday ? " has-today" : ""));
    grid.setAttribute("role", "list");
    types.forEach((type, i) => grid.append(this._buildTile(type, i, todayItems.has(type.id), a.next, t)));
    frag.append(grid);

    // Riga della settimana
    if (this._config.show_week && Array.isArray(a.days)) {
      frag.append(this._buildWeek(a.days, byId, t));
    }

    this._content.replaceChildren(frag);
  }

  _buildTile(type, index, isToday, next, t) {
    const tile = el("div", "tile" + (isToday ? " today" : ""));
    tile.setAttribute("role", "listitem");
    tile.style.setProperty("--i", String(index)); // ritardo animazione a cascata
    if (COLOR_RE.test(type.color)) {
      tile.style.setProperty("--c", type.color);
      tile.style.setProperty("--on-c", readableOn(type.color));
    }

    // Icona: <ha-icon> se disponibile (in HA lo è sempre); altrimenti iniziale.
    const iconWrap = el("div", "icon");
    iconWrap.setAttribute("aria-hidden", "true");
    if (ICON_RE.test(type.icon) && customElements.get("ha-icon")) {
      const icon = document.createElement("ha-icon");
      icon.setAttribute("icon", type.icon);
      iconWrap.append(icon);
    } else {
      iconWrap.textContent = String(type.name || "?").charAt(0).toUpperCase();
    }
    tile.append(iconWrap, el("div", "name", String(type.name || "").slice(0, 40)));

    // Riga secondaria: "Oggi" oppure data del prossimo ritiro
    const nextIso = next && next[type.id];
    const nextDate = parseDate(nextIso);
    if (!isToday && nextDate) {
      tile.append(el("div", "when", nextDate.toLocaleDateString(this._lang(), { weekday: "short", day: "numeric" })));
    }
    if (isToday) tile.append(el("span", "badge", t.today));

    // Etichetta per screen reader (il testo visibile è frammentato).
    const label = [type.name, isToday ? t.today : nextDate ? `${t.next}: ${nextDate.toLocaleDateString(this._lang(), { weekday: "long", day: "numeric", month: "long" })}` : ""];
    tile.setAttribute("aria-label", label.filter(Boolean).join(", "));
    return tile;
  }

  _buildWeek(daysIn, byId, t) {
    // Il contratto manda sempre lun→dom; se serve domenica per prima ruotiamo.
    let days = daysIn.filter((d) => d && parseDate(d.date));
    if (this._config.week_start === "sunday") {
      const sunday = days.findIndex((d) => d.weekday === 6);
      if (sunday > 0) days = [days[sunday], ...days.slice(0, sunday), ...days.slice(sunday + 1)];
    }

    const section = el("div", "week");
    section.append(el("div", "week-label", t.week));
    const row = el("div", "days");
    const detail = el("div", "detail");
    detail.setAttribute("aria-live", "polite");

    // Se il giorno selezionato non è più nella settimana, deseleziona.
    if (!days.some((d) => d.date === this._selected)) this._selected = null;

    const buttons = [];
    days.forEach((d) => {
      const date = parseDate(d.date);
      const items = (Array.isArray(d.items) ? d.items : []).map((id) => byId.get(id)).filter(Boolean);
      const btn = el("button", "day" + (d.is_today ? " today" : ""));
      btn.type = "button";
      btn.setAttribute("aria-pressed", String(d.date === this._selected));
      const longDate = date.toLocaleDateString(this._lang(), { weekday: "long", day: "numeric", month: "long" });
      btn.setAttribute("aria-label", `${d.is_today ? t.today + ", " : ""}${longDate}: ${items.length ? items.map((x) => x.name).join(", ") : t.nothing_day}`);

      btn.append(el("span", "dow", date.toLocaleDateString(this._lang(), { weekday: "short" })));
      btn.append(el("span", "num", String(date.getDate())));
      const dots = el("span", "dots");
      dots.setAttribute("aria-hidden", "true");
      items.forEach((x) => {
        const dot = el("span", "dot");
        if (COLOR_RE.test(x.color)) dot.style.setProperty("--c", x.color);
        dots.append(dot);
      });
      btn.append(dots);

      // Tocco: seleziona/deseleziona il giorno e mostra il dettaglio.
      btn.addEventListener("click", () => {
        this._selected = this._selected === d.date ? null : d.date;
        buttons.forEach(([b, day]) => b.setAttribute("aria-pressed", String(day === this._selected)));
        this._fillDetail(detail, days, byId, t);
      });
      buttons.push([btn, d.date]);
      row.append(btn);
    });

    section.append(row, detail);
    this._fillDetail(detail, days, byId, t);
    return section;
  }

  _fillDetail(container, days, byId, t) {
    container.replaceChildren();
    const d = days.find((x) => x.date === this._selected);
    if (!d) return;
    const date = parseDate(d.date);
    container.append(el("div", "d-title", date.toLocaleDateString(this._lang(), { weekday: "long", day: "numeric", month: "long" })));
    const items = (Array.isArray(d.items) ? d.items : []).map((id) => byId.get(id)).filter(Boolean);
    if (!items.length) {
      container.append(el("div", "none", t.nothing_day));
      return;
    }
    const ul = el("ul");
    items.forEach((x) => {
      const li = el("li");
      const dot = el("span", "dot");
      if (COLOR_RE.test(x.color)) dot.style.setProperty("--c", x.color);
      li.append(dot, el("span", null, String(x.name).slice(0, 40)));
      ul.append(li);
    });
    container.append(ul);
  }
}

if (!customElements.get("garbage-view-card")) {
  customElements.define("garbage-view-card", GarbageViewCard);
}
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "garbage-view-card")) {
  window.customCards.push({
    type: "garbage-view-card",
    name: "Garbage View",
    description: "Cosa buttare oggi e nella settimana (stile Apple / HomeKit)",
    preview: true,
  });
}
console.info(`%c GARBAGE-VIEW-CARD %c ${CARD_VERSION} `, "background:#0a84ff;color:#fff", "");
