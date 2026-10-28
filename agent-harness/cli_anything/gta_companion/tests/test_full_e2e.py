"""End-to-End and Subprocess Integration Tests for GTA SA AI Companion CLI."""

import os
import sys
import json
import shutil
import subprocess
import pytest


def _resolve_cli(name: str):
    """Resolve installed CLI command; falls back to python -m for dev."""
    force = os.environ.get("CLI_ANYTHING_FORCE_INSTALLED", "").strip() == "1"
    path = shutil.which(name)
    if path:
        return [path]
    if force:
        raise RuntimeError(f"{name} not found in PATH. Install with: pip install -e .")
    return [sys.executable, "-m", "cli_anything.gta_companion.gta_cli"]


class TestCLISubprocess:
    CLI_BASE = _resolve_cli("cli-anything-gta")

    def _run(self, args: list, check: bool = True):
        # Ensure agent-harness root is in PYTHONPATH so python -m resolves cleanly
        env = os.environ.copy()
        harness_root = str(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..")))
        pythonpath = env.get("PYTHONPATH", "")
        env["PYTHONPATH"] = f"{harness_root}{os.pathsep}{pythonpath}" if pythonpath else harness_root

        return subprocess.run(
            self.CLI_BASE + args,
            capture_output=True,
            text=True,
            check=check,
            env=env,
        )

    def test_help(self):
        res = self._run(["--help"])
        assert res.returncode == 0
        assert "GTA San Andreas AI Companion" in res.stdout
        assert "telemetry" in res.stdout
        assert "companion" in res.stdout

    def test_status_json(self):
        res = self._run(["status", "--json"])
        assert res.returncode == 0
        data = json.loads(res.stdout)
        assert data["harness_version"] == "1.0.0"
        assert "game_process_running" in data
        assert "companion" in data
        assert "player" in data

    def test_telemetry_json(self):
        res = self._run(["telemetry", "--json"])
        assert res.returncode == 0
        data = json.loads(res.stdout)
        assert "player" in data
        assert "companion" in data
        assert "environment" in data
        assert "health" in data["player"]

    def test_companion_persona_json(self):
        res = self._run(["companion", "persona", "hitman", "--json"])
        assert res.returncode == 0
        data = json.loads(res.stdout)
        assert data["persona"] == "hitman"
        assert "success" in data

    def test_companion_order_json(self):
        res = self._run(["companion", "order", "cover", "--json"])
        assert res.returncode == 0
        data = json.loads(res.stdout)
        assert data["order"] == "cover"
        assert "action_id" in data

    def test_companion_equip_json(self):
        res = self._run(["companion", "equip", "m4", "--json"])
        assert res.returncode == 0
        data = json.loads(res.stdout)
        assert data["weapon"] == "m4"

    def test_companion_speak_json(self):
        res = self._run(["companion", "speak", "cover", "--json"])
        assert res.returncode == 0
        data = json.loads(res.stdout)
        assert data["speech_event"] == "cover"
        assert data["speech_code"] == 65

    def test_companion_dismiss_json(self):
        res = self._run(["companion", "dismiss", "--json"])
        assert res.returncode == 0
        data = json.loads(res.stdout)
        assert data["status"] == "dismissed"

    def test_memory_json(self):
        res = self._run(["memory", "--json"])
        assert res.returncode == 0
        data = json.loads(res.stdout)
        assert data["aob_scanner_supported"] is True
        assert "CPedPool & CVehiclePool" in data["signatures"]

    def test_config_show_json(self):
        res = self._run(["config", "show", "--json"])
        assert res.returncode == 0
        data = json.loads(res.stdout)
        assert isinstance(data, dict)

    def test_workflow_combat_ready(self):
        # 1. Check status
        r1 = self._run(["status", "--json"])
        assert json.loads(r1.stdout)["harness_version"] == "1.0.0"

        # 2. Set Hitman persona
        r2 = self._run(["companion", "persona", "hitman", "--json"])
        assert json.loads(r2.stdout)["persona"] == "hitman"

        # 3. Equip M4
        r3 = self._run(["companion", "equip", "m4", "--json"])
        assert json.loads(r3.stdout)["weapon"] == "m4"

        # 4. Issue Cover order
        r4 = self._run(["companion", "order", "cover", "--json"])
        assert json.loads(r4.stdout)["order"] == "cover"
