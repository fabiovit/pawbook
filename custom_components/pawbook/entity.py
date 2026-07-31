from __future__ import annotations

from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import PawBookCoordinator


class PawBookEntity(CoordinatorEntity[PawBookCoordinator]):
    _attr_has_entity_name = True

    def __init__(self, coordinator: PawBookCoordinator, key: str) -> None:
        super().__init__(coordinator)
        self._key = key
        self._attr_unique_id = f"{coordinator.entry.entry_id}_{key}"

    @property
    def device_info(self) -> DeviceInfo:
        profile = self.coordinator.data.profile
        return DeviceInfo(
            identifiers={(DOMAIN, self.coordinator.entry.entry_id)},
            name=profile.get("dog_name", self.coordinator.entry.title),
            manufacturer="PawBook",
            model=profile.get("breed") or "Cane",
            configuration_url=profile.get("enci_url") or None,
        )
