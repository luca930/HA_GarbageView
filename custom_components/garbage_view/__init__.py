"""HA Garbage View: setup, coordinator e piattaforme."""
from __future__ import annotations

from pathlib import Path

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
import voluptuous as vol
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import config_validation as cv

from .const import CARD_URL, DOMAIN
from .coordinator import GarbageViewCoordinator
from .notifier import KINDS, KIND_TODAY, Notifier

PLATFORMS = [Platform.SENSOR, Platform.CALENDAR]
_CARD_REGISTERED = f"{DOMAIN}_card_registered"

SERVICE_TEST = "send_test_notification"
_TEST_SCHEMA = vol.Schema({vol.Optional("kind", default=KIND_TODAY): vol.In(KINDS)})

type GarbageViewConfigEntry = ConfigEntry[GarbageViewCoordinator]


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    async def _send_test(call: ServiceCall) -> None:
        entries = hass.config_entries.async_loaded_entries(DOMAIN)
        if not entries:
            raise ServiceValidationError(translation_domain=DOMAIN, translation_key="not_loaded")
        notifier: Notifier = entries[0].runtime_data.notifier
        if not await notifier.async_send(call.data["kind"], force=True):
            raise ServiceValidationError(translation_domain=DOMAIN, translation_key="no_delivery")

    hass.services.async_register(DOMAIN, SERVICE_TEST, _send_test, schema=_TEST_SCHEMA)
    return True


CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)


async def _async_register_card(hass: HomeAssistant) -> None:
    """Serve la card in sola lettura e la carica nel frontend (una sola volta)."""
    if hass.data.get(_CARD_REGISTERED):
        return
    card = Path(__file__).parent / "frontend" / "garbage-view-card.js"
    await hass.http.async_register_static_paths(
        [StaticPathConfig(CARD_URL, str(card), cache_headers=False)]
    )
    add_extra_js_url(hass, CARD_URL)
    hass.data[_CARD_REGISTERED] = True


async def async_setup_entry(hass: HomeAssistant, entry: GarbageViewConfigEntry) -> bool:
    coordinator = GarbageViewCoordinator(hass, entry)
    await coordinator.async_config_entry_first_refresh()
    coordinator.async_start()
    coordinator.notifier = Notifier(hass, entry)
    entry.runtime_data = coordinator

    await _async_register_card(hass)
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    # Ricalcolo immediato al cambio opzioni (nessun reload completo).
    entry.async_on_unload(entry.add_update_listener(_async_options_updated))
    entry.async_on_unload(coordinator.async_stop)
    entry.async_on_unload(coordinator.notifier.async_stop)
    await coordinator.notifier.async_start()
    return True


async def _async_options_updated(hass: HomeAssistant, entry: GarbageViewConfigEntry) -> None:
    entry.runtime_data.notifier.async_reload()
    await entry.runtime_data.async_refresh()


async def async_unload_entry(hass: HomeAssistant, entry: GarbageViewConfigEntry) -> bool:
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
