"""Test delle notifiche programmate (validazione, testi, invio, dedup, riavvio)."""
from __future__ import annotations

from datetime import date, datetime, timedelta

import pytest
from freezegun.api import FrozenDateTimeFactory
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.exceptions import ServiceValidationError
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import (
    MockConfigEntry,
    async_fire_time_changed,
)

from custom_components.garbage_view.const import CONF_NOTIFICATIONS, DOMAIN
from custom_components.garbage_view.notifier import load_texts, render
from custom_components.garbage_view.validation import ValidationError, validate_notifications

from .test_integration import TYPES as BASE_TYPES, setup

# Plastica (sabato) si ritira la sera: promemoria il giorno stesso. Gli altri al mattino: sera prima.
TYPES = [{**t, "pickup": "evening"} if t["id"] == "plastica" else t for t in BASE_TYPES]

NOTIFY = {
    "enabled": True,
    "targets": ["mobile_app_pixel", "mobile_app_iphone"],
    "time": "07:30:00",
    "evening_time": "20:00:00",
    "put_out_from": "18:00:00",
    "skip_if_empty": True,
    "title_template": "",
    "message_template": "",
}


def tz_dt(y, m, d, hh=0, mm=0, ss=0):
    return datetime(y, m, d, hh, mm, ss, tzinfo=dt_util.get_default_time_zone())


@pytest.fixture
def calls(hass: HomeAssistant) -> list[ServiceCall]:
    recorded: list[ServiceCall] = []

    async def _h(call: ServiceCall) -> None:
        recorded.append(call)

    for name in ("mobile_app_pixel", "mobile_app_iphone"):
        hass.services.async_register("notify", name, _h)
    return recorded


async def setup_n(hass, notif=NOTIFY, types=TYPES) -> MockConfigEntry:
    from unittest.mock import patch

    entry = MockConfigEntry(domain=DOMAIN, data={}, options={"types": types, CONF_NOTIFICATIONS: notif})
    entry.add_to_hass(hass)
    with patch("custom_components.garbage_view._async_register_card"):
        assert await hass.config_entries.async_setup(entry.entry_id)
        await hass.async_block_till_done()
    return entry


async def tick(hass, freezer: FrozenDateTimeFactory, when: datetime):
    freezer.move_to(when)
    async_fire_time_changed(hass)
    await hass.async_block_till_done()


# ---- validazione ------------------------------------------------------------
def test_validate_ok_and_defaults() -> None:
    out = validate_notifications({"enabled": True, "targets": ["mobile_app_x", "mobile_app_x"], "time": "7:05"})
    assert out["targets"] == ["mobile_app_x"] and out["time"] == "07:05:00"
    assert out["skip_if_empty"] is True and out["evening_time"] == "20:00:00"


@pytest.mark.parametrize(
    "raw,code",
    [
        ({"enabled": True, "targets": []}, "no_targets"),
        ({"targets": ["notify.evil"]}, "invalid_targets"),
        ({"targets": ["mobile_app_x; rm"]}, "invalid_targets"),
        ({"targets": "mobile_app_x"}, "invalid_targets"),
        ({"targets": ""}, "invalid_targets"),
        ({"time": "25:00"}, "invalid_time"),
        ({"time": "abc"}, "invalid_time"),
        ({"time": 730}, "invalid_time"),
        ({"message_template": "x" * 201}, "invalid_template"),
        ({"message_template": "{__class__}"}, "invalid_template"),
        ({"title_template": "{items.__class__}"}, "invalid_template"),
    ],
)
def test_validate_rejects(raw, code) -> None:
    with pytest.raises(ValidationError) as err:
        validate_notifications(raw)
    assert err.value.code == code


# ---- testi -------------------------------------------------------------------
def test_texts_languages_and_fallback() -> None:
    assert load_texts("it")["and"] == "e"
    assert load_texts("en")["and"] == "and"
    assert load_texts("it-IT")["and"] == "e"  # lingua base
    assert load_texts("xx")["and"] == "and"  # ripiego su en
    assert load_texts("../../etc/passwd")["and"] == "and"  # nessun path traversal


def test_render_default_custom_and_empty() -> None:
    it, en = load_texts("it"), load_texts("en")
    d = date(2026, 11, 7)
    assert render(it, {}, "today", ["Umido", "Carta", "Vetro"], d) == (
        "Da portare fuori oggi", "Oggi porta fuori: Umido, Carta e Vetro.")
    assert render(en, {}, "tomorrow", ["Paper"], d)[1] == "Tomorrow put out: Paper."
    assert render(it, {}, "today", [], d)[1] == "Oggi non c'è nulla da portare fuori."
    custom = {"title_template": "Bin ({count})", "message_template": "{when} {date}: {items}"}
    assert render(en, custom, "today", ["A", "B"], d) == ("Bin (2)", "today 2026-11-07: A and B")


# ---- invio -------------------------------------------------------------------
async def test_morning_send_multi_target(hass, calls, freezer) -> None:
    freezer.move_to(tz_dt(2026, 11, 7, 6, 0))  # sabato: Plastica
    await setup_n(hass)
    await tick(hass, freezer, tz_dt(2026, 11, 7, 7, 30, 1))
    assert sorted(c.service for c in calls) == ["mobile_app_iphone", "mobile_app_pixel"]
    assert calls[0].data["message"] == "Today put out: Plastica."  # lingua di test: en


async def test_italian_language(hass, calls, freezer) -> None:
    hass.config.language = "it"
    freezer.move_to(tz_dt(2026, 11, 7, 6, 0))
    await setup_n(hass)
    await tick(hass, freezer, tz_dt(2026, 11, 7, 7, 30, 1))
    assert calls[0].data["message"] == "Oggi porta fuori: Plastica."


async def test_evening_before_lists_tomorrow(hass, calls, freezer) -> None:
    freezer.move_to(tz_dt(2026, 11, 7, 6, 0))
    await setup_n(hass)
    await tick(hass, freezer, tz_dt(2026, 11, 7, 7, 30, 1))  # mattina (non oggetto del test)
    calls.clear()
    await tick(hass, freezer, tz_dt(2026, 11, 7, 20, 0, 1))  # domenica: niente → saltata
    assert calls == []
    await tick(hass, freezer, tz_dt(2026, 11, 8, 20, 0, 1))  # domenica sera → lunedì: Carta
    assert calls and calls[0].data["message"] == "Tomorrow put out: Carta."


async def test_skip_if_empty_and_send_when_not_skipping(hass, calls, freezer) -> None:
    freezer.move_to(tz_dt(2026, 11, 7, 6, 0))
    await setup_n(hass, {**NOTIFY, "skip_if_empty": False})
    await tick(hass, freezer, tz_dt(2026, 11, 8, 7, 30, 1))  # domenica vuota
    assert calls and calls[0].data["message"] == "Nothing to put out today."


async def test_no_duplicate_after_restart(hass, calls, freezer) -> None:
    freezer.move_to(tz_dt(2026, 11, 7, 6, 0))
    entry = await setup_n(hass)
    await tick(hass, freezer, tz_dt(2026, 11, 7, 7, 30, 1))
    assert len(calls) == 2
    # riavvio 10 minuti dopo: nella finestra di recupero ma già inviato
    freezer.move_to(tz_dt(2026, 11, 7, 7, 40))
    assert await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()
    assert len(calls) == 2


async def test_catch_up_after_restart(hass, calls, freezer) -> None:
    freezer.move_to(tz_dt(2026, 11, 7, 7, 40))  # 10 minuti dopo l'orario, mai inviato
    await setup_n(hass)
    assert len(calls) == 2


async def test_late_start_no_catch_up(hass, calls, freezer) -> None:
    freezer.move_to(tz_dt(2026, 11, 7, 15, 0))
    await setup_n(hass)
    assert calls == []


async def test_disabled_sends_nothing(hass, calls, freezer) -> None:
    freezer.move_to(tz_dt(2026, 11, 7, 6, 0))
    await setup_n(hass, {**NOTIFY, "enabled": False})
    await tick(hass, freezer, tz_dt(2026, 11, 7, 7, 30, 1))
    assert calls == []


async def test_options_change_reschedules(hass, calls, freezer) -> None:
    freezer.move_to(tz_dt(2026, 11, 7, 6, 0))
    entry = await setup_n(hass)
    hass.config_entries.async_update_entry(
        entry, options={**entry.options, CONF_NOTIFICATIONS: {**NOTIFY, "time": "08:00:00"}}
    )
    await hass.async_block_till_done()
    await tick(hass, freezer, tz_dt(2026, 11, 7, 7, 30, 1))
    assert calls == []
    await tick(hass, freezer, tz_dt(2026, 11, 7, 8, 0, 1))
    assert len(calls) == 2


async def test_missing_target_is_skipped(hass, calls, freezer) -> None:
    freezer.move_to(tz_dt(2026, 11, 7, 6, 0))
    await setup_n(hass, {**NOTIFY, "targets": ["mobile_app_gone", "mobile_app_pixel"]})
    await tick(hass, freezer, tz_dt(2026, 11, 7, 7, 30, 1))
    assert [c.service for c in calls] == ["mobile_app_pixel"]


async def test_test_service(hass, calls, freezer) -> None:
    freezer.move_to(tz_dt(2026, 11, 8, 9, 0))  # domenica, vuoto: il test invia comunque
    await setup_n(hass)
    await hass.services.async_call(DOMAIN, "send_test_notification", {"kind": "today"}, blocking=True)
    assert len(calls) == 2
    with pytest.raises(Exception):
        await hass.services.async_call(DOMAIN, "send_test_notification", {"kind": "bogus"}, blocking=True)


async def test_test_service_no_delivery(hass, freezer) -> None:
    freezer.move_to(tz_dt(2026, 11, 8, 9, 0))
    await setup_n(hass)  # nessun servizio notify registrato
    with pytest.raises(ServiceValidationError):
        await hass.services.async_call(DOMAIN, "send_test_notification", {}, blocking=True)


# ---- options flow ---------------------------------------------------------------
async def test_options_flow_notifications(hass, calls) -> None:
    entry = MockConfigEntry(domain=DOMAIN, unique_id=DOMAIN, data={}, options={"types": TYPES})
    entry.add_to_hass(hass)
    r = await hass.config_entries.options.async_init(entry.entry_id)
    assert "notifications" in r["menu_options"]
    fid = r["flow_id"]
    r = await hass.config_entries.options.async_configure(fid, {"next_step_id": "notifications"})
    assert r["step_id"] == "notifications"
    # nessun dispositivo scelto con notifiche attive → errore
    bad = {"enabled": True, "targets": [], "time": "07:30:00",
           "evening_time": "20:00:00", "put_out_from": "18:00:00", "skip_if_empty": True}
    r = await hass.config_entries.options.async_configure(fid, bad)
    assert r["errors"] == {"targets": "no_targets"}
    r = await hass.config_entries.options.async_configure(fid, {**bad, "targets": ["mobile_app_pixel"]})
    assert r["type"] == FlowResultType.MENU
    r = await hass.config_entries.options.async_configure(fid, {"next_step_id": "finish"})
    assert r["type"] == FlowResultType.CREATE_ENTRY
    saved = r["data"][CONF_NOTIFICATIONS]
    assert saved["targets"] == ["mobile_app_pixel"] and saved["enabled"] is True
    assert r["data"]["types"] == TYPES


# ---- orario di ritiro (0.2.2) -------------------------------------------------------
async def test_morning_pickup_not_notified_on_the_day(hass, calls, freezer) -> None:
    """Carta (lunedì, mattina) NON genera il promemoria delle 07:30 del lunedì."""
    freezer.move_to(tz_dt(2026, 11, 9, 6, 0))
    await setup_n(hass)
    await tick(hass, freezer, tz_dt(2026, 11, 9, 7, 30, 1))
    assert calls == []


async def test_evening_pickup_not_notified_the_evening_before(hass, calls, freezer) -> None:
    """Plastica (sabato, sera) NON compare nel promemoria delle 20:00 di venerdì."""
    freezer.move_to(tz_dt(2026, 11, 6, 6, 0))
    await setup_n(hass)
    await tick(hass, freezer, tz_dt(2026, 11, 6, 20, 0, 1))
    assert calls == []


async def test_mixed_day_lists_only_matching_types(hass, calls, freezer) -> None:
    types = [
        {**TYPES[1], "id": "a", "name": "Sera", "pickup": "evening"},   # sabato sera
        {**TYPES[1], "id": "b", "name": "Mattina", "pickup": "morning"},  # sabato mattina
    ]
    freezer.move_to(tz_dt(2026, 11, 6, 6, 0))
    await setup_n(hass, types=types)
    await tick(hass, freezer, tz_dt(2026, 11, 6, 20, 0, 1))  # venerdì sera -> solo "Mattina"
    assert calls[0].data["message"] == "Tomorrow put out: Mattina."
    calls.clear()
    await tick(hass, freezer, tz_dt(2026, 11, 7, 7, 30, 1))  # sabato -> solo "Sera"
    assert calls[0].data["message"] == "Today put out: Sera."


async def test_evening_reminder_no_duplicate_after_restart(hass, calls, freezer) -> None:
    freezer.move_to(tz_dt(2026, 11, 8, 19, 0))  # domenica: domani lunedì Carta (mattina)
    entry = await setup_n(hass)
    await tick(hass, freezer, tz_dt(2026, 11, 8, 20, 0, 1))
    assert len(calls) == 2
    freezer.move_to(tz_dt(2026, 11, 8, 20, 10))
    assert await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()
    assert len(calls) == 2


async def test_legacy_options_still_load(hass, calls, freezer) -> None:
    """Opzioni 0.2.0/0.2.1: chiave `evening_before` ignorata, tipi senza `pickup` = mattina."""
    legacy = {**NOTIFY, "evening_before": False}
    legacy.pop("put_out_from")
    old_types = [{k: v for k, v in t.items() if k != "pickup"} for t in TYPES]
    freezer.move_to(tz_dt(2026, 11, 8, 19, 0))
    await setup_n(hass, legacy, old_types)
    await tick(hass, freezer, tz_dt(2026, 11, 8, 20, 0, 1))
    assert calls and calls[0].data["message"] == "Tomorrow put out: Carta."


def test_validate_drops_old_evening_before_key() -> None:
    out = validate_notifications({"evening_before": True, "evening_time": "21:00"})
    assert "evening_before" not in out
    assert out["evening_time"] == "21:00:00" and out["put_out_from"] == "18:00:00"
    with pytest.raises(ValidationError):
        validate_notifications({"put_out_from": "99:00"})
