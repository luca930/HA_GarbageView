"""Notifiche push programmate verso l'app mobile di Home Assistant.

* Nessun polling: un listener ``async_track_time_change`` per orario.
* Fuso orario di Home Assistant (anche con ora legale).
* Nessun doppio invio: l'ultimo giorno di invio è salvato su disco.
* Testi tradotti (``notification_texts/<lingua>.json``) nella lingua di HA.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.event import async_track_time_change
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import (
    CATCH_UP_MINUTES,
    CONF_NOTIFICATIONS,
    DEFAULT_NOTIFICATIONS,
    DOMAIN,
    N_ENABLED,
    N_EVENING,
    N_EVENING_TIME,
    N_MESSAGE,
    N_SKIP_EMPTY,
    N_TARGETS,
    N_TIME,
    N_TITLE,
    NOTIFY_TARGET_PREFIX,
)
from .recurrence import occurs_on

_LOGGER = logging.getLogger(__name__)

KIND_TODAY = "today"        # al mattino: cosa portare fuori oggi
KIND_TOMORROW = "tomorrow"  # la sera prima: cosa portare fuori domani
KINDS = (KIND_TODAY, KIND_TOMORROW)

_TEXTS_DIR = Path(__file__).parent / "notification_texts"
_FALLBACK_LANG = "en"
_PLACEHOLDER_RE = re.compile(r"\{(items|count|when|date)\}")
STORE_VERSION = 1


def load_texts(language: str) -> dict[str, str]:
    """Testi per `language` (es. "it", "pt-BR"); ripiega sulla lingua base e poi su "en"."""
    base = _read(_FALLBACK_LANG)
    candidates = [language, language.split("-")[0].split("_")[0]]
    for code in candidates:
        if re.fullmatch(r"[A-Za-z]{2,3}([-_][A-Za-z0-9]{2,8})?", code or ""):
            texts = _read(code.replace("_", "-"))
            if texts:
                return {**base, **texts}
    return base


def _read(code: str) -> dict[str, str]:
    path = _TEXTS_DIR / f"{code}.json"
    if path.parent != _TEXTS_DIR or not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return {k: v for k, v in data.items() if isinstance(v, str)} if isinstance(data, dict) else {}


def join_names(names: list[str], word_and: str) -> str:
    if len(names) <= 1:
        return "".join(names)
    return f"{', '.join(names[:-1])} {word_and} {names[-1]}"


def _fill(template: str, values: dict[str, str]) -> str:
    # Sostituzione dei soli segnaposto noti: niente str.format, niente accesso ad attributi.
    return _PLACEHOLDER_RE.sub(lambda m: values[m.group(1)], template)


def render(
    texts: dict[str, str], opts: dict[str, Any], kind: str, names: list[str], day: date
) -> tuple[str, str]:
    """Titolo e messaggio per `kind`; i template personalizzati hanno la precedenza."""
    values = {
        "items": join_names(names, texts["and"]),
        "count": str(len(names)),
        "when": texts[f"when_{kind}"],
        "date": day.isoformat(),
    }
    title = opts.get(N_TITLE) or texts[f"title_{kind}"]
    if opts.get(N_MESSAGE):
        message = opts[N_MESSAGE]
    elif names:
        message = texts[f"message_{kind}"]
    else:
        message = texts[f"message_empty_{kind}"]
    return _fill(title, values), _fill(message, values)


class Notifier:
    """Programma e invia le notifiche in base alle opzioni dell'integrazione."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.hass = hass
        self.entry = entry
        self._store: Store[dict[str, str]] = Store(
            hass, STORE_VERSION, f"{DOMAIN}.{entry.entry_id}.notified"
        )
        self._sent: dict[str, str] = {}
        self._unsubs: list[CALLBACK_TYPE] = []
        self._lock = asyncio.Lock()
        self._texts: dict[str, dict[str, str]] = {}

    # ---- opzioni ------------------------------------------------------------
    @property
    def options(self) -> dict[str, Any]:
        raw = self.entry.options.get(CONF_NOTIFICATIONS)
        return {**DEFAULT_NOTIFICATIONS, **(raw if isinstance(raw, dict) else {})}

    # ---- ciclo di vita --------------------------------------------------------
    async def async_start(self) -> None:
        self._sent = {k: v for k, v in (await self._store.async_load() or {}).items() if k in KINDS}
        self._schedule()
        await self._async_catch_up()

    @callback
    def async_stop(self) -> None:
        self._unschedule()

    @callback
    def async_reload(self) -> None:
        """Riprogramma dopo un cambio di opzioni."""
        self._unschedule()
        self._schedule()

    def _unschedule(self) -> None:
        for unsub in self._unsubs:
            unsub()
        self._unsubs = []

    def _schedule(self) -> None:
        opts = self.options
        if not opts[N_ENABLED] or not opts[N_TARGETS]:
            return
        for kind, enabled, key in (
            (KIND_TODAY, True, N_TIME),
            (KIND_TOMORROW, opts[N_EVENING], N_EVENING_TIME),
        ):
            if not enabled:
                continue
            t = dt_util.parse_time(opts[key])
            if t is None:
                _LOGGER.warning("Orario notifica non valido: %s", opts[key])
                continue
            self._unsubs.append(
                async_track_time_change(
                    self.hass,
                    self._make_handler(kind),
                    hour=t.hour,
                    minute=t.minute,
                    second=t.second,
                )
            )

    def _make_handler(self, kind: str):
        @callback
        def _fire(_now: datetime) -> None:
            self.hass.async_create_task(self.async_send(kind), eager_start=True)

        return _fire

    async def _async_catch_up(self) -> None:
        """Dopo un riavvio recupera un invio mancato di poco (entro CATCH_UP_MINUTES)."""
        opts = self.options
        if not opts[N_ENABLED] or not opts[N_TARGETS]:
            return
        now = dt_util.now()
        for kind, enabled, key in (
            (KIND_TODAY, True, N_TIME),
            (KIND_TOMORROW, opts[N_EVENING], N_EVENING_TIME),
        ):
            t = dt_util.parse_time(opts[key])
            if not enabled or t is None:
                continue
            due = datetime.combine(now.date(), t, tzinfo=now.tzinfo)
            if due <= now <= due + timedelta(minutes=CATCH_UP_MINUTES):
                await self.async_send(kind)

    # ---- invio ----------------------------------------------------------------
    def _names_for(self, day: date) -> list[str]:
        types = self.entry.options.get("types", [])
        return [
            t["name"]
            for t in types
            if isinstance(t, dict) and "name" in t and "rule" in t and occurs_on(t["rule"], day)
        ]

    async def _async_texts(self) -> dict[str, str]:
        lang = self.hass.config.language or _FALLBACK_LANG
        if lang not in self._texts:
            self._texts[lang] = await self.hass.async_add_executor_job(load_texts, lang)
        return self._texts[lang]

    async def async_send(
        self, kind: str, *, force: bool = False, targets: list[str] | None = None
    ) -> bool:
        """Invia la notifica `kind`. Con `force` ignora dedup e "salta se vuoto" (test)."""
        if kind not in KINDS:
            raise ValueError(f"kind sconosciuto: {kind}")
        opts = self.options
        async with self._lock:
            today = dt_util.now().date()
            if not force and self._sent.get(kind) == today.isoformat():
                return False
            day = today if kind == KIND_TODAY else today + timedelta(days=1)
            names = self._names_for(day)
            if not names and opts[N_SKIP_EMPTY] and not force:
                return False
            texts = await self._async_texts()
            title, message = render(texts, opts, kind, names, day)
            ok = await self._async_deliver(targets or opts[N_TARGETS], title, message)
            if ok and not force:
                self._sent[kind] = today.isoformat()
                await self._store.async_save(dict(self._sent))
            return ok

    async def _async_deliver(self, targets: list[str], title: str, message: str) -> bool:
        delivered = False
        for target in targets:
            if not target.startswith(NOTIFY_TARGET_PREFIX) or not self.hass.services.has_service(
                "notify", target
            ):
                _LOGGER.warning("Servizio notify.%s non disponibile, salto", target)
                continue
            try:
                await self.hass.services.async_call(
                    "notify", target, {"title": title, "message": message}, blocking=True
                )
                delivered = True
            except HomeAssistantError as err:
                _LOGGER.warning("Invio a notify.%s non riuscito: %s", target, err)
        return delivered
