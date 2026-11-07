"""sensor.garbage_view_schedule (CONTRACT.md §2)."""
from __future__ import annotations

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import GarbageViewCoordinator


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    async_add_entities([GarbageViewSensor(entry.runtime_data, entry)])


class GarbageViewSensor(CoordinatorEntity[GarbageViewCoordinator], SensorEntity):
    """Stato = numero di tipi da buttare oggi; attributi = contratto JSON."""

    _attr_has_entity_name = False
    _attr_name = "Garbage View Schedule"
    _attr_icon = "mdi:trash-can-outline"
    _attr_native_unit_of_measurement = None

    def __init__(self, coordinator: GarbageViewCoordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{entry.entry_id}_schedule"
        self.entity_id = f"sensor.{DOMAIN}_schedule"

    @property
    def native_value(self) -> int:
        return len(self.coordinator.data["today_items"])

    @property
    def extra_state_attributes(self) -> dict:
        return self.coordinator.data
