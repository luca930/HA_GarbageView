"""Preset dei tipi di rifiuto più comuni (nome localizzato + icona mdi suggerita).

Modulo puro: nessuna dipendenza da Home Assistant. I nomi mostrati vengono dalle
traduzioni (``selector.preset.options.<id>``); qui ci sono solo id e icone.
"""
from __future__ import annotations

from .validation import ICON_RE

CUSTOM_PRESET = "custom"

# id -> icona mdi suggerita (l'utente può sempre cambiarla)
PRESET_ICONS: dict[str, str] = {
    "organic": "mdi:food-apple",
    "plastic": "mdi:bottle-soda-classic-outline",
    "paper": "mdi:newspaper-variant-outline",
    "glass": "mdi:glass-fragile",
    "residual": "mdi:trash-can-outline",
    "garden": "mdi:leaf",
    "metal": "mdi:pail-outline",
    "plastic_metal": "mdi:recycle",
    "bulky": "mdi:sofa-outline",
    "oil": "mdi:oil",
    "textiles": "mdi:tshirt-crew-outline",
    "batteries": "mdi:battery-outline",
}

PRESET_OPTIONS: list[str] = [*PRESET_ICONS, CUSTOM_PRESET]

assert all(ICON_RE.fullmatch(i) for i in PRESET_ICONS.values())
