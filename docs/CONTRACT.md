# Contratto dati condiviso (schema_version 1)

Tutti i task rispettano questo contratto. Modifiche solo con aumento di `schema_version`.

## 1. Opzioni salvate (config entry `options["types"]`)
```json
{
  "types": [
    {
      "id": "umido",                 // slug [a-z0-9_]{1,32}, univoco
      "name": "Umido",               // 1..40 caratteri
      "icon": "mdi:food-apple",      // ^mdi:[a-z0-9-]+$
      "rule": { "type": "weekly", "weekdays": [1, 4] },
      "pickup": "morning"            // "morning" (default se assente) | "evening"
    }
  ]
}
```
`pickup`: quando passano a ritirare. `morning` → la card si accende e il promemoria parte la sera prima; `evening` → il giorno stesso (vedi §2 `due_now` e §3 notifiche).

`weekday`: 0 = lunedì … 6 = domenica (come `date.weekday()`).

Regole (`rule`):
| type | campi |
|---|---|
| `weekly` | `weekdays`: lista di 1..7 giorni, valori 0..6 |
| `every_n_weeks` | `weekdays`: lista di 1..7 giorni, valori 0..6, `interval: 2..8`, `anchor_date: "YYYY-MM-DD"` (qualsiasi data della settimana "attiva") |
| `monthly_nth_weekday` | `weekday: 0..6`, `nth: 1..4 \| -1` (-1 = ultimo) |
| `monthly_day` | `day: 1..31` (se il mese è più corto, ultimo giorno del mese) |

## 2. Entità `sensor.garbage_view_schedule`
- `state`: numero (int) di tipi da buttare oggi.
- `attributes` (esempio completo in `tests/fixtures/schedule_example.json`):
```json
{
  "schema_version": 1,
  "today": "2026-11-07",
  "weekday": 5,
  "horizon_days": 14,
  "types": [
    { "id": "umido", "name": "Umido", "icon": "mdi:food-apple",
      "rule": { "type": "weekly", "weekdays": [1, 4] },
      "next": { "date": "2026-11-10", "days_until": 3 } }
  ],
  "today_items": ["plastica"],
  "due_items": ["plastica"],
  "put_out_from": "18:00",
  "days": [
    { "date": "2026-11-07", "weekday": 5, "is_today": true, "items": ["plastica"] }
  ],
  "next_item": { "id": "plastica", "date": "2026-11-07", "days_until": 0, "pickup": "evening" }
}
```
- `types[].pickup` (additivo): `morning` | `evening` (assente nei dati vecchi = `morning`). `types[].due_now` (bool): è il momento di mettere fuori questo tipo. `due_items`: gli id con `due_now`. `put_out_from` ("HH:MM", default "18:00", da `options.notifications.put_out_from`): ora da cui si accendono i ritiri del giorno dopo.
- Regola di `due_now` (ora locale): `evening` → vero tutto il giorno del ritiro; `morning` → vero dalla sera prima da `put_out_from` e fino alle 12:00 del giorno del ritiro. Il sensore si ricalcola a mezzanotte, alle 12:00, a `put_out_from` e al cambio opzioni.
- La card, se i tipi hanno `due_now`, accende (classe `.today`) solo quelle tessere e colora la barra «Prossimo» (`.due` / `.muted` secondo il tipo di `next_item`); senza `due_now` (backend < 0.2.2) evidenzia come prima i ritiri di oggi o il prossimo.
- `days`: **finestra mobile di `horizon_days` (default 14) giorni che parte da oggi** (il primo elemento è sempre oggi). La card in modalità settimana ne mostra i primi 7.
- `types[].rule` (aggiunto, retrocompatibile: `schema_version` resta 1): la regola di ricorrenza del §1, copiata così com'è. Serve al **calendario grande** della card, che calcola nel browser (stesso algoritmo di `recurrence.py`, verificato da `tests/fixtures/occurrences.json`) i giorni di qualsiasi settimana o mese, anche passati, senza che il sensore debba esportare decine di giorni (attributi piccoli, niente limite di 16 KB del recorder). Se manca (backend più vecchio) la card ripiega sui soli `days`.
- `items` / `today_items`: id presenti in `types`, nell'ordine di `types`.
- `types[].next`: prossima occorrenza (oggi incluso) con `days_until`, oppure `null` se non calcolabile entro 400 giorni. L'ordine/etichette "Oggi", "Domani", "N giorni" sono resi dalla card (i18n it/en), non dal backend.
- `next_item`: il tipo con `days_until` minore (a parità, primo in `types`), oppure `null` se nessun tipo ha occorrenze.
- Si aggiorna a mezzanotte locale e al cambio opzioni.

## 3. Card `custom:garbage-view-card`
Layout (riferimento: esempio di Luca, `docs/reference/example.jpeg`): 
1. riga di tessere, una per tipo: icona, nome, badge con "Oggi" / "Domani" / "N giorni" e data breve (es. "gio 12/11"); la tessera col prossimo ritiro (o quelle di oggi) è evidenziata con bordo/alone, più tessere possono essere evidenziate insieme;
2. sotto, striscia di giorni (`days`): sigla del giorno sopra, numero sotto; oggi con contorno, i giorni con ritiro riempiti con l'unico colore d'accento (`--gv-accent`); i tipi non hanno un colore proprio;
3. in fondo una barra riepilogo "Prossimo: **Plastica** · sab 7/11 · oggi" da `next_item`.
```yaml
type: custom:garbage-view-card
entity: sensor.garbage_view_schedule   # obbligatorio
title: Raccolta differenziata           # opzionale
style: apple                            # apple | homekit
days: 14                                # 7 | 14 (quanti giorni mostrare nella striscia)
view: compact                           # compact | calendar (vista iniziale)
calendar_mode: week                     # week | next_week | month (periodo iniziale del calendario)
show_view_toggle: true                  # interruttore Compatta / Calendario nell'intestazione
show_summary: true                      # barra "Prossimo"
css: "--gv-radius: 18px; --gv-accent: #34c759"   # solo --gv-*
```
Vista **calendario**: sostituisce tessere e striscia con una griglia di 7 colonne (lunedì→domenica). Periodi: settimana corrente, prossima settimana, mese; le frecce ‹ › spostano di una settimana o di un mese (anche indietro). Ogni giorno mostra le icone dei tipi raccolti (max 4 in settimana, 3 nel mese, poi «+N»), sempre con l'unico colore d'accento; oggi è evidenziato e animato, passati e giorni fuori mese sono attenuati. Toccando un giorno compare l'elenco con i nomi; sotto la griglia c'è una legenda icona→nome. Lo stato (vista, periodo) vive solo nella card, non è salvato.

Variabili CSS pubbliche: `--gv-font`, `--gv-bg`, `--gv-text`, `--gv-text-secondary`, `--gv-tile-bg`, `--gv-tile-size`, `--gv-radius`, `--gv-gap`, `--gv-accent`, `--gv-shadow`, `--gv-anim-duration`.
Risorsa servita da `/garbage_view/garbage-view-card.js`. Dark mode automatica.

## 4. Servizio / calendario
`calendar.garbage_view`: un evento "tutto il giorno" per ogni tipo e data, `summary` = `name`, `uid` = `<id>-<date>`.

Fixture di riferimento: `tests/fixtures/schedule_example.json`.

## 3. Opzioni notifiche (`options["notifications"]`)
```json
{ "enabled": false, "targets": ["mobile_app_pixel"], "time": "07:30:00",
  "evening_time": "20:00:00", "put_out_from": "18:00:00", "skip_if_empty": true,
  "title_template": "", "message_template": "" }
```
Il promemoria segue `types[].pickup`: `evening_time` → kind `tomorrow` con i tipi `morning` di domani (sera prima); `time` → kind `today` con i tipi `evening` di oggi. Entrambi sempre programmati (con `skip_if_empty` non inviano se vuoti). `evening_before` (≤ 0.2.1) è ignorato. `put_out_from` non riguarda le notifiche ma la card (§2).
`targets`: servizi `notify.mobile_app_*` (max 10). Template: max 200 caratteri, solo `{items}`, `{count}`, `{when}`, `{date}`.
Testi predefiniti in `notification_texts/<lingua>.json`. L'ultimo giorno di invio per tipo (`today`/`tomorrow`) è in `.storage/garbage_view.<entry_id>.notified`.
