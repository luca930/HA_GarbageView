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
      "color": "#8E5A2B",            // ^#[0-9A-Fa-f]{6}$
      "rule": { "type": "weekly", "weekdays": [1, 4] }
    }
  ]
}
```
`weekday`: 0 = lunedì … 6 = domenica (come `date.weekday()`).

Regole (`rule`):
| type | campi |
|---|---|
| `weekly` | `weekdays: int[1..7]` |
| `every_n_weeks` | `weekdays: int[1..7]`, `interval: 2..8`, `anchor_date: "YYYY-MM-DD"` (qualsiasi data della settimana "attiva") |
| `monthly_nth_weekday` | `weekday: 0..6`, `nth: 1..4 \| -1` (-1 = ultimo) |
| `monthly_day` | `day: 1..31` (se il mese è più corto, ultimo giorno del mese) |

## 2. Entità `sensor.garbage_view_schedule`
- `state`: numero (int) di tipi da buttare oggi.
- `attributes`:
```json
{
  "schema_version": 1,
  "today": "2026-11-07",
  "weekday": 5,
  "week_start": "2026-11-02",
  "types": [{ "id": "umido", "name": "Umido", "icon": "mdi:food-apple", "color": "#8E5A2B" }],
  "today_items": ["umido"],
  "days": [
    { "date": "2026-11-02", "weekday": 0, "is_today": false, "items": [] }
  ],
  "next": { "umido": "2026-11-10" }
}
```
- `days`: sempre 7 elementi, lunedì → domenica (la card ruota in base a `week_start` se serve domenica).
- `items` / `today_items` contengono id presenti in `types`, nell'ordine di `types`.
- `next[id]`: prossima data (oggi incluso) o `null` se non calcolabile entro 400 giorni.
- Il sensore si aggiorna a mezzanotte locale e al cambio opzioni.

## 3. Card `custom:garbage-view-card`
```yaml
type: custom:garbage-view-card
entity: sensor.garbage_view_schedule   # obbligatorio
title: Raccolta differenziata           # opzionale
style: apple                            # apple | homekit
week_start: monday                      # monday | sunday
show_week: true
css: "--gv-radius: 18px; --gv-accent: #34c759"   # solo --gv-*
```
Variabili CSS pubbliche: `--gv-font`, `--gv-bg`, `--gv-text`, `--gv-text-secondary`, `--gv-tile-bg`, `--gv-tile-size`, `--gv-radius`, `--gv-gap`, `--gv-accent`, `--gv-shadow`, `--gv-anim-duration`.
Risorsa servita da `/garbage_view/garbage-view-card.js`.

## 4. Servizio / calendario
`calendar.garbage_view`: un evento "tutto il giorno" per ogni tipo e data, `summary` = `name`, `uid` = `<id>-<date>`.

Fixture di riferimento: `tests/fixtures/schedule_example.json`.
