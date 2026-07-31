from __future__ import annotations

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.data_entry_flow import FlowResult
from homeassistant.helpers import selector

from .const import (
    CONF_BIRTH_DATE,
    CONF_BREED,
    CONF_DOG_NAME,
    CONF_ENCI_NAME,
    CONF_ENCI_REGISTRY,
    CONF_ENCI_URL,
    CONF_MICROCHIP,
    CONF_PEDIGREE_NUMBER,
    CONF_PHOTO_URL,
    CONF_SEX,
    DOMAIN,
)


class PawBookConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input=None) -> FlowResult:
        if user_input is not None:
            unique = user_input.get(CONF_MICROCHIP) or user_input[CONF_DOG_NAME].strip().lower()
            await self.async_set_unique_id(str(unique))
            self._abort_if_unique_id_configured()
            return self.async_create_entry(title=user_input[CONF_DOG_NAME], data=user_input)

        schema = vol.Schema({
            vol.Required(CONF_DOG_NAME): str,
            vol.Required(CONF_BIRTH_DATE): selector.DateSelector(),
            vol.Required(CONF_SEX, default="female"): vol.In({
                "female": "Femmina",
                "male": "Maschio",
            }),
            vol.Optional(CONF_BREED, default=""): str,
            vol.Optional(CONF_MICROCHIP, default=""): str,
            vol.Optional(CONF_ENCI_NAME, default=""): str,
            vol.Optional(CONF_ENCI_REGISTRY, default=""): str,
            vol.Optional(CONF_PEDIGREE_NUMBER, default=""): str,
            vol.Optional(
                CONF_ENCI_URL,
                default="https://www.enci.it/libro-genealogico/libro-genealogico-on-line",
            ): str,
            vol.Optional(CONF_PHOTO_URL, default=""): str,
        })
        return self.async_show_form(step_id="user", data_schema=schema)
