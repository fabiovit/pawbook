from __future__ import annotations

from datetime import datetime
import asyncio
import re
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

    async def _detail_request(self, endpoint: str, *, dog_id: str) -> Any:
        """Call an ENCI detail endpoint using the request shape used by enci.it."""
        try:
            return await self._request(
                "GET", endpoint, params={"ID_CANE": dog_id}
            )
        except EnciError as err:
            _LOGGER.warning("ENCI endpoint %s failed: %s", endpoint, err)
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
            "breed_changes": "GetCambioRazzaCane",
            "practices": "GetPraticheCane",
            "health_documents": "GetDocumentiSanitariCane",
            "dental": "GetCartaDentariaCane",
            "foreign_titles": "GetTitoliEsteri",
        }
        data: dict[str, Any] = {"search_row": search_row}
        for key, endpoint in endpoints.items():
            data[key] = await self._detail_request(
                endpoint, dog_id=dog_id_text
            )

        # ENCI exposes HD/ED, DNA deposits and other official checks through
        # GetAvvenimentiCane for every individual dog. Fetch the same data for
        # all ancestors in the imported pedigree, with a conservative
        # concurrency limit to avoid overloading the public service.
        pedigree_data = _unwrap_dict(data.get("pedigree"))
        ancestor_ids = _extract_ancestor_ids(pedigree_data)
        ancestor_ids.discard(dog_id_text)
        data["ancestor_events"] = await self._ancestor_events(ancestor_ids)

        if not data.get("profile") and not data.get("pedigree"):
            raise EnciError(
                "ENCI ha trovato il cane, ma non ha restituito anagrafica o pedigree. "
                "Controlla i registri cercando ‘ENCI endpoint’."
            )
        return data

    async def _ancestor_events(self, dog_ids: set[str]) -> dict[str, list[dict[str, Any]]]:
        """Fetch official ENCI events for each ancestor with limited concurrency."""
        semaphore = asyncio.Semaphore(5)

        async def fetch(dog_id: str) -> tuple[str, list[dict[str, Any]]]:
            async with semaphore:
                result = await self._detail_request("GetAvvenimentiCane", dog_id=dog_id)
            events = [item for item in _as_list(result) if isinstance(item, dict)]
            return dog_id, events

        if not dog_ids:
            return {}
        pairs = await asyncio.gather(*(fetch(dog_id) for dog_id in sorted(dog_ids)))
        return {dog_id: events for dog_id, events in pairs if events}


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
        "color": _pick(merged, "MANTELLO", "COLORE", "Colore"),
        "microchip": _pick(merged, "CHIP", "MICROCHIP", "Microchip", "MicroChip", "microchip"),
        "sex": _pick(merged, "SESSO", "Sesso", "sex"),
        "birth_date": _format_enci_date(_pick(merged, "DATA_NASCITA_CANE", "DATA_NASCITA", "DataNascita", "DataN", "birth_date")),
        "breeder": _pick(merged, "ALLEVATORE", "Allevatore", "NOME_ALLEVATORE"),
        "father": _pick(merged, "DES_PADRE", "PADRE", "NomePadre", "NOME_PADRE"),
        "mother": _pick(merged, "DES_MADRE", "MADRE", "NomeMadre", "NOME_MADRE"),
        "owner": _pick(merged, "PROPRIETARIO", "Proprietario"),
        "deceased": _pick(merged, "FLAG_DECEDUTO") == "SI",
        "selected_breeder": _pick(merged, "FLAG_RIPRODUTTORE_SELEZIONATO") == "SI",
        "enci_url": "https://www.enci.it/libro-genealogico/libro-genealogico-on-line",
        "enci_last_sync": datetime.now().isoformat(timespec="seconds"),
    }
    profile = {key: value for key, value in profile.items() if value not in (None, "")}
    genealogy = _normalize_pedigree(details.get("pedigree"), profile, details.get("ancestor_events") or {}, details.get("events") or [])
    extras = {
        "events": details.get("events") or [],
        "show_results": details.get("show_results") or [],
        "trial_results": details.get("trial_results") or [],
        "descendants": details.get("descendants") or [],
        "dental": details.get("dental") or [],
        "health_documents": details.get("health_documents") or {},
        "practices": details.get("practices") or [],
        "breed_changes": details.get("breed_changes") or [],
        "foreign_titles": details.get("foreign_titles") or [],
        "raw_profile": details.get("profile") or {},
        "raw_pedigree": details.get("pedigree") or {},
        "ancestor_events": details.get("ancestor_events") or {},
    }
    return profile, genealogy, extras


def _format_enci_date(value: Any) -> str:
    """Convert ENCI dates such as YYYYMMDD to ISO YYYY-MM-DD."""
    text = str(value or "").strip()
    if len(text) == 8 and text.isdigit():
        return f"{text[:4]}-{text[4:6]}-{text[6:8]}"
    return text


def _normalize_pedigree(raw: Any, profile: dict[str, Any], ancestor_events: dict[str, list[dict[str, Any]]], root_events: Any) -> dict[str, Any]:
    """Normalize the flat ENCI pedigree response into PawBook's tree."""
    data = _unwrap_dict(raw)
    root = {
        "enci_id": str(_pick(data, "ID_CANE")),
        "name": _pick(data, "NOME_CANE") or profile.get("enci_name", ""),
        "roi": _pick(data, "LOI_CANE") or profile.get("enci_registry", ""),
        "microchip": profile.get("microchip", ""),
        "birth_date": _format_enci_date(_pick(data, "DATA_NASCITA_CANE")),
    }
    _attach_health(root, [item for item in _as_list(root_events) if isinstance(item, dict)])

    # ENCI returns a flat binary tree:
    # 1/2 = parents, 3/4 = father's parents, 5/6 = mother's parents, etc.
    father = _enci_ancestor_node(data, 1, ancestor_events)
    mother = _enci_ancestor_node(data, 2, ancestor_events)
    if father:
        root["father"] = father
    if mother:
        root["mother"] = mother

    return {
        key: value
        for key, value in root.items()
        if value not in (None, "", [], {})
    }


def _enci_ancestor_node(data: dict[str, Any], index: int, ancestor_events: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    """Build one ENCI ancestor and recursively attach its parents."""
    if index < 1 or index > 30:
        return {}

    relation = "PADRE" if index % 2 else "MADRE"
    node = {
        "enci_id": str(_pick(data, f"ID_{relation}_{index}") or ""),
        "name": _pick(data, f"NOME_{relation}_{index}"),
        "roi": _pick(data, f"LOI_{relation}_{index}"),
        "birth_date": _format_enci_date(
            _pick(data, f"DATA_NASCITA_{relation}_{index}")
        ),
    }

    father_index = 2 * index + 1
    mother_index = 2 * index + 2
    father = _enci_ancestor_node(data, father_index, ancestor_events)
    mother = _enci_ancestor_node(data, mother_index, ancestor_events)
    if father:
        node["father"] = father
    if mother:
        node["mother"] = mother

    dog_id = str(node.get("enci_id") or "")
    if dog_id:
        _attach_health(node, ancestor_events.get(dog_id, []))

    meaningful = any(node.get(key) for key in ("enci_id", "name", "roi", "birth_date"))
    if not meaningful:
        return {}
    return {
        key: value
        for key, value in node.items()
        if value not in (None, "", [], {})
    }



def _extract_ancestor_ids(data: dict[str, Any]) -> set[str]:
    ids: set[str] = set()
    root_id = str(_pick(data, "ID_CANE") or "").strip()
    if root_id:
        ids.add(root_id)
    for index in range(1, 31):
        relation = "PADRE" if index % 2 else "MADRE"
        dog_id = str(_pick(data, f"ID_{relation}_{index}") or "").strip()
        if dog_id:
            ids.add(dog_id)
    return ids


def _attach_health(node: dict[str, Any], events: list[dict[str, Any]]) -> None:
    """Attach normalized HD/ED/DNA information and raw ENCI events to a tree node."""
    if not events:
        return
    summary: dict[str, Any] = {}
    labels: list[str] = []
    normalized_events: list[dict[str, Any]] = []

    for event in events:
        description = str(_pick(event, "AVVENIMENTO", "Descrizione") or "").strip()
        event_type = str(_pick(event, "TIPO", "Tipo") or "").strip()
        date_value = _format_enci_date(_pick(event, "DATA_ISO", "DATA", "DATA_CHAR"))
        normalized_events.append({
            "type": event_type,
            "description": description,
            "date": date_value,
            "code": str(_pick(event, "CODICE") or ""),
        })
        upper = description.upper()
        hd_match = re.search(r"\bHD[.\s-]*([A-E])(?:\s*\((\d+)\))?", upper)
        ed_match = re.search(r"\bED(?:[.\s-]*)?(\d)", upper)
        if hd_match:
            grade = hd_match.group(1)
            summary["hd"] = grade
            labels.append(f"HD {grade}")
        if ed_match:
            grade = ed_match.group(1)
            summary["ed"] = grade
            labels.append(f"ED {grade}")
        if "CAMPIONE BIOLOGICO" in event_type.upper() or "DNA" in upper or "VETOGENE" in upper:
            summary["dna"] = True
            labels.append("DNA")

    node["health_summary"] = summary
    node["health_events"] = normalized_events
    node["health"] = list(dict.fromkeys(labels))
