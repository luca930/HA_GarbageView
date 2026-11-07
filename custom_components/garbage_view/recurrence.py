"""Logica di ricorrenza pura (task T1). Nessuna dipendenza da Home Assistant.

Il modulo non importa nulla dal pacchetto, così può essere testato
(e usato) senza Home Assistant installato.
"""
from __future__ import annotations

import calendar
from datetime import date, timedelta
from typing import Any

SCHEMA_VERSION = 1
NEXT_LOOKAHEAD_DAYS = 400
DEFAULT_HORIZON_DAYS = 14


def _monday(day: date) -> date:
    return day - timedelta(days=day.weekday())


def _to_date(value: date | str) -> date:
    return value if isinstance(value, date) else date.fromisoformat(value)


def occurs_on(rule: dict[str, Any], day: date) -> bool:
    """Ritorna True se la regola (CONTRACT.md §1) cade in `day`; regole malformate non cadono mai."""
    try:
        return _occurs_on(rule, day)
    except (KeyError, TypeError, ValueError, ZeroDivisionError):
        return False


def _occurs_on(rule: dict[str, Any], day: date) -> bool:
    """Ritorna True se la regola (CONTRACT.md §1) cade in `day`.

    Una regola sconosciuta o malformata non cade mai (falso), così un dato
    corrotto non rompe l'intero aggiornamento.
    """
    try:
        return _occurs_on(rule, day)
    except (KeyError, TypeError, ValueError, AttributeError):
        return False


def _occurs_on(rule: dict[str, Any], day: date) -> bool:
    rtype = rule.get("type")

    if rtype == "weekly":
        return day.weekday() in rule["weekdays"]

    if rtype == "every_n_weeks":
        if day.weekday() not in rule["weekdays"]:
            return False
        weeks = (_monday(day) - _monday(_to_date(rule["anchor_date"]))).days // 7
        return weeks % rule["interval"] == 0

    if rtype == "monthly_nth_weekday":
        if day.weekday() != rule["weekday"]:
            return False
        nth = rule["nth"]
        if nth == -1:
            return day.day + 7 > calendar.monthrange(day.year, day.month)[1]
        return (day.day - 1) // 7 + 1 == nth

    if rtype == "monthly_day":
        last = calendar.monthrange(day.year, day.month)[1]
        return day.day == min(rule["day"], last)

    return False


def next_occurrence(
    rule: dict[str, Any], start: date, lookahead: int = NEXT_LOOKAHEAD_DAYS
) -> date | None:
    """Prima data >= `start` in cui la regola cade, entro `lookahead` giorni."""
    for offset in range(lookahead + 1):
        day = start + timedelta(days=offset)
        if occurs_on(rule, day):
            return day
    return None


def build_view(
    types: list[dict[str, Any]], today: date, horizon_days: int = DEFAULT_HORIZON_DAYS
) -> dict[str, Any]:
    """Costruisce gli attributi del sensore (CONTRACT.md §2).

    `days` è una finestra mobile di `horizon_days` giorni che parte da oggi.
    """
    # Elementi incompleti (dati corrotti) vengono saltati invece di sollevare.
    types = [
        t for t in types
        if isinstance(t, dict) and all(k in t for k in ("id", "name", "icon", "rule"))
    ]
    days = []
    for i in range(horizon_days):
        day = today + timedelta(days=i)
        days.append(
            {
                "date": day.isoformat(),
                "weekday": day.weekday(),
                "is_today": i == 0,
                "items": [t["id"] for t in types if occurs_on(t["rule"], day)],
            }
        )

    out_types = []
    next_item: dict[str, Any] | None = None
    for t in types:
        n = next_occurrence(t["rule"], today)
        nxt = None
        if n is not None:
            nxt = {"date": n.isoformat(), "days_until": (n - today).days}
            # A parità di days_until vince il primo in `types` (confronto stretto).
            if next_item is None or nxt["days_until"] < next_item["days_until"]:
                next_item = {"id": t["id"], **nxt}
        # `rule` serve alla card per disegnare il calendario grande (mese, ecc.)
        # senza dover esporre centinaia di giorni: le regole sono poche e piccole.
        out_types.append({**{k: t[k] for k in ("id", "name", "icon", "rule")}, "next": nxt})

    return {
        "schema_version": SCHEMA_VERSION,
        "today": today.isoformat(),
        "weekday": today.weekday(),
        "horizon_days": horizon_days,
        "types": out_types,
        "today_items": days[0]["items"] if days else [],
        "days": days,
        "next_item": next_item,
    }
