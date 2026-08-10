from __future__ import annotations

from datetime import date, timedelta

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



def _median(values):
    if not values:
        return None
    ordered = sorted(values)
    middle = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[middle]
    return round((ordered[middle - 1] + ordered[middle]) / 2)


def _heat_forecast(heat_cycles):
    starts = sorted(parsed for parsed in (parse_date(item.get("starts_on")) for item in heat_cycles) if parsed)
    if len(starts) < 2:
        return None
    intervals = [(starts[index] - starts[index - 1]).days for index in range(1, len(starts))]
    typical = _median(intervals)
    if not typical:
        return None
    center = starts[-1] + timedelta(days=typical)
    deviations = [abs(value - typical) for value in intervals]
    half_window = max(21, min(60, (_median(deviations) or 0) + 21))
    return {"center": center, "from": center - timedelta(days=half_window), "to": center + timedelta(days=half_window)}


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    coordinator: PawBookCoordinator = entry.runtime_data
    async_add_entities([
        VaccinationDueBinarySensor(coordinator),
        TreatmentActiveBinarySensor(coordinator),
        VisitOverdueBinarySensor(coordinator),
        WeightReminderBinarySensor(coordinator),
        HeatWindowBinarySensor(coordinator),
        TreatmentEndingBinarySensor(coordinator),
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


class VisitOverdueBinarySensor(PawBookEntity, BinarySensorEntity):
    _attr_name = "Visita da programmare"
    _attr_icon = "mdi:calendar-alert"
    _attr_device_class = BinarySensorDeviceClass.PROBLEM

    def __init__(self, coordinator):
        super().__init__(coordinator, "visit_overdue")

    @property
    def is_on(self):
        dates = [parse_date(item.get("date")) for item in self.coordinator.data.visits]
        dates = [item for item in dates if item]
        if not dates:
            return True
        return (date.today() - max(dates)).days > 365

    @property
    def extra_state_attributes(self):
        dates = [parse_date(item.get("date")) for item in self.coordinator.data.visits]
        dates = [item for item in dates if item]
        return {"giorni_dall_ultima_visita": (date.today() - max(dates)).days if dates else None}


class WeightReminderBinarySensor(PawBookEntity, BinarySensorEntity):
    _attr_name = "Peso da aggiornare"
    _attr_icon = "mdi:scale-bathroom"
    _attr_device_class = BinarySensorDeviceClass.PROBLEM

    def __init__(self, coordinator):
        super().__init__(coordinator, "weight_reminder")

    @property
    def is_on(self):
        dates = [parse_date(item.get("date")) for item in self.coordinator.data.weights]
        dates = [item for item in dates if item]
        if not dates:
            return True
        return (date.today() - max(dates)).days > 30

    @property
    def extra_state_attributes(self):
        dates = [parse_date(item.get("date")) for item in self.coordinator.data.weights]
        dates = [item for item in dates if item]
        return {"giorni_dall_ultimo_peso": (date.today() - max(dates)).days if dates else None}


class HeatWindowBinarySensor(PawBookEntity, BinarySensorEntity):
    _attr_name = "Finestra prossimo calore"
    _attr_icon = "mdi:flower"
    _attr_device_class = BinarySensorDeviceClass.PROBLEM

    def __init__(self, coordinator):
        super().__init__(coordinator, "heat_window")

    @property
    def is_on(self):
        forecast = _heat_forecast(self.coordinator.data.heat_cycles)
        if not forecast:
            return False
        today = date.today()
        return forecast["from"] <= today <= forecast["to"]

    @property
    def extra_state_attributes(self):
        forecast = _heat_forecast(self.coordinator.data.heat_cycles)
        if not forecast:
            return {"disponibile": False}
        return {
            "disponibile": True,
            "data_stimata": forecast["center"].isoformat(),
            "finestra_da": forecast["from"].isoformat(),
            "finestra_a": forecast["to"].isoformat(),
        }


class TreatmentEndingBinarySensor(PawBookEntity, BinarySensorEntity):
    _attr_name = "Terapia in scadenza"
    _attr_icon = "mdi:pill-off"
    _attr_device_class = BinarySensorDeviceClass.PROBLEM

    def __init__(self, coordinator):
        super().__init__(coordinator, "treatment_ending")

    @property
    def is_on(self):
        today = date.today()
        for item in self.coordinator.data.treatments:
            end = parse_date(item.get("ends_on"))
            if end and 0 <= (end - today).days <= 3:
                return True
        return False

    @property
    def extra_state_attributes(self):
        today = date.today()
        ending = []
        for item in self.coordinator.data.treatments:
            end = parse_date(item.get("ends_on"))
            if end and 0 <= (end - today).days <= 3:
                ending.append({
                    "nome": item.get("name"),
                    "fine": end.isoformat(),
                    "giorni": (end - today).days,
                })
        return {"terapie": ending}


