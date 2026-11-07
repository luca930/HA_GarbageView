"""Validazione e normalizzazione dei tipi di rifiuto (CONTRACT.md §1).

Modulo puro: nessuna dipendenza da Home Assistant, riusabile e testabile.
Le funzioni sollevano ``ValidationError`` con un codice che corrisponde a una
chiave di traduzione in ``config.error`` / ``options.error``.
"""
from __future__ import annotations

import math
import re
import unicodedata
from datetime import date
from typing import Any

from .const import (
    DEFAULT_NOTIFICATIONS,
    MAX_TARGETS,
    N_ENABLED,
    N_EVENING_TIME,
    N_PUT_OUT_FROM,
    N_MESSAGE,
    N_SKIP_EMPTY,
    N_TARGETS,
    N_TIME,
    N_TITLE,
    NOTIFY_TARGET_PREFIX,
    TEMPLATE_MAX_LEN,
    NAME_MAX_LEN,
    DEFAULT_PICKUP,
    PICKUPS,
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
    if not math.isfinite(as_float) or as_float != int(as_float):
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


def validate_pickup(value: Any) -> str:
    """Momento del ritiro: "morning" (default, anche se assente) o "evening"."""
    if value is None:
        return DEFAULT_PICKUP
    if value not in PICKUPS:
        raise ValidationError("invalid_pickup", "pickup")
    return value


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
    *, type_id: str | None, name: Any, icon: Any, rule: Any, existing_ids: set[str], pickup: Any = None
) -> dict[str, Any]:
    """Crea il dict salvato in ``options["types"]``.

    ``existing_ids`` sono gli id già in uso, usati solo per generare un id nuovo
    quando ``type_id`` è ``None``; se ``type_id`` è dato (modifica) viene mantenuto.
    """
    clean_name = validate_name(name)
    item = {
        "id": type_id or unique_id(clean_name, existing_ids),
        "name": clean_name,
        "icon": validate_icon(icon),
        "rule": validate_rule(rule),
        "pickup": validate_pickup(pickup),
    }
    if not ID_RE.fullmatch(item["id"]):
        raise ValueError(f"invalid type id: {item['id']!r}")  # errore di programmazione, non di input
    return item


# ---- Notifiche -------------------------------------------------------------
_PLACEHOLDER_RE = re.compile(r"\{(\w+)\}")
TEMPLATE_FIELDS = ("items", "count", "when", "date")


def validate_time(value: Any, field: str) -> str:
    """Accetta "HH:MM" o "HH:MM:SS" e normalizza in "HH:MM:SS"."""
    if not isinstance(value, str) or not re.fullmatch(r"\d{1,2}:\d{2}(:\d{2})?", value.strip()):
        raise ValidationError("invalid_time", field)
    parts = [int(p) for p in value.strip().split(":")]
    parts += [0] * (3 - len(parts))
    if not (0 <= parts[0] < 24 and 0 <= parts[1] < 60 and 0 <= parts[2] < 60):
        raise ValidationError("invalid_time", field)
    return "{:02d}:{:02d}:{:02d}".format(*parts)


def validate_template(value: Any, field: str) -> str:
    if value is None:
        return ""
    if not isinstance(value, str) or len(value) > TEMPLATE_MAX_LEN:
        raise ValidationError("invalid_template", field)
    value = value.strip()
    stripped = _PLACEHOLDER_RE.sub("", value)  # dopo aver tolto i segnaposto noti non devono restare graffe
    if any(ch in value for ch in "\x00\r") or "{" in stripped or "}" in stripped or any(
        name not in TEMPLATE_FIELDS for name in _PLACEHOLDER_RE.findall(value)
    ):
        raise ValidationError("invalid_template", field)
    return value


def validate_notifications(raw: dict[str, Any]) -> dict[str, Any]:
    """Valida e normalizza le opzioni delle notifiche (CONTRACT.md §3)."""
    targets = raw.get(N_TARGETS)
    if targets is None:
        targets = []
    if not isinstance(targets, list) or len(targets) > MAX_TARGETS:
        raise ValidationError("invalid_targets", N_TARGETS)
    clean_targets: list[str] = []
    for t in targets:
        if not isinstance(t, str) or not re.fullmatch(rf"{NOTIFY_TARGET_PREFIX}[a-z0-9_]{{1,64}}", t):
            raise ValidationError("invalid_targets", N_TARGETS)
        if t not in clean_targets:
            clean_targets.append(t)
    enabled = bool(raw.get(N_ENABLED, False))
    if enabled and not clean_targets:
        raise ValidationError("no_targets", N_TARGETS)
    return {
        N_ENABLED: enabled,
        N_TARGETS: clean_targets,
        N_TIME: validate_time(raw.get(N_TIME, DEFAULT_NOTIFICATIONS[N_TIME]), N_TIME),
        N_EVENING_TIME: validate_time(raw.get(N_EVENING_TIME, DEFAULT_NOTIFICATIONS[N_EVENING_TIME]), N_EVENING_TIME),
        N_PUT_OUT_FROM: validate_time(raw.get(N_PUT_OUT_FROM, DEFAULT_NOTIFICATIONS[N_PUT_OUT_FROM]), N_PUT_OUT_FROM),
        N_SKIP_EMPTY: bool(raw.get(N_SKIP_EMPTY, True)),
        N_TITLE: validate_template(raw.get(N_TITLE), N_TITLE),
        N_MESSAGE: validate_template(raw.get(N_MESSAGE), N_MESSAGE),
    }
