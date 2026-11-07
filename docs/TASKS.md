# Task paralleli

Dipendenza comune: `docs/CONTRACT.md` (già fissato). Modello consigliato per i thread: Sonnet.

| # | Task | Dipende da | File principali |
|---|---|---|---|
| T1 | Logica di ricorrenza pura + test pytest | contratto | `recurrence.py`, `tests/test_recurrence.py` |
| T2 | Config flow + options flow (CRUD tipi), validazione, traduzioni it/en | contratto (schema opzioni) | `config_flow.py`, `const.py`, `translations/` |
| T3 | Coordinator + sensor + calendar (usa `recurrence.py`) | T1 (interfaccia in `recurrence.py` stub) | `coordinator.py`, `sensor.py`, `calendar.py`, `__init__.py` |
| T4 | Card Lovelace: rendering, stili apple/homekit, animazioni, a11y, sanificazione css | fixture JSON | `frontend/garbage-view-card.js` |
| T5 | Editor visuale della card + test vitest/Playwright + screenshot | T4 | `frontend/`, `tests/card/` |
| T6 | CI (pytest, hassfest, HACS action), README it/en, release | T1–T4 | `.github/workflows/`, `README.md` |

Parallelizzabili subito: **T1, T2, T4** (T3 parte appena T1 espone `occurs_on`/`build_view`, già stub-pati nello scaffold). Poi T3, T5, quindi T6.
