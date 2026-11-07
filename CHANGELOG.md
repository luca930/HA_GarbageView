# Changelog

Formato basato su [Keep a Changelog](https://keepachangelog.com/it/1.1.0/). / Format based on Keep a Changelog.

## [0.2.2] - 2026-11-07

### Novità / Added
- **Orario di ritiro per tipo**: ogni tipo ha «Ritiro: al mattino / alla sera» (default mattina, nell'options flow, it/en). / Per-type pickup time (morning/evening).
- **La card si accende al momento giusto**: ritiro del mattino → acceso dalla sera prima (da `put_out_from`, default 18:00) fino a mezzogiorno del ritiro; ritiro serale → acceso tutto il giorno del ritiro; altrimenti tenue. Vale per le tessere e per la barra «Prossimo». Mattina/sera compaiono nella riga della data e nella barra. / Tiles and the «Next» bar light up only when it is time to put the bin out.
- **Promemoria che seguono il ritiro**: mattina → la sera prima (`evening_time`, default 20:00, elenco di domani); sera → il giorno stesso (`time`, default 07:30, elenco di oggi). Nuovo campo «Evidenzia dalle» (`put_out_from`). Il sensore si aggiorna anche alle 12:00 e all'ora `put_out_from`.
- Sensore (additivo, `schema_version` resta 1): `types[].pickup`, `types[].due_now`, `due_items`, `put_out_from`, `next_item.pickup`.
- Opzione `tile_min_width` (px, 60–240; vuoto = automatica, come prima: 76 Apple / 88 HomeKit), anche nell'editor visuale, e variabile CSS `--gv-tile-min-width`. / New `tile_min_width` option (also in the visual editor) and `--gv-tile-min-width` CSS variable.
- Test vitest e Playwright con 1–8 tessere a larghezze strette e larghe; nuovi screenshot. / Tests for 1–8 tiles at narrow/wide widths; new screenshots.

### Cambiato / Changed
- Rimosso l'interruttore `evening_before`: il promemoria serale è sempre attivo per i tipi del mattino (con «non inviare se non c'è nulla» non disturba se non serve). Il vecchio valore salvato viene ignorato e scartato al prossimo salvataggio.
- Nessun doppio invio dopo un riavvio (stessa dedup per `today`/`tomorrow`).
- La barra «Prossimo» mostra il ritiro da mettere fuori ora (il più vicino tra quelli accesi), non un ritiro mattutino già passato (es. domenica sera non indica più la carta di stamattina mentre si accende l'umido di domani).
- **Le tessere riempiono tutta la larghezza della card**: si allargano in modo uniforme con una larghezza minima e, se non ci stanno, vanno a capo con **righe bilanciate** (5 tessere → 3 + 2 invece di 4 + 1; 7 → 3 + 2 + 2). Ogni riga arriva fino ai bordi, quindi non resta più spazio vuoto accanto a una tessera sola. Stile Apple/HomeKit, animazioni, tema chiaro/scuro e calendario espandibile non cambiano. / Tiles stretch evenly to fill the card width (with a minimum) and wrap into balanced rows; every row spans the full width, so a lone tile no longer leaves empty space.

### Compatibilità / Compatibility
- I tipi salvati senza `pickup` valgono «mattina»; con un backend più vecchio la card mantiene il vecchio comportamento (evidenzia i ritiri di oggi/prossimo).
- **Da rivedere dopo l'aggiornamento**: chi riceveva il promemoria del mattino per i rifiuti di oggi ora riceve, per quei tipi (default «mattina»), l'avviso la sera prima; per riavere l'avviso al mattino imposta il tipo su «alla sera».

## [0.2.1] - 2026-11-07

### Cambiato / Changed
- **Il calendario si espande dalla card compatta**, sul posto: niente più vista separata. Sotto la striscia dei giorni c'è solo un piccolo chevron discreto (`aria-label`, `aria-expanded`, tastiera); la card compatta resta com'era: la striscia si chiude e il calendario si apre con un'animazione di altezza; ricliccando si torna alla vista compatta. Tessere, titolo e barra «Prossimo» restano sempre visibili. Con `prefers-reduced-motion` il passaggio è istantaneo. Il calendario viene costruito solo alla prima apertura.
- Nuova opzione `start_expanded` (calendario già aperto). La vecchia `view: calendar` continua a funzionare come `start_expanded: true`; l'editor visuale ora scrive `start_expanded`. `show_view_toggle: false` nasconde il pulsante.
- **Default di `days` ora 7** (la settimana corrente; prima 14), sempre impostabile a 7 o 14 anche dall'editor. Chi aveva `days` esplicito nella config non cambia; chi non lo aveva vedrà 7 giorni: per riavere i 14 basta `days: 14`.
- Test vitest/Playwright e screenshot aggiornati.

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
