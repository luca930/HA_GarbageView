"""Costanti di Garbage View (vedi docs/CONTRACT.md)."""
DOMAIN = "garbage_view"
SCHEMA_VERSION = 1
CONF_TYPES = "types"
CARD_URL = "/garbage_view/garbage-view-card.js"

RULE_WEEKLY = "weekly"
RULE_EVERY_N_WEEKS = "every_n_weeks"
RULE_MONTHLY_NTH_WEEKDAY = "monthly_nth_weekday"
RULE_MONTHLY_DAY = "monthly_day"

RULE_TYPES = (RULE_WEEKLY, RULE_EVERY_N_WEEKS, RULE_MONTHLY_NTH_WEEKDAY, RULE_MONTHLY_DAY)

MAX_TYPES = 20
NAME_MAX_LEN = 40
DEFAULT_ICON = "mdi:trash-can-outline"

# ---- Orario di ritiro (CONTRACT.md §1) ----
PICKUP_MORNING = "morning"
PICKUP_EVENING = "evening"
PICKUPS = (PICKUP_MORNING, PICKUP_EVENING)
DEFAULT_PICKUP = PICKUP_MORNING

# ---- Notifiche (CONTRACT.md §3) ----
CONF_NOTIFICATIONS = "notifications"
N_ENABLED = "enabled"
N_TARGETS = "targets"
N_TIME = "time"
N_EVENING_TIME = "evening_time"
N_PUT_OUT_FROM = "put_out_from"
N_SKIP_EMPTY = "skip_if_empty"
N_TITLE = "title_template"
N_MESSAGE = "message_template"

NOTIFY_TARGET_PREFIX = "mobile_app_"
TEMPLATE_MAX_LEN = 200
MAX_TARGETS = 10
CATCH_UP_MINUTES = 60  # dopo un riavvio, invia in ritardo solo entro questa finestra
DEFAULT_NOTIFICATIONS = {
    N_ENABLED: False,
    N_TARGETS: [],
    N_TIME: "07:30:00",
    N_EVENING_TIME: "20:00:00",
    N_PUT_OUT_FROM: "18:00:00",
    N_SKIP_EMPTY: True,
    N_TITLE: "",
    N_MESSAGE: "",
}
