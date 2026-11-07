# Piano: HA Garbage View

Integrazione personalizzata Home Assistant, installabile da HACS, che mostra cosa buttare **oggi** e **nella settimana**, con card Lovelace in stile Apple / HomeKit.

## 1. Architettura

Un solo repo HACS (categoria *integration*). L'integrazione serve anche la card: all'avvio registra il percorso statico `/garbage_view/garbage-view-card.js` e lo aggiunge come risorsa frontend, quindi **l'utente installa una sola cosa**.

```
custom_components/garbage_view/
  manifest.json, const.py, __init__.py
  config_flow.py     # config flow + options flow (CRUD tipi di rifiuto)
  recurrence.py      # logica pura di ricorrenza, senza dipendenze da HA
  coordinator.py     # DataUpdateCoordinator: ricalcola a mezzanotte e a ogni modifica opzioni
  sensor.py          # sensor.garbage_view_schedule (contratto in CONTRACT.md)
  calendar.py        # entità calendario (eventi giornalieri per tipo)
  frontend/garbage-view-card.js   # card Lit/vanilla, nessun build step obbligatorio
  translations/it.json, en.json
tests/               # pytest (ricorrenza, config flow, sensor) + test card
```

### Ricorrenze supportate (`rule.type`)
| type | significato |
|---|---|
| `weekly` | ogni settimana nei giorni `weekdays` |
| `every_n_weeks` | ogni `interval` settimane nei giorni `weekdays`, ancorato ad `anchor_date` |
| `monthly_nth_weekday` | l'`nth` (1..4, oppure -1 = ultimo) `weekday` del mese |
| `monthly_day` | giorno `day` del mese (se mancante, ultimo giorno del mese) |

La logica sta in funzioni pure (`occurs_on(rule, date)`, `week_view(types, today)`): facile da testare e veloce (O(tipi × 7) per aggiornamento).

### Config / options flow
Voce unica. Menu opzioni: *Aggiungi tipo*, *Modifica*, *Rimuovi*. Per ogni tipo: nome, icona (mdi), colore, tipo ricorrenza e relativi campi. Validazione con `voluptuous` + messaggi tradotti.

### Entità
- `sensor.garbage_view_schedule`: stato = numero di elementi da buttare oggi; attributi = contratto JSON (vedi `docs/CONTRACT.md`).
- `calendar.garbage_view`: eventi giornalieri (utile per automazioni e notifiche).

### Card Lovelace `custom:garbage-view-card`
- Riga di quadrati, uno per tipo di rifiuto (icona + nome); quelli in scadenza oggi sono evidenziati (anche più insieme).
- Sotto, riga di 7 quadrati per i giorni della settimana: giorno corrente evidenziato, puntini colorati per i rifiuti di quel giorno.
- Tocco su un giorno mostra il dettaglio. Animazioni leggere (scale/spring), rispetto di `prefers-reduced-motion`.
- Config: `entity`, `style: apple | homekit`, `title`, `week_start: monday|sunday`, `show_week`, `css` opzionale.
- Editor visuale (`getConfigElement`) e `getStubConfig`.

### Stili
Due preset (`apple`, `homekit`) definiti come **CSS custom properties** (`--gv-radius`, `--gv-bg`, `--gv-tile-bg`, `--gv-accent`, `--gv-text`, `--gv-gap`, `--gv-shadow`, `--gv-font` …) su shadow DOM, con dark mode automatica. Personalizzazione: tramite `card-mod` o tramite l'opzione `css` della card (sanificata: solo proprietà `--gv-*`). Riferimento estetico: Apple HIG (https://github.com/dickwu/apple-design-skill): gerarchia chiara, spazi generosi, angoli arrotondati continui, target ≥ 44 px, contrasto AA.

### Struttura HACS
`hacs.json` alla radice, `custom_components/garbage_view/manifest.json` (domain, name, version, `config_flow: true`, `iot_class: calculated`, `documentation`, `issue_tracker`, `codeowners`), traduzioni `it`/`en`, release GitHub con tag semver, workflow `hacs/action` + `hassfest`.

## 2. Sicurezza
- Nessuna chiamata di rete, nessuna credenziale: tutto locale (`iot_class: calculated`).
- Input validati lato server (tipi, range, lunghezze massime, regex colore `#RRGGBB`, icona `mdi:`).
- Card: niente `innerHTML` con dati utente (solo `textContent`/template Lit con escape); l'opzione `css` accetta solo `--gv-*` con valori filtrati.
- File statico servito in sola lettura con `StaticPathConfig`; nessun endpoint scrivibile.
- Dipendenze minime e con versione fissata; niente script remoti/CDN.

## 3. Performance
Aggiornamento solo a mezzanotte e al cambio opzioni (non polling). Attributi compatti. Card: render solo quando cambia lo stato dell'entità, CSS puro per le animazioni.

## 4. Test
- **pytest**: ricorrenza (settimanale, ogni N settimane con ancora, nth weekday incluso "ultimo", giorno 31 in mesi corti, anno bisestile, cambio ora legale), `week_view`, validazione schema, config/options flow (`pytest-homeassistant-custom-component`), sensor/calendar.
- **Card**: test con `vitest` + `happy-dom` su rendering, evidenziazione di oggi, più rifiuti nello stesso giorno, sanificazione `css`; screenshot Playwright per i 2 preset (chiaro/scuro).
- **CI**: GitHub Actions (pytest, hassfest, HACS validation, test card).

## 5. Task paralleli
Vedi `docs/TASKS.md`. Il contratto in `docs/CONTRACT.md` e la fixture `tests/fixtures/schedule_example.json` permettono di lavorare su backend e card in modo indipendente.
