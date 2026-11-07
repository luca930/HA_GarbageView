// Scaffold (task T4): implementare la card secondo docs/CONTRACT.md §3.
class GarbageViewCard extends HTMLElement {
  setConfig(config) {
    if (!config.entity) throw new Error("entity è obbligatorio");
    this._config = config;
  }
  set hass(hass) { this._hass = hass; }
  getCardSize() { return 3; }
}
customElements.define("garbage-view-card", GarbageViewCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: "garbage-view-card", name: "Garbage View", description: "Cosa buttare oggi e nella settimana" });
