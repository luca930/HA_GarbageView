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
 * SICUREZZA: i dati dell'utente (nomi, icone) non passano mai da
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
    tomorrow: "Domani",
    in_days: (n) => `${n} giorni`,
    next_label: "Prossimo",
    nothing_next: "Nessun ritiro in programma",
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
    tomorrow: "Tomorrow",
    in_days: (n) => `${n} days`,
    next_label: "Next",
    nothing_next: "No collection scheduled",
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

  /* ---- Tessere dei tipi di rifiuto ----
     Minimal: un solo colore (--gv-accent). Le tessere sono neutre e attenuate;
     solo quelle di OGGI sono piene di accent, con alone e un "respiro" lento. */
  .types {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(var(--gv-tile-size), 1fr));
    gap: var(--gv-gap);
  }
  .tile {
    position: relative;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 6px;
    min-height: calc(var(--gv-tile-size) + 28px);
    padding: 14px 8px;
    border-radius: var(--gv-radius);
    background: var(--gv-tile-bg);
    color: var(--gv-text-secondary);
    opacity: .7;                         /* attenuata: non è oggi */
    box-sizing: border-box;
    text-align: center;
    transition: transform var(--gv-anim-duration) cubic-bezier(.34, 1.56, .64, 1),
                box-shadow var(--gv-anim-duration) ease, opacity var(--gv-anim-duration) ease;
    animation: gv-pop var(--gv-anim-duration) cubic-bezier(.34, 1.56, .64, 1) both;
    animation-delay: calc(var(--i, 0) * 40ms);
  }
  .tile .icon { --mdc-icon-size: 36px; font-size: 1.8rem; line-height: 1; font-weight: 700; display: flex; }
  .tile .name { font-size: .78rem; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; overflow-wrap: anywhere; }
  .tile .badge { font-size: .78rem; font-weight: 600; padding: 3px 12px; border-radius: 999px; background: rgba(128, 128, 128, .18); color: var(--gv-text); }
  .tile .when { font-size: .72rem; }
  /* Prossimo ritiro (quando oggi non c'è nulla): normale opacità + bordo accent sottile */
  .tile.next { opacity: 1; box-shadow: inset 0 0 0 2px var(--gv-accent); }
  .tile.next .icon { color: var(--gv-accent); }
  /* OGGI: protagonista. Fill accent, testo bianco, alone e respiro lento */
  .tile.today {
    opacity: 1;
    background: var(--gv-accent);
    color: #fff;
    box-shadow: 0 8px 24px color-mix(in srgb, var(--gv-accent) 50%, transparent);
    transform: scale(1.04);
    animation: gv-pop var(--gv-anim-duration) cubic-bezier(.34, 1.56, .64, 1) both,
               gv-glow 2.8s ease-in-out 1s infinite;
    animation-delay: calc(var(--i, 0) * 40ms), 1s;
  }
  .tile.today .icon { color: #fff; }
  .tile.today .badge { background: rgba(255, 255, 255, .25); color: #fff; }

  /* ---- Striscia dei giorni ---- */
  .strip { display: grid; gap: 4px; margin-top: 16px; }
  .day {
    all: unset;                         /* reset del <button> */
    box-sizing: border-box;
    display: flex; flex-direction: column; align-items: center; gap: 4px;
    cursor: pointer; border-radius: 10px; padding: 2px 0;
  }
  .day:focus-visible { outline: 3px solid var(--gv-accent); outline-offset: 1px; }
  .day .dow { font-size: .68rem; color: var(--gv-text-secondary); }
  .day .cell {
    width: 100%; min-height: 44px;      /* altezza >= 44px: target tocco comodo */
    display: flex; align-items: center; justify-content: center;
    border-radius: 8px; box-sizing: border-box;
    background: var(--gv-tile-bg); color: var(--gv-text-secondary);
    font-size: .8rem; font-weight: 600;
    transition: transform var(--gv-anim-duration) cubic-bezier(.34, 1.56, .64, 1);
  }
  .day:hover .cell { transform: translateY(-2px); }
  .day:active .cell { transform: scale(.94); }
  /* Giorno con ritiro: tinta accent leggera. Oggi: pieno. */
  .day.has .cell { background: color-mix(in srgb, var(--gv-accent) 22%, var(--gv-tile-bg)); color: var(--gv-text); }
  .day.today .cell { background: var(--gv-accent); color: #fff; }
  .day[aria-pressed="true"] .cell { box-shadow: 0 0 0 2px var(--gv-text-secondary); }

  /* ---- Dettaglio del giorno toccato ---- */
  .detail { margin: 12px 4px 0; font-size: .9rem; animation: gv-fade var(--gv-anim-duration) ease both; }
  .detail:empty { display: none; }
  .detail .d-title { font-weight: 600; margin-bottom: 6px; text-transform: capitalize; }
  .detail ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  .detail li { display: flex; align-items: center; gap: 8px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--gv-accent); flex: none; }
  .detail .none { color: var(--gv-text-secondary); }

  /* ---- Barra riepilogo "Prossimo" ---- */
  .summary-bar {
    margin-top: 14px; padding: 12px 16px; border-radius: var(--gv-radius);
    background: var(--gv-tile-bg); display: flex; align-items: center; gap: 12px;
    font-size: .95rem; animation: gv-fade var(--gv-anim-duration) ease both;
  }
  .summary-bar .icon { color: var(--gv-accent); --mdc-icon-size: 26px; font-size: 1.3rem; font-weight: 700; display: flex; }
  .summary-bar .txt { color: var(--gv-text-secondary); }
  .summary-bar strong { color: var(--gv-text); }

  .message { padding: 16px; color: var(--gv-text-secondary); font-size: .9rem; }

  /* ---- Animazioni ---- */
  @keyframes gv-pop   { from { opacity: 0; transform: scale(.88); } }
  @keyframes gv-fade  { from { opacity: 0; transform: translateY(-4px); } }
  @keyframes gv-glow  { 50% { transform: scale(1.06); box-shadow: 0 10px 32px color-mix(in srgb, var(--gv-accent) 70%, transparent); } }

  /* Accessibilità: chi preferisce meno movimento non vede animazioni */
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation: none !important; transition: none !important; }
  }
`;

/* ------------------------------------------------------------------ *
 * 3. Helper
 * ------------------------------------------------------------------ */

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
      days: Number(config.days) === 7 ? 7 : 14,
      show_summary: config.show_summary !== false,
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

  getCardSize() { return 4; }

  // HA chiama questo metodo per aprire l'editor visuale della card.
  static getConfigElement() {
    return document.createElement("garbage-view-card-editor");
  }

  static getStubConfig(hass) {
    const entity = hass && Object.keys(hass.states).find((e) => e.startsWith("sensor.garbage_view"));
    return { entity: entity || "sensor.garbage_view_schedule", style: "apple", days: 14, show_summary: true };
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

  _lang() {
    return (this._hass && (this._hass.locale?.language || this._hass.language)) || "it";
  }

  _t() {
    return STRINGS[this._lang().slice(0, 2)] || STRINGS.en;
  }

  // "gio 12/11" — sigla del giorno + giorno/mese.
  _shortDate(date) {
    const wd = date.toLocaleDateString(this._lang(), { weekday: "short" }).replace(".", "");
    return `${wd} ${date.getDate()}/${date.getMonth() + 1}`;
  }

  _longDate(date) {
    return date.toLocaleDateString(this._lang(), { weekday: "long", day: "numeric", month: "long" });
  }

  // "Oggi" / "Domani" / "N giorni"
  _relative(days, t) {
    return days === 0 ? t.today : days === 1 ? t.tomorrow : t.in_days(days);
  }

  // Mostra un messaggio (errore / stato vuoto) al posto del contenuto.
  _showMessage(text) {
    this._content.replaceChildren(el("div", "message", text));
  }

  // Icona del tipo: <ha-icon> se disponibile (in HA lo è sempre), altrimenti l'iniziale.
  _icon(type) {
    const wrap = el("div", "icon");
    wrap.setAttribute("aria-hidden", "true");
    if (ICON_RE.test(type.icon) && customElements.get("ha-icon")) {
      const icon = document.createElement("ha-icon");
      icon.setAttribute("icon", type.icon);
      wrap.append(icon);
    } else {
      wrap.textContent = String(type.name || "?").charAt(0).toUpperCase();
    }
    return wrap;
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

    // Quali tessere evidenziare: quelle di oggi; se non ce ne sono, quelle
    // con il prossimo ritiro (stessa distanza di next_item).
    const daysUntil = (x) => (x.next && Number.isInteger(x.next.days_until) ? x.next.days_until : null);
    const todays = types.filter((x) => daysUntil(x) === 0);
    const nextDist = a.next_item && Number.isInteger(a.next_item.days_until) ? a.next_item.days_until : null;
    const highlighted = new Set((todays.length ? todays : types.filter((x) => nextDist !== null && daysUntil(x) === nextDist)).map((x) => x.id));

    const frag = document.createDocumentFragment();

    if (this._config.title) {
      const header = el("div", "header");
      header.append(el("h2", "title", this._config.title));
      frag.append(header);
    }

    const grid = el("div", "types");
    grid.setAttribute("role", "list");
    types.forEach((type, i) => grid.append(this._buildTile(type, i, highlighted.has(type.id), t)));
    frag.append(grid);

    if (Array.isArray(a.days)) frag.append(this._buildStrip(a.days, byId, t));
    if (this._config.show_summary) frag.append(this._buildSummary(a.next_item, byId, t));

    this._content.replaceChildren(frag);
  }

  _buildTile(type, index, highlighted, t) {
    const dist = type.next && Number.isInteger(type.next.days_until) ? type.next.days_until : null;
    const nextDate = type.next ? parseDate(type.next.date) : null;
    const tile = el("div", "tile" + (dist === 0 ? " today" : highlighted ? " next" : ""));
    tile.setAttribute("role", "listitem");
    tile.style.setProperty("--i", String(index)); // ritardo animazione a cascata

    tile.append(this._icon(type), el("div", "name", String(type.name || "").slice(0, 40)));
    if (dist !== null && nextDate) {
      tile.append(el("div", "badge", this._relative(dist, t)));
      if (dist !== 0) tile.append(el("div", "when", this._shortDate(nextDate)));
    }

    // Etichetta per screen reader (il testo visibile è frammentato).
    const label = [type.name];
    if (dist !== null && nextDate) label.push(dist === 0 ? t.today : `${t.next_label}: ${this._relative(dist, t)}, ${this._longDate(nextDate)}`);
    tile.setAttribute("aria-label", label.join(", "));
    return tile;
  }

  _buildStrip(daysIn, byId, t) {
    // Il backend manda `horizon_days` giorni a partire da oggi; ne mostriamo 7 o 14.
    const days = daysIn.filter((d) => d && parseDate(d.date)).slice(0, this._config.days);
    if (!days.some((d) => d.date === this._selected)) this._selected = null;

    const section = el("div", "week");
    const strip = el("div", "strip");
    strip.style.gridTemplateColumns = `repeat(${days.length || 1}, minmax(0, 1fr))`;
    const detail = el("div", "detail");
    detail.setAttribute("aria-live", "polite");

    const buttons = [];
    days.forEach((d) => {
      const date = parseDate(d.date);
      const items = (Array.isArray(d.items) ? d.items : []).map((id) => byId.get(id)).filter(Boolean);
      const btn = el("button", "day" + (d.is_today ? " today" : "") + (items.length ? " has" : ""));
      btn.type = "button";
      btn.setAttribute("aria-pressed", String(d.date === this._selected));
      btn.setAttribute("aria-label", `${d.is_today ? t.today + ", " : ""}${this._longDate(date)}: ${items.length ? items.map((x) => x.name).join(", ") : t.nothing_day}`);

      const dow = el("span", "dow", date.toLocaleDateString(this._lang(), { weekday: "short" }).replace(".", ""));
      dow.setAttribute("aria-hidden", "true");
      const cell = el("span", "cell", String(date.getDate()));
      cell.setAttribute("aria-hidden", "true");

      btn.append(dow, cell);

      // Tocco: seleziona/deseleziona il giorno e mostra il dettaglio.
      btn.addEventListener("click", () => {
        this._selected = this._selected === d.date ? null : d.date;
        buttons.forEach(([b, day]) => b.setAttribute("aria-pressed", String(day === this._selected)));
        this._fillDetail(detail, days, byId, t);
      });
      buttons.push([btn, d.date]);
      strip.append(btn);
    });

    section.append(strip, detail);
    this._fillDetail(detail, days, byId, t);
    return section;
  }

  _fillDetail(container, days, byId, t) {
    container.replaceChildren();
    const d = days.find((x) => x.date === this._selected);
    if (!d) return;
    container.append(el("div", "d-title", this._longDate(parseDate(d.date))));
    const items = (Array.isArray(d.items) ? d.items : []).map((id) => byId.get(id)).filter(Boolean);
    if (!items.length) {
      container.append(el("div", "none", t.nothing_day));
      return;
    }
    const ul = el("ul");
    items.forEach((x) => {
      const li = el("li");
      li.append(el("span", "dot"), el("span", null, String(x.name).slice(0, 40)));
      ul.append(li);
    });
    container.append(ul);
  }

  // Barra "Prossimo: Plastica · sab 7/11 · oggi"
  _buildSummary(nextItem, byId, t) {
    const bar = el("div", "summary-bar");
    bar.setAttribute("role", "status");
    const type = nextItem && byId.get(nextItem.id);
    const date = nextItem && parseDate(nextItem.date);
    if (!type || !date || !Number.isInteger(nextItem.days_until)) {
      bar.append(el("span", "txt", t.nothing_next));
      return bar;
    }
    const txt = el("span", "txt");
    txt.append(`${t.next_label}: `, el("strong", null, String(type.name).slice(0, 40)),
      ` · ${this._shortDate(date)} · ${this._relative(nextItem.days_until, t).toLowerCase()}`);
    bar.append(this._icon(type), txt);
    return bar;
  }
}

/* ------------------------------------------------------------------ *
 * 5. Editor visuale
 *
 * HA lo crea con `getConfigElement()`, gli passa la config con `setConfig()`
 * e ascolta l'evento "config-changed" per salvare le modifiche.
 *
 * Usiamo solo controlli HTML nativi (input, select, checkbox): funzionano
 * ovunque e sono accessibili di serie. Il form viene costruito UNA volta sola;
 * dopo, aggiorniamo i valori senza ricreare i campi, altrimenti l'utente
 * perderebbe il cursore mentre scrive.
 * ------------------------------------------------------------------ */
const EDITOR_STRINGS = {
  it: {
    entity: "Entità",
    entity_hint: "Il sensore creato dall'integrazione (sensor.garbage_view_schedule).",
    title: "Titolo (facoltativo)",
    style: "Stile",
    apple: "Apple",
    homekit: "HomeKit",
    days: "Giorni mostrati nella striscia",
    days_7: "7 giorni",
    days_14: "14 giorni",
    show_summary: "Mostra la barra \"Prossimo\"",
    css: "Personalizzazione CSS (facoltativa)",
    css_hint: (ok, total) =>
      total === 0
        ? "Esempio: --gv-radius: 18px; --gv-accent: #34c759"
        : `${ok} di ${total} variabili valide. Sono ammesse solo variabili --gv-* con valori semplici.`,
    entity_missing: "Scegli un'entità.",
  },
  en: {
    entity: "Entity",
    entity_hint: "The sensor created by the integration (sensor.garbage_view_schedule).",
    title: "Title (optional)",
    style: "Style",
    apple: "Apple",
    homekit: "HomeKit",
    days: "Days shown in the strip",
    days_7: "7 days",
    days_14: "14 days",
    show_summary: "Show the \"Next\" bar",
    css: "CSS customization (optional)",
    css_hint: (ok, total) =>
      total === 0
        ? "Example: --gv-radius: 18px; --gv-accent: #34c759"
        : `${ok} of ${total} variables valid. Only --gv-* variables with simple values are allowed.`,
    entity_missing: "Choose an entity.",
  },
};

const EDITOR_STYLES = `
  :host { display: block; font-family: var(--paper-font-body1_-_font-family, sans-serif); }
  .form { display: grid; gap: 16px; }
  label.field { display: grid; gap: 6px; font-size: .85rem; color: var(--secondary-text-color, #6e6e73); }
  input[type="text"], select, textarea {
    font: inherit; font-size: 1rem; color: var(--primary-text-color, #1d1d1f);
    background: var(--card-background-color, #fff);
    border: 1px solid var(--divider-color, #c7c7cc); border-radius: 10px;
    padding: 10px 12px; min-height: 44px; box-sizing: border-box; width: 100%;
  }
  textarea { min-height: 88px; font-family: ui-monospace, monospace; font-size: .9rem; resize: vertical; }
  input:focus-visible, select:focus-visible, textarea:focus-visible {
    outline: 3px solid var(--primary-color, #0a84ff); outline-offset: 1px;
  }
  label.check { display: flex; align-items: center; gap: 10px; min-height: 44px; font-size: 1rem; color: var(--primary-text-color, #1d1d1f); }
  label.check input { width: 22px; height: 22px; accent-color: var(--primary-color, #0a84ff); }
  .hint { font-size: .78rem; color: var(--secondary-text-color, #6e6e73); }
  .hint.error { color: var(--error-color, #d70015); }
`;

class GarbageViewCardEditor extends HTMLElement {
  constructor() {
    super();
    this._root = this.attachShadow({ mode: "open" });
    this._config = {};
    this._built = false;
  }

  setConfig(config) {
    this._config = { ...config };
    if (this._built) this._sync();
    else this._build();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._built) this._fillEntities();
  }

  _t() {
    const lang = ((this._hass && (this._hass.locale?.language || this._hass.language)) || "it").slice(0, 2);
    return EDITOR_STRINGS[lang] || EDITOR_STRINGS.en;
  }

  // Crea un campo "etichetta + controllo" e lo aggiunge al form.
  _field(labelText, control) {
    const label = el("label", "field");
    label.append(el("span", null, labelText), control);
    this._form.append(label);
    return label;
  }

  _build() {
    const t = this._t();
    const style = document.createElement("style");
    style.textContent = EDITOR_STYLES;
    this._form = el("div", "form");

    // Entità: input di testo con suggerimenti (<datalist>), così si può anche scrivere a mano.
    this._entity = el("input");
    this._entity.type = "text";
    this._entity.setAttribute("list", "gv-entities");
    this._entity.setAttribute("autocomplete", "off");
    this._entity.setAttribute("spellcheck", "false");
    this._datalist = el("datalist");
    this._datalist.id = "gv-entities";
    this._entityHint = el("div", "hint", t.entity_hint);
    const entityLabel = this._field(t.entity, this._entity);
    entityLabel.append(this._datalist, this._entityHint);

    this._title = el("input");
    this._title.type = "text";
    this._title.maxLength = 80;
    this._field(t.title, this._title);

    this._styleSel = this._select([["apple", t.apple], ["homekit", t.homekit]]);
    this._field(t.style, this._styleSel);

    this._days = this._select([["14", t.days_14], ["7", t.days_7]]);
    this._field(t.days, this._days);

    this._showSummary = el("input");
    this._showSummary.type = "checkbox";
    const check = el("label", "check");
    check.append(this._showSummary, el("span", null, t.show_summary));
    this._form.append(check);

    this._css = el("textarea");
    this._css.maxLength = 2000;
    this._css.setAttribute("spellcheck", "false");
    this._cssHint = el("div", "hint");
    const cssLabel = this._field(t.css, this._css);
    cssLabel.append(this._cssHint);

    // Ogni modifica genera un nuovo config (vedi _emit).
    this._entity.addEventListener("input", () => this._emit());
    this._title.addEventListener("input", () => this._emit());
    this._styleSel.addEventListener("change", () => this._emit());
    this._days.addEventListener("change", () => this._emit());
    this._showSummary.addEventListener("change", () => this._emit());
    this._css.addEventListener("input", () => this._emit());

    this._root.replaceChildren(style, this._form);
    this._built = true;
    this._fillEntities();
    this._sync();
  }

  _select(options) {
    const sel = el("select");
    for (const [value, label] of options) {
      const opt = el("option", null, label);
      opt.value = value;
      sel.append(opt);
    }
    return sel;
  }

  // Suggerisce le entità: prima quelle di Garbage View, poi tutti i sensori.
  _fillEntities() {
    if (!this._hass || !this._hass.states) return;
    const ids = Object.keys(this._hass.states).filter((id) => id.startsWith("sensor."));
    const mine = ids.filter((id) => this._hass.states[id]?.attributes?.schema_version !== undefined);
    const list = mine.length ? mine : ids;
    this._datalist.replaceChildren(
      ...list.slice(0, 200).map((id) => {
        const opt = el("option");
        opt.value = id;
        return opt;
      })
    );
  }

  // Copia la config nei campi (usata all'apertura e se HA cambia la config da fuori).
  _sync() {
    const c = this._config;
    // Non toccare il campo che l'utente sta modificando in questo momento.
    const active = this._root.activeElement;
    if (active !== this._entity) this._entity.value = c.entity || "";
    if (active !== this._title) this._title.value = c.title || "";
    this._styleSel.value = c.style === "homekit" ? "homekit" : "apple";
    this._days.value = Number(c.days) === 7 ? "7" : "14";
    this._showSummary.checked = c.show_summary !== false;
    if (active !== this._css) this._css.value = c.css || "";
    this._updateHints();
  }

  _updateHints() {
    const t = this._t();
    const raw = this._css.value;
    const total = raw.split(";").filter((d) => d.includes(":")).length;
    const ok = parseSafeCss(raw).length;
    this._cssHint.textContent = t.css_hint(ok, total);
    this._cssHint.classList.toggle("error", total > ok);
    const missing = !this._entity.value.trim();
    this._entityHint.textContent = missing ? t.entity_missing : t.entity_hint;
    this._entityHint.classList.toggle("error", missing);
    this._entity.setAttribute("aria-invalid", String(missing));
  }

  // Costruisce la nuova config (senza campi vuoti) e avvisa HA.
  _emit() {
    const config = { ...this._config, type: this._config.type || "custom:garbage-view-card" };
    const set = (key, value, keep) => (keep ? (config[key] = value) : delete config[key]);
    set("entity", this._entity.value.trim(), true);
    set("title", this._title.value, this._title.value.trim() !== "");
    set("style", this._styleSel.value, true);
    set("days", 7, this._days.value === "7"); // 14 è il default
    set("show_summary", false, !this._showSummary.checked); // true è il default
    set("css", this._css.value, this._css.value.trim() !== "");
    this._config = config;
    this._updateHints();
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
  }
}

if (!customElements.get("garbage-view-card-editor")) {
  customElements.define("garbage-view-card-editor", GarbageViewCardEditor);
}

if (!customElements.get("garbage-view-card")) {
  customElements.define("garbage-view-card", GarbageViewCard);
}
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "garbage-view-card")) {
  window.customCards.push({
    type: "garbage-view-card",
    name: "Garbage View",
    description: "Cosa buttare oggi e nei prossimi giorni (stile Apple / HomeKit)",
    preview: true,
  });
}
console.info(`%c GARBAGE-VIEW-CARD %c ${CARD_VERSION} `, "background:#0a84ff;color:#fff", "");
