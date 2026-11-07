"""Coordinator: ricalcola il calendario a mezzanotte locale e al cambio opzioni."""
from __future__ import annotations

import logging
from datetime import date, datetime, time
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback
from homeassistant.helpers.event import async_track_time_change
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator
from homeassistant.util import dt as dt_util

from .const import CONF_NOTIFICATIONS, CONF_TYPES, DEFAULT_NOTIFICATIONS, DOMAIN, N_PUT_OUT_FROM
from .recurrence import build_view

_LOGGER = logging.getLogger(__name__)


class GarbageViewCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    """Nessun polling: aggiornamento solo a mezzanotte e quando cambiano le opzioni."""

    config_entry: ConfigEntry

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        super().__init__(hass, _LOGGER, config_entry=entry, name=DOMAIN, update_interval=None)
        self._unsubs: list[CALLBACK_TYPE] = []
        self.notifier: Any = None  # impostato da async_setup_entry

    @property
    def types(self) -> list[dict[str, Any]]:
        """Tipi di rifiuto salvati nelle opzioni (CONTRACT.md §1)."""
        return list(self.config_entry.options.get(CONF_TYPES, []))

    @staticmethod
    def _today() -> date:
        return dt_util.now().date()

    @property
    def put_out_from(self) -> time:
        """Ora da cui si evidenziano i ritiri del mattino dopo (sera prima)."""
        raw = self.config_entry.options.get(CONF_NOTIFICATIONS)
        value = raw.get(N_PUT_OUT_FROM) if isinstance(raw, dict) else None
        return dt_util.parse_time(value or "") or dt_util.parse_time(DEFAULT_NOTIFICATIONS[N_PUT_OUT_FROM])

    async def _async_update_data(self) -> dict[str, Any]:
        now = dt_util.now()
        return build_view(self.types, now.date(), now=now.time(), put_out_from=self.put_out_from)

    @callback
    def async_start(self) -> None:
        """Ricalcola a mezzanotte, a mezzogiorno e all'ora di "metti fuori" (dalle opzioni)."""
        self.async_stop()
        for t in (time(0, 0), time(12, 0), self.put_out_from):
            self._unsubs.append(
                async_track_time_change(
                    self.hass, self._handle_tick, hour=t.hour, minute=t.minute, second=t.second
                )
            )

    @callback
    def async_stop(self) -> None:
        for unsub in self._unsubs:
            unsub()
        self._unsubs = []

    @callback
    def _handle_tick(self, _now: datetime) -> None:
        self.hass.async_create_task(self.async_refresh())
