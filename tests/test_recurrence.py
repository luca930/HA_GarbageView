"""Test della logica di ricorrenza pura (T1)."""
from __future__ import annotations

import importlib.util
import json
from datetime import date, timedelta
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
# Caricamento per percorso: evita di importare il pacchetto (e quindi Home Assistant).
_spec = importlib.util.spec_from_file_location(
    "recurrence", ROOT / "custom_components/garbage_view/recurrence.py"
)
rec = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rec)

FIXTURE = json.loads((ROOT / "tests/fixtures/schedule_example.json").read_text())

# Regole che riproducono la fixture (14 giorni da 2026-11-07).
TYPES = [
    {"id": "umido", "name": "Umido", "icon": "mdi:food-apple", "color": "#8E5A2B",
     "rule": {"type": "weekly", "weekdays": [1, 4]}},
    {"id": "plastica", "name": "Plastica", "icon": "mdi:recycle", "color": "#FF9F0A",
     "rule": {"type": "weekly", "weekdays": [5]}},
    {"id": "carta", "name": "Carta", "icon": "mdi:package-variant", "color": "#0A84FF",
     "rule": {"type": "every_n_weeks", "weekdays": [0], "interval": 2,
              "anchor_date": "2026-11-09"}},
    {"id": "vetro", "name": "Vetro", "icon": "mdi:glass-fragile", "color": "#34C759",
     "rule": {"type": "monthly_nth_weekday", "weekday": 3, "nth": 2}},
]


def dates(rule, start, end):
    return [d for d in (start + timedelta(n) for n in range((end - start).days + 1))
            if rec.occurs_on(rule, d)]


def test_weekly():
    rule = {"type": "weekly", "weekdays": [1, 4]}
    assert dates(rule, date(2026, 11, 2), date(2026, 11, 8)) == [
        date(2026, 11, 3), date(2026, 11, 6)]


def test_every_n_weeks_anchor_any_day_of_week():
    # L'ancora può essere un giorno qualsiasi della settimana attiva.
    rule = {"type": "every_n_weeks", "weekdays": [0, 3], "interval": 2,
            "anchor_date": "2026-11-05"}
    assert dates(rule, date(2026, 11, 2), date(2026, 11, 29)) == [
        date(2026, 11, 2), date(2026, 11, 5), date(2026, 11, 16), date(2026, 11, 19)]


def test_every_n_weeks_before_anchor_and_interval_3():
    rule = {"type": "every_n_weeks", "weekdays": [2], "interval": 3,
            "anchor_date": "2026-11-04"}
    assert rec.occurs_on(rule, date(2026, 10, 14))  # 3 settimane prima
    assert not rec.occurs_on(rule, date(2026, 10, 21))
    assert rec.occurs_on(rule, date(2026, 11, 25))


def test_every_n_weeks_across_year_boundary():
    rule = {"type": "every_n_weeks", "weekdays": [0], "interval": 2,
            "anchor_date": "2026-12-28"}
    assert rec.occurs_on(rule, date(2027, 1, 11))
    assert not rec.occurs_on(rule, date(2027, 1, 4))


@pytest.mark.parametrize("nth,expected", [
    (1, date(2026, 11, 6)), (2, date(2026, 11, 13)), (3, date(2026, 11, 20)),
    (4, date(2026, 11, 27)), (-1, date(2026, 11, 27)),
])
def test_nth_weekday_november_fridays(nth, expected):
    rule = {"type": "monthly_nth_weekday", "weekday": 4, "nth": nth}
    assert dates(rule, date(2026, 11, 1), date(2026, 11, 30)) == [expected]


def test_last_weekday_differs_from_fourth_when_five_occurrences():
    # Ottobre 2026 ha 5 venerdì: 2, 9, 16, 23, 30.
    last = {"type": "monthly_nth_weekday", "weekday": 4, "nth": -1}
    fourth = {"type": "monthly_nth_weekday", "weekday": 4, "nth": 4}
    assert dates(last, date(2026, 10, 1), date(2026, 10, 31)) == [date(2026, 10, 30)]
    assert dates(fourth, date(2026, 10, 1), date(2026, 10, 31)) == [date(2026, 10, 23)]


def test_monthly_day_regular():
    rule = {"type": "monthly_day", "day": 15}
    assert rec.occurs_on(rule, date(2026, 11, 15))
    assert not rec.occurs_on(rule, date(2026, 11, 14))


@pytest.mark.parametrize("year,month,last", [
    (2026, 2, 28), (2028, 2, 29), (2026, 4, 30), (2026, 12, 31)])
def test_monthly_day_31_falls_back_to_last_day(year, month, last):
    rule = {"type": "monthly_day", "day": 31}
    hits = dates(rule, date(year, month, 1), date(year, month, last))
    assert hits == [date(year, month, last)]


def test_leap_day_29_in_non_leap_year():
    rule = {"type": "monthly_day", "day": 29}
    assert dates(rule, date(2027, 2, 1), date(2027, 2, 28)) == [date(2027, 2, 28)]
    assert dates(rule, date(2028, 2, 1), date(2028, 2, 29)) == [date(2028, 2, 29)]


def test_dst_change_days_are_plain_dates():
    # Cambio ora legale (2026-03-29 e 2026-10-25): lavoriamo su date, nessun salto.
    rule = {"type": "weekly", "weekdays": [6]}
    assert rec.occurs_on(rule, date(2026, 3, 29))
    assert rec.occurs_on(rule, date(2026, 10, 25))
    assert not rec.occurs_on(rule, date(2026, 3, 30))


def test_unknown_rule_never_occurs():
    assert not rec.occurs_on({"type": "boh"}, date(2026, 11, 7))


def test_next_occurrence_includes_today_and_none():
    rule = {"type": "weekly", "weekdays": [5]}
    assert rec.next_occurrence(rule, date(2026, 11, 7)) == date(2026, 11, 7)
    assert rec.next_occurrence(rule, date(2026, 11, 8)) == date(2026, 11, 14)
    never = {"type": "weekly", "weekdays": []}
    assert rec.next_occurrence(never, date(2026, 11, 7)) is None


def test_build_view_matches_fixture():
    view = rec.build_view(TYPES, date(2026, 11, 7))
    assert view == FIXTURE["attributes"]


def test_build_view_rolling_window_starts_today():
    view = rec.build_view(TYPES, date(2026, 11, 4))
    assert len(view["days"]) == view["horizon_days"] == 14
    assert view["days"][0]["is_today"] and view["days"][0]["date"] == "2026-11-04"
    assert sum(d["is_today"] for d in view["days"]) == 1
    assert view["days"][-1]["date"] == "2026-11-17"


def test_build_view_custom_horizon():
    assert len(rec.build_view(TYPES, date(2026, 11, 7), horizon_days=7)["days"]) == 7


def test_next_item_tie_goes_to_first_type():
    types = [
        {"id": "b", "name": "B", "icon": "mdi:a", "color": "#000000",
         "rule": {"type": "weekly", "weekdays": [2]}},
        {"id": "a", "name": "A", "icon": "mdi:a", "color": "#000000",
         "rule": {"type": "weekly", "weekdays": [2]}},
    ]
    view = rec.build_view(types, date(2026, 11, 3))  # martedì
    assert view["next_item"] == {"id": "b", "date": "2026-11-04", "days_until": 1}


def test_build_view_items_follow_types_order_and_multiple_per_day():
    types = [
        {"id": "b", "name": "B", "icon": "mdi:a", "color": "#000000",
         "rule": {"type": "weekly", "weekdays": [2]}},
        {"id": "a", "name": "A", "icon": "mdi:a", "color": "#000000",
         "rule": {"type": "weekly", "weekdays": [2]}},
    ]
    view = rec.build_view(types, date(2026, 11, 4))
    assert view["today_items"] == ["b", "a"]


def test_next_null_when_never_occurs():
    t = [{"id": "x", "name": "X", "icon": "mdi:a", "color": "#000000",
          "rule": {"type": "weekly", "weekdays": []}}]
    view = rec.build_view(t, date(2026, 11, 7))
    assert view["types"][0]["next"] is None and view["next_item"] is None


def test_build_view_empty_types():
    view = rec.build_view([], date(2026, 11, 7))
    assert view["types"] == [] and view["today_items"] == [] and view["next_item"] is None


@pytest.mark.parametrize("rule", [
    {}, {"type": "weekly"}, {"type": "weekly", "weekdays": 3},
    {"type": "every_n_weeks", "weekdays": [0]},
    {"type": "every_n_weeks", "weekdays": [0], "interval": 2, "anchor_date": "boh"},
    {"type": "monthly_nth_weekday", "weekday": 0},
    {"type": "monthly_day"},
])
def test_malformed_rules_degrade_to_false(rule):
    assert rec.occurs_on(rule, date(2026, 11, 2)) is False


def test_build_view_skips_incomplete_types():
    view = rec.build_view([{"id": "x"}, TYPES[0]], date(2026, 11, 7))
    assert [t["id"] for t in view["types"]] == ["umido"]
