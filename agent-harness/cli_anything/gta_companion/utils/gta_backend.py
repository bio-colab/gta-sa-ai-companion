"""GTA SA Backend Connector & IPC Management Module.

Provides safe, atomic access to the GTA San Andreas game directory,
ainpc_bridge.ini communication channel, and live process inspection.
"""

import os
import sys
import configparser
import subprocess
from pathlib import Path
from typing import Dict, Any, Optional, Tuple


def find_gta_root() -> Path:
    """Resolve the GTA San Andreas root directory."""
    # 1. Environment variable override
    env_dir = os.environ.get("GTA_SA_DIR")
    if env_dir and Path(env_dir).is_dir():
        return Path(env_dir).resolve()

    # 2. Walk up from this package (agent-harness/cli_anything/gta_companion/utils -> root is 4 levels up)
    current = Path(__file__).resolve()
    for parent in current.parents:
        if (parent / "gta_sa.exe").exists() or (parent / "cleo" / "ainpc_bridge.ini").exists():
            return parent.resolve()

    # 3. Working directory fallback
    cwd = Path.cwd().resolve()
    if (cwd / "gta_sa.exe").exists() or (cwd / "cleo" / "ainpc_bridge.ini").exists():
        return cwd

    # 4. Standard default path
    default_path = Path(r"d:\GTA san andreas")
    if default_path.is_dir():
        return default_path

    return cwd


def get_ini_path() -> Path:
    """Return path to cleo/ainpc_bridge.ini."""
    root = find_gta_root()
    return root / "cleo" / "ainpc_bridge.ini"


def is_game_running() -> bool:
    """Check if gta_sa.exe is actively running on Windows."""
    try:
        res = subprocess.run(
            ["tasklist", "/FI", "IMAGENAME eq gta_sa.exe", "/FO", "CSV", "/NH"],
            capture_output=True,
            text=True,
            timeout=3,
        )
        return "gta_sa.exe" in res.stdout.lower()
    except Exception:
        return False


def read_ini_safely() -> Tuple[Dict[str, str], Dict[str, str]]:
    """Read [GAME] and [BRIDGE] sections from ainpc_bridge.ini."""
    ini_path = get_ini_path()
    if not ini_path.exists():
        return {}, {}

    config = configparser.ConfigParser(interpolation=None)
    try:
        config.read(str(ini_path), encoding="utf-8")
        game = dict(config["GAME"]) if "GAME" in config else {}
        bridge = dict(config["BRIDGE"]) if "BRIDGE" in config else {}
        return game, bridge
    except Exception:
        return {}, {}


def write_bridge_section(updates: Dict[str, Any]) -> bool:
    """Atomically update keys in [BRIDGE] section of ainpc_bridge.ini."""
    ini_path = get_ini_path()
    if not ini_path.exists():
        return False

    config = configparser.ConfigParser(interpolation=None)
    try:
        config.read(str(ini_path), encoding="utf-8")
        if not config.has_section("BRIDGE"):
            config.add_section("BRIDGE")

        for k, v in updates.items():
            config.set("BRIDGE", str(k), str(v))

        # Write to temp file then atomic replace to prevent race conditions
        temp_path = ini_path.with_suffix(".tmp")
        with open(temp_path, "w", encoding="utf-8") as f:
            config.write(f)

        if os.name == "nt":
            # On Windows, replace can fail if open, retry with safe replace
            try:
                os.replace(temp_path, ini_path)
            except Exception:
                with open(ini_path, "w", encoding="utf-8") as f:
                    config.write(f)
                if temp_path.exists():
                    temp_path.unlink()
        else:
            os.replace(temp_path, ini_path)

        return True
    except Exception as e:
        return False


def dispatch_action(action_cmd: str, say_text: Optional[str] = None) -> Dict[str, Any]:
    """Queue a game action and optional say text into ainpc_bridge.ini."""
    _, bridge = read_ini_safely()

    try:
        current_action_id = int(bridge.get("action_id", "0"))
    except ValueError:
        current_action_id = 0

    try:
        current_say_id = int(bridge.get("say_id", "0"))
    except ValueError:
        current_say_id = 0

    new_action_id = current_action_id + 1
    updates: Dict[str, Any] = {
        "action_cmd": action_cmd,
        "action_id": str(new_action_id),
    }

    new_say_id = current_say_id
    if say_text:
        new_say_id = current_say_id + 1
        updates["say_text"] = say_text
        updates["say_id"] = str(new_say_id)

    success = write_bridge_section(updates)
    return {
        "success": success,
        "action_id": new_action_id,
        "action_cmd": action_cmd,
        "say_id": new_say_id if say_text else None,
        "say_text": say_text,
    }
