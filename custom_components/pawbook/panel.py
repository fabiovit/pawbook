from __future__ import annotations

from pathlib import Path
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.components.frontend import (
    async_register_built_in_panel,
    async_remove_panel,
)
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant, callback

from .const import DOMAIN

PANEL_URL = "pawbook"
PANEL_ELEMENT = "pawbook-panel"
STATIC_URL = "/pawbook_static"


async def async_setup_panel(hass: HomeAssistant) -> None:
    """Register the PawBook sidebar panel and its frontend resource."""
    if hass.data[DOMAIN].get("panel_registered"):
        return

    frontend_path = Path(__file__).parent / "frontend"
    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(
                f"{STATIC_URL}/pawbook-panel.js",
                str(frontend_path / "pawbook-panel.js"),
                False,
            )
        ]
    )

    async_register_built_in_panel(
        hass,
        component_name="custom",
        sidebar_title="PawBook",
        sidebar_icon="mdi:paw",
        frontend_url_path=PANEL_URL,
        config={
            "_panel_custom": {
                "name": PANEL_ELEMENT,
                "embed_iframe": False,
                "trust_external": False,
                "js_url": f"{STATIC_URL}/pawbook-panel.js?v=0.6.1",
            }
        },
        require_admin=False,
    )

    websocket_api.async_register_command(hass, websocket_get_books)
    hass.data[DOMAIN]["panel_registered"] = True


@callback
@websocket_api.websocket_command(
    {vol.Required("type"): "pawbook/get_books"}
)
def websocket_get_books(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return every PawBook entry and its locally stored data."""
    books: list[dict[str, Any]] = []

    for entry_id, coordinator in hass.data.get(DOMAIN, {}).items():
        if entry_id == "panel_registered":
            continue
        if not hasattr(coordinator, "data"):
            continue

        data = coordinator.data
        books.append(
            {
                "entry_id": entry_id,
                "title": coordinator.entry.title,
                "profile": data.profile,
                "weights": data.weights,
                "vaccinations": data.vaccinations,
                "visits": data.visits,
                "treatments": data.treatments,
                "heat_cycles": data.heat_cycles,
                "genealogy": data.genealogy,
            }
        )

    connection.send_result(msg["id"], books)


def async_unload_panel(hass: HomeAssistant) -> None:
    """Remove the panel when the last PawBook entry is unloaded."""
    if not hass.data.get(DOMAIN, {}).get("panel_registered"):
        return
    async_remove_panel(hass, PANEL_URL)
    hass.data[DOMAIN]["panel_registered"] = False
