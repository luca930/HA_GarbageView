# Changelog

Formato basato su [Keep a Changelog](https://keepachangelog.com/it/1.1.0/). / Format based on Keep a Changelog.

## [0.2.1] - 2026-11-07

### Cambiato / Changed
- **Il calendario si espande dalla card compatta**, sul posto: niente più vista separata. Sotto la striscia dei giorni c'è il pulsante «Mostra calendario» (chevron, `aria-expanded`, tastiera): la striscia si chiude e il calendario si apre con un'animazione di altezza; ricliccando si torna alla vista compatta. Tessere, titolo e barra «Prossimo» restano sempre visibili. Con `prefers-reduced-motion` il passaggio è istantaneo. Il calendario viene costruito solo alla prima apertura.
- Nuova opzione `start_expanded` (calendario già aperto). La vecchia `view: calendar` continua a funzionare come `start_expanded: true`; l'editor visuale ora scrive `start_expanded`. `show_view_toggle: false` nasconde il pulsante.
- Test vitest/Playwright e screenshot aggiornati.

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
