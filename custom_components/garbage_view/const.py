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
