"""Companion Lifecycle & High-Level Command Orchestration."""

from typing import Dict, Any, Optional
from cli_anything.gta_companion.utils.gta_backend import dispatch_action, write_bridge_section, read_ini_safely

VALID_PERSONAS = ["companion", "hitman", "driver", "heavy", "medic", "girlfriend"]

WEAPON_COMMANDS = {
    "m4": ("give_weapon_m4", "M4 Assault Rifle"),
    "deagle": ("give_weapon_deagle", "Desert Eagle"),
    "pistol": ("give_weapon_pistol", "9mm Pistol"),
    "shotgun": ("give_weapon_shotgun", "Combat Shotgun"),
    "smg": ("give_weapon_smg", "MP5 Submachine Gun"),
    "rpg": ("give_weapon_rpg", "Rocket Launcher (RPG)"),
}

SPEECH_EVENTS = {
    "recruit": ("JoinGangYes", 126),
    "dismiss": ("OrderDisbandOne", 150),
    "attack": ("ShootGeneric", 184),
    "gun": ("GunCool", 114),
    "cover": ("CoverMe", 65),
    "follow": ("OrderFollowNearOne", 154),
    "agree": ("PconvAgreeGood", 162),
    "enter_car": ("CarGetIn", 35),
}


def switch_persona(persona: str) -> Dict[str, Any]:
    """Switch active companion persona and sync state."""
    persona_clean = persona.lower().strip()
    if persona_clean not in VALID_PERSONAS:
        return {
            "success": False,
            "error": f"Invalid persona '{persona}'. Choose from: {', '.join(VALID_PERSONAS)}",
        }

    updates = {
        "active_persona": persona_clean if persona_clean != "companion" else "",
        "active_mode": "combat" if persona_clean in ["hitman", "heavy"] else ("vehicle" if persona_clean == "driver" else "companion"),
    }
    write_bridge_section(updates)
    cmd = f"persona_{persona_clean}"
    res = dispatch_action(cmd, say_text=f"~g~[PERSONA ACTIVATED] Role set to {persona_clean.upper()}~w~")
    return {
        "success": res["success"],
        "persona": persona_clean,
        "action_id": res["action_id"],
        "action_cmd": cmd,
    }


def issue_order(order_name: str) -> Dict[str, Any]:
    """Dispatch an tactical order to the companion."""
    order_clean = order_name.lower().strip()
    valid_orders = {
        "follow": ("order_follow", "~y~Companion is following CJ.~w~"),
        "attack": ("order_attack", "~r~Companion attacking target!~w~"),
        "cover": ("order_cover", "~b~Taking tactical cover!~w~"),
        "heal": ("heal", "~g~Health and armor restored!~w~"),
        "drive": ("order_drive", "~y~Companion entering driver seat.~w~"),
        "distract": ("order_distract", "~p~Creating diversion!~w~"),
        "regroup": ("order_regroup", "~g~Regrouping on CJ!~w~"),
    }

    if order_clean not in valid_orders:
        return {
            "success": False,
            "error": f"Invalid order '{order_name}'. Choose from: {', '.join(valid_orders.keys())}",
        }

    cmd, msg = valid_orders[order_clean]
    res = dispatch_action(cmd, say_text=msg)
    return {
        "success": res["success"],
        "order": order_clean,
        "action_id": res["action_id"],
    }


def equip_weapon(weapon_name: str) -> Dict[str, Any]:
    """Equip companion or CJ with specified tactical weapon."""
    wep_clean = weapon_name.lower().strip()
    if wep_clean not in WEAPON_COMMANDS:
        return {
            "success": False,
            "error": f"Unknown weapon '{weapon_name}'. Choose from: {', '.join(WEAPON_COMMANDS.keys())}",
        }

    cmd, label = WEAPON_COMMANDS[wep_clean]
    res = dispatch_action(cmd, say_text=f"~g~Equipped {label}!~w~")
    return {
        "success": res["success"],
        "weapon": wep_clean,
        "label": label,
        "action_id": res["action_id"],
    }


def trigger_speech(speech_key: str) -> Dict[str, Any]:
    """Trigger an authentic in-engine native voice line for the companion."""
    key_clean = speech_key.lower().strip()
    if key_clean not in SPEECH_EVENTS:
        return {
            "success": False,
            "error": f"Unknown speech event '{speech_key}'. Choose from: {', '.join(SPEECH_EVENTS.keys())}",
        }

    label, code = SPEECH_EVENTS[key_clean]
    cmd = f"speak_{key_clean}"
    res = dispatch_action(cmd)
    return {
        "success": res["success"],
        "speech_event": key_clean,
        "speech_code": code,
        "action_id": res["action_id"],
    }


def dismiss_companion() -> Dict[str, Any]:
    """Dismiss companion, clear group follow, and restore normal ped AI."""
    res = dispatch_action("dismiss_companion", say_text="~y~Companion dismissed safely.~w~")
    write_bridge_section({
        "active_persona": "",
        "active_mode": "companion",
    })
    return {
        "success": res["success"],
        "status": "dismissed",
        "action_id": res["action_id"],
    }
