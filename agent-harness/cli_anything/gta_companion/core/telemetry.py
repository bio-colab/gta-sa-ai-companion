"""GTA SA Live Telemetry Extraction & Formatting Module."""

from typing import Dict, Any, Optional
from cli_anything.gta_companion.utils.gta_backend import read_ini_safely, is_game_running

WEAPONS_MAP = {
    0: "Unarmed (Fist)", 1: "Brass Knuckles", 2: "Golf Club", 3: "Nightstick", 4: "Knife",
    5: "Baseball Bat", 6: "Shovel", 7: "Pool Cue", 8: "Katana", 9: "Chainsaw",
    16: "Grenade", 18: "Molotov",
    22: "9mm Pistol", 23: "Silenced 9mm", 24: "Desert Eagle",
    25: "Shotgun", 26: "Sawn-off Shotgun", 27: "Combat Shotgun (SPAS-12)",
    28: "Micro SMG (Uzi)", 29: "SMG (MP5)", 30: "AK-47", 31: "M4 Carbine",
    32: "Tec-9", 33: "Country Rifle", 34: "Sniper Rifle",
    35: "Rocket Launcher (RPG)", 36: "Heat-Seeking RPG", 37: "Flamethrower", 38: "Minigun",
    41: "Spraycan", 42: "Fire Extinguisher", 43: "Camera", 46: "Parachute",
}


def get_live_telemetry() -> Dict[str, Any]:
    """Retrieve structured live telemetry from the game bridge."""
    running = is_game_running()
    game, bridge = read_ini_safely()

    wep_id = 0
    try:
        wep_id = int(game.get("cj_weapon", "0"))
    except ValueError:
        pass

    wep_name = WEAPONS_MAP.get(wep_id, f"Weapon ID #{wep_id}")

    try:
        health = float(game.get("cj_health", "100.0"))
    except ValueError:
        health = 100.0

    try:
        wanted = int(game.get("cj_wanted", "0"))
    except ValueError:
        wanted = 0

    npc_active = game.get("npc_active", "0") == "1"

    return {
        "game_process_running": running,
        "bridge_status": bridge.get("status", "unknown"),
        "companion": {
            "active": npc_active,
            "persona": bridge.get("active_persona", "companion") or "companion",
            "mode": bridge.get("active_mode", "companion"),
            "model_id": game.get("npc_model", "none"),
            "trust_level": float(bridge.get("trust_level", "0.50")),
            "bravery": float(bridge.get("bravery", "0.50")),
        },
        "player": {
            "health": health,
            "wanted_level": wanted,
            "weapon_id": wep_id,
            "weapon_name": wep_name,
            "in_vehicle": game.get("cj_in_car", "0") == "1",
        },
        "environment": {
            "threat_active": game.get("threat_active", "0") == "1",
            "last_action_ack": int(game.get("action_ack", "0")),
            "last_say_ack": int(game.get("say_ack", "0")),
        },
    }
