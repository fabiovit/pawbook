from __future__ import annotations

from datetime import date, datetime
from typing import Any

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import UnitOfMass
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .coordinator import PawBookCoordinator
from .entity import PawBookEntity


def parse_date(value: str | None) -> date | None:
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
        AgeSensor(coordinator),
        WeightSensor(coordinator),
        NextVaccinationSensor(coordinator),
        LastVisitSensor(coordinator),
        LastHeatSensor(coordinator),
        ActiveTreatmentsSensor(coordinator),
        HealthSummarySensor(coordinator),
    ])


class AgeSensor(PawBookEntity, SensorEntity):
    _attr_name = "Età"
    _attr_icon = "mdi:cake-variant"

    def __init__(self, coordinator):
        super().__init__(coordinator, "age")

    @property
    def native_value(self) -> str | None:
        born = parse_date(self.coordinator.data.profile.get("birth_date"))
        if not born:
            return None
        today = date.today()
        years = today.year - born.year - ((today.month, today.day) < (born.month, born.day))
        months = (today.year - born.year) * 12 + today.month - born.month
        if today.day < born.day:
            months -= 1
        remaining_months = max(0, months - years * 12)
        return f"{years} anni e {remaining_months} mesi"

    @property
    def extra_state_attributes(self):
        return {"data_nascita": self.coordinator.data.profile.get("birth_date")}


class WeightSensor(PawBookEntity, SensorEntity):
    _attr_name = "Peso"
    _attr_icon = "mdi:scale"
    _attr_native_unit_of_measurement = UnitOfMass.KILOGRAMS
    _attr_suggested_display_precision = 2

    def __init__(self, coordinator):
        super().__init__(coordinator, "weight")

    @property
    def native_value(self):
        records = self.coordinator.data.weights
        return records[-1]["weight"] if records else None

    @property
    def extra_state_attributes(self):
        records = self.coordinator.data.weights
        return {
            "ultima_misurazione": records[-1]["date"] if records else None,
            "storico": records[-20:],
        }


class NextVaccinationSensor(PawBookEntity, SensorEntity):
    _attr_name = "Prossimo vaccino"
    _attr_icon = "mdi:needle"

    def __init__(self, coordinator):
        super().__init__(coordinator, "next_vaccination")

    def _next(self):
        today = date.today()
        valid = [
            v for v in self.coordinator.data.vaccinations
            if parse_date(v.get("expires_on")) and parse_date(v.get("expires_on")) >= today
        ]
        return min(valid, key=lambda v: v["expires_on"]) if valid else None

    @property
    def native_value(self):
        item = self._next()
        return item["expires_on"] if item else None

    @property
    def extra_state_attributes(self):
        item = self._next()
        if not item:
            return {"vaccinazioni": self.coordinator.data.vaccinations}
        expiry = parse_date(item["expires_on"])
        return {
            "nome": item.get("name"),
            "giorni_rimanenti": (expiry - date.today()).days if expiry else None,
            "veterinario": item.get("veterinarian"),
            "lotto": item.get("batch"),
            "vaccinazioni": self.coordinator.data.vaccinations,
        }


class LastVisitSensor(PawBookEntity, SensorEntity):
    _attr_name = "Ultima visita"
    _attr_icon = "mdi:stethoscope"

    def __init__(self, coordinator):
        super().__init__(coordinator, "last_visit")

    @property
    def native_value(self):
        records = sorted(self.coordinator.data.visits, key=lambda x: x.get("date") or "")
        return records[-1]["date"] if records else None

    @property
    def extra_state_attributes(self):
        records = sorted(self.coordinator.data.visits, key=lambda x: x.get("date") or "")
        return records[-1] if records else {}


class LastHeatSensor(PawBookEntity, SensorEntity):
    _attr_name = "Ultimo calore"
    _attr_icon = "mdi:fire"

    def __init__(self, coordinator):
        super().__init__(coordinator, "last_heat")

    @property
    def native_value(self):
        records = sorted(self.coordinator.data.heat_cycles, key=lambda x: x.get("starts_on") or "")
        return records[-1]["starts_on"] if records else None

    @property
    def extra_state_attributes(self):
        records = sorted(self.coordinator.data.heat_cycles, key=lambda x: x.get("starts_on") or "")
        return records[-1] if records else {}


class ActiveTreatmentsSensor(PawBookEntity, SensorEntity):
    _attr_name = "Terapie attive"
    _attr_icon = "mdi:pill-multiple"

    def __init__(self, coordinator):
        super().__init__(coordinator, "active_treatments")

    def active(self):
        today = date.today()
        result = []
        for item in self.coordinator.data.treatments:
            start = parse_date(item.get("starts_on"))
            end = parse_date(item.get("ends_on"))
            if start and start <= today and (end is None or end >= today):
                result.append(item)
        return result

    @property
    def native_value(self):
        return len(self.active())

    @property
    def extra_state_attributes(self):
        return {"terapie": self.active()}


class HealthSummarySensor(PawBookEntity, SensorEntity):
    _attr_name = "Stato sanitario"
    _attr_icon = "mdi:heart-pulse"

    def __init__(self, coordinator):
        super().__init__(coordinator, "health_summary")

    @property
    def native_value(self):
        today = date.today()
        expiries = [
            parse_date(v.get("expires_on"))
            for v in self.coordinator.data.vaccinations
            if parse_date(v.get("expires_on"))
        ]
        if any(expiry < today for expiry in expiries):
            return "attenzione"
        if any(0 <= (expiry - today).days <= 30 for expiry in expiries):
            return "in_scadenza"
        return "regolare"

    @property
    def extra_state_attributes(self):
        profile = self.coordinator.data.profile
        return {
            "nome": profile.get("dog_name"),
            "razza": profile.get("breed"),
            "sesso": profile.get("sex"),
            "microchip": profile.get("microchip"),
            "nome_enci": profile.get("enci_name"),
            "registro_enci": profile.get("enci_registry") or profile.get("roi"),
            "numero_pedigree": profile.get("pedigree_number"),
            "enci_url": profile.get("enci_url"),
            "foto": profile.get("photo_url"),
            "numero_visite": len(self.coordinator.data.visits),
            "numero_vaccinazioni": len(self.coordinator.data.vaccinations),
        }
