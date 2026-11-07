"""Validazione e normalizzazione dei tipi di rifiuto (CONTRACT.md §1).

Modulo puro: nessuna dipendenza da Home Assistant, riusabile e testabile.
Le funzioni sollevano ``ValidationError`` con un codice che corrisponde a una
chiave di traduzione in ``config.error`` / ``options.error``.
"""
from __future__ import annotations

import re
import unicodedata
from datetime import date
from typing import Any

from .const import (
    NAME_MAX_LEN,
    RULE_EVERY_N_WEEKS,
    RULE_MONTHLY_DAY,
    RULE_MONTHLY_NTH_WEEKDAY,
    RULE_TYPES,
    RULE_WEEKLY,
)

ICON_RE = re.compile(r"^mdi:[a-z0-9-]+$")
ID_RE = re.compile(r"^[a-z0-9_]{1,32}$")
NTH_VALUES = (1, 2, 3, 4, -1)


class ValidationError(ValueError):
    """Errore di validazione; ``code`` è la chiave di traduzione."""

    def __init__(self, code: str, field: str) -> None:
        super().__init__(code)
        self.code = code
        self.field = field


def _int(value: Any, field: str, code: str) -> int:
    # bool è sottoclasse di int: lo escludiamo esplicitamente.
    if isinstance(value, bool):
        raise ValidationError(code, field)
    try:
        as_float = float(value)
    except (TypeError, ValueError):
        raise ValidationError(code, field) from None
    if as_float != int(as_float):
        raise ValidationError(code, field)
    return int(as_float)


def validate_name(value: Any) -> str:
    name = value.strip() if isinstance(value, str) else ""
    if not name or len(name) > NAME_MAX_LEN or any(unicodedata.category(c) == "Cc" for c in name):
        raise ValidationError("invalid_name", "name")
    return name


def validate_icon(value: Any) -> str:
    if not isinstance(value, str) or not ICON_RE.fullmatch(value.strip()):
        raise ValidationError("invalid_icon", "icon")
    return value.strip()


def validate_weekdays(value: Any) -> list[int]:
    if not isinstance(value, (list, tuple, set)) or not value:
        raise ValidationError("no_weekdays", "weekdays")
    days = {_int(v, "weekdays", "invalid_weekday") for v in value}
    if not days <= set(range(7)):
        raise ValidationError("invalid_weekday", "weekdays")
    return sorted(days)


def validate_anchor_date(value: Any) -> str:
    try:
        return date.fromisoformat(str(value)).isoformat()
    except ValueError:
        raise ValidationError("invalid_anchor_date", "anchor_date") from None


def validate_rule(rule: Any) -> dict[str, Any]:
    """Valida e normalizza una regola; ignora i campi estranei."""
    if not isinstance(rule, dict) or rule.get("type") not in RULE_TYPES:
        raise ValidationError("invalid_rule", "rule_type")
    rtype = rule["type"]
    if rtype == RULE_WEEKLY:
        return {"type": rtype, "weekdays": validate_weekdays(rule.get("weekdays"))}
    if rtype == RULE_EVERY_N_WEEKS:
        interval = _int(rule.get("interval"), "interval", "invalid_interval")
        if not 2 <= interval <= 8:
            raise ValidationError("invalid_interval", "interval")
        return {
            "type": rtype,
            "weekdays": validate_weekdays(rule.get("weekdays")),
            "interval": interval,
            "anchor_date": validate_anchor_date(rule.get("anchor_date")),
        }
    if rtype == RULE_MONTHLY_NTH_WEEKDAY:
        weekday = _int(rule.get("weekday"), "weekday", "invalid_weekday")
        nth = _int(rule.get("nth"), "nth", "invalid_nth")
        if not 0 <= weekday <= 6:
            raise ValidationError("invalid_weekday", "weekday")
        if nth not in NTH_VALUES:
            raise ValidationError("invalid_nth", "nth")
        return {"type": rtype, "weekday": weekday, "nth": nth}
    day = _int(rule.get("day"), "day", "invalid_day")
    if not 1 <= day <= 31:
        raise ValidationError("invalid_day", "day")
    return {"type": RULE_MONTHLY_DAY, "day": day}


def slugify(name: str) -> str:
    """Slug ``[a-z0-9_]{1,32}`` a partire dal nome (accenti rimossi)."""
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "_", ascii_name.lower()).strip("_")[:32].strip("_")
    return slug or "tipo"


def unique_id(name: str, existing: set[str]) -> str:
    base = slugify(name)
    candidate, n = base, 2
    while candidate in existing:
        suffix = f"_{n}"
        candidate = f"{base[: 32 - len(suffix)]}{suffix}"
        n += 1
    return candidate


def build_type(
    *, type_id: str | None, name: Any, icon: Any, rule: Any, existing_ids: set[str]
) -> dict[str, Any]:
    """Crea il dict salvato in ``options["types"]``. ``existing_ids`` esclude il tipo in modifica."""
    clean_name = validate_name(name)
    item = {
        "id": type_id or unique_id(clean_name, existing_ids),
        "name": clean_name,
        "icon": validate_icon(icon),
        "rule": validate_rule(rule),
    }
    if not ID_RE.fullmatch(item["id"]):
        raise ValidationError("invalid_rule", "name")
    return item
