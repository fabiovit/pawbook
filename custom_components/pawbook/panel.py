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
from .enci import EnciClient, EnciError, normalize_import

PANEL_URL = "pawbook"
PANEL_ELEMENT = "pawbook-panel-v070"
STATIC_URL = "/pawbook_static"


async def async_setup_panel(hass: HomeAssistant) -> None:
    """Register the PawBook sidebar panel and its frontend resource."""
    if hass.data[DOMAIN].get("panel_registered"):
        return

    frontend_path = Path(__file__).parent / "frontend"
    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(
                f"{STATIC_URL}/pawbook-panel-v070.js",
                str(frontend_path / "pawbook-panel-v070.js"),
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
                "js_url": f"{STATIC_URL}/pawbook-panel-v070.js",
            }
        },
        require_admin=False,
    )

    websocket_api.async_register_command(hass, websocket_get_books)
    websocket_api.async_register_command(hass, websocket_enci_search)
    websocket_api.async_register_command(hass, websocket_enci_import)
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
                "enci_data": data.enci_data,
            }
        )

    connection.send_result(msg["id"], books)


def async_unload_panel(hass: HomeAssistant) -> None:
    """Remove the panel when the last PawBook entry is unloaded."""
    if not hass.data.get(DOMAIN, {}).get("panel_registered"):
        return
    async_remove_panel(hass, PANEL_URL)
    hass.data[DOMAIN]["panel_registered"] = False


@websocket_api.websocket_command({
    vol.Required("type"): "pawbook/enci_search",
    vol.Optional("registry", default=""): str,
    vol.Optional("name", default=""): str,
    vol.Optional("microchip", default=""): str,
})
@websocket_api.async_response
async def websocket_enci_search(hass, connection, msg):
    if not any((msg["registry"].strip(), msg["name"].strip(), msg["microchip"].strip())):
        connection.send_error(msg["id"], "invalid_query", "Inserisci ROI/LOI, nome oppure microchip")
        return
    try:
        rows = await EnciClient(hass).search(registry=msg["registry"], name=msg["name"], microchip=msg["microchip"])
    except EnciError as err:
        connection.send_error(msg["id"], "enci_error", str(err))
        return
    connection.send_result(msg["id"], rows)


@websocket_api.websocket_command({
    vol.Required("type"): "pawbook/enci_import",
    vol.Required("entry_id"): str,
    vol.Optional("enci_dog_id", default=""): vol.Any(str, int),
    vol.Optional("registry", default=""): str,
    vol.Optional("microchip", default=""): str,
    vol.Optional("search_row", default={}): dict,
})
@websocket_api.async_response
async def websocket_enci_import(hass, connection, msg):
    coordinator = hass.data.get(DOMAIN, {}).get(msg["entry_id"])
    if coordinator is None or not hasattr(coordinator, "async_import_enci"):
        connection.send_error(msg["id"], "not_found", "Scheda PawBook non trovata")
        return
    try:
        details = await EnciClient(hass).dog_details(
            msg["enci_dog_id"],
            registry=msg["registry"],
            microchip=msg["microchip"],
            search_row=msg["search_row"],
        )
        profile, genealogy, extras = normalize_import(details, msg["enci_dog_id"])
        await coordinator.async_import_enci(profile, genealogy, extras)
    except EnciError as err:
        connection.send_error(msg["id"], "enci_error", str(err))
        return
    connection.send_result(msg["id"], {"profile": profile, "genealogy": genealogy})
