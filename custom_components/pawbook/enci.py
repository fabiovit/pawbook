from __future__ import annotations

import logging
import ssl
from functools import partial
from typing import Any

import certifi
from aiohttp import ClientConnectorCertificateError, ClientError, ClientResponseError
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession

_LOGGER = logging.getLogger(__name__)

ENCI_API_BASE = "https://lg.enci.it/enciwslg/api/LG"
ENCI_HEADERS = {
    "Content-Type": "application/json",
    "UserName": "enciwebapiuser",
    "Password": "aGq92wpifJ8ATKrASkHzsU1wP1bTUqsG3oLLUJF1h3MpYsTCeCdswp81XBka5QaLzfl34P9JoN4LTqLwsonq1OJBbqN70vAcDoHtw2qZ3OzessYDVAnvs9WPxg2JeEsN",
}


class EnciError(Exception):
    """Raised when an ENCI request cannot be completed."""


class EnciClient:
    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass
        self._session = async_get_clientsession(hass)
        self._ssl_context: ssl.SSLContext | None = None

    async def _async_get_ssl_context(self) -> ssl.SSLContext:
        """Create the ENCI SSL context outside Home Assistant's event loop."""
        if self._ssl_context is None:
            self._ssl_context = await self._hass.async_add_executor_job(
                partial(ssl.create_default_context, cafile=certifi.where())
            )
        return self._ssl_context

    async def _request(self, method: str, endpoint: str, **kwargs: Any) -> Any:
        ssl_context = await self._async_get_ssl_context()
        try:
            async with self._session.request(
                method,
                f"{ENCI_API_BASE}/{endpoint}",
                headers=ENCI_HEADERS,
                timeout=30,
                ssl=ssl_context,
                **kwargs,
            ) as response:
                response.raise_for_status()
                return await response.json(content_type=None)
        except ClientConnectorCertificateError as err:
            certificate_error = getattr(err, "certificate_error", None)
            verify_code = getattr(certificate_error, "verify_code", None)
            verify_message = getattr(certificate_error, "verify_message", None)
            _LOGGER.exception(
                "ENCI TLS certificate verification failed: host=%s port=%s "
                "endpoint=%s exception_type=%s verify_code=%s verify_message=%s "
                "certificate_error=%r",
                getattr(err, "host", "lg.enci.it"),
                getattr(err, "port", 443),
                endpoint,
                type(certificate_error).__name__ if certificate_error else type(err).__name__,
                verify_code,
                verify_message,
                certificate_error or err,
            )
            raise EnciError(
                "Impossibile verificare il certificato HTTPS del servizio ENCI. "
                "Controlla i registri di Home Assistant cercando “ENCI TLS” e "
                "comunica il codice e il messaggio di verifica riportati."
            ) from err
        except (ClientError, ClientResponseError, TimeoutError, ValueError) as err:
            raise EnciError(f"Servizio ENCI non disponibile: {err}") from err

    async def search(
        self,
        *,
        registry: str = "",
        name: str = "",
        microchip: str = "",
    ) -> list[dict[str, Any]]:
        payload = {
            "ROI_RSR_ES": registry.strip(),
            "ItaliaEstero": True,
            "Nome": name.strip(),
            "Allevatore": "",
            "Proprietario": "",
            "Microchip": microchip.strip(),
            "Tatuaggio": "",
            "Razza": "",
        }
        result = await self._request("POST", "GetCaniList", json=payload)
        rows = _as_list(result)
        return [_normalize_search_row(row) for row in rows if isinstance(row, dict)]

    async def dog_details(self, dog_id: int | str) -> dict[str, Any]:
        params = {"ID_CANE": dog_id}
        endpoints = {
            "profile": "GetAnagraficaCane",
            "pedigree": "GetPedigreeCane",
            "events": "GetAvvenimentiCane",
            "show_results": "GetRisultatiExpoCane",
            "trial_results": "GetRisultatiProveCane",
            "descendants": "GetDiscendentiCane",
            "dental": "GetCartaDentariaCane",
        }
        data: dict[str, Any] = {}
        for key, endpoint in endpoints.items():
            try:
                data[key] = await self._request("GET", endpoint, params=params)
            except EnciError:
                data[key] = None
        if not data.get("profile") and not data.get("pedigree"):
            raise EnciError("ENCI non ha restituito dati per il soggetto selezionato")
        return data


def _as_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if isinstance(value, dict):
        for key in ("Dto", "Data", "Items", "Results", "ListaCani", "Cani"):
            nested = value.get(key)
            if isinstance(nested, list):
                return nested
        return [value]
    return []


def _pick(data: dict[str, Any], *keys: str) -> Any:
    lowered = {str(key).lower(): value for key, value in data.items()}
    for key in keys:
        if key in data and data[key] not in (None, ""):
            return data[key]
        value = lowered.get(key.lower())
        if value not in (None, ""):
            return value
    return ""


def _normalize_search_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": _pick(row, "ID_CANE", "IdCane", "idCane", "Id"),
        "name": _pick(row, "NOME_CANE", "Nome", "NOME"),
        "registry": _pick(row, "LOI_CANE", "LOI", "ROI_RSR_ES", "Registro"),
        "birth_date": _pick(row, "DATA_NASCITA", "DataN", "DataNascita"),
        "sex": _pick(row, "SESSO", "Sesso"),
        "breed": _pick(row, "RAZZA", "Razza", "DESC_RAZZA"),
        "microchip": _pick(row, "MICROCHIP", "Microchip"),
        "raw": row,
    }


def normalize_import(details: dict[str, Any], dog_id: int | str) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    profile_raw = details.get("profile") or {}
    if isinstance(profile_raw, list):
        profile_raw = profile_raw[0] if profile_raw else {}
    if not isinstance(profile_raw, dict):
        profile_raw = {}
    registered_name = _pick(profile_raw, "NOME_CANE", "Nome", "NOME")
    registry = _pick(profile_raw, "LOI_CANE", "LOI", "ROI_RSR_ES", "Registro")
    father = _pick(profile_raw, "PADRE", "NomePadre", "NOME_PADRE")
    mother = _pick(profile_raw, "MADRE", "NomeMadre", "NOME_MADRE")
    profile = {
        "enci_id": str(dog_id),
        "enci_name": registered_name,
        "dog_name": registered_name,
        "enci_registry": registry,
        "roi": registry,
        "pedigree_number": registry,
        "breed": _pick(profile_raw, "RAZZA", "Razza", "DESC_RAZZA"),
        "color": _pick(profile_raw, "COLORE", "Colore"),
        "microchip": _pick(profile_raw, "MICROCHIP", "Microchip"),
        "sex": _pick(profile_raw, "SESSO", "Sesso"),
        "birth_date": _pick(profile_raw, "DATA_NASCITA", "DataNascita", "DataN"),
        "breeder": _pick(profile_raw, "ALLEVATORE", "Allevatore", "NOME_ALLEVATORE"),
        "father": father,
        "mother": mother,
        "enci_url": "https://www.enci.it/libro-genealogico/libro-genealogico-on-line",
        "enci_last_sync": __import__("datetime").datetime.now().isoformat(timespec="seconds"),
    }
    profile = {key: value for key, value in profile.items() if value not in (None, "")}
    genealogy = _normalize_pedigree(details.get("pedigree"), profile)
    extras = {
        "events": details.get("events") or [],
        "show_results": details.get("show_results") or [],
        "trial_results": details.get("trial_results") or [],
        "descendants": details.get("descendants") or [],
        "dental": details.get("dental") or [],
    }
    return profile, genealogy, extras


def _normalize_pedigree(raw: Any, profile: dict[str, Any]) -> dict[str, Any]:
    root = {
        "name": profile.get("enci_name", ""),
        "roi": profile.get("enci_registry", ""),
        "microchip": profile.get("microchip", ""),
    }
    if isinstance(raw, dict):
        candidates = raw.get("Dto") or raw.get("Data") or raw
        if isinstance(candidates, dict):
            root.update(_node_from_dict(candidates))
        elif isinstance(candidates, list):
            _attach_flat_nodes(root, candidates)
    elif isinstance(raw, list):
        _attach_flat_nodes(root, raw)
    return {key: value for key, value in root.items() if value not in (None, "", [], {})}


def _node_from_dict(data: dict[str, Any]) -> dict[str, Any]:
    node = {
        "name": _pick(data, "NOME_CANE", "Nome", "NOME", "name"),
        "roi": _pick(data, "LOI_CANE", "LOI", "ROI", "roi"),
        "microchip": _pick(data, "MICROCHIP", "Microchip", "microchip"),
    }
    father = data.get("father") or data.get("Padre") or data.get("PADRE")
    mother = data.get("mother") or data.get("Madre") or data.get("MADRE")
    if isinstance(father, dict):
        node["father"] = _node_from_dict(father)
    elif isinstance(father, str) and father:
        node["father"] = {"name": father}
    if isinstance(mother, dict):
        node["mother"] = _node_from_dict(mother)
    elif isinstance(mother, str) and mother:
        node["mother"] = {"name": mother}
    return {key: value for key, value in node.items() if value not in (None, "", [], {})}


def _attach_flat_nodes(root: dict[str, Any], rows: list[Any]) -> None:
    normalized = [_node_from_dict(row) for row in rows if isinstance(row, dict)]
    normalized = [row for row in normalized if row.get("name") or row.get("roi")]
    if not normalized:
        return
    # ENCI responses differ over time. Preserve all rows and expose the first
    # male/female-looking entries as parents when possible.
    root["enci_nodes"] = normalized
    if len(normalized) >= 1:
        root.setdefault("father", normalized[0])
    if len(normalized) >= 2:
        root.setdefault("mother", normalized[1])
