"""calendar.garbage_view: un evento "tutto il giorno" per ogni tipo e data."""
from __future__ import annotations

from datetime import date, datetime, timedelta

from homeassistant.components.calendar import CalendarEntity, CalendarEvent
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.util import dt as dt_util

from .const import DOMAIN
from .coordinator import GarbageViewCoordinator
from .recurrence import occurs_on

# Protezione da richieste con intervalli enormi (costo O(tipi x giorni)).
MAX_RANGE_DAYS = 732


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    async_add_entities([GarbageViewCalendar(entry.runtime_data, entry)])


def events_between(types: list[dict], start: date, end: date) -> list[CalendarEvent]:
    """Eventi per i giorni in [start, end) (end escluso)."""
    end = min(end, start + timedelta(days=MAX_RANGE_DAYS))
    events: list[CalendarEvent] = []
    day = start
    while day < end:
        for t in types:
            if occurs_on(t["rule"], day):
                events.append(
                    CalendarEvent(
                        start=day,
                        end=day + timedelta(days=1),
                        summary=t["name"],
                        uid=f"{t['id']}-{day.isoformat()}",
                    )
                )
        day += timedelta(days=1)
    return events


class GarbageViewCalendar(CalendarEntity):
    _attr_name = "Garbage View"
    _attr_icon = "mdi:calendar-today"

    def __init__(self, coordinator: GarbageViewCoordinator, entry: ConfigEntry) -> None:
        self._coordinator = coordinator
        self._attr_unique_id = f"{entry.entry_id}_calendar"
        self.entity_id = f"calendar.{DOMAIN}"

    @property
    def event(self) -> CalendarEvent | None:
        """Prossimo evento (oggi incluso), dal calcolo già fatto dal coordinator."""
        data = self._coordinator.data or {}
        nxt = data.get("next_item")
        if not nxt:
            return None
        name = next((t["name"] for t in data["types"] if t["id"] == nxt["id"]), None)
        if name is None:
            return None
        day = date.fromisoformat(nxt["date"])
        return CalendarEvent(
            start=day,
            end=day + timedelta(days=1),
            summary=name,
            uid=f"{nxt['id']}-{nxt['date']}",
        )

    async def async_get_events(
        self, hass: HomeAssistant, start_date: datetime, end_date: datetime
    ) -> list[CalendarEvent]:
        local = dt_util.get_default_time_zone()
        start = start_date.astimezone(local).date()
        end = end_date.astimezone(local)
        # end è escluso: se è esattamente a mezzanotte locale non include un giorno in più.
        at_midnight = (end.hour, end.minute, end.second, end.microsecond) == (0, 0, 0, 0)
        end_day = end.date() if at_midnight else end.date() + timedelta(days=1)
        return events_between(self._coordinator.types, start, end_day)

    async def async_added_to_hass(self) -> None:
        # Aggiorna lo stato (evento corrente) quando il coordinator ricalcola.
        self.async_on_remove(
            self._coordinator.async_add_listener(self.async_write_ha_state)
        )
