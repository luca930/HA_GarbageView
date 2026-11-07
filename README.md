# HA Garbage View

[🇮🇹 Italiano](#italiano) · [🇬🇧 English](#english)

![Card in stile Apple, tema chiaro](docs/screenshots/apple-chiaro.png)

---

## Italiano

Integrazione per Home Assistant, installabile da HACS, che mostra **cosa buttare oggi e nei prossimi giorni** con una card Lovelace in stile Apple / HomeKit. Tutto gira in locale: nessuna rete, nessun account.

### Funzioni
- Tessere per ogni tipo di rifiuto, con badge «Oggi / Domani / N giorni» e data.
- Striscia di 7 o 14 giorni e barra riepilogo «Prossimo».
- Ricorrenze: settimanale, ogni N settimane, n-esimo giorno del mese (anche «ultimo»), giorno del mese.
- Tipi gestiti dall'interfaccia (nome, icona, colore, regola), senza YAML.
- Sensore `sensor.garbage_view_schedule` ed entità `calendar.garbage_view` per le automazioni.
- Due stili (`apple`, `homekit`), tema scuro automatico, animazioni leggere che rispettano `prefers-reduced-motion`.

### Installazione con HACS
1. HACS → ⋮ → **Repository personalizzati** → incolla `https://github.com/luca930/HA_GarbageView`, categoria **Integrazione**.
2. Cerca **HA Garbage View**, scarica, riavvia Home Assistant.
3. **Impostazioni → Dispositivi e servizi → Aggiungi integrazione → HA Garbage View**.

La card viene registrata automaticamente: non serve aggiungere risorse a mano.

### Configurazione
Dalla scheda dell'integrazione → **Configura** puoi aggiungere, modificare e rimuovere i tipi di rifiuto (nome, icona `mdi:`, colore `#RRGGBB`, ricorrenza).

Poi aggiungi la card (anche dall'editor visuale):

```yaml
type: custom:garbage-view-card
entity: sensor.garbage_view_schedule   # obbligatorio
title: Raccolta differenziata          # opzionale
style: apple                           # apple | homekit
days: 14                               # 7 | 14
show_summary: true                     # barra «Prossimo»
css: "--gv-radius: 18px; --gv-accent: #34c759"   # opzionale
```

### Personalizzare lo stile
Lo stile è fatto di variabili CSS pubbliche:

| Variabile | Cosa controlla |
|---|---|
| `--gv-font` | font |
| `--gv-bg` / `--gv-text` / `--gv-text-secondary` | sfondo e testi |
| `--gv-tile-bg` / `--gv-tile-size` | tessere |
| `--gv-radius` / `--gv-gap` / `--gv-shadow` | forme e spazi |
| `--gv-accent` | colore di evidenziazione |
| `--gv-anim-duration` | durata animazioni |

Due modi per cambiarle:

1. **Opzione `css` della card**: accetta solo proprietà `--gv-*` (il resto viene ignorato per sicurezza).
   ```yaml
   css: "--gv-radius: 12px; --gv-gap: 6px; --gv-accent: #ff9f0a"
   ```
2. **[card-mod](https://github.com/thomasloven/lovelace-card-mod)**, per chi lo usa già:
   ```yaml
   type: custom:garbage-view-card
   entity: sensor.garbage_view_schedule
   card_mod:
     style: |
       :host {
         --gv-bg: #1c1c1e;
         --gv-text: #fff;
         --gv-radius: 22px;
       }
   ```

### Sviluppo e test
```bash
pip install -r requirements_test.txt && pytest      # backend
npm ci && npm test && npm run test:e2e              # card (vitest + Playwright)
```
La CI esegue pytest, test della card, validazione HACS e hassfest. Per rilasciare: aggiorna `version` in `manifest.json`, poi `git tag vX.Y.Z && git push --tags` (il workflow crea la release con lo zip).

---

## English

A HACS-installable Home Assistant integration that shows **what to put out today and in the coming days**, with an Apple / HomeKit-style Lovelace card. Everything runs locally: no network, no account.

### Features
- One tile per waste type with a "Today / Tomorrow / N days" badge and date.
- 7- or 14-day strip and a "Next" summary bar.
- Recurrences: weekly, every N weeks, nth weekday of the month (including "last"), day of month.
- Waste types managed from the UI (name, icon, color, rule), no YAML needed.
- `sensor.garbage_view_schedule` and `calendar.garbage_view` entities for automations.
- Two styles (`apple`, `homekit`), automatic dark mode, light animations honoring `prefers-reduced-motion`.

### Install with HACS
1. HACS → ⋮ → **Custom repositories** → paste `https://github.com/luca930/HA_GarbageView`, category **Integration**.
2. Search for **HA Garbage View**, download, restart Home Assistant.
3. **Settings → Devices & services → Add integration → HA Garbage View**.

The card is registered automatically: no manual resource needed.

### Configuration
From the integration page → **Configure** you can add, edit and remove waste types (name, `mdi:` icon, `#RRGGBB` color, recurrence).

Then add the card (the visual editor works too):

```yaml
type: custom:garbage-view-card
entity: sensor.garbage_view_schedule   # required
title: Recycling                       # optional
style: apple                           # apple | homekit
days: 14                               # 7 | 14
show_summary: true                     # "Next" bar
css: "--gv-radius: 18px; --gv-accent: #34c759"   # optional
```

### Customizing the style
Styling is driven by public CSS variables (`--gv-font`, `--gv-bg`, `--gv-text`, `--gv-text-secondary`, `--gv-tile-bg`, `--gv-tile-size`, `--gv-radius`, `--gv-gap`, `--gv-accent`, `--gv-shadow`, `--gv-anim-duration`).

1. **The card's `css` option**: only `--gv-*` properties are accepted, anything else is ignored for safety.
2. **[card-mod](https://github.com/thomasloven/lovelace-card-mod)**: set the same variables under `card_mod.style` on `:host` (see the example above).

### Development and tests
```bash
pip install -r requirements_test.txt && pytest      # backend
npm ci && npm test && npm run test:e2e              # card (vitest + Playwright)
```
CI runs pytest, card tests, HACS validation and hassfest. To release: bump `version` in `manifest.json`, then `git tag vX.Y.Z && git push --tags` (the workflow publishes the release with the zip).

### Screenshots

| Apple · light | Apple · dark |
|---|---|
| ![](docs/screenshots/apple-chiaro.png) | ![](docs/screenshots/apple-scuro.png) |
| **HomeKit · light** | **HomeKit · dark** |
| ![](docs/screenshots/homekit-chiaro.png) | ![](docs/screenshots/homekit-scuro.png) |

![Visual editor](docs/screenshots/editor.png)
