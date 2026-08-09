from __future__ import annotations

from datetime import date, datetime, timedelta

from homeassistant.components.calendar import CalendarEntity, CalendarEvent
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .coordinator import PawBookCoordinator
from .entity import PawBookEntity


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _events(coordinator: PawBookCoordinator) -> list[CalendarEvent]:
    events: list[CalendarEvent] = []
    dog = coordinator.data.profile.get("dog_name") or coordinator.entry.title

    for item in coordinator.data.vaccinations:
        when = _parse_date(item.get("expires_on"))
        if when:
            events.append(CalendarEvent(
                start=when,
                end=when + timedelta(days=1),
                summary=f"💉 {dog}: richiamo {item.get('name') or 'vaccino'}",
                description=item.get("notes") or item.get("veterinarian") or None,
                uid=f"pawbook-vax-{item.get('id', '')}",
            ))

    for item in coordinator.data.treatments:
        start = _parse_date(item.get("starts_on"))
        end = _parse_date(item.get("ends_on"))
        if start:
            events.append(CalendarEvent(
                start=start,
                end=start + timedelta(days=1),
                summary=f"💊 {dog}: inizio {item.get('name') or 'terapia'}",
                description=" · ".join(x for x in (item.get("dosage"), item.get("frequency"), item.get("notes")) if x) or None,
                uid=f"pawbook-treatment-start-{item.get('id', '')}",
            ))
        if end:
            events.append(CalendarEvent(
                start=end,
                end=end + timedelta(days=1),
                summary=f"💊 {dog}: fine {item.get('name') or 'terapia'}",
                description=item.get("notes") or None,
                uid=f"pawbook-treatment-end-{item.get('id', '')}",
            ))

    return sorted(events, key=lambda event: event.start)


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    coordinator: PawBookCoordinator = entry.runtime_data
    async_add_entities([PawBookHealthCalendar(coordinator)])


class PawBookHealthCalendar(PawBookEntity, CalendarEntity):
    _attr_name = "Calendario salute"
    _attr_icon = "mdi:calendar-heart"

    def __init__(self, coordinator: PawBookCoordinator) -> None:
        super().__init__(coordinator, "health_calendar")

    @property
    def event(self) -> CalendarEvent | None:
        today = date.today()
        for event in _events(self.coordinator):
            if event.end >= today:
                return event
        return None

    async def async_get_events(
        self,
        hass: HomeAssistant,
        start_date: datetime,
        end_date: datetime,
    ) -> list[CalendarEvent]:
        start = start_date.date()
        end = end_date.date()
        return [event for event in _events(self.coordinator) if event.end > start and event.start < end]
