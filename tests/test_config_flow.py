import json
from pathlib import Path

import pytest
from homeassistant import config_entries
from homeassistant.data_entry_flow import FlowResultType, InvalidData
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.garbage_view.const import DOMAIN


async def test_config_flow_single_instance(hass):
    r = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    assert r["type"] == FlowResultType.FORM
    r = await hass.config_entries.flow.async_configure(r["flow_id"], {})
    assert r["type"] == FlowResultType.CREATE_ENTRY
    assert r["options"] == {"types": []}
    r = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    assert r["type"] == FlowResultType.ABORT and r["reason"] == "already_configured"


@pytest.fixture
def entry(hass):
    e = MockConfigEntry(domain=DOMAIN, unique_id=DOMAIN, data={}, options={"types": []})
    e.add_to_hass(hass)
    return e


async def _menu(hass, entry_or_flow, choice):
    r = await hass.config_entries.options.async_configure(entry_or_flow, {"next_step_id": choice})
    return r


async def _add(hass, flow_id, name, icon, rtype, rule_input):
    r = await _menu(hass, flow_id, "add_type")
    assert r["step_id"] == "details"
    r = await hass.config_entries.options.async_configure(flow_id, {"name": name, "icon": icon, "rule_type": rtype})
    assert r["step_id"] == f"rule_{rtype}", r
    return await hass.config_entries.options.async_configure(flow_id, rule_input)


async def test_add_edit_remove(hass, entry):
    r = await hass.config_entries.options.async_init(entry.entry_id)
    fid = r["flow_id"]
    assert r["type"] == FlowResultType.MENU and "edit_type" not in r["menu_options"]

    r = await _add(hass, fid, "Umido", "mdi:food-apple", "weekly", {"weekdays": ["1", "4"]})
    assert r["type"] == FlowResultType.MENU and "edit_type" in r["menu_options"]
    r = await _add(hass, fid, "Carta", "mdi:newspaper", "every_n_weeks",
                   {"weekdays": ["2"], "interval": 2, "anchor_date": "2026-11-04"})
    r = await _add(hass, fid, "Vetro", "mdi:glass-fragile", "monthly_nth_weekday", {"nth": "-1", "weekday": "4"})
    r = await _add(hass, fid, "Ingombranti", "mdi:sofa", "monthly_day", {"day": 15})

    # modifica Umido
    r = await _menu(hass, fid, "edit_type")
    r = await hass.config_entries.options.async_configure(fid, {"type_id": "umido"})
    assert r["step_id"] == "details"
    r = await hass.config_entries.options.async_configure(
        fid, {"name": "Umido", "icon": "mdi:leaf", "rule_type": "weekly"})
    r = await hass.config_entries.options.async_configure(fid, {"weekdays": ["0", "3", "5"]})
    # rimuovi Vetro
    r = await _menu(hass, fid, "remove_type")
    r = await hass.config_entries.options.async_configure(fid, {"type_id": "vetro"})
    r = await _menu(hass, fid, "finish")
    assert r["type"] == FlowResultType.CREATE_ENTRY
    assert r["data"]["types"] == [
        {"id": "umido", "name": "Umido", "icon": "mdi:leaf", "rule": {"type": "weekly", "weekdays": [0, 3, 5]}},
        {"id": "carta", "name": "Carta", "icon": "mdi:newspaper",
         "rule": {"type": "every_n_weeks", "weekdays": [2], "interval": 2, "anchor_date": "2026-11-04"}},
        {"id": "ingombranti", "name": "Ingombranti", "icon": "mdi:sofa", "rule": {"type": "monthly_day", "day": 15}},
    ]
    assert all("color" not in t for t in r["data"]["types"])


async def test_unsaved_changes_dropped_without_finish(hass, entry):
    r = await hass.config_entries.options.async_init(entry.entry_id)
    await _add(hass, r["flow_id"], "Umido", "mdi:a", "monthly_day", {"day": 1})
    hass.config_entries.options.async_abort(r["flow_id"])
    assert entry.options["types"] == []


async def test_validation_errors(hass, entry):
    r = await hass.config_entries.options.async_init(entry.entry_id)
    fid = r["flow_id"]
    await _menu(hass, fid, "add_type")
    r = await hass.config_entries.options.async_configure(fid, {"name": "  ", "icon": "mdi:a", "rule_type": "weekly"})
    assert r["errors"] == {"name": "invalid_name"}
    r = await hass.config_entries.options.async_configure(fid, {"name": "A", "icon": "nope", "rule_type": "weekly"})
    assert r["errors"] == {"icon": "invalid_icon"}
    r = await hass.config_entries.options.async_configure(fid, {"name": "A", "icon": "mdi:a", "rule_type": "weekly"})
    r = await hass.config_entries.options.async_configure(fid, {"weekdays": []})
    assert r["errors"] == {"weekdays": "no_weekdays"}
    with pytest.raises(InvalidData):  # già respinto dal selettore, prima della nostra validazione
        await hass.config_entries.options.async_configure(fid, {"weekdays": ["9"]})
    r = await hass.config_entries.options.async_configure(fid, {"weekdays": ["1"]})
    assert r["type"] == FlowResultType.MENU


async def test_duplicate_name(hass, entry):
    r = await hass.config_entries.options.async_init(entry.entry_id)
    fid = r["flow_id"]
    await _add(hass, fid, "Umido", "mdi:a", "monthly_day", {"day": 1})
    await _menu(hass, fid, "add_type")
    r = await hass.config_entries.options.async_configure(
        fid, {"name": "umido", "icon": "mdi:a", "rule_type": "monthly_day"})
    assert r["errors"] == {"name": "duplicate_name"}


async def test_max_types(hass):
    types = [{"id": f"t{i}", "name": f"T{i}", "icon": "mdi:a", "rule": {"type": "monthly_day", "day": 1}}
             for i in range(20)]
    e = MockConfigEntry(domain=DOMAIN, unique_id=DOMAIN, data={}, options={"types": types})
    e.add_to_hass(hass)
    r = await hass.config_entries.options.async_init(e.entry_id)
    r = await _menu(hass, r["flow_id"], "add_type")
    assert r["type"] == FlowResultType.ABORT and r["reason"] == "max_types"


def test_translations_complete():
    base = Path(__file__).parent.parent / "custom_components/garbage_view/translations"
    en, it = (json.loads((base / f"{n}.json").read_text()) for n in ("en", "it"))

    def keys(d, p=""):
        return {f"{p}{k}" for k, v in d.items() if not isinstance(v, dict)} | {
            kk for k, v in d.items() if isinstance(v, dict) for kk in keys(v, f"{p}{k}.")}

    assert keys(en) == keys(it)
    assert en["options"]["error"].keys() >= {"invalid_name", "duplicate_name", "invalid_icon", "no_weekdays"}


async def test_edit_keeps_own_name(hass):
    t = {"id": "umido", "name": "Umido", "icon": "mdi:a", "rule": {"type": "monthly_day", "day": 1}}
    e = MockConfigEntry(domain=DOMAIN, unique_id=DOMAIN, data={}, options={"types": [t]})
    e.add_to_hass(hass)
    r = await hass.config_entries.options.async_init(e.entry_id)
    fid = r["flow_id"]
    await _menu(hass, fid, "edit_type")
    await hass.config_entries.options.async_configure(fid, {"type_id": "umido"})
    r = await hass.config_entries.options.async_configure(
        fid, {"name": "Umido", "icon": "mdi:b", "rule_type": "monthly_day"})
    assert r["step_id"] == "rule_monthly_day"
    await hass.config_entries.options.async_configure(fid, {"day": 31})
    r = await _menu(hass, fid, "finish")
    assert r["data"]["types"] == [{**t, "icon": "mdi:b", "rule": {"type": "monthly_day", "day": 31}}]
