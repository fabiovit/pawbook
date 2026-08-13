from __future__ import annotations

from pathlib import Path

from homeassistant.components import websocket_api
from homeassistant.components.frontend import (
    async_register_built_in_panel,
    async_remove_panel,
)
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant

from .const import DOMAIN
from .panel import (
    websocket_add_attachment,
    websocket_delete_attachment,
    websocket_enci_import,
    websocket_enci_search,
    websocket_export_backup,
    websocket_get_books,
    websocket_import_backup,
    websocket_set_photo,
)

PANEL_URL = "pawbook"
PANEL_ELEMENT = "pawbook-panel-v650"
STATIC_URL = "/pawbook_static"


async def async_setup_panel(hass: HomeAssistant) -> None:
    """Register PawBook 6.5 panel while preserving the 6.4 base frontend."""
    if hass.data[DOMAIN].get("panel_registered"):
        return

    frontend_path = Path(__file__).parent / "frontend"
    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(
                f"{STATIC_URL}/pawbook-panel-v640.js",
                str(frontend_path / "pawbook-panel-v640.js"),
                False,
            ),
            StaticPathConfig(
                f"{STATIC_URL}/pawbook-panel-v650.js",
                str(frontend_path / "pawbook-panel-v650.js"),
                False,
            ),
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
                "js_url": f"{STATIC_URL}/pawbook-panel-v650.js",
            }
        },
        require_admin=False,
    )

    websocket_api.async_register_command(hass, websocket_get_books)
    websocket_api.async_register_command(hass, websocket_enci_search)
    websocket_api.async_register_command(hass, websocket_enci_import)
    websocket_api.async_register_command(hass, websocket_set_photo)
    websocket_api.async_register_command(hass, websocket_export_backup)
    websocket_api.async_register_command(hass, websocket_import_backup)
    websocket_api.async_register_command(hass, websocket_add_attachment)
    websocket_api.async_register_command(hass, websocket_delete_attachment)
    hass.data[DOMAIN]["panel_registered"] = True


def async_unload_panel(hass: HomeAssistant) -> None:
    """Remove the PawBook panel when the last entry is unloaded."""
    if not hass.data.get(DOMAIN, {}).get("panel_registered"):
        return
    async_remove_panel(hass, PANEL_URL)
    hass.data[DOMAIN]["panel_registered"] = False
