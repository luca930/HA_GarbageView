"""Config flow e options flow (task T2)."""
from __future__ import annotations

from homeassistant import config_entries

from .const import DOMAIN


class GarbageViewConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Voce singola, senza parametri iniziali."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        return self.async_create_entry(title="Garbage View", data={}, options={"types": []})
