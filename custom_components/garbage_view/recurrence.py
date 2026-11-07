"""Logica di ricorrenza pura (task T1). Nessuna dipendenza da Home Assistant.

Il modulo non importa nulla dal pacchetto, così può essere testato
(e usato) senza Home Assistant installato.
"""
from __future__ import annotations

import calendar
from datetime import date, time, timedelta
from typing import Any

SCHEMA_VERSION = 1
NEXT_LOOKAHEAD_DAYS = 400
DEFAULT_HORIZON_DAYS = 14
PICKUP_MORNING = "morning"
PICKUP_EVENING = "evening"
DEFAULT_PUT_OUT_FROM = time(18, 0)
MORNING_PICKUP_UNTIL = time(12, 0)  # un ritiro del mattino resta "da fare" fino a mezzogiorno


def pickup_of(item: dict[str, Any]) -> str:
    """Momento del ritiro di un tipo; i tipi salvati prima della 0.2.2 non lo hanno: mattina."""
    return PICKUP_EVENING if item.get("pickup") == PICKUP_EVENING else PICKUP_MORNING


def is_due_now(
    pickup: str, today_hit: bool, tomorrow_hit: bool, now: time, put_out_from: time
) -> bool:
    """True se è il momento di mettere fuori il rifiuto (CONTRACT.md §2).

    * ritiro serale: acceso tutto il giorno del ritiro;
    * ritiro del mattino: acceso dalla sera prima (da `put_out_from`) fino a mezzogiorno del ritiro.
    """
    if pickup == PICKUP_EVENING:
        return today_hit
    return (tomorrow_hit and now >= put_out_from) or (today_hit and now < MORNING_PICKUP_UNTIL)


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
    types: list[dict[str, Any]],
    today: date,
    horizon_days: int = DEFAULT_HORIZON_DAYS,
    now: time | None = None,
    put_out_from: time = DEFAULT_PUT_OUT_FROM,
) -> dict[str, Any]:
    """Costruisce gli attributi del sensore (CONTRACT.md §2).

    `days` è una finestra mobile di `horizon_days` giorni che parte da oggi.
    `now` (ora locale) serve per `due_now`; se assente vale mezzogiorno.
    """
    now = now or time(12, 0)
    tomorrow = today + timedelta(days=1)
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
    due_items: list[str] = []
    next_item: dict[str, Any] | None = None
    for t in types:
        n = next_occurrence(t["rule"], today)
        nxt = None
        if n is not None:
            nxt = {"date": n.isoformat(), "days_until": (n - today).days}
            # A parità di days_until vince il primo in `types` (confronto stretto).
            if next_item is None or nxt["days_until"] < next_item["days_until"]:
                next_item = {"id": t["id"], **nxt, "pickup": pickup_of(t)}
        # `rule` serve alla card per disegnare il calendario grande (mese, ecc.)
        # senza dover esporre centinaia di giorni: le regole sono poche e piccole.
        due = is_due_now(
            pickup_of(t), occurs_on(t["rule"], today), occurs_on(t["rule"], tomorrow), now, put_out_from
        )
        if due:
            due_items.append(t["id"])
        out_types.append(
            {**{k: t[k] for k in ("id", "name", "icon", "rule")}, "pickup": pickup_of(t), "due_now": due, "next": nxt}
        )

    return {
        "schema_version": SCHEMA_VERSION,
        "today": today.isoformat(),
        "weekday": today.weekday(),
        "horizon_days": horizon_days,
        "types": out_types,
        "today_items": days[0]["items"] if days else [],
        "due_items": due_items,
        "put_out_from": put_out_from.strftime("%H:%M"),
        "days": days,
        "next_item": next_item,
    }
