from __future__ import annotations

from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.storage import Store
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator

from .const import DOMAIN, STORAGE_KEY_PREFIX, STORAGE_VERSION
from .models import PetBookData, new_id, normalize_date


class PawBookCoordinator(DataUpdateCoordinator[PetBookData]):
    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        super().__init__(
            hass,
            logger=__import__("logging").getLogger(__name__),
            name=f"{DOMAIN}_{entry.entry_id}",
            update_interval=None,
        )
        self.entry = entry
        self.store: Store[dict[str, Any]] = Store(
            hass, STORAGE_VERSION, f"{STORAGE_KEY_PREFIX}.{entry.entry_id}"
        )

    async def async_initialize(self) -> None:
        stored = await self.store.async_load()
        profile = {**self.entry.data, **self.entry.options}
        data = PetBookData.from_dict(stored or {}, profile)

        # Records created by early PawBook versions did not always have an ID.
        # Add one automatically so they can be edited and deleted from the panel.
        migrated = False
        for category in (
            "weights",
            "vaccinations",
            "visits",
            "treatments",
            "heat_cycles",
            "attachments",
        ):
            for item in getattr(data, category):
                if not item.get("id"):
                    item["id"] = new_id()
                    migrated = True

        self.async_set_updated_data(data)

        if migrated:
            await self.store.async_save(data.as_dict())

    async def _save(self) -> None:
        await self.store.async_save(self.data.as_dict())
        self.async_set_updated_data(self.data)

    async def async_add_weight(self, weight: float, record_date: Any, notes: str | None) -> str:
        record_id = new_id()
        self.data.weights.append({
            "id": record_id,
            "date": normalize_date(record_date),
            "weight": float(weight),
            "notes": notes or "",
        })
        self.data.weights.sort(key=lambda item: item.get("date") or "")
        await self._save()
        return record_id


    async def async_add_automatic_weight(
        self,
        weight: float,
        record_date: Any,
        source_entity: str,
        source_name: str | None = None,
    ) -> str | None:
        """Add a weight from a configured HA sensor, avoiding same-day duplicates."""
        normalized_date = normalize_date(record_date)
        numeric_weight = round(float(weight), 3)

        for item in reversed(self.data.weights):
            if (
                item.get("date") == normalized_date
                and item.get("source_entity") == source_entity
                and abs(float(item.get("weight", 0)) - numeric_weight) < 0.001
            ):
                return None

        record_id = new_id()
        self.data.weights.append({
            "id": record_id,
            "date": normalized_date,
            "weight": numeric_weight,
            "notes": "",
            "source": "automatic",
            "source_entity": source_entity,
            "source_name": source_name or source_entity,
        })
        self.data.weights.sort(key=lambda item: item.get("date") or "")
        await self._save()
        return record_id

    async def async_add_vaccination(
        self, name: str, administered_on: Any, expires_on: Any,
        veterinarian: str | None, batch: str | None, notes: str | None
    ) -> str:
        record_id = new_id()
        self.data.vaccinations.append({
            "id": record_id,
            "name": name,
            "administered_on": normalize_date(administered_on),
            "expires_on": normalize_date(expires_on),
            "veterinarian": veterinarian or "",
            "batch": batch or "",
            "notes": notes or "",
        })
        await self._save()
        return record_id

    async def async_add_visit(
        self, visit_date: Any, reason: str, veterinarian: str | None,
        outcome: str | None, notes: str | None
    ) -> str:
        record_id = new_id()
        self.data.visits.append({
            "id": record_id,
            "date": normalize_date(visit_date),
            "reason": reason,
            "veterinarian": veterinarian or "",
            "outcome": outcome or "",
            "notes": notes or "",
        })
        await self._save()
        return record_id

    async def async_add_treatment(
        self, name: str, starts_on: Any, ends_on: Any,
        dosage: str | None, frequency: str | None, notes: str | None
    ) -> str:
        record_id = new_id()
        self.data.treatments.append({
            "id": record_id,
            "name": name,
            "starts_on": normalize_date(starts_on),
            "ends_on": normalize_date(ends_on),
            "dosage": dosage or "",
            "frequency": frequency or "",
            "notes": notes or "",
        })
        await self._save()
        return record_id

    async def async_add_heat(
        self, starts_on: Any, ends_on: Any, notes: str | None
    ) -> str:
        record_id = new_id()
        self.data.heat_cycles.append({
            "id": record_id,
            "starts_on": normalize_date(starts_on),
            "ends_on": normalize_date(ends_on),
            "notes": notes or "",
        })
        await self._save()
        return record_id

    async def async_set_profile(self, updates: dict[str, Any]) -> None:
        self.data.profile.update({k: v for k, v in updates.items() if v is not None})
        await self._save()


    async def async_import_genealogy(self, genealogy: dict[str, Any]) -> None:
        self.data.genealogy = genealogy
        await self._save()

    async def async_clear_genealogy(self) -> None:
        self.data.genealogy = {}
        await self._save()

    async def async_import_enci(self, profile: dict[str, Any], genealogy: dict[str, Any], extras: dict[str, Any]) -> None:
        self.data.profile.update(profile)
        self.data.genealogy = genealogy
        self.data.enci_data = extras
        await self._save()


    async def async_update_record(
        self,
        category: str,
        record_id: str,
        updates: dict[str, Any],
    ) -> bool:
        allowed = {"weights", "vaccinations", "visits", "treatments", "heat_cycles"}
        if category not in allowed:
            return False

        records = getattr(self.data, category)
        for item in records:
            if item.get("id") == record_id:
                item.update({key: value for key, value in updates.items() if value is not None})
                await self._save()
                return True
        return False

    async def async_delete_record(self, category: str, record_id: str) -> bool:
        allowed = {"weights", "vaccinations", "visits", "treatments", "heat_cycles"}
        if category not in allowed:
            return False
        records = getattr(self.data, category)
        before = len(records)
        records[:] = [item for item in records if item.get("id") != record_id]
        changed = len(records) != before
        if changed:
            await self._save()
        return changed


    async def async_add_attachment(
        self, name: str, mime_type: str, data: str, category: str = "general", record_id: str = ""
    ) -> str:
        """Store a small local document or image attachment."""
        attachment_id = new_id()
        self.data.attachments.append({
            "id": attachment_id,
            "name": name,
            "mime_type": mime_type,
            "data": data,
            "category": category or "general",
            "record_id": record_id or "",
        })
        await self._save()
        return attachment_id

    async def async_delete_attachment(self, attachment_id: str) -> bool:
        before = len(self.data.attachments)
        self.data.attachments[:] = [item for item in self.data.attachments if item.get("id") != attachment_id]
        changed = len(self.data.attachments) != before
        if changed:
            await self._save()
        return changed

    def export_backup(self) -> dict[str, Any]:
        """Return a portable PawBook backup payload for this pet."""
        return {
            "format": "pawbook-backup",
            "version": 3,
            "entry_title": self.entry.title,
            "data": self.data.as_dict(),
        }

    async def async_restore_backup(self, payload: dict[str, Any]) -> None:
        """Restore PawBook data from a validated portable backup payload."""
        if payload.get("format") != "pawbook-backup":
            raise ValueError("Formato backup PawBook non valido")
        raw = payload.get("data")
        if not isinstance(raw, dict):
            raise ValueError("Il backup non contiene dati PawBook validi")

        restored = PetBookData.from_dict(raw, self.data.profile)
        for category in ("weights", "vaccinations", "visits", "treatments", "heat_cycles", "attachments"):
            records = getattr(restored, category)
            if not isinstance(records, list):
                raise ValueError(f"Sezione backup non valida: {category}")
            for item in records:
                if not isinstance(item, dict):
                    raise ValueError(f"Record backup non valido: {category}")
                if not item.get("id"):
                    item["id"] = new_id()

        self.data = restored
        await self._save()
