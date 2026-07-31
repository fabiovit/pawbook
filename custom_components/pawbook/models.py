from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any
import uuid


def new_id() -> str:
    return uuid.uuid4().hex[:12]


def today_iso() -> str:
    return date.today().isoformat()


def normalize_date(value: Any) -> str | None:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


@dataclass(slots=True)
class PetBookData:
    profile: dict[str, Any]
    weights: list[dict[str, Any]]
    vaccinations: list[dict[str, Any]]
    visits: list[dict[str, Any]]
    treatments: list[dict[str, Any]]
    heat_cycles: list[dict[str, Any]]

    @classmethod
    def empty(cls, profile: dict[str, Any]) -> "PetBookData":
        return cls(
            profile=profile,
            weights=[],
            vaccinations=[],
            visits=[],
            treatments=[],
            heat_cycles=[],
        )

    @classmethod
    def from_dict(cls, data: dict[str, Any], fallback_profile: dict[str, Any]) -> "PetBookData":
        return cls(
            profile={**fallback_profile, **data.get("profile", {})},
            weights=list(data.get("weights", [])),
            vaccinations=list(data.get("vaccinations", [])),
            visits=list(data.get("visits", [])),
            treatments=list(data.get("treatments", [])),
            heat_cycles=list(data.get("heat_cycles", [])),
        )

    def as_dict(self) -> dict[str, Any]:
        return {
            "profile": self.profile,
            "weights": self.weights,
            "vaccinations": self.vaccinations,
            "visits": self.visits,
            "treatments": self.treatments,
            "heat_cycles": self.heat_cycles,
        }
