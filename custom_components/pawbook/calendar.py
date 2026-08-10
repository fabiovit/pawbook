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



def _median(values: list[int]) -> int | None:
    if not values:
        return None
    ordered = sorted(values)
    middle = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[middle]
    return round((ordered[middle - 1] + ordered[middle]) / 2)


def _heat_forecast(heat_cycles):
    starts = sorted(parsed for parsed in (_parse_date(item.get("starts_on")) for item in heat_cycles) if parsed)
    if len(starts) < 2:
        return None
    intervals = [(starts[index] - starts[index - 1]).days for index in range(1, len(starts))]
    typical = _median(intervals)
    if not typical:
        return None
    center = starts[-1] + timedelta(days=typical)
    deviations = [abs(value - typical) for value in intervals]
    half_window = max(21, min(60, (_median(deviations) or 0) + 21))
    return center, center - timedelta(days=half_window), center + timedelta(days=half_window)


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


    heat = _heat_forecast(coordinator.data.heat_cycles)
    if heat:
        center, window_from, window_to = heat
        events.append(CalendarEvent(
            start=window_from,
            end=window_to + timedelta(days=1),
            summary=f"🌸 {dog}: finestra stimata prossimo calore",
            description=f"Data centrale stimata: {center.isoformat()}. Proiezione statistica basata sullo storico PawBook.",
            uid=f"pawbook-heat-window-{center.isoformat()}",
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
