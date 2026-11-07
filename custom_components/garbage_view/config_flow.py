"""Config flow e options flow (task T2).

Menu opzioni: aggiungi / modifica / rimuovi tipo di rifiuto. Ogni tipo ha nome,
icona e ricorrenza (nessun colore: la card usa un unico colore d'accento).
"""
from __future__ import annotations

from datetime import date
from typing import Any

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.helpers import selector, translation

from .const import (
    CONF_NOTIFICATIONS,
    CONF_TYPES,
    DEFAULT_NOTIFICATIONS,
    N_ENABLED,
    N_EVENING,
    N_EVENING_TIME,
    N_MESSAGE,
    N_SKIP_EMPTY,
    N_TARGETS,
    N_TIME,
    N_TITLE,
    NOTIFY_TARGET_PREFIX,
    DEFAULT_ICON,
    DOMAIN,
    MAX_TYPES,
    RULE_EVERY_N_WEEKS,
    RULE_MONTHLY_DAY,
    RULE_MONTHLY_NTH_WEEKDAY,
    RULE_TYPES,
    RULE_WEEKLY,
)
from .presets import CUSTOM_PRESET, PRESET_ICONS, PRESET_OPTIONS
from .validation import (
    ValidationError,
    build_type,
    validate_icon,
    validate_name,
    validate_notifications,
)

_WEEKDAYS = selector.SelectSelector(
    selector.SelectSelectorConfig(
        options=[str(i) for i in range(7)],
        multiple=True,
        mode=selector.SelectSelectorMode.LIST,
        translation_key="weekday",
    )
)
_WEEKDAY = selector.SelectSelector(
    selector.SelectSelectorConfig(
        options=[str(i) for i in range(7)],
        mode=selector.SelectSelectorMode.DROPDOWN,
        translation_key="weekday",
    )
)
_NTH = selector.SelectSelector(
    selector.SelectSelectorConfig(
        options=["1", "2", "3", "4", "last"],  # "-1" non è una chiave di traduzione valida (hassfest)
        mode=selector.SelectSelectorMode.DROPDOWN,
        translation_key="nth",
    )
)
_PRESET = selector.SelectSelector(
    selector.SelectSelectorConfig(
        options=PRESET_OPTIONS,
        mode=selector.SelectSelectorMode.DROPDOWN,
        translation_key="preset",
    )
)
_RULE_TYPE = selector.SelectSelector(
    selector.SelectSelectorConfig(
        options=list(RULE_TYPES),
        mode=selector.SelectSelectorMode.LIST,
        translation_key="rule_type",
    )
)


def _num(lo: int, hi: int) -> selector.NumberSelector:
    return selector.NumberSelector(
        selector.NumberSelectorConfig(min=lo, max=hi, step=1, mode=selector.NumberSelectorMode.BOX)
    )


class GarbageViewConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Voce singola, senza parametri iniziali."""

    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None):
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        if user_input is None:
            return self.async_show_form(step_id="user")
        return self.async_create_entry(title="Garbage View", data={}, options={CONF_TYPES: []})

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: config_entries.ConfigEntry) -> config_entries.OptionsFlow:
        return GarbageViewOptionsFlow()


class GarbageViewOptionsFlow(config_entries.OptionsFlow):
    """CRUD dei tipi di rifiuto salvati in ``options["types"]``."""

    def __init__(self) -> None:
        self._types: list[dict[str, Any]] | None = None
        self._editing: str | None = None  # id del tipo in modifica
        self._draft: dict[str, Any] = {}
        self._notify: dict[str, Any] | None = None

    # ---- menu -----------------------------------------------------------
    async def async_step_init(self, user_input: dict[str, Any] | None = None):
        if self._types is None:  # prima apertura: le modifiche restano in memoria fino a "Salva"
            self._types = [dict(t) for t in self.config_entry.options.get(CONF_TYPES, [])]
        if self._notify is None:
            saved = self.config_entry.options.get(CONF_NOTIFICATIONS)
            self._notify = {**DEFAULT_NOTIFICATIONS, **(saved if isinstance(saved, dict) else {})}
        self._editing, self._draft = None, {}
        menu = ["add_type"]
        if self._types:
            menu += ["edit_type", "remove_type"]
        menu += ["notifications", "finish"]
        return self.async_show_menu(step_id="init", menu_options=menu)

    async def async_step_finish(self, user_input: dict[str, Any] | None = None):
        return self.async_create_entry(
            data={**self.config_entry.options, CONF_TYPES: self._types, CONF_NOTIFICATIONS: self._notify}
        )

    # ---- notifiche -------------------------------------------------------------
    def _mobile_targets(self) -> list[str]:
        services = self.hass.services.async_services_for_domain("notify")
        found = {s for s in services if s.startswith(NOTIFY_TARGET_PREFIX)}
        return sorted(found | set(self._notify[N_TARGETS]))  # mantiene anche i salvati non più attivi

    async def async_step_notifications(self, user_input: dict[str, Any] | None = None):
        errors: dict[str, str] = {}
        if user_input is not None:
            try:
                self._notify = validate_notifications(user_input)
            except ValidationError as err:
                errors[err.field] = err.code
            else:
                return await self.async_step_init()
        n = self._notify
        schema = vol.Schema(
            {
                vol.Required(N_ENABLED, default=n[N_ENABLED]): selector.BooleanSelector(),
                vol.Required(N_TARGETS, default=n[N_TARGETS]): selector.SelectSelector(
                    selector.SelectSelectorConfig(
                        options=self._mobile_targets(),
                        multiple=True,
                        mode=selector.SelectSelectorMode.DROPDOWN,
                    )
                ),
                vol.Required(N_TIME, default=n[N_TIME]): selector.TimeSelector(),
                vol.Required(N_EVENING, default=n[N_EVENING]): selector.BooleanSelector(),
                vol.Required(N_EVENING_TIME, default=n[N_EVENING_TIME]): selector.TimeSelector(),
                vol.Required(N_SKIP_EMPTY, default=n[N_SKIP_EMPTY]): selector.BooleanSelector(),
                vol.Optional(N_TITLE, default=n[N_TITLE]): selector.TextSelector(),
                vol.Optional(N_MESSAGE, default=n[N_MESSAGE]): selector.TextSelector(
                    selector.TextSelectorConfig(multiline=True)
                ),
            }
        )
        if user_input is not None:
            schema = self.add_suggested_values_to_schema(schema, user_input)
        return self.async_show_form(
            step_id="notifications",
            data_schema=schema,
            errors=errors,
            description_placeholders={"placeholders": "{items}, {count}, {when}, {date}"},
        )

    # ---- aggiungi / modifica ---------------------------------------------
    async def async_step_add_type(self, user_input: dict[str, Any] | None = None):
        if len(self._types) >= MAX_TYPES:
            return self.async_abort(reason="max_types")
        self._editing = None
        return await self.async_step_preset(user_input)

    async def async_step_preset(self, user_input: dict[str, Any] | None = None):
        """Scelta di un preset (nome + icona precompilati) o di «personalizzato»."""
        if user_input is not None:
            preset = user_input.get("preset")
            self._draft = {}
            if preset in PRESET_ICONS:  # il selettore rifiuta già id sconosciuti; «custom» non precompila nulla
                self._draft = {"name": await self._preset_name(preset), "icon": PRESET_ICONS[preset]}
            return await self.async_step_details()
        schema = vol.Schema({vol.Required("preset", default=CUSTOM_PRESET): _PRESET})
        return self.async_show_form(step_id="preset", data_schema=schema)

    async def _preset_name(self, preset: str) -> str:
        """Nome localizzato del preset, ricavato dalle traduzioni del selettore."""
        key = f"component.{DOMAIN}.selector.preset.options.{preset}"
        for language in (self.hass.config.language, "en"):
            names = await translation.async_get_translations(
                self.hass, language, "selector", [DOMAIN]
            )
            if isinstance(names.get(key), str):
                return names[key]
        return preset.replace("_", " ").capitalize()

    async def async_step_edit_type(self, user_input: dict[str, Any] | None = None):
        if user_input is not None:
            current = next((t for t in self._types if t["id"] == user_input["type_id"]), None)
            if current is None:
                return await self.async_step_init()
            self._editing = current["id"]
            self._draft = {"name": current["name"], "icon": current["icon"], "rule_type": current["rule"]["type"]}
            return await self.async_step_details()
        return self.async_show_form(step_id="edit_type", data_schema=self._pick_schema())

    async def async_step_details(self, user_input: dict[str, Any] | None = None):
        errors: dict[str, str] = {}
        if user_input is not None:
            try:
                name = self._check_name(user_input["name"])
                self._draft = {
                    "name": name,
                    "icon": validate_icon(user_input["icon"]),
                    "rule_type": user_input["rule_type"],
                }
            except ValidationError as err:
                errors[err.field] = err.code
                self._draft = {**user_input}
            else:
                return await getattr(self, f"async_step_rule_{self._draft['rule_type']}")()
        d = self._draft
        schema = vol.Schema(
            {
                vol.Required("name", default=d.get("name", vol.UNDEFINED)): selector.TextSelector(),
                vol.Required("icon", default=d.get("icon", DEFAULT_ICON)): selector.IconSelector(),
                vol.Required("rule_type", default=d.get("rule_type", RULE_WEEKLY)): _RULE_TYPE,
            }
        )
        return self.async_show_form(step_id="details", data_schema=schema, errors=errors)

    def _check_name(self, raw: Any) -> str:
        name = validate_name(raw)
        taken = {t["name"].casefold() for t in self._types if t["id"] != self._editing}
        if name.casefold() in taken:
            raise ValidationError("duplicate_name", "name")
        return name

    # ---- passi per ciascuna ricorrenza --------------------------------------
    def _current_rule(self, rtype: str) -> dict[str, Any]:
        if self._editing:
            rule = next(t for t in self._types if t["id"] == self._editing)["rule"]
            if rule["type"] == rtype:
                return rule
        return {}

    async def _rule_step(self, step: str, rtype: str, fields: dict[Any, Any], user_input, convert):
        errors: dict[str, str] = {}
        if user_input is not None:
            try:
                self._save({"type": rtype, **convert(user_input)})
            except ValidationError as err:
                errors[err.field] = err.code
            else:
                return await self.async_step_init()
        schema = vol.Schema(fields)
        if user_input is not None:  # mantiene le scelte dell'utente dopo un errore
            schema = self.add_suggested_values_to_schema(schema, user_input)
        return self.async_show_form(step_id=step, data_schema=schema, errors=errors)

    async def async_step_rule_weekly(self, user_input: dict[str, Any] | None = None):
        cur = self._current_rule(RULE_WEEKLY)
        return await self._rule_step(
            "rule_weekly",
            RULE_WEEKLY,
            {vol.Required("weekdays", default=[str(d) for d in cur.get("weekdays", [])]): _WEEKDAYS},
            user_input,
            lambda i: {"weekdays": [int(d) for d in i["weekdays"]]},
        )

    async def async_step_rule_every_n_weeks(self, user_input: dict[str, Any] | None = None):
        cur = self._current_rule(RULE_EVERY_N_WEEKS)
        return await self._rule_step(
            "rule_every_n_weeks",
            RULE_EVERY_N_WEEKS,
            {
                vol.Required("weekdays", default=[str(d) for d in cur.get("weekdays", [])]): _WEEKDAYS,
                vol.Required("interval", default=cur.get("interval", 2)): _num(2, 8),
                vol.Required("anchor_date", default=cur.get("anchor_date", date.today().isoformat())): selector.DateSelector(),
            },
            user_input,
            lambda i: {
                "weekdays": [int(d) for d in i["weekdays"]],
                "interval": i["interval"],
                "anchor_date": i["anchor_date"],
            },
        )

    async def async_step_rule_monthly_nth_weekday(self, user_input: dict[str, Any] | None = None):
        cur = self._current_rule(RULE_MONTHLY_NTH_WEEKDAY)
        return await self._rule_step(
            "rule_monthly_nth_weekday",
            RULE_MONTHLY_NTH_WEEKDAY,
            {
                vol.Required("nth", default="last" if cur.get("nth") == -1 else str(cur.get("nth", 1))): _NTH,
                vol.Required("weekday", default=str(cur.get("weekday", 0))): _WEEKDAY,
            },
            user_input,
            lambda i: {"nth": -1 if i["nth"] == "last" else i["nth"], "weekday": i["weekday"]},
        )

    async def async_step_rule_monthly_day(self, user_input: dict[str, Any] | None = None):
        cur = self._current_rule(RULE_MONTHLY_DAY)
        return await self._rule_step(
            "rule_monthly_day",
            RULE_MONTHLY_DAY,
            {vol.Required("day", default=cur.get("day", 1)): _num(1, 31)},
            user_input,
            lambda i: {"day": i["day"]},
        )

    def _save(self, rule: dict[str, Any]) -> None:
        item = build_type(
            type_id=self._editing,
            name=self._draft["name"],
            icon=self._draft["icon"],
            rule=rule,
            existing_ids={t["id"] for t in self._types},
        )
        if self._editing:
            self._types = [item if t["id"] == self._editing else t for t in self._types]
        else:
            self._types.append(item)

    # ---- rimozione -----------------------------------------------------------
    async def async_step_remove_type(self, user_input: dict[str, Any] | None = None):
        if user_input is not None:
            self._types = [t for t in self._types if t["id"] != user_input["type_id"]]
            return await self.async_step_init()
        return self.async_show_form(step_id="remove_type", data_schema=self._pick_schema())

    def _pick_schema(self) -> vol.Schema:
        return vol.Schema(
            {
                vol.Required("type_id"): selector.SelectSelector(
                    selector.SelectSelectorConfig(
                        options=[{"value": t["id"], "label": t["name"]} for t in self._types],
                        mode=selector.SelectSelectorMode.LIST,
                    )
                )
            }
        )
