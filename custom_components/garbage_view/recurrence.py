"""Logica di ricorrenza pura (task T1). Nessuna dipendenza da Home Assistant."""
from __future__ import annotations

from datetime import date
from typing import Any


def occurs_on(rule: dict[str, Any], day: date) -> bool:
    """Ritorna True se la regola (CONTRACT.md §1) cade in `day`."""
    raise NotImplementedError


def build_view(types: list[dict[str, Any]], today: date) -> dict[str, Any]:
    """Costruisce gli attributi del sensore (CONTRACT.md §2)."""
    raise NotImplementedError
