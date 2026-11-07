import pytest

from custom_components.garbage_view.validation import (
    ValidationError,
    build_type,
    slugify,
    unique_id,
    validate_rule,
)


def err(fn, *a, **k):
    with pytest.raises(ValidationError) as e:
        fn(*a, **k)
    return e.value.code


def test_slugify_and_unique():
    assert slugify("Carta e Cartone!") == "carta_e_cartone"
    assert slugify("Plastica è così") == "plastica_e_cosi"
    assert slugify("###") == "tipo"
    assert len(slugify("a" * 80)) == 32
    assert unique_id("Umido", {"umido", "umido_2"}) == "umido_3"
    assert len(unique_id("a" * 40, {"a" * 32})) <= 32


def test_weekly():
    assert validate_rule({"type": "weekly", "weekdays": ["4", 1, 1]}) == {"type": "weekly", "weekdays": [1, 4]}
    assert err(validate_rule, {"type": "weekly", "weekdays": []}) == "no_weekdays"
    assert err(validate_rule, {"type": "weekly", "weekdays": [7]}) == "invalid_weekday"
    assert err(validate_rule, {"type": "weekly", "weekdays": [True]}) == "invalid_weekday"
    assert err(validate_rule, {"type": "weekly", "weekdays": [1.5]}) == "invalid_weekday"
    for bad in (float("nan"), float("inf"), "nan", "inf"):
        assert err(validate_rule, {"type": "monthly_day", "day": bad}) == "invalid_day"


def test_every_n_weeks():
    ok = {"type": "every_n_weeks", "weekdays": [0], "interval": 2.0, "anchor_date": "2026-11-02", "x": 1}
    assert validate_rule(ok) == {"type": "every_n_weeks", "weekdays": [0], "interval": 2, "anchor_date": "2026-11-02"}
    assert err(validate_rule, {**ok, "interval": 1}) == "invalid_interval"
    assert err(validate_rule, {**ok, "interval": 9}) == "invalid_interval"
    assert err(validate_rule, {**ok, "anchor_date": "2026-02-30"}) == "invalid_anchor_date"
    assert err(validate_rule, {**ok, "anchor_date": None}) == "invalid_anchor_date"


def test_monthly():
    assert validate_rule({"type": "monthly_nth_weekday", "weekday": "2", "nth": "-1"}) == {
        "type": "monthly_nth_weekday", "weekday": 2, "nth": -1}
    assert err(validate_rule, {"type": "monthly_nth_weekday", "weekday": 2, "nth": 5}) == "invalid_nth"
    assert err(validate_rule, {"type": "monthly_nth_weekday", "weekday": 7, "nth": 1}) == "invalid_weekday"
    assert validate_rule({"type": "monthly_day", "day": 31}) == {"type": "monthly_day", "day": 31}
    assert err(validate_rule, {"type": "monthly_day", "day": 0}) == "invalid_day"
    assert err(validate_rule, {"type": "monthly_day", "day": 32}) == "invalid_day"
    assert err(validate_rule, {"type": "monthly_day", "day": "abc"}) == "invalid_day"


def test_bad_rule():
    assert err(validate_rule, {"type": "daily"}) == "invalid_rule"
    assert err(validate_rule, None) == "invalid_rule"


def test_build_type():
    t = build_type(type_id=None, name="  Umido ", icon="mdi:food-apple",
                   rule={"type": "monthly_day", "day": 3}, existing_ids={"umido"})
    assert t == {"id": "umido_2", "name": "Umido", "icon": "mdi:food-apple", "rule": {"type": "monthly_day", "day": 3},
                 "pickup": "morning"}
    rule = {"type": "monthly_day", "day": 3}
    for name in ("", "   ", "x" * 41, "a\nb", None):
        assert err(build_type, type_id=None, name=name, icon="mdi:a", rule=rule, existing_ids=set()) == "invalid_name"
    for icon in ("food", "mdi:Food", "mdi:", "<script>", None, "mdi:a b"):
        assert err(build_type, type_id=None, name="A", icon=icon, rule=rule, existing_ids=set()) == "invalid_icon"


def test_validate_pickup():
    from custom_components.garbage_view.validation import validate_pickup
    assert validate_pickup(None) == "morning"  # tipi salvati prima della 0.2.2
    assert validate_pickup("evening") == "evening"
    for bad in ("noon", "", 1, ["morning"]):
        with pytest.raises(ValidationError) as err:
            validate_pickup(bad)
        assert err.value.code == "invalid_pickup"
