from __future__ import annotations

from datetime import date
import math
import json
import voluptuous as vol

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.event import async_track_state_change_event

from .const import *
from .coordinator import PawBookCoordinator
from .panel import async_setup_panel, async_unload_panel

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

type PawBookConfigEntry = ConfigEntry[PawBookCoordinator]


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    hass.data.setdefault(DOMAIN, {})

    async def get_coordinator(call: ServiceCall) -> PawBookCoordinator:
        dog_id = call.data["dog_id"]
        for coordinator in hass.data[DOMAIN].values():
            # The domain dictionary also contains panel metadata, such as
            # ``panel_registered``. Only PawBook coordinators have pet data.
            if not isinstance(coordinator, PawBookCoordinator):
                continue

            profile = coordinator.data.profile
            if dog_id in (
                coordinator.entry.entry_id,
                profile.get("microchip"),
                profile.get("dog_name"),
            ):
                return coordinator
        raise HomeAssistantError(f"Cane non trovato: {dog_id}")

    async def add_weight(call: ServiceCall) -> None:
        c = await get_coordinator(call)
        await c.async_add_weight(
            call.data["weight"], call.data.get("date") or date.today(),
            call.data.get("notes")
        )

    async def add_vaccination(call: ServiceCall) -> None:
        c = await get_coordinator(call)
        await c.async_add_vaccination(
            call.data["name"], call.data["administered_on"],
            call.data.get("expires_on"), call.data.get("veterinarian"),
            call.data.get("batch"), call.data.get("notes")
        )

    async def add_visit(call: ServiceCall) -> None:
        c = await get_coordinator(call)
        await c.async_add_visit(
            call.data["date"], call.data["reason"], call.data.get("veterinarian"),
            call.data.get("outcome"), call.data.get("notes")
        )

    async def add_treatment(call: ServiceCall) -> None:
        c = await get_coordinator(call)
        await c.async_add_treatment(
            call.data["name"], call.data["starts_on"], call.data.get("ends_on"),
            call.data.get("dosage"), call.data.get("frequency"), call.data.get("notes")
        )

    async def add_heat(call: ServiceCall) -> None:
        c = await get_coordinator(call)
        await c.async_add_heat(
            call.data["starts_on"], call.data.get("ends_on"), call.data.get("notes")
        )

    async def set_profile(call: ServiceCall) -> None:
        c = await get_coordinator(call)
        updates = dict(call.data)
        updates.pop("dog_id", None)
        await c.async_set_profile(updates)


    async def import_genealogy(call: ServiceCall) -> None:
        c = await get_coordinator(call)
        raw = call.data["genealogy_json"]
        try:
            genealogy = json.loads(raw)
        except json.JSONDecodeError as err:
            raise HomeAssistantError(f"JSON genealogia non valido: {err}") from err

        if not isinstance(genealogy, dict):
            raise HomeAssistantError("La genealogia deve essere un oggetto JSON.")

        await c.async_import_genealogy(genealogy)

    async def clear_genealogy(call: ServiceCall) -> None:
        c = await get_coordinator(call)
        await c.async_clear_genealogy()


    async def update_record(call: ServiceCall) -> None:
        c = await get_coordinator(call)
        updates = dict(call.data)
        updates.pop("dog_id", None)
        category = updates.pop("category")
        record_id = updates.pop("record_id")

        for key in (
            "date",
            "administered_on",
            "expires_on",
            "starts_on",
            "ends_on",
        ):
            if key in updates and updates[key] is not None:
                updates[key] = updates[key].isoformat()

        if "weight" in updates:
            updates["weight"] = float(updates["weight"])

        changed = await c.async_update_record(category, record_id, updates)
        if not changed:
            raise HomeAssistantError("Record non trovato oppure categoria non valida")

    async def delete_record(call: ServiceCall) -> None:
        c = await get_coordinator(call)
        changed = await c.async_delete_record(call.data["category"], call.data["record_id"])
        if not changed:
            raise HomeAssistantError("Record non trovato oppure categoria non valida")

    service_defs = {
        SERVICE_ADD_WEIGHT: (add_weight, vol.Schema({
            vol.Required("dog_id"): cv.string,
            vol.Required("weight"): vol.Coerce(float),
            vol.Optional("date"): cv.date,
            vol.Optional("notes"): cv.string,
        })),
        SERVICE_ADD_VACCINATION: (add_vaccination, vol.Schema({
            vol.Required("dog_id"): cv.string,
            vol.Required("name"): cv.string,
            vol.Required("administered_on"): cv.date,
            vol.Optional("expires_on"): cv.date,
            vol.Optional("veterinarian"): cv.string,
            vol.Optional("batch"): cv.string,
            vol.Optional("notes"): cv.string,
        })),
        SERVICE_ADD_VISIT: (add_visit, vol.Schema({
            vol.Required("dog_id"): cv.string,
            vol.Required("date"): cv.date,
            vol.Required("reason"): cv.string,
            vol.Optional("veterinarian"): cv.string,
            vol.Optional("outcome"): cv.string,
            vol.Optional("notes"): cv.string,
        })),
        SERVICE_ADD_TREATMENT: (add_treatment, vol.Schema({
            vol.Required("dog_id"): cv.string,
            vol.Required("name"): cv.string,
            vol.Required("starts_on"): cv.date,
            vol.Optional("ends_on"): cv.date,
            vol.Optional("dosage"): cv.string,
            vol.Optional("frequency"): cv.string,
            vol.Optional("notes"): cv.string,
        })),
        SERVICE_ADD_HEAT: (add_heat, vol.Schema({
            vol.Required("dog_id"): cv.string,
            vol.Required("starts_on"): cv.date,
            vol.Optional("ends_on"): cv.date,
            vol.Optional("notes"): cv.string,
        })),
        SERVICE_SET_PROFILE: (set_profile, vol.Schema({
            vol.Required("dog_id"): cv.string,
            vol.Optional("breed"): cv.string,
            vol.Optional("color"): cv.string,
            vol.Optional("microchip"): cv.string,
            vol.Optional("veterinarian"): cv.string,
            vol.Optional("enci_name"): cv.string,
            vol.Optional("enci_registry"): cv.string,
            vol.Optional("pedigree_number"): cv.string,
            vol.Optional("roi"): cv.string,
            vol.Optional("enci_url"): cv.string,
            vol.Optional("photo_url"): cv.string,
            vol.Optional("father"): cv.string,
            vol.Optional("mother"): cv.string,
            vol.Optional("breeder"): cv.string,
        })),

        SERVICE_IMPORT_GENEALOGY: (import_genealogy, vol.Schema({
            vol.Required("dog_id"): cv.string,
            vol.Required("genealogy_json"): cv.string,
        })),
        SERVICE_CLEAR_GENEALOGY: (clear_genealogy, vol.Schema({
            vol.Required("dog_id"): cv.string,
        })),

        SERVICE_UPDATE_RECORD: (update_record, vol.Schema({
            vol.Required("dog_id"): cv.string,
            vol.Required("category"): vol.In(
                ["weights", "vaccinations", "visits", "treatments", "heat_cycles"]
            ),
            vol.Required("record_id"): cv.string,
            vol.Optional("weight"): vol.Coerce(float),
            vol.Optional("date"): cv.date,
            vol.Optional("name"): cv.string,
            vol.Optional("administered_on"): cv.date,
            vol.Optional("expires_on"): cv.date,
            vol.Optional("veterinarian"): cv.string,
            vol.Optional("batch"): cv.string,
            vol.Optional("reason"): cv.string,
            vol.Optional("outcome"): cv.string,
            vol.Optional("starts_on"): cv.date,
            vol.Optional("ends_on"): cv.date,
            vol.Optional("dosage"): cv.string,
            vol.Optional("frequency"): cv.string,
            vol.Optional("notes"): cv.string,
        })),
        SERVICE_DELETE_RECORD: (delete_record, vol.Schema({
            vol.Required("dog_id"): cv.string,
            vol.Required("category"): vol.In(
                ["weights", "vaccinations", "visits", "treatments", "heat_cycles"]
            ),
            vol.Required("record_id"): cv.string,
        })),
    }

    for name, (handler, schema) in service_defs.items():
        if not hass.services.has_service(DOMAIN, name):
            hass.services.async_register(DOMAIN, name, handler, schema=schema)

    return True


async def _async_reload_entry(hass: HomeAssistant, entry: PawBookConfigEntry) -> None:
    """Reload PawBook when options (including the automatic weight sensor) change."""
    await hass.config_entries.async_reload(entry.entry_id)


def _weight_to_kg(raw_value: str, unit: str | None) -> float | None:
    """Convert a Home Assistant weight sensor value to kilograms."""
    try:
        value = float(raw_value)
    except (TypeError, ValueError):
        return None

    if not math.isfinite(value) or value <= 0:
        return None

    normalized_unit = (unit or "kg").strip().lower()
    if normalized_unit in {"lb", "lbs", "pound", "pounds"}:
        value *= 0.45359237
    elif normalized_unit not in {"kg", "kilogram", "kilograms", ""}:
        return None

    return round(value, 3)


async def async_setup_entry(hass: HomeAssistant, entry: PawBookConfigEntry) -> bool:
    coordinator = PawBookCoordinator(hass, entry)
    await coordinator.async_initialize()
    await async_setup_panel(hass)
    entry.runtime_data = coordinator
    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = coordinator

    weight_sensor = entry.options.get(CONF_WEIGHT_SENSOR, "")
    if weight_sensor:
        async def _handle_weight_state(event) -> None:
            old_state = event.data.get("old_state")
            new_state = event.data.get("new_state")
            if new_state is None:
                return

            raw_state = new_state.state
            if raw_state in {"unknown", "unavailable", "none", ""}:
                return
            if old_state is not None and old_state.state == raw_state:
                return

            weight_kg = _weight_to_kg(
                raw_state,
                new_state.attributes.get("unit_of_measurement"),
            )
            if weight_kg is None:
                return

            await coordinator.async_add_automatic_weight(
                weight_kg,
                date.today(),
                weight_sensor,
                new_state.attributes.get("friendly_name"),
            )

        entry.async_on_unload(
            async_track_state_change_event(hass, [weight_sensor], _handle_weight_state)
        )

    entry.async_on_unload(entry.add_update_listener(_async_reload_entry))
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: PawBookConfigEntry) -> bool:
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unloaded:
        hass.data[DOMAIN].pop(entry.entry_id, None)
        remaining = [
            key for key in hass.data.get(DOMAIN, {})
            if key != "panel_registered"
        ]
        if not remaining:
            async_unload_panel(hass)
    return unloaded
