from __future__ import annotations

from datetime import datetime
import json
import logging
import ssl
from pathlib import Path
from typing import Any

import certifi
from aiohttp import ClientConnectorCertificateError, ClientError, ClientResponseError
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession

_LOGGER = logging.getLogger(__name__)

ENCI_API_BASE = "https://lg.enci.it/enciwslg/api/LG"
ENCI_INTERMEDIATE_CA = (
    Path(__file__).resolve().parent
    / "certificates"
    / "actalis_domain_validation_server_ca_g3.pem"
)
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

    @staticmethod
    def _create_ssl_context() -> ssl.SSLContext:
        context = ssl.create_default_context(cafile=certifi.where())
        context.check_hostname = True
        context.verify_mode = ssl.CERT_REQUIRED
        context.load_verify_locations(cafile=str(ENCI_INTERMEDIATE_CA))
        return context

    async def _async_get_ssl_context(self) -> ssl.SSLContext:
        if self._ssl_context is None:
            self._ssl_context = await self._hass.async_add_executor_job(
                self._create_ssl_context
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
                raw_text = await response.text()
                if response.status >= 400:
                    raise EnciError(
                        f"ENCI {endpoint}: HTTP {response.status} {raw_text[:250]}"
                    )
                if not raw_text.strip():
                    return None
                try:
                    return json.loads(raw_text)
                except ValueError as err:
                    raise EnciError(
                        f"ENCI {endpoint}: risposta non JSON ({raw_text[:250]})"
                    ) from err
        except ClientConnectorCertificateError as err:
            certificate_error = getattr(err, "certificate_error", None)
            _LOGGER.exception(
                "ENCI TLS certificate verification failed: host=%s port=%s "
                "endpoint=%s verify_code=%s verify_message=%s",
                getattr(err, "host", "lg.enci.it"),
                getattr(err, "port", 443),
                endpoint,
                getattr(certificate_error, "verify_code", None),
                getattr(certificate_error, "verify_message", None),
            )
            raise EnciError(
                "Impossibile verificare il certificato HTTPS del servizio ENCI."
            ) from err
        except EnciError:
            raise
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
        normalized = [_normalize_search_row(row) for row in rows if isinstance(row, dict)]
        _LOGGER.debug("ENCI search returned %s normalized rows", len(normalized))
        return normalized

    async def _detail_request(
        self,
        endpoint: str,
        *,
        dog_id: str,
        registry: str,
        microchip: str,
    ) -> Any:
        """Try the request shapes used by different ENCI API revisions."""
        candidates: list[tuple[str, dict[str, Any]]] = []
        identifiers = [
            ("ID_CANE", dog_id),
            ("IdCane", dog_id),
            ("idCane", dog_id),
            ("ROI_RSR_ES", registry),
            ("LOI_CANE", registry),
            ("Microchip", microchip),
        ]
        for key, value in identifiers:
            if value:
                candidates.append(("GET", {"params": {key: value}}))
                candidates.append(("POST", {"json": {key: value}}))

        errors: list[str] = []
        for method, kwargs in candidates:
            try:
                result = await self._request(method, endpoint, **kwargs)
                if _has_meaningful_data(result):
                    _LOGGER.debug(
                        "ENCI endpoint %s succeeded with %s and keys=%s",
                        endpoint,
                        method,
                        _shape_summary(result),
                    )
                    return result
            except EnciError as err:
                errors.append(f"{method} {list((kwargs.get('params') or kwargs.get('json') or {}).keys())}: {err}")

        _LOGGER.warning(
            "ENCI endpoint %s returned no usable data. Attempts: %s",
            endpoint,
            " | ".join(errors[-8:]) if errors else "no meaningful response",
        )
        return None

    async def dog_details(
        self,
        dog_id: int | str = "",
        *,
        registry: str = "",
        microchip: str = "",
        search_row: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        search_row = search_row or {}
        dog_id_text = str(dog_id or _pick(search_row, "id", "ID_CANE", "IdCane")).strip()
        registry_text = str(registry or _pick(search_row, "registry", "LOI_CANE", "ROI_RSR_ES")).strip()
        microchip_text = str(microchip or _pick(search_row, "microchip", "MICROCHIP")).strip()

        if not any((dog_id_text, registry_text, microchip_text)):
            raise EnciError("Il risultato ENCI non contiene un identificativo utilizzabile")

        endpoints = {
            "profile": "GetAnagraficaCane",
            "pedigree": "GetPedigreeCane",
            "events": "GetAvvenimentiCane",
            "show_results": "GetRisultatiExpoCane",
            "trial_results": "GetRisultatiProveCane",
            "descendants": "GetDiscendentiCane",
            "dental": "GetCartaDentariaCane",
        }
        data: dict[str, Any] = {"search_row": search_row}
        for key, endpoint in endpoints.items():
            data[key] = await self._detail_request(
                endpoint,
                dog_id=dog_id_text,
                registry=registry_text,
                microchip=microchip_text,
            )

        if not data.get("profile") and not data.get("pedigree"):
            raise EnciError(
                "ENCI ha trovato il cane, ma non ha restituito anagrafica o pedigree. "
                "Controlla i registri cercando ‘ENCI endpoint’."
            )
        return data


def _has_meaningful_data(value: Any) -> bool:
    if value in (None, "", [], {}):
        return False
    if isinstance(value, dict):
        if value.get("Success") is False:
            return False
        for key in ("Dto", "Data", "Items", "Results"):
            if key in value:
                return _has_meaningful_data(value[key])
    return True


def _shape_summary(value: Any) -> str:
    if isinstance(value, dict):
        return f"dict:{','.join(list(value.keys())[:20])}"
    if isinstance(value, list):
        keys = list(value[0].keys())[:20] if value and isinstance(value[0], dict) else []
        return f"list[{len(value)}]:{','.join(keys)}"
    return type(value).__name__


def _as_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if isinstance(value, dict):
        for key in ("Dto", "Data", "Items", "Results", "ListaCani", "Cani"):
            nested = value.get(key)
            if isinstance(nested, list):
                return nested
            if isinstance(nested, dict):
                return [nested]
        return [value]
    return []


def _unwrap_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, list):
        return _unwrap_dict(value[0]) if value else {}
    if not isinstance(value, dict):
        return {}
    for key in ("Dto", "Data", "Item", "Result", "Anagrafica"):
        nested = value.get(key)
        if isinstance(nested, dict):
            return nested
        if isinstance(nested, list) and nested and isinstance(nested[0], dict):
            return nested[0]
    return value


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
        "id": _pick(
            row,
            "ID_CANE", "IdCane", "idCane", "IDCane", "Id", "ID", "CodiceCane",
        ),
        "name": _pick(row, "NOME_CANE", "Nome", "NOME", "NomeCane"),
        "registry": _pick(
            row, "LOI_CANE", "LOI", "ROI_RSR_ES", "Registro", "ROI", "RSR"
        ),
        "birth_date": _pick(row, "DATA_NASCITA", "DataN", "DataNascita"),
        "sex": _pick(row, "SESSO", "Sesso"),
        "breed": _pick(row, "RAZZA", "Razza", "DESC_RAZZA", "DescrizioneRazza"),
        "microchip": _pick(row, "MICROCHIP", "Microchip", "MicroChip"),
        "raw": row,
    }


def normalize_import(
    details: dict[str, Any], dog_id: int | str
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    search_row = details.get("search_row") or {}
    profile_raw = _unwrap_dict(details.get("profile"))
    merged = {**search_row, **profile_raw}

    registered_name = _pick(
        merged, "NOME_CANE", "Nome", "NOME", "NomeCane", "name"
    )
    registry = _pick(
        merged, "LOI_CANE", "LOI", "ROI_RSR_ES", "Registro", "ROI", "registry"
    )
    profile = {
        "enci_id": str(dog_id or _pick(search_row, "id")),
        "enci_name": registered_name,
        "dog_name": registered_name,
        "enci_registry": registry,
        "roi": registry,
        "pedigree_number": registry,
        "breed": _pick(merged, "RAZZA", "Razza", "DESC_RAZZA", "DescrizioneRazza", "breed"),
        "color": _pick(merged, "COLORE", "Colore"),
        "microchip": _pick(merged, "MICROCHIP", "Microchip", "MicroChip", "microchip"),
        "sex": _pick(merged, "SESSO", "Sesso", "sex"),
        "birth_date": _pick(merged, "DATA_NASCITA", "DataNascita", "DataN", "birth_date"),
        "breeder": _pick(merged, "ALLEVATORE", "Allevatore", "NOME_ALLEVATORE"),
        "father": _pick(merged, "PADRE", "NomePadre", "NOME_PADRE"),
        "mother": _pick(merged, "MADRE", "NomeMadre", "NOME_MADRE"),
        "enci_url": "https://www.enci.it/libro-genealogico/libro-genealogico-on-line",
        "enci_last_sync": datetime.now().isoformat(timespec="seconds"),
    }
    profile = {key: value for key, value in profile.items() if value not in (None, "")}
    genealogy = _normalize_pedigree(details.get("pedigree"), profile)
    extras = {
        "events": details.get("events") or [],
        "show_results": details.get("show_results") or [],
        "trial_results": details.get("trial_results") or [],
        "descendants": details.get("descendants") or [],
        "dental": details.get("dental") or [],
        "raw_profile": details.get("profile") or {},
        "raw_pedigree": details.get("pedigree") or {},
    }
    return profile, genealogy, extras


def _normalize_pedigree(raw: Any, profile: dict[str, Any]) -> dict[str, Any]:
    root = {
        "name": profile.get("enci_name", ""),
        "roi": profile.get("enci_registry", ""),
        "microchip": profile.get("microchip", ""),
    }
    candidates = raw
    if isinstance(raw, dict):
        candidates = raw.get("Dto") or raw.get("Data") or raw.get("Items") or raw

    if isinstance(candidates, dict):
        root.update(_node_from_dict(candidates))
        _attach_named_relatives(root, candidates)
    elif isinstance(candidates, list):
        _attach_flat_nodes(root, candidates)
    return {key: value for key, value in root.items() if value not in (None, "", [], {})}


def _node_from_dict(data: dict[str, Any]) -> dict[str, Any]:
    node = {
        "name": _pick(data, "NOME_CANE", "Nome", "NOME", "name", "NomeCane"),
        "roi": _pick(data, "LOI_CANE", "LOI", "ROI", "roi", "Registro"),
        "microchip": _pick(data, "MICROCHIP", "Microchip", "microchip"),
        "titles": _pick(data, "TITOLI", "Titoli", "titles"),
    }
    father = _pick_relation(data, "father", "Padre", "PADRE", "GenitoreMaschio")
    mother = _pick_relation(data, "mother", "Madre", "MADRE", "GenitoreFemmina")
    if father:
        node["father"] = father
    if mother:
        node["mother"] = mother
    return {key: value for key, value in node.items() if value not in (None, "", [], {})}


def _pick_relation(data: dict[str, Any], *keys: str) -> dict[str, Any] | None:
    lowered = {str(key).lower(): value for key, value in data.items()}
    for key in keys:
        value = data.get(key, lowered.get(key.lower()))
        if isinstance(value, dict):
            return _node_from_dict(value)
        if isinstance(value, str) and value.strip():
            return {"name": value.strip()}
    return None


def _attach_named_relatives(root: dict[str, Any], data: dict[str, Any]) -> None:
    mappings = {
        "father": ("PADRE", "Padre", "father", "NOME_PADRE"),
        "mother": ("MADRE", "Madre", "mother", "NOME_MADRE"),
    }
    for target, keys in mappings.items():
        relation = _pick_relation(data, *keys)
        if relation:
            root[target] = relation


def _attach_flat_nodes(root: dict[str, Any], rows: list[Any]) -> None:
    normalized: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        node = _node_from_dict(row)
        generation = str(_pick(row, "GENERAZIONE", "Generazione", "Livello", "level"))
        position = str(_pick(row, "POSIZIONE", "Posizione", "Ruolo", "relationship"))
        if generation:
            node["generation"] = generation
        if position:
            node["relationship"] = position
        if node.get("name") or node.get("roi"):
            normalized.append(node)
    if not normalized:
        return
    root["enci_nodes"] = normalized

    for node in normalized:
        relation = str(node.get("relationship", "")).lower()
        if "padre" in relation or relation in {"father", "sire"}:
            root.setdefault("father", node)
        elif "madre" in relation or relation in {"mother", "dam"}:
            root.setdefault("mother", node)

    if "father" not in root and normalized:
        root["father"] = normalized[0]
    if "mother" not in root and len(normalized) > 1:
        root["mother"] = normalized[1]
