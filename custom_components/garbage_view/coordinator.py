"""Coordinator: ricalcola il calendario a mezzanotte locale e al cambio opzioni."""
from __future__ import annotations

import logging
from datetime import date, datetime
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback
from homeassistant.helpers.event import async_track_time_change
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator
from homeassistant.util import dt as dt_util

from .const import CONF_TYPES, DOMAIN
from .recurrence import build_view

_LOGGER = logging.getLogger(__name__)


class GarbageViewCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    """Nessun polling: aggiornamento solo a mezzanotte e quando cambiano le opzioni."""

    config_entry: ConfigEntry

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        super().__init__(hass, _LOGGER, config_entry=entry, name=DOMAIN, update_interval=None)
        self._unsub_midnight: CALLBACK_TYPE | None = None

    @property
    def types(self) -> list[dict[str, Any]]:
        """Tipi di rifiuto salvati nelle opzioni (CONTRACT.md §1)."""
        return list(self.config_entry.options.get(CONF_TYPES, []))

    @staticmethod
    def _today() -> date:
        return dt_util.now().date()

    async def _async_update_data(self) -> dict[str, Any]:
        return build_view(self.types, self._today())

    @callback
    def async_start(self) -> None:
        """Pianifica il ricalcolo a mezzanotte locale."""
        self._unsub_midnight = async_track_time_change(
            self.hass, self._handle_midnight, hour=0, minute=0, second=0
        )

    @callback
    def async_stop(self) -> None:
        if self._unsub_midnight:
            self._unsub_midnight()
            self._unsub_midnight = None

    @callback
    def _handle_midnight(self, _now: datetime) -> None:
        self.hass.async_create_task(self.async_refresh())
