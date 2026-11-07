import json
from pathlib import Path

import pytest
import voluptuous as vol
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


async def _start_custom(hass, flow_id):
    await _menu(hass, flow_id, "add_type")
    return await hass.config_entries.options.async_configure(flow_id, {"preset": "custom"})


async def _add(hass, flow_id, name, icon, rtype, rule_input):
    r = await _menu(hass, flow_id, "add_type")
    assert r["step_id"] == "preset"
    r = await hass.config_entries.options.async_configure(flow_id, {"preset": "custom"})
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
    r = await _add(hass, fid, "Vetro", "mdi:glass-fragile", "monthly_nth_weekday", {"nth": "last", "weekday": "4"})
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
        {"id": "umido", "name": "Umido", "icon": "mdi:leaf", "rule": {"type": "weekly", "weekdays": [0, 3, 5]},
         "pickup": "morning"},
        {"id": "carta", "name": "Carta", "icon": "mdi:newspaper", "pickup": "morning",
         "rule": {"type": "every_n_weeks", "weekdays": [2], "interval": 2, "anchor_date": "2026-11-04"}},
        {"id": "ingombranti", "name": "Ingombranti", "icon": "mdi:sofa", "rule": {"type": "monthly_day", "day": 15},
         "pickup": "morning"},
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
    await _start_custom(hass, fid)
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


async def test_rule_error_keeps_input(hass, entry):
    r = await hass.config_entries.options.async_init(entry.entry_id)
    fid = r["flow_id"]
    await _start_custom(hass, fid)
    await hass.config_entries.options.async_configure(
        fid, {"name": "Carta", "icon": "mdi:a", "rule_type": "every_n_weeks"})
    r = await hass.config_entries.options.async_configure(
        fid, {"weekdays": [], "interval": 2, "anchor_date": "2026-11-04"})
    assert r["errors"] == {"weekdays": "no_weekdays"}
    suggested = {str(k): k.description["suggested_value"] for k in r["data_schema"].schema if k.description}
    assert suggested["anchor_date"] == "2026-11-04"


async def test_duplicate_name(hass, entry):
    r = await hass.config_entries.options.async_init(entry.entry_id)
    fid = r["flow_id"]
    await _add(hass, fid, "Umido", "mdi:a", "monthly_day", {"day": 1})
    await _start_custom(hass, fid)
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
    assert r["data"]["types"] == [
        {**t, "icon": "mdi:b", "rule": {"type": "monthly_day", "day": 31}, "pickup": "morning"}
    ]  # un tipo salvato prima della 0.2.2 (senza pickup) diventa "mattina"


def test_translation_option_keys_valid_for_hassfest():
    """hassfest: le chiavi di `selector.*.options` devono essere [a-z0-9-_]+, senza trattini/underscore ai bordi."""
    import json, pathlib, re
    ok = re.compile(r"^[a-z0-9]([a-z0-9_-]*[a-z0-9])?$")
    for f in pathlib.Path("custom_components/garbage_view/translations").glob("*.json"):
        for sel in json.loads(f.read_text())["selector"].values():
            assert all(ok.match(k) for k in sel["options"]), f


def _default(result, field):
    for key in result["data_schema"].schema:
        if key == field:
            return key.default()
    raise AssertionError(field)


async def test_preset_prefills_name_and_icon(hass, entry):
    hass.config.language = "it"
    r = await hass.config_entries.options.async_init(entry.entry_id)
    fid = r["flow_id"]
    r = await _menu(hass, fid, "add_type")
    assert r["step_id"] == "preset"
    r = await hass.config_entries.options.async_configure(fid, {"preset": "garden"})
    assert r["step_id"] == "details"
    assert _default(r, "name") == "Sfalci e verde"
    assert _default(r, "icon") == "mdi:leaf"
    # l'utente può cambiare l'icona con una qualsiasi mdi: valida
    r = await hass.config_entries.options.async_configure(
        fid, {"name": "Sfalci e verde", "icon": "mdi:grass", "rule_type": "weekly"})
    r = await hass.config_entries.options.async_configure(fid, {"weekdays": ["2"]})
    r = await _menu(hass, fid, "finish")
    assert r["data"]["types"][0]["icon"] == "mdi:grass"


async def test_preset_name_follows_language_with_fallback(hass, entry):
    hass.config.language = "en"
    r = await hass.config_entries.options.async_init(entry.entry_id)
    await _menu(hass, r["flow_id"], "add_type")
    r = await hass.config_entries.options.async_configure(r["flow_id"], {"preset": "organic"})
    assert _default(r, "name") == "Organic waste"
    hass.config.language = "xx"  # lingua senza traduzione: ripiego su inglese
    r = await hass.config_entries.options.async_init(entry.entry_id)
    await _menu(hass, r["flow_id"], "add_type")
    r = await hass.config_entries.options.async_configure(r["flow_id"], {"preset": "glass"})
    assert _default(r, "name") == "Glass"


async def test_custom_preset_has_no_prefill(hass, entry):
    r = await hass.config_entries.options.async_init(entry.entry_id)
    await _menu(hass, r["flow_id"], "add_type")
    r = await hass.config_entries.options.async_configure(r["flow_id"], {"preset": "custom"})
    assert r["step_id"] == "details"
    assert _default(r, "icon") == "mdi:trash-can-outline"
    assert all(k != "name" or k.default is vol.UNDEFINED for k in r["data_schema"].schema)


async def test_unknown_preset_rejected(hass, entry):
    r = await hass.config_entries.options.async_init(entry.entry_id)
    await _menu(hass, r["flow_id"], "add_type")
    with pytest.raises(InvalidData):
        await hass.config_entries.options.async_configure(r["flow_id"], {"preset": "../etc"})


@pytest.mark.parametrize("icon", ["https://x.y/a.svg", "mdi:", "mdi:A b", "mdi:<script>", "hass:foo", "mdi:a;b"])
async def test_custom_icon_must_be_mdi(hass, entry, icon):
    r = await hass.config_entries.options.async_init(entry.entry_id)
    await _menu(hass, r["flow_id"], "add_type")
    r = await hass.config_entries.options.async_configure(r["flow_id"], {"preset": "custom"})
    r = await hass.config_entries.options.async_configure(
        r["flow_id"], {"name": "A", "icon": icon, "rule_type": "weekly"})
    assert r["errors"] == {"icon": "invalid_icon"}


def test_preset_translations_complete():
    from custom_components.garbage_view.presets import PRESET_OPTIONS, PRESET_ICONS
    from custom_components.garbage_view.validation import ICON_RE
    base = Path(__file__).parent.parent / "custom_components" / "garbage_view" / "translations"
    for lang in ("it", "en"):
        opts = json.loads((base / f"{lang}.json").read_text())["selector"]["preset"]["options"]
        assert set(opts) == set(PRESET_OPTIONS)
        assert all(len(opts[p]) <= 40 for p in PRESET_ICONS)
    assert all(ICON_RE.fullmatch(i) for i in PRESET_ICONS.values())


async def test_existing_types_unchanged_by_editing(hass):
    # tipi salvati prima dei preset (anche con icona non presente nei preset) restano validi
    t = {"id": "x", "name": "X", "icon": "mdi:weird-custom-1", "rule": {"type": "monthly_day", "day": 1}}
    e = MockConfigEntry(domain=DOMAIN, unique_id=DOMAIN, data={}, options={"types": [t]})
    e.add_to_hass(hass)
    r = await hass.config_entries.options.async_init(e.entry_id)
    r = await _menu(hass, r["flow_id"], "edit_type")
    r = await hass.config_entries.options.async_configure(r["flow_id"], {"type_id": "x"})
    assert _default(r, "icon") == "mdi:weird-custom-1"


async def test_pickup_choice_saved_and_editable(hass, entry):
    r = await hass.config_entries.options.async_init(entry.entry_id)
    fid = r["flow_id"]
    await _menu(hass, fid, "add_type")
    await hass.config_entries.options.async_configure(fid, {"preset": "custom"})
    r = await hass.config_entries.options.async_configure(
        fid, {"name": "Carta", "icon": "mdi:a", "rule_type": "weekly", "pickup": "evening"})
    await hass.config_entries.options.async_configure(fid, {"weekdays": ["1"]})
    # in modifica il valore salvato è preselezionato; si può cambiare
    await _menu(hass, fid, "edit_type")
    r = await hass.config_entries.options.async_configure(fid, {"type_id": "carta"})
    assert next(k for k in r["data_schema"].schema if k == "pickup").default() == "evening"
    await hass.config_entries.options.async_configure(
        fid, {"name": "Carta", "icon": "mdi:a", "rule_type": "weekly", "pickup": "morning"})
    await hass.config_entries.options.async_configure(fid, {"weekdays": ["1"]})
    r = await _menu(hass, fid, "finish")
    assert r["data"]["types"][0]["pickup"] == "morning"


async def test_invalid_pickup_rejected(hass, entry):
    r = await hass.config_entries.options.async_init(entry.entry_id)
    fid = r["flow_id"]
    await _start_custom(hass, fid)
    with pytest.raises(InvalidData):
        await hass.config_entries.options.async_configure(
            fid, {"name": "X", "icon": "mdi:a", "rule_type": "weekly", "pickup": "noon"})
