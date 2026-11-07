"""Test di coordinator, sensor e calendar (T3)."""
from __future__ import annotations

from datetime import date, datetime, timedelta
from unittest.mock import patch

import pytest
from freezegun.api import FrozenDateTimeFactory
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import MockConfigEntry, async_fire_time_changed

from custom_components.garbage_view.const import DOMAIN

TYPES = [
    {"id": "umido", "name": "Umido", "icon": "mdi:food-apple", "color": "#8E5A2B",
     "rule": {"type": "weekly", "weekdays": [1, 4]}},
    {"id": "plastica", "name": "Plastica", "icon": "mdi:recycle", "color": "#FF9F0A",
     "rule": {"type": "weekly", "weekdays": [5]}},
    {"id": "carta", "name": "Carta", "icon": "mdi:package-variant", "color": "#0A84FF",
     "rule": {"type": "every_n_weeks", "weekdays": [0], "interval": 2,
              "anchor_date": "2026-11-09"}},
]


async def setup(hass: HomeAssistant, types=TYPES) -> MockConfigEntry:
    entry = MockConfigEntry(domain=DOMAIN, data={}, options={"types": types})
    entry.add_to_hass(hass)
    with patch("custom_components.garbage_view._async_register_card"):
        assert await hass.config_entries.async_setup(entry.entry_id)
        await hass.async_block_till_done()
    return entry


@pytest.fixture
def saturday(freezer: FrozenDateTimeFactory):
    """2026-11-07 (sabato), 10:00 nel fuso di test."""
    freezer.move_to(datetime(2026, 11, 7, 10, 0, tzinfo=dt_util.get_default_time_zone()))
    return freezer


async def test_sensor_state_and_attributes(hass: HomeAssistant, saturday) -> None:
    await setup(hass)
    state = hass.states.get("sensor.garbage_view_schedule")
    assert state.state == "1"
    a = state.attributes
    assert a["schema_version"] == 1
    assert a["today"] == "2026-11-07" and a["horizon_days"] == 14
    assert a["today_items"] == ["plastica"]
    assert len(a["days"]) == 14 and a["days"][0]["is_today"]
    assert a["next_item"] == {"id": "plastica", "date": "2026-11-07", "days_until": 0}
    carta = next(t for t in a["types"] if t["id"] == "carta")
    assert carta["next"] == {"date": "2026-11-09", "days_until": 2}


async def test_midnight_refresh(hass: HomeAssistant, saturday) -> None:
    await setup(hass)
    assert hass.states.get("sensor.garbage_view_schedule").attributes["today"] == "2026-11-07"
    saturday.move_to(datetime(2026, 11, 8, 0, 0, 1, tzinfo=dt_util.get_default_time_zone()))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    state = hass.states.get("sensor.garbage_view_schedule")
    assert state.attributes["today"] == "2026-11-08"
    assert state.state == "0"


async def test_options_change_refreshes(hass: HomeAssistant, saturday) -> None:
    entry = await setup(hass)
    hass.config_entries.async_update_entry(entry, options={"types": TYPES[:1]})
    await hass.async_block_till_done()
    state = hass.states.get("sensor.garbage_view_schedule")
    assert [t["id"] for t in state.attributes["types"]] == ["umido"]
    assert state.state == "0"


async def test_empty_types(hass: HomeAssistant, saturday) -> None:
    await setup(hass, [])
    state = hass.states.get("sensor.garbage_view_schedule")
    assert state.state == "0" and state.attributes["next_item"] is None


async def test_calendar_events_all_day_with_uid(hass: HomeAssistant, saturday) -> None:
    await setup(hass)
    entity = hass.data["calendar"].get_entity("calendar.garbage_view")
    start = datetime(2026, 11, 7, tzinfo=dt_util.get_default_time_zone())
    events = await entity.async_get_events(hass, start, start + timedelta(days=7))
    assert [(e.uid, e.summary) for e in events] == [
        ("plastica-2026-11-07", "Plastica"),
        ("carta-2026-11-09", "Carta"),
        ("umido-2026-11-10", "Umido"),
        ("umido-2026-11-13", "Umido"),
    ]
    assert all(isinstance(e.start, date) and not isinstance(e.start, datetime) for e in events)
    assert events[0].end == date(2026, 11, 8)
    # Stato = evento corrente/prossimo.
    assert hass.states.get("calendar.garbage_view").attributes["message"] == "Plastica"


async def test_calendar_range_is_capped(hass: HomeAssistant, saturday) -> None:
    await setup(hass)
    entity = hass.data["calendar"].get_entity("calendar.garbage_view")
    start = datetime(2026, 1, 1, tzinfo=dt_util.get_default_time_zone())
    events = await entity.async_get_events(hass, start, start + timedelta(days=36500))
    assert events and events[-1].start < date(2026, 1, 1) + timedelta(days=733)


async def test_calendar_end_at_local_midnight_is_exclusive(hass: HomeAssistant, saturday) -> None:
    await setup(hass)
    entity = hass.data["calendar"].get_entity("calendar.garbage_view")
    tz = dt_util.get_default_time_zone()
    # Venerdì 13 non deve comparire: l'intervallo termina a mezzanotte di venerdì 13.
    events = await entity.async_get_events(
        hass, datetime(2026, 11, 10, tzinfo=tz), datetime(2026, 11, 13, tzinfo=tz))
    assert [e.uid for e in events] == ["umido-2026-11-10"]


async def test_calendar_event_uses_coordinator_data(hass: HomeAssistant, saturday) -> None:
    await setup(hass, [])
    assert hass.states.get("calendar.garbage_view").state == "off"
    entity = hass.data["calendar"].get_entity("calendar.garbage_view")
    assert entity.event is None
