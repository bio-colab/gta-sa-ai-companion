"""Unit Tests for GTA SA AI Companion Core Modules."""

import pytest
from pathlib import Path
import tempfile
import json

from cli_anything.gta_companion.core.session import Session
from cli_anything.gta_companion.core.telemetry import WEAPONS_MAP, get_live_telemetry
from cli_anything.gta_companion.core.companion import (
    switch_persona,
    issue_order,
    equip_weapon,
    trigger_speech,
    dismiss_companion,
    VALID_PERSONAS,
    WEAPON_COMMANDS,
    SPEECH_EVENTS,
)
from cli_anything.gta_companion.core.memory import get_memory_signatures_info


class TestSession:
    def test_session_init_and_record(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            sess_file = Path(tmpdir) / "session.json"
            session = Session(session_path=sess_file)
            assert session.active_persona == "companion"
            assert len(session.history) == 0

            session.record_action("test_action", {"key": "val"}, undo_payload={"undo": True})
            assert len(session.history) == 1
            assert len(session.undo_stack) == 1
            assert session.history[0]["action"] == "test_action"

            undone = session.undo()
            assert undone is not None
            assert undone["action"] == "test_action"
            assert len(session.undo_stack) == 0

    def test_session_save_and_load(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            sess_file = Path(tmpdir) / "session.json"
            s1 = Session(session_path=sess_file)
            s1.active_persona = "hitman"
            s1.record_action("spawn", {"model": 105})

            s2 = Session(session_path=sess_file)
            assert s2.active_persona == "hitman"
            assert len(s2.history) == 1


class TestTelemetry:
    def test_weapons_mapping(self):
        assert WEAPONS_MAP[0] == "Unarmed (Fist)"
        assert WEAPONS_MAP[24] == "Desert Eagle"
        assert WEAPONS_MAP[31] == "M4 Carbine"
        assert WEAPONS_MAP[35] == "Rocket Launcher (RPG)"

    def test_get_live_telemetry_structure(self):
        telem = get_live_telemetry()
        assert "game_process_running" in telem
        assert "bridge_status" in telem
        assert "companion" in telem
        assert "player" in telem
        assert "environment" in telem
        assert isinstance(telem["player"]["health"], float)
        assert isinstance(telem["player"]["wanted_level"], int)


class TestCompanionLogic:
    def test_persona_validation(self):
        for p in VALID_PERSONAS:
            res = switch_persona(p)
            assert "success" in res
            assert res["persona"] == p

        inv = switch_persona("astronaut")
        assert inv["success"] is False
        assert "Invalid persona" in inv["error"]

    def test_order_dispatch(self):
        res = issue_order("cover")
        assert "success" in res
        assert res["order"] == "cover"

        inv = issue_order("fly_to_moon")
        assert inv["success"] is False
        assert "Invalid order" in inv["error"]

    def test_equip_weapon(self):
        for wep in WEAPON_COMMANDS.keys():
            res = equip_weapon(wep)
            assert "success" in res
            assert res["weapon"] == wep

        inv = equip_weapon("plasma_rifle")
        assert inv["success"] is False
        assert "Unknown weapon" in inv["error"]

    def test_speech_events(self):
        for ev in SPEECH_EVENTS.keys():
            res = trigger_speech(ev)
            assert "success" in res
            assert res["speech_event"] == ev

        inv = trigger_speech("sing_opera")
        assert inv["success"] is False
        assert "Unknown speech event" in inv["error"]

    def test_dismiss(self):
        res = dismiss_companion()
        assert "success" in res
        assert res["status"] == "dismissed"


class TestMemoryModule:
    def test_signatures_info(self):
        info = get_memory_signatures_info()
        assert info["aob_scanner_supported"] is True
        assert info["target_executable"] == "gta_sa.exe"
        assert info["signatures_count"] >= 4
        assert "CPedPool & CVehiclePool" in info["signatures"]
        assert "CPed::Say" in info["signatures"]
