from __future__ import annotations

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.data_entry_flow import FlowResult
from homeassistant.helpers import selector

from .const import (
    CONF_BIRTH_DATE,
    CONF_BREED,
    CONF_BREEDER,
    CONF_COLOR,
    CONF_DOG_NAME,
    CONF_ENCI_NAME,
    CONF_ENCI_REGISTRY,
    CONF_ENCI_URL,
    CONF_FATHER,
    CONF_MICROCHIP,
    CONF_MOTHER,
    CONF_PEDIGREE_NUMBER,
    CONF_PHOTO_URL,
    CONF_SEX,
    CONF_VETERINARIAN,
    CONF_WEIGHT_SENSOR,
    DOMAIN,
    ENCI_PUBLIC_URL,
)


def profile_schema(defaults: dict, *, include_identity: bool, include_automation: bool = False) -> vol.Schema:
    fields: dict = {}

    if include_identity:
        fields[vol.Required(
            CONF_DOG_NAME, default=defaults.get(CONF_DOG_NAME, "")
        )] = str
        fields[vol.Required(
            CONF_BIRTH_DATE, default=defaults.get(CONF_BIRTH_DATE)
        )] = selector.DateSelector()
        fields[vol.Required(
            CONF_SEX, default=defaults.get(CONF_SEX, "female")
        )] = vol.In({"female": "Femmina", "male": "Maschio"})

    fields.update({
        vol.Optional(CONF_BREED, default=defaults.get(CONF_BREED, "")): str,
        vol.Optional(CONF_COLOR, default=defaults.get(CONF_COLOR, "")): str,
        vol.Optional(CONF_MICROCHIP, default=defaults.get(CONF_MICROCHIP, "")): str,
        vol.Optional(
            CONF_VETERINARIAN,
            default=defaults.get(CONF_VETERINARIAN, ""),
        ): str,
        vol.Optional(CONF_PHOTO_URL, default=defaults.get(CONF_PHOTO_URL, "")): str,
        vol.Optional(CONF_ENCI_NAME, default=defaults.get(CONF_ENCI_NAME, "")): str,
        vol.Optional(
            CONF_ENCI_REGISTRY,
            default=defaults.get(CONF_ENCI_REGISTRY, ""),
        ): str,
        vol.Optional(
            CONF_PEDIGREE_NUMBER,
            default=defaults.get(CONF_PEDIGREE_NUMBER, ""),
        ): str,
        vol.Optional(CONF_BREEDER, default=defaults.get(CONF_BREEDER, "")): str,
        vol.Optional(CONF_FATHER, default=defaults.get(CONF_FATHER, "")): str,
        vol.Optional(CONF_MOTHER, default=defaults.get(CONF_MOTHER, "")): str,
        vol.Optional(
            CONF_ENCI_URL,
            default=defaults.get(CONF_ENCI_URL, ENCI_PUBLIC_URL),
        ): str,
    })

    if include_automation:
        current_weight_sensor = defaults.get(CONF_WEIGHT_SENSOR, "")
        weight_sensor_key = (
            vol.Optional(
                CONF_WEIGHT_SENSOR,
                description={"suggested_value": current_weight_sensor},
            )
            if current_weight_sensor
            else vol.Optional(CONF_WEIGHT_SENSOR)
        )
        fields[weight_sensor_key] = selector.EntitySelector(
            selector.EntitySelectorConfig(domain="sensor")
        )

    return vol.Schema(fields)


class PawBookConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 2

    async def async_step_user(self, user_input=None) -> FlowResult:
        if user_input is not None:
            unique = (
                user_input.get(CONF_MICROCHIP)
                or user_input[CONF_DOG_NAME].strip().lower()
            )
            await self.async_set_unique_id(str(unique))
            self._abort_if_unique_id_configured()
            return self.async_create_entry(
                title=user_input[CONF_DOG_NAME],
                data=user_input,
            )

        return self.async_show_form(
            step_id="user",
            data_schema=profile_schema({}, include_identity=True),
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        # Home Assistant injects config_entry into OptionsFlow.
        # Do not assign self.config_entry manually: this is no longer supported.
        return PawBookOptionsFlow()


class PawBookOptionsFlow(config_entries.OptionsFlow):
    async def async_step_init(self, user_input=None) -> FlowResult:
        coordinator = self.hass.data.get(DOMAIN, {}).get(self.config_entry.entry_id)
        defaults = (
            dict(coordinator.data.profile)
            if coordinator is not None
            else {**self.config_entry.data, **self.config_entry.options}
        )

        if user_input is not None:
            profile_updates = dict(user_input)
            profile_updates.pop(CONF_WEIGHT_SENSOR, None)
            if coordinator is not None:
                await coordinator.async_set_profile(profile_updates)

            return self.async_create_entry(title="", data=dict(user_input))

        return self.async_show_form(
            step_id="init",
            data_schema=profile_schema(defaults, include_identity=False, include_automation=True),
        )
