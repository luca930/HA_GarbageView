# Changelog

Formato basato su [Keep a Changelog](https://keepachangelog.com/it/1.1.0/). / Format based on Keep a Changelog.

## [Unreleased]

### Novità / Added
- **Preset per i tipi di rifiuto**: aggiungendo un tipo si sceglie tra Umido, Plastica, Carta, Vetro, Indifferenziato, Sfalci e verde, Lattine e metalli e altri, oppure «Personalizzato…». Nome (italiano/inglese secondo la lingua di HA) e icona vengono precompilati e restano modificabili. / Ready-made presets (name + suggested icon, it/en) when adding a waste type, plus «Custom…».
- **Icona**: selettore icone di Home Assistant con ricerca e anteprima; resta possibile scrivere qualsiasi icona `mdi:` se non è in elenco (validata con `^mdi:[a-z0-9-]+$`). / Icon picker with search and preview; any typed `mdi:` icon is still accepted.

### Compatibilità / Compatibility
- I tipi già salvati non cambiano (stesso formato dati).

## [0.2.0] - 2026-11-07

### Novità / Added
- **Notifiche sul telefono**: notifica push all'app mobile di Home Assistant (`notify.mobile_app_*`, anche più dispositivi) con ciò che c'è da portare fuori, all'orario scelto e, opzionale, la sera prima. Opzione «non inviare se non c'è nulla». Testi nella lingua di HA (italiano e inglese, ripiego su inglese) e personalizzabili con `{items}`, `{count}`, `{when}`, `{date}`. Nuovo menu **Notifiche sul telefono** nelle opzioni e servizio `garbage_view.send_test_notification`.
- **Calendario grande nella card**: vista settimana, prossima settimana e mese con frecce ‹ › (anche mesi passati), icone dei rifiuti per giorno, oggi evidenziato, elenco dei nomi al tocco, legenda. Interruttore Compatta / Calendario e nuove opzioni `view`, `calendar_mode`, `show_view_toggle` (anche nell'editor visuale).
- Il sensore espone `types[].rule` (additivo: `schema_version` resta 1); le ricorrenze del calendario sono calcolate nella card.

### Robustezza / Security
- Notifiche: nessun polling, nessun doppio invio dopo un riavvio (recupero di un invio mancato solo entro 60 minuti), target validati (`mobile_app_*`), template con soli segnaposto noti (niente accesso ad attributi), lunghezza massima 200 caratteri, lingua sanificata.
- Un target non disponibile viene saltato senza bloccare gli altri.

### Test
- Test di parità Python↔JS delle ricorrenze (`tests/fixtures/occurrences.json`).
- Verificato in Home Assistant 2026.2.3 reale: options flow, servizio di prova, invio programmato, riavvio senza duplicati, card in vista compatta e calendario (chiaro/scuro).

## [0.1.0]
- Prima versione: sensore e calendario con ricorrenze configurabili dall'interfaccia, card Lovelace (stili apple/homekit), editor visuale.
