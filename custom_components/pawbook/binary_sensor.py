from __future__ import annotations

from datetime import date

from homeassistant.components.binary_sensor import BinarySensorEntity, BinarySensorDeviceClass
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .coordinator import PawBookCoordinator
from .entity import PawBookEntity


def parse_date(value):
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    coordinator: PawBookCoordinator = entry.runtime_data
    async_add_entities([
        VaccinationDueBinarySensor(coordinator),
        TreatmentActiveBinarySensor(coordinator),
    ])


class VaccinationDueBinarySensor(PawBookEntity, BinarySensorEntity):
    _attr_name = "Vaccino in scadenza"
    _attr_icon = "mdi:needle"
    _attr_device_class = BinarySensorDeviceClass.PROBLEM

    def __init__(self, coordinator):
        super().__init__(coordinator, "vaccination_due")

    @property
    def is_on(self):
        today = date.today()
        for item in self.coordinator.data.vaccinations:
            expiry = parse_date(item.get("expires_on"))
            if expiry and (expiry - today).days <= 30:
                return True
        return False


class TreatmentActiveBinarySensor(PawBookEntity, BinarySensorEntity):
    _attr_name = "Terapia attiva"
    _attr_icon = "mdi:pill"

    def __init__(self, coordinator):
        super().__init__(coordinator, "treatment_active")

    @property
    def is_on(self):
        today = date.today()
        for item in self.coordinator.data.treatments:
            start = parse_date(item.get("starts_on"))
            end = parse_date(item.get("ends_on"))
            if start and start <= today and (end is None or end >= today):
                return True
        return False
