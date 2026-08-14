from __future__ import annotations

from datetime import date, datetime, timedelta
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



def _median(values: list[int]) -> int | None:
    if not values:
        return None
    ordered = sorted(values)
    middle = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[middle]
    return round((ordered[middle - 1] + ordered[middle]) / 2)


def heat_forecast(heat_cycles: list[dict[str, Any]]) -> dict[str, Any] | None:
    starts = sorted(
        parsed for parsed in (parse_date(item.get("starts_on")) for item in heat_cycles)
        if parsed
    )
    if len(starts) < 2:
        return None

    intervals = [(starts[index] - starts[index - 1]).days for index in range(1, len(starts))]
    typical = _median(intervals)
    if not typical:
        return None

    center = starts[-1] + timedelta(days=typical)
    deviations = [abs(value - typical) for value in intervals]
    observed_spread = _median(deviations) or 0
    half_window = max(21, min(60, observed_spread + 21))

    confidence = "buona" if len(intervals) >= 4 else "indicativa" if len(intervals) >= 2 else "limitata"
    return {
        "estimated_date": center,
        "window_from": center - timedelta(days=half_window),
        "window_to": center + timedelta(days=half_window),
        "median_interval_days": typical,
        "confidence": confidence,
        "cycles_used": len(starts),
    }


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
        SmartHealthSensor(coordinator),
        DaysToVaccinationSensor(coordinator),
        DaysSinceVisitSensor(coordinator),
        NextHeatEstimateSensor(coordinator),
        DaysToNextHeatSensor(coordinator),
        GenealogySensor(coordinator),
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
            "numero_visite": len(self.coordinator.data.visits),
            "numero_vaccinazioni": len(self.coordinator.data.vaccinations),
        }


def _count_ancestors(node):
    if not isinstance(node, dict):
        return 0
    count = 1 if node.get("name") else 0
    count += _count_ancestors(node.get("father"))
    count += _count_ancestors(node.get("mother"))
    return count



class NextHeatEstimateSensor(PawBookEntity, SensorEntity):
    _attr_name = "Prossimo calore stimato"
    _attr_icon = "mdi:flower-pollen"

    def __init__(self, coordinator):
        super().__init__(coordinator, "next_heat_estimate")

    @property
    def native_value(self):
        forecast = heat_forecast(self.coordinator.data.heat_cycles)
        return forecast["estimated_date"].isoformat() if forecast else None

    @property
    def extra_state_attributes(self):
        forecast = heat_forecast(self.coordinator.data.heat_cycles)
        if not forecast:
            return {"disponibile": False}
        return {
            "disponibile": True,
            "finestra_da": forecast["window_from"].isoformat(),
            "finestra_a": forecast["window_to"].isoformat(),
            "intervallo_mediano_giorni": forecast["median_interval_days"],
            "affidabilita": forecast["confidence"],
            "cicli_usati": forecast["cycles_used"],
            "nota": "Stima statistica basata sullo storico registrato; non è una previsione veterinaria.",
        }


class DaysToNextHeatSensor(PawBookEntity, SensorEntity):
    _attr_name = "Giorni al prossimo calore stimato"
    _attr_icon = "mdi:calendar-heart"
    _attr_native_unit_of_measurement = "d"

    def __init__(self, coordinator):
        super().__init__(coordinator, "days_to_next_heat")

    @property
    def native_value(self):
        forecast = heat_forecast(self.coordinator.data.heat_cycles)
        return (forecast["estimated_date"] - date.today()).days if forecast else None


class GenealogySensor(PawBookEntity, SensorEntity):
    _attr_name = "Genealogia"
    _attr_icon = "mdi:family-tree"

    def __init__(self, coordinator):
        super().__init__(coordinator, "genealogy")

    @property
    def native_value(self):
        tree = self.coordinator.data.genealogy
        if not tree:
            return "non_importata"
        return f"{_count_ancestors(tree)} soggetti"

    @property
    def extra_state_attributes(self):
        tree = self.coordinator.data.genealogy
        return {
            "nome": tree.get("name") if isinstance(tree, dict) else None,
            "padre": (
                tree.get("father", {}).get("name")
                if isinstance(tree, dict) and isinstance(tree.get("father"), dict)
                else None
            ),
            "madre": (
                tree.get("mother", {}).get("name")
                if isinstance(tree, dict) and isinstance(tree.get("mother"), dict)
                else None
            ),
            "soggetti_totali": _count_ancestors(tree),
            "fonte": "ENCI/manuale",
        }


class SmartHealthSensor(PawBookEntity, SensorEntity):
    _attr_name = "Smart Health"
    _attr_icon = "mdi:heart-pulse"

    def __init__(self, coordinator):
        super().__init__(coordinator, "smart_health")

    @property
    def native_value(self):
        today = date.today()
        issues = []
        future_vax = []
        for item in self.coordinator.data.vaccinations:
            expiry = parse_date(item.get("expires_on"))
            if expiry:
                future_vax.append((expiry, item))
                if expiry < today:
                    issues.append("vaccino_scaduto")
        visits = [parse_date(x.get("date")) for x in self.coordinator.data.visits]
        visits = [x for x in visits if x]
        if visits and (today - max(visits)).days > 365:
            issues.append("visita_oltre_12_mesi")
        if not visits:
            issues.append("nessuna_visita")
        if issues:
            return "attenzione"
        if future_vax and min(x[0] for x in future_vax) <= today + __import__('datetime').timedelta(days=30):
            return "promemoria"
        return "ok"

    @property
    def extra_state_attributes(self):
        today = date.today()
        vaccinations = []
        for item in self.coordinator.data.vaccinations:
            expiry = parse_date(item.get("expires_on"))
            if expiry:
                vaccinations.append({"nome": item.get("name"), "data": expiry.isoformat(), "giorni": (expiry - today).days})
        vaccinations.sort(key=lambda x: x["data"])
        visits = [parse_date(x.get("date")) for x in self.coordinator.data.visits]
        visits = [x for x in visits if x]
        weights = sorted(self.coordinator.data.weights, key=lambda x: x.get("date") or "")
        return {
            "prossimo_vaccino": vaccinations[0] if vaccinations else None,
            "giorni_dall_ultima_visita": (today - max(visits)).days if visits else None,
            "ultimo_peso": weights[-1].get("weight") if weights else None,
            "terapie_attive": [x.get("name") for x in self.coordinator.data.treatments if (parse_date(x.get("starts_on")) or today) <= today and (parse_date(x.get("ends_on")) is None or parse_date(x.get("ends_on")) >= today)],
        }


class DaysToVaccinationSensor(PawBookEntity, SensorEntity):
    _attr_name = "Giorni al prossimo vaccino"
    _attr_icon = "mdi:calendar-clock"
    _attr_native_unit_of_measurement = "d"

    def __init__(self, coordinator):
        super().__init__(coordinator, "days_to_vaccination")

    @property
    def native_value(self):
        today = date.today()
        dates = [parse_date(x.get("expires_on")) for x in self.coordinator.data.vaccinations]
        dates = sorted(x for x in dates if x and x >= today)
        return (dates[0] - today).days if dates else None


class DaysSinceVisitSensor(PawBookEntity, SensorEntity):
    _attr_name = "Giorni dall'ultima visita"
    _attr_icon = "mdi:doctor"
    _attr_native_unit_of_measurement = "d"

    def __init__(self, coordinator):
        super().__init__(coordinator, "days_since_visit")

    @property
    def native_value(self):
        today = date.today()
        dates = [parse_date(x.get("date")) for x in self.coordinator.data.visits]
        dates = [x for x in dates if x]
        return (today - max(dates)).days if dates else None
