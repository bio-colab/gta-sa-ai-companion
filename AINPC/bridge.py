# ====================================================================
# GTA San Andreas - AI NPC Bridge (Phase 2.5: Voice-In / Text-Out Active)
# Bulletproof Concurrency, Safe INI & Groq Cloud Speech Architecture
# ====================================================================

import os
import sys
import time
import queue
import threading
from datetime import datetime
import psutil
from llm_brain import LLMBrain
from voice_stt import VoiceSTT
from ped_demographics import resolve_persona_input, CORE_PERSONAS

# توافق مع Windows Console
if sys.platform == "win32":
    import ctypes
    _kernel32 = ctypes.windll.kernel32
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
else:
    _kernel32 = None

_last_gta_check_time = 0.0
_cached_gta_running = False

def is_gta_running(cache_ttl: float = 1.5) -> bool:
    """فحص ما إذا كانت عملية لعبة GTA San Andreas مشغلة حالياً مع تخزين مؤقت لتقليل استهلاك المعالج"""
    global _last_gta_check_time, _cached_gta_running
    now = time.time()
    if now - _last_gta_check_time < cache_ttl:
        return _cached_gta_running
    _last_gta_check_time = now
    try:
        for p in psutil.process_iter(['name']):
            p_name = p.info.get('name')
            if p_name and p_name.lower() in ['gta_sa.exe', 'gta-sa.exe', 'gta_sa']:
                _cached_gta_running = True
                return True
    except Exception:
        pass
    _cached_gta_running = False
    return False

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INI_PATH = os.path.join(BASE_DIR, "cleo", "ainpc_bridge.ini")

WEAPONS = {
    0: "Unarmed (Fist)", 1: "Brass Knuckles", 2: "Golf Club", 3: "Nightstick", 4: "Knife",
    5: "Baseball Bat", 6: "Shovel", 7: "Pool Cue", 8: "Katana", 9: "Chainsaw",
    16: "Grenade", 18: "Molotov",
    22: "Pistol (Colt 45)", 23: "Silenced 9mm", 24: "Desert Eagle",
    25: "Shotgun", 26: "Sawn-off Shotgun", 27: "Combat Shotgun",
    28: "Micro Uzi", 29: "MP5", 30: "AK-47", 31: "M4 Rifle", 32: "TEC-9",
    33: "Country Rifle", 34: "Sniper Rifle", 35: "Rocket Launcher", 36: "Heat-Seeking RPG",
    37: "Flamethrower", 38: "Minigun", 39: "Satchel Charges"
}

HEAVY_WEAPONS = {8, 9, 16, 18, 27, 35, 36, 37, 38, 39}

RADIO_STATIONS = {
    -1: {"name": "Radio Off", "genre": "Silence", "vibe": "quiet driving"},
    0: {"name": "Playback FM", "genre": "Classic East Coast Hip-Hop", "vibe": "Golden Age hip hop (Kool G Rap, Big Daddy Kane)"},
    1: {"name": "K-Rose", "genre": "Classic Country", "vibe": "Country & Western (Willie Nelson, Patsy Cline)"},
    2: {"name": "K-DST", "genre": "Classic Rock", "vibe": "The Dust - 70s rock (Tom Petty, Kiss, Boston)"},
    3: {"name": "Bounce FM", "genre": "Funk & Disco", "vibe": "70s Funk & Boogie (Kool & the Gang, Ohio Players)"},
    4: {"name": "SF-UR", "genre": "House & Techno", "vibe": "San Fierro Underground club tracks"},
    5: {"name": "Radio Los Santos", "genre": "West Coast Rap", "vibe": "90s Gangsta Rap (Dr. Dre, Snoop Dogg, 2Pac)"},
    6: {"name": "Radio X", "genre": "Alternative & Grunge", "vibe": "90s Rock & Grunge (Guns N Roses, Soundgarden)"},
    7: {"name": "CSR 103.9", "genre": "New Jack Swing & R&B", "vibe": "Smooth 90s Soul & Pop (Bell Biv DeVoe, Boyz II Men)"},
    8: {"name": "K-JAH West", "genre": "Reggae & Dub", "vibe": "Chill Roots Reggae and Dub vibes"},
    9: {"name": "Master Sounds 98.3", "genre": "Rare Groove & Soul", "vibe": "Classic Soul, James Brown, Booker T"},
    10: {"name": "WCTR", "genre": "Talk Radio", "vibe": "Crazy San Andreas talk shows and conspiracy theorists"},
    11: {"name": "User Track Player", "genre": "Custom Tracks", "vibe": "CJ's personal mixtape"},
    12: {"name": "Radio Off", "genre": "Silence", "vibe": "quiet"}
}

WEATHER_NAMES = {
    0: "Extra Sunny (Los Santos)",
    1: "Sunny (Los Santos)",
    2: "Smoggy Sunny (Los Santos)",
    3: "Smoggy (Los Santos)",
    4: "Cloudy (Los Santos)",
    5: "Sunny (San Fierro)",
    6: "Extra Sunny (San Fierro)",
    7: "Cloudy (San Fierro)",
    8: "Rainy (San Fierro)",
    9: "Foggy (San Fierro)",
    10: "Sunny (Las Venturas)",
    11: "Extra Sunny (Las Venturas)",
    12: "Cloudy (Las Venturas)",
    13: "Extra Sunny (Countryside)",
    14: "Sunny (Countryside)",
    15: "Cloudy (Countryside)",
    16: "Rainy (Countryside)",
    17: "Extra Sunny (Desert)",
    18: "Sunny (Desert)",
    19: "Sandstorm (Desert)"
}

def get_time_period(hour: int) -> str:
    if 5 <= hour < 7:
        return "Dawn"
    elif 7 <= hour < 12:
        return "Morning"
    elif 12 <= hour < 18:
        return "Afternoon"
    elif 18 <= hour < 21:
        return "Sunset / Dusk"
    elif 21 <= hour < 24:
        return "Night"
    else:
        return "Midnight / Late Night"

from poi_manager import get_spatial_brief, resolve_zone_name

# ====================================================================
# Safe INI Parser & Serializer (مقاوم تماماً لتعارضات القراءة والكتابة)
# ====================================================================

class SafeIniManager:
    def __init__(self, path: str):
        self.path = os.path.abspath(path)
        self.data = {}
        self.lock = threading.Lock()
        self._last_mtime = 0.0

    def reload(self, force: bool = False) -> bool:
        """قراءة آمنة مع فحص تاريخ التعديل لتفادي استهلاك المعالج وإعادة المحاولة عند قفل الملف"""
        if not os.path.exists(self.path):
            return False

        try:
            mtime = os.path.getmtime(self.path)
            if not force and mtime == self._last_mtime and self.data:
                return True
            self._last_mtime = mtime
        except OSError:
            pass

        for _ in range(3):
            try:
                with open(self.path, "r", encoding="utf-8", errors="replace") as f:
                    lines = f.readlines()

                cur_sec = None
                new_data = {}
                for line in lines:
                    line = line.strip()
                    if not line or line.startswith(";") or line.startswith("#"):
                        continue
                    if line.startswith("[") and line.endswith("]"):
                        cur_sec = line[1:-1].strip().upper()
                        if cur_sec not in new_data:
                            new_data[cur_sec] = {}
                    elif "=" in line and cur_sec:
                        k, v = line.split("=", 1)
                        new_data[cur_sec][k.strip().lower()] = v.strip()

                with self.lock:
                    self.data = new_data
                return True
            except (PermissionError, OSError):
                time.sleep(0.01)
            except Exception:
                break
        return False

    def has_section(self, section: str) -> bool:
        with self.lock:
            return section.upper() in self.data

    def get_str(self, section: str, key: str, default: str = "") -> str:
        with self.lock:
            val = self.data.get(section.upper(), {}).get(key.lower(), default)
        if isinstance(val, (list, tuple)):
            val = val[0] if val else default
        return str(val).strip()

    def get_int(self, section: str, key: str, default: int = 0) -> int:
        val = self.get_str(section, key, "")
        if not val:
            return default
        try:
            return int(float(val))
        except (ValueError, TypeError):
            return default

    def get_float(self, section: str, key: str, default: float = 0.0) -> float:
        val = self.get_str(section, key, "")
        if not val:
            return default
        try:
            return float(val)
        except (ValueError, TypeError):
            return default

    def update_bridge_section(self, bridge_dict: dict) -> bool:
        """تحديث قسم BRIDGE فقط حصرياً عبر Windows Native API الذرية دون لمس أسطر GAME أو إعادة كتابة الملف"""
        if _kernel32 is not None:
            try:
                for k, v in bridge_dict.items():
                    _kernel32.WritePrivateProfileStringW("BRIDGE", str(k), str(v), self.path)
                return True
            except Exception:
                pass

        # Fallback لأنظمة غير ويندوز
        for _ in range(5):
            try:
                game_lines = []
                if os.path.exists(self.path):
                    with open(self.path, "r", encoding="utf-8", errors="replace") as f:
                        lines = f.readlines()
                    in_game = False
                    for line in lines:
                        stripped = line.strip()
                        if stripped.upper() == "[GAME]":
                            in_game = True
                        elif stripped.startswith("[") and stripped.endswith("]"):
                            in_game = False
                        if in_game:
                            game_lines.append(line)

                bridge_lines = ["[BRIDGE]\n"]
                for k, v in bridge_dict.items():
                    bridge_lines.append(f"{k} = {v}\n")
                bridge_lines.append("\n")

                all_lines = bridge_lines + game_lines
                with open(self.path, "w", encoding="utf-8") as f:
                    f.writelines(all_lines)
                return True
            except (PermissionError, OSError):
                time.sleep(0.01)
            except Exception:
                time.sleep(0.01)
        return False

    def reset_game_section(self) -> bool:
        """تصفير قسم GAME بالكامل لمنع قراءة بيانات شبحية قديمة من جلسات سابقة"""
        for _ in range(5):
            try:
                bridge_lines = ["[BRIDGE]\n"]
                if os.path.exists(self.path):
                    with open(self.path, "r", encoding="utf-8", errors="replace") as f:
                        lines = f.readlines()
                    in_bridge = False
                    for line in lines:
                        stripped = line.strip()
                        if stripped.upper() == "[BRIDGE]":
                            in_bridge = True
                            continue
                        elif stripped.startswith("[") and stripped.endswith("]"):
                            in_bridge = False
                        if in_bridge and "=" in stripped:
                            bridge_lines.append(line)

                default_game_lines = [
                    "\n[GAME]\n",
                    "status = offline\n",
                    "pong = 0\n",
                    "npc_active = 0\n",
                    "say_ack = 0\n",
                    "action_ack = 0\n",
                    "text_cmd_id = 0\n"
                ]
                with open(self.path, "w", encoding="utf-8") as f:
                    f.writelines(bridge_lines + default_game_lines)
                self.reload()
                return True
            except Exception:
                time.sleep(0.01)
        return False

# ====================================================================
# إدارة الحالة والأوامر
# ====================================================================

ini = SafeIniManager(INI_PATH)
say_counter = 0
action_counter = 0
say_fifo = queue.Queue()
action_fifo = queue.Queue()
in_flight_say = None     # (say_id, text, sent_time)
in_flight_action = None  # (action_id, cmd, sent_time)
command_lock = threading.Lock()

bridge_state = {
    "status": "ready",
    "ping": "1",
    "say_id": "0",
    "say_text": "",
    "action_id": "0",
    "action_cmd": "",
    "active_mode": "companion",
    "active_persona": "companion",
    "trust_level": "0.50",
    "bravery": "0.50"
}

llm_queue = queue.Queue()
brain = LLMBrain()
stt = VoiceSTT()

latest_game_context = {}
last_autonomous_event_time = 0.0
AUTONOMOUS_COOLDOWN_SEC = 8.0

def log(msg: str):
    now = datetime.now().strftime("%H:%M:%S")
    print(f"[{now}] {msg}", flush=True)

def set_active_mode(new_mode: str) -> bool:
    new_mode = new_mode.lower().strip()
    if new_mode in ["companion", "combat", "vehicle", "emote"]:
        brain.current_mode = new_mode
        bridge_state["active_mode"] = new_mode
        ini.update_bridge_section(bridge_state)
        log(f"[MODE SWITCH] Active mode set to: [{new_mode.upper()}]")
        return True
    return False

def apply_persona_command(user_text: str) -> bool:
    """معالجة وتطبيق أوامر تخصيص الشخصية ونظام الـ System Instructions الخاص بالـ NPC"""
    persona_info = resolve_persona_input(user_text)
    if not persona_info:
        return False

    try:
        npc_model = latest_game_context.get("npc_model", 107) if latest_game_context else 107
        identity = brain.get_or_create_identity(npc_model)
        npc_name = identity.get("name", "Companion")

        # تحديث وتخزين الشخصية في مخ الذكاء الاصطناعي وقاعدة البيانات الدائمة SQLite
        intro_quote = brain.set_custom_persona(npc_model, persona_info)

        p_type = persona_info.get("type", "custom")
        if p_type in ["companion", "reset", "none"]:
            bridge_state["active_persona"] = ""
            bridge_state["active_mode"] = "companion"
            bridge_state["trust_level"] = f"{brain.get_current_trust():.2f}"
            bridge_state["bravery"] = f"{brain.get_current_bravery():.2f}"
            ini.update_bridge_section(bridge_state)
            queue_say(f"{persona_info['gta_subtitle']}~n~~y~{npc_name}:~w~ {intro_quote}")
            queue_action("persona_companion")
            log(f"[PERSONA RESET] {npc_name} reset to default companion mode.")
            return True

        bridge_state["active_persona"] = p_type
        bridge_state["trust_level"] = f"{brain.get_current_trust():.2f}"
        bridge_state["bravery"] = f"{brain.get_current_bravery():.2f}"
        ini.update_bridge_section(bridge_state)

        # إرسال إشعار للشاشة وتفعيل قدرات السكريبت فوراً
        queue_say(f"{persona_info['gta_subtitle']}~n~~y~{npc_name}:~w~ {intro_quote}")
        if persona_info.get("action"):
            queue_action(persona_info["action"])

        log(f"[PERSONA ACTIVATED] [{persona_info['title']}] assigned to {npc_name} (Model {npc_model})!")
        log(f"  Intro Dialogue: \"{intro_quote}\"")
        return True
    except Exception as e:
        log(f"[PERSONA ERROR] Failed to apply persona command: {e}")
        return False

def queue_say(text: str):
    global say_counter
    with command_lock:
        say_counter += 1
        sid = say_counter
        say_fifo.put((sid, text))
    log(f"[QUEUED SUBTITLE #{sid}] \"{text}\"")

def queue_action(cmd: str):
    global action_counter
    with command_lock:
        action_counter += 1
        aid = action_counter
        action_fifo.put((aid, cmd))
    log(f"[QUEUED ACTION #{aid}] Command: {cmd}")

def llm_worker():
    """خيط خلفي لمعالجة طلبات الذكاء الاصطناعي دون إيقاف نبض الاتصال"""
    while True:
        try:
            req = llm_queue.get()
            if req is None:
                break

            trigger_type = req.get("type", "prompt")
            context = req.get("context", {})
            user_prompt = req.get("prompt")

            log(f"[LLM BRAIN] Processing request (Type: {trigger_type} | Mode: {brain.current_mode.upper()})...")
            say_text, action_cmd, active_mode = brain.generate_response(context, trigger_type, user_prompt)
            latency = brain.last_response_time

            log(f"[LLM BRAIN ({latency:.0f}ms)] Responded: \"{say_text}\" | Action: {action_cmd} | Mode: [{active_mode.upper()}]")

            bridge_state["trust_level"] = f"{brain.get_current_trust():.2f}"
            bridge_state["bravery"] = f"{brain.get_current_bravery():.2f}"
            if active_mode and active_mode != bridge_state.get("active_mode"):
                bridge_state["active_mode"] = active_mode
                log(f"[MODE TRANSITION] Active mode transitioned to: [{active_mode.upper()}]")
            ini.update_bridge_section(bridge_state)

            if say_text:
                disp_name = brain.current_identity["name"] if brain.current_identity else "AI NPC"
                queue_say(f"~y~{disp_name}:~w~ {say_text}")
            if action_cmd and action_cmd != "none":
                queue_action(action_cmd)

            llm_queue.task_done()
        except Exception as e:
            log(f"[LLM Worker Error]: {e}")

def trigger_llm_event(context: dict, event_desc: str):
    global last_autonomous_event_time
    now = time.time()
    if now - last_autonomous_event_time < AUTONOMOUS_COOLDOWN_SEC:
        return

    last_autonomous_event_time = now
    ctx = dict(context)
    ctx["event_desc"] = event_desc
    llm_queue.put({"type": "event", "context": ctx, "prompt": None})

def trigger_llm_prompt(user_text: str):
    global latest_game_context
    ctx = dict(latest_game_context) if latest_game_context else {
        "zone": "San Andreas", "cj_health": 100, "cj_weapon_name": "Fist",
        "cj_wanted": 0, "cj_mode": "On Foot", "npc_health": 100, "npc_dist": 2.0
    }
    llm_queue.put({"type": "prompt", "context": ctx, "prompt": user_text})

def format_telemetry(ini_mgr: SafeIniManager) -> str:
    cj_health = ini_mgr.get_int("GAME", "cj_health", 100)
    cj_armor = ini_mgr.get_int("GAME", "cj_armor", 0)
    cj_weapon = ini_mgr.get_int("GAME", "cj_weapon", 0)
    cj_wanted = ini_mgr.get_int("GAME", "cj_wanted", 0)
    cj_in_car = ini_mgr.get_int("GAME", "cj_in_car", 0)
    cj_car_model = ini_mgr.get_int("GAME", "cj_car_model", 0)
    raw_zone = ini_mgr.get_str("GAME", "cj_zone", "SAN_AND")
    cj_x = ini_mgr.get_float("GAME", "cj_x", 2495.0)
    cj_y = ini_mgr.get_float("GAME", "cj_y", -1686.0)
    spatial = get_spatial_brief(cj_x, cj_y, raw_zone)
    zone_name = spatial["zone"]

    weapon_name = WEAPONS.get(cj_weapon, f"Weapon #{cj_weapon}")
    car_str = f"In Vehicle (Model {cj_car_model})" if cj_in_car else "On Foot"
    stars_str = f"{cj_wanted} Stars" if cj_wanted > 0 else "0 Stars (Clean)"

    clock_hour = ini_mgr.get_int("GAME", "clock_hour", 12)
    clock_min = ini_mgr.get_int("GAME", "clock_min", 0)
    weather_id = ini_mgr.get_int("GAME", "weather_id", -1)
    car_radio = ini_mgr.get_int("GAME", "car_radio", -1)
    threat_active = ini_mgr.get_int("GAME", "threat_active", 0)
    car_crashed = ini_mgr.get_int("GAME", "car_crashed", 0)

    time_period = get_time_period(clock_hour)
    weather_name = WEATHER_NAMES.get(weather_id, "Clear / Normal")
    radio_name = RADIO_STATIONS.get(car_radio, {"name": "Radio Off"})["name"]

    npc_active = ini_mgr.get_int("GAME", "npc_active", 0)

    lines = [
        f"  [CJ]  Zone: {zone_name} | HP: {cj_health}% | Armor: {cj_armor}% | Gun: {weapon_name} | Wanted: {stars_str} | Mode: {car_str}",
        f"  [ENV] Time: {clock_hour:02d}:{clock_min:02d} ({time_period}) | Weather: {weather_name} | Radio: {radio_name if cj_in_car else 'N/A'}"
    ]

    if car_crashed:
        lines.append("  [CRASH] ** VIOLENT COLLISION / CRASH IMPACT DETECTED! **")

    if threat_active:
        lines.append("  [THREAT] ** HOSTILE THREAT ACTIVE (Engaging Drive-By / Combat!) **")

    target_active = ini_mgr.get_int("GAME", "target_active", 0)
    target_x = ini_mgr.get_float("GAME", "target_x", 0.0)
    target_y = ini_mgr.get_float("GAME", "target_y", 0.0)
    if target_active:
        lines.append(f"  [GPS] Target Waypoint Active at ({target_x:.1f}, {target_y:.1f})")

    lines.append(f"  [POI] Food: {spatial['nearest_food']} | Guns: {spatial['nearest_weapons']}")

    if npc_active:
        npc_health = ini_mgr.get_int("GAME", "npc_health", 100)
        npc_armor = ini_mgr.get_int("GAME", "npc_armor", 0)
        npc_model = ini_mgr.get_int("GAME", "npc_model", 0)
        npc_weapon = ini_mgr.get_int("GAME", "npc_weapon", 0)
        npc_in_car = ini_mgr.get_int("GAME", "npc_in_car", 0)
        npc_dist = ini_mgr.get_float("GAME", "npc_dist", 0.0)
        npc_mode = "In Vehicle" if npc_in_car else "On Foot"
        npc_weapon_name = WEAPONS.get(npc_weapon, f"Weapon #{npc_weapon}")

        demo = brain.demographics_engine.get_demographics(npc_model)
        demo_name = demo["name"]
        demo_gender = demo["gender"].capitalize()
        demo_age = demo["age"].capitalize()
        demo_arch = demo["archetype"]
        cur_mode = bridge_state.get("active_mode", brain.current_mode).upper()
        lines.append(f"  [NPC] {demo_name} ({demo_gender}, {demo_age} - {demo_arch}) | Layer: [{cur_mode}] | Model: {npc_model} | HP: {npc_health}% | Armor: {npc_armor}% | Gun: {npc_weapon_name} | Dist: {npc_dist:.1f}m | Escort: {npc_mode}")
    else:
        lines.append("  [NPC] STANDBY (No active ped attached. Press H near a citizen in-game)")

    return "\n".join(lines)

def input_thread_func():
    """خيط إدخال تفاعلي من الطرفية للتحدث مع الذكاء الاصطناعي أو إصدار أوامر مباشرة"""
    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                break
            text = line.strip()
            if not text:
                continue

            if text == "mode":
                cur_m = bridge_state.get("active_mode", brain.current_mode).upper()
                print(f"\n[LAYERED ARCHITECTURE] Active Layer/Mode: [{cur_m}]", flush=True)
                print("  Available Modes: companion | combat | vehicle | emote", flush=True)
                print("  Switch mode by typing: mode <name> (e.g. 'mode emote', 'mode combat')\n", flush=True)
            elif text in ["persona", "role"]:
                cur_p = bridge_state.get("active_persona", "companion").upper()
                print(f"\n[PERSONA SYSTEM] Active Persona: [{cur_p}]", flush=True)
                print("  Core Archetypes: hitman | medic | heavy | driver | girlfriend", flush=True)
                print("  Assign in-game or console via: /persona <role> (e.g. '/persona hitman', '/persona medic')", flush=True)
                print("  Or custom free-form instruction: /persona You are a loyal Russian bodyguard...\n", flush=True)
            elif apply_persona_command(text):
                continue
            elif text.startswith("mode "):
                target_m = text[5:].strip().lower()
                if target_m in ["social", "chill", "dance", "feelings"]:
                    target_m = "emote"
                elif target_m in ["war", "weapons"]:
                    target_m = "combat"
                elif target_m in ["drive", "car"]:
                    target_m = "vehicle"
                elif target_m in ["normal", "follow"]:
                    target_m = "companion"
                if set_active_mode(target_m):
                    print(f"\n[SUCCESS] Active Layer/Mode switched to: [{target_m.upper()}]!", flush=True)
                else:
                    print(f"\n[ERROR] Unknown mode '{target_m}'. Valid options: companion, combat, vehicle, emote", flush=True)
            elif text.startswith("act "):
                cmd = text[4:].strip()
                if cmd in ["look", "look_at_player"]:
                    queue_action("look_at_player")
                elif cmd in ["face", "face_player"]:
                    queue_action("face_player")
                elif cmd in ["hands", "hands_up"]:
                    queue_action("hands_up")
                elif cmd in ["heal", "hesoyam"]:
                    queue_action("heal")
                elif cmd in ["rifle", "m4", "arm_rifle"]:
                    queue_action("arm_rifle")
                elif cmd in ["pistol", "deagle", "arm_pistol"]:
                    queue_action("arm_pistol")
                elif cmd in ["smg", "uzi", "arm_smg"]:
                    queue_action("arm_smg")
                elif cmd in ["shotgun", "arm_shotgun"]:
                    queue_action("arm_shotgun")
                elif cmd in ["disarm", "holster"]:
                    queue_action("disarm")
                elif cmd in ["fetch", "fetch_car", "bring_car", "jack", "jack_car"]:
                    queue_action("fetch_car")
                elif cmd in ["drive", "cruise", "wander", "drive_wander"]:
                    queue_action("drive_wander")
                elif cmd in ["waypoint", "target", "drive_to_target", "marker"]:
                    queue_action("drive_to_target")
                elif cmd in ["exit", "exit_car", "leave", "leave_car"]:
                    queue_action("exit_car")
                elif cmd in ["driveby", "drive_by", "shoot"]:
                    if brain.current_mode not in ["combat", "vehicle"]:
                        print(f"\n[AI GUARD] Action '{cmd}' requires COMBAT or VEHICLE mode! Auto-activating COMBAT mode...", flush=True)
                        set_active_mode("combat")
                    queue_action("driveby")
                elif cmd in ["attack", "attack_threat", "defend"]:
                    if brain.current_mode != "combat":
                        set_active_mode("combat")
                    queue_action("attack")
                elif cmd in ["follow", "follow_player", "return", "stop", "cancel", "come"]:
                    queue_action("follow_player")
                elif cmd in ["dance", "dance_female", "dance_male", "flirt", "kiss", "drunk", "act_drunk", "drink", "sober", "sober_up", "gang", "gang_sign", "reppin", "smoke", "cigarette", "cheer", "clap", "cower"]:
                    if brain.current_mode != "emote":
                        print(f"\n[AI GUARD] Action '{cmd}' requires EMOTE mode! Auto-activating EMOTE mode...", flush=True)
                        set_active_mode("emote")
                    queue_action(cmd)
                else:
                    queue_action(cmd)
            elif text.startswith("say "):
                clean_say = text[4:].strip()
                queue_say(f"~y~AI NPC:~w~ {clean_say}")
            elif text == "status":
                if ini.reload() and ini.has_section("GAME"):
                    print(format_telemetry(ini), flush=True)
                else:
                    print("Game not connected.", flush=True)
            elif text == "v":
                print("\n[VOICE TEST] Recording microphone for 3 seconds... Speak now in Arabic or English!", flush=True)
                stt.start_recording()
                time.sleep(3.0)
                txt, lat = stt.stop_recording_and_transcribe()
                print(f"[VOICE TEST ({lat:.0f}ms)] Transcribed: \"{txt}\"", flush=True)
                if txt:
                    trigger_llm_prompt(txt)
            elif text == "help":
                print("\n[Commands]:", flush=True)
                print("  mode                  -> Show active layer/mode (companion/combat/vehicle/emote)", flush=True)
                print("  mode <name>           -> Switch active mode (e.g. 'mode emote', 'mode combat')", flush=True)
                print("  act <fetch_car|drive|exit|arm_rifle|heal|dance|flirt|drunk|sober|gang|smoke|cheer|cower> -> Actions", flush=True)
                print("  say <text>            -> Force immediate subtitle on game screen", flush=True)
                print("  status                -> Print current in-game telemetry snapshot", flush=True)
                print("  help                  -> Show this help message\n", flush=True)
            else:
                log(f"[USER -> AI NPC] \"{text}\"")
                trigger_llm_prompt(text)
        except Exception:
            break

def main():
    global say_fifo, action_fifo, in_flight_say, in_flight_action, latest_game_context, bridge_state, say_counter, action_counter

    log("====================================================================")
    log("   GTA San Andreas AI NPC - Bridge (Phase 2.5 Voice-In / Text-Out)  ")
    log("====================================================================")
    log(f"Bridge Target: {INI_PATH}")
    log(f"LLM Model:     {brain.model} (Groq Cloud)")
    log(f"STT Model:     {stt.model} (Groq Cloud Whisper)")

    # تشغيل خيط الذكاء الاصطناعي وخيط الإدخال
    llm_t = threading.Thread(target=llm_worker, daemon=True)
    llm_t.start()

    input_t = threading.Thread(target=input_thread_func, daemon=True)
    input_t.start()

    # تنظيف أي حالة سابقة في ملف الجسر لتفادي أي بيانات شبحية من جلسات قديمة
    gta_active = is_gta_running()
    if not gta_active:
        log("[BRIDGE] Initialized in STANDBY mode. Waiting for GTA San Andreas (gta_sa.exe) to start...")
        ini.reset_game_section()
    else:
        log("[BRIDGE] GTA San Andreas process detected running. Initializing handshake...")

    bridge_state["status"] = "connecting" if gta_active else "standby"
    bridge_state["ping"] = "0"
    bridge_state["say_id"] = "0"
    bridge_state["say_text"] = ""
    bridge_state["action_id"] = "0"
    bridge_state["action_cmd"] = ""
    bridge_state["active_mode"] = "companion"
    bridge_state["active_persona"] = ""
    ini.update_bridge_section(bridge_state)
    log("[BRIDGE] Instructions: Hold Key 'T' to speak, press Key '~' (or F6) in GTA to type, or type message here...")

    handshake_established = False
    welcome_sent = False
    ping_counter = 0
    last_ping_time = time.time()
    last_successful_pong_time = time.time()
    last_telemetry_print_time = 0
    last_telemetry_snapshot = ""

    ini.reload()
    say_counter = max(say_counter, ini.get_int("GAME", "say_ack", 0), ini.get_int("BRIDGE", "say_id", 0))
    action_counter = max(action_counter, ini.get_int("GAME", "action_ack", 0), ini.get_int("BRIDGE", "action_id", 0))
    last_seen_say_ack = ini.get_int("GAME", "say_ack", 0)
    last_seen_action_ack = ini.get_int("GAME", "action_ack", 0)
    last_seen_text_cmd_id = ini.get_int("GAME", "text_cmd_id", 0)

    # حالات سابقة لاكتشاف الأحداث
    prev_cj_weapon = None
    prev_cj_wanted = None
    prev_cj_in_car = None
    prev_cj_health = None
    prev_npc_active = 0
    prev_ptt_active = 0
    prev_car_radio = None
    last_radio_comment_time = 0.0
    last_crash_comment_time = 0.0
    last_ambient_comment_time = 0.0
    prev_hour_period = None
    prev_weather_id = None
    prev_threat_active = 0

    try:
        while True:
            time.sleep(0.08) # 80ms استقصاء سريع

            now = time.time()

            # 1. التحقق من وجود عملية اللعبة الحقيقية لمنع قراءة بيانات قديمة
            gta_alive = is_gta_running()
            if not gta_alive:
                if handshake_established:
                    handshake_established = False
                    welcome_sent = False
                    ping_counter = 0
                    brain.reset_session()
                    log("--------------------------------------------------------------------")
                    log("[GAME CLOSED] GTA San Andreas process closed. Returning to standby...")
                    log("[BRIDGE] Waiting for game to relaunch...")
                    log("--------------------------------------------------------------------")
                    bridge_state["status"] = "standby"
                    bridge_state["ping"] = "0"
                    ini.update_bridge_section(bridge_state)
                    ini.reset_game_section()
                time.sleep(1.0)
                continue

            if not ini.reload() or not ini.has_section("GAME"):
                continue

            game_status = ini.get_str("GAME", "status", "offline")
            game_pong = ini.get_int("GAME", "pong", 0)

            # 2. المصافحة الحية المؤكدة برقم النبضة المتطابق (Real-Time Ping/Pong Matching)
            if not handshake_established:
                if ping_counter == 0 or (now - last_ping_time > 2.0):
                    ping_counter += 1
                    last_ping_time = now
                    bridge_state["status"] = "connecting"
                    bridge_state["ping"] = str(ping_counter)
                    ini.update_bridge_section(bridge_state)

                if game_pong == ping_counter and game_pong > 0:
                    handshake_established = True
                    last_successful_pong_time = now
                    rtt_ms = (now - last_ping_time) * 1000
                    log("====================================================================")
                    log(f"  [SUCCESS] HANDSHAKE LINKED! (Game Status: {game_status} | Latency: {rtt_ms:.1f}ms)")
                    log("====================================================================")
                    if not welcome_sent:
                        welcome_sent = True
                        queue_say("~y~AI NPC:~w~ Brain online! Hold T to speak, or press F6 to type.")
                        queue_action("look_at_player")
                continue
            else:
                # 3. فحص الـ Pong النشط ومطابقته
                if game_pong == ping_counter:
                    last_successful_pong_time = now

                # نبض الاتصال الدوري كل ثانية
                if now - last_ping_time > 1.0:
                    last_ping_time = now
                    ping_counter += 1
                    bridge_state["status"] = "active"
                    bridge_state["ping"] = str(ping_counter)
                    ini.update_bridge_section(bridge_state)

                # كاشف تشنج اللعبة أو التوقف الطويل (مهلة 20 ثانية)
                if now - last_successful_pong_time > 20.0:
                    log("--------------------------------------------------------------------")
                    log("[DISCONNECTED] Game stopped responding to heartbeat pings.")
                    log("[BRIDGE] Returning to standby. Waiting for game response...")
                    log("--------------------------------------------------------------------")
                    handshake_established = False
                    welcome_sent = False
                    ping_counter = 0
                    last_ping_time = now
                    continue

                # =========================================================
                # 4. معالجة زر التحدث المباشر بالمايكروفون (Push-To-Talk)
                # =========================================================
                ptt_active = ini.get_int("GAME", "ptt_active", 0)
                if ptt_active == 1 and prev_ptt_active == 0:
                    log("[VOICE] PTT Key Held: Recording player speech...")
                    stt.start_recording()
                elif ptt_active == 0 and prev_ptt_active == 1:
                    log("[VOICE] PTT Key Released: Processing audio via Groq Whisper...")
                    def async_transcribe():
                        text, lat = stt.stop_recording_and_transcribe()
                        if text:
                            log(f"[VOICE TRANSCRIBED ({lat:.0f}ms)] Player said: \"{text}\"")
                            trigger_llm_prompt(text)
                        else:
                            log("[VOICE] Audio too brief or no speech detected.")
                    threading.Thread(target=async_transcribe, daemon=True).start()
                prev_ptt_active = ptt_active

                # =========================================================
                # 4.2 استلام أوامر شريط الكتابة داخل اللعبة (In-Game Text Bar)
                # =========================================================
                text_cmd_id = ini.get_int("GAME", "text_cmd_id", 0)
                if text_cmd_id != last_seen_text_cmd_id and text_cmd_id > 0:
                    last_seen_text_cmd_id = text_cmd_id
                    typed_text = ini.get_str("GAME", "text_cmd", "").strip()
                    if typed_text:
                        log(f"[IN-GAME TEXT COMMAND #{text_cmd_id}] Player typed: \"{typed_text}\"")
                        try:
                            if not apply_persona_command(typed_text):
                                trigger_llm_prompt(typed_text)
                        except Exception as e:
                            log(f"[TEXT CMD ERROR] Error processing in-game command: {e}")

                # فحص تأكيد استلام اللعبة (Acks)
                game_say_ack = ini.get_int("GAME", "say_ack", 0)
                if game_say_ack > last_seen_say_ack:
                    last_seen_say_ack = game_say_ack
                    log(f"  [ACK CONFIRMED] Subtitle #{game_say_ack} displayed on screen!")

                game_action_ack = ini.get_int("GAME", "action_ack", 0)
                if game_action_ack > last_seen_action_ack:
                    last_seen_action_ack = game_action_ack
                    log(f"  [ACK CONFIRMED] Action #{game_action_ack} executed by NPC!")

                # تحرير الحزم الحالية إذا أكدتها اللعبة أو مر عليها أكثر من 5 ثوان كأمان
                if in_flight_say and (game_say_ack >= in_flight_say[0] or (now - in_flight_say[2] > 5.0)):
                    in_flight_say = None

                if in_flight_action and (game_action_ack >= in_flight_action[0] or (now - in_flight_action[2] > 5.0)):
                    in_flight_action = None

                # =========================================================
                # 5. إرسال الحوارات والأوامر من طوابير FIFO بالتتابع المؤكد
                # =========================================================
                need_bridge_sync = False
                with command_lock:
                    if in_flight_say is None and not say_fifo.empty():
                        sid, stext = say_fifo.get()
                        in_flight_say = (sid, stext, now)
                        bridge_state["say_id"] = str(sid)
                        bridge_state["say_text"] = stext
                        need_bridge_sync = True

                    if in_flight_action is None and not action_fifo.empty():
                        aid, acmd = action_fifo.get()
                        in_flight_action = (aid, acmd, now)
                        bridge_state["action_id"] = str(aid)
                        bridge_state["action_cmd"] = acmd
                        need_bridge_sync = True

                if need_bridge_sync:
                    ini.update_bridge_section(bridge_state)

                # =========================================================
                # 6. استخراج التيليميتري وتحليل الأحداث الحية للذكاء الاصطناعي
                # =========================================================
                try:
                    cj_health = ini.get_int("GAME", "cj_health", 100)
                    cj_weapon = ini.get_int("GAME", "cj_weapon", 0)
                    cj_wanted = ini.get_int("GAME", "cj_wanted", 0)
                    cj_in_car = ini.get_int("GAME", "cj_in_car", 0)
                    cj_car_model = ini.get_int("GAME", "cj_car_model", 0)
                    raw_zone = ini.get_str("GAME", "cj_zone", "SAN_AND")
                    cj_x = ini.get_float("GAME", "cj_x", 2495.0)
                    cj_y = ini.get_float("GAME", "cj_y", -1686.0)
                    target_active = ini.get_int("GAME", "target_active", 0)
                    target_x = ini.get_float("GAME", "target_x", 0.0)
                    target_y = ini.get_float("GAME", "target_y", 0.0)

                    clock_hour = ini.get_int("GAME", "clock_hour", 12)
                    clock_min = ini.get_int("GAME", "clock_min", 0)
                    weather_id = ini.get_int("GAME", "weather_id", -1)
                    car_radio = ini.get_int("GAME", "car_radio", -1)
                    car_crashed = ini.get_int("GAME", "car_crashed", 0)
                    crash_severity = ini.get_int("GAME", "crash_severity", 0)
                    threat_active = ini.get_int("GAME", "threat_active", 0)

                    time_period = get_time_period(clock_hour)
                    time_str = f"{clock_hour:02d}:{clock_min:02d} ({time_period})"
                    weather_str = WEATHER_NAMES.get(weather_id, "Clear / Normal")
                    radio_info = RADIO_STATIONS.get(car_radio, {"name": "Radio Off", "genre": "Silence", "vibe": "quiet"})
                    radio_str = f"{radio_info['name']} ({radio_info['genre']})" if (cj_in_car and car_radio not in [-1, 12]) else "Radio Off"
                    threat_str = "Engaging Hostiles in Drive-By / Shootout!" if threat_active else "Clear (No Threats)"

                    spatial = get_spatial_brief(cj_x, cj_y, raw_zone)
                    zone_name = spatial["zone"]
                    target_str = f"Waypoint at ({target_x:.0f}, {target_y:.0f})" if target_active else "None"

                    weapon_name = WEAPONS.get(cj_weapon, f"Weapon #{cj_weapon}")
                    npc_active = ini.get_int("GAME", "npc_active", 0)
                    npc_health = ini.get_int("GAME", "npc_health", 100)
                    npc_model = ini.get_int("GAME", "npc_model", 0)
                    npc_dist = ini.get_float("GAME", "npc_dist", 0.0)
                    npc_weapon = ini.get_int("GAME", "npc_weapon", 0)
                    npc_weapon_name = WEAPONS.get(npc_weapon, "Unarmed")
                    npc_in_car = ini.get_int("GAME", "npc_in_car", 0)

                    latest_game_context = {
                        "zone": zone_name,
                        "time_str": time_str,
                        "weather_str": weather_str,
                        "radio_station": radio_str,
                        "threat_state": threat_str,
                        "nearest_food": spatial["nearest_food"],
                        "nearest_weapons": spatial["nearest_weapons"],
                        "nearest_hospital": spatial["nearest_hospital"],
                        "target_blip": target_str,
                        "cj_health": cj_health,
                        "cj_weapon_name": weapon_name,
                        "cj_wanted": cj_wanted,
                        "cj_mode": f"In Car (Model {cj_car_model})" if cj_in_car else "On Foot",
                        "npc_active": npc_active,
                        "npc_health": npc_health,
                        "npc_model": npc_model,
                        "npc_dist": npc_dist,
                        "npc_weapon": npc_weapon,
                        "npc_weapon_name": npc_weapon_name
                    }

                    # محرك كشف الأحداث الذكي والمحمي من استنزاف الـ API
                    if npc_active == 1:
                        if prev_npc_active == 0:
                            # تجنيد رفيق جديد: استرجاع الشخصية المحفوظة للموديل إن وجدت وإلا رفيق عادي
                            brain.reset_session()
                            identity = brain.get_or_create_identity(npc_model)
                            active_p = brain.current_persona.get("type", "") if brain.current_persona else ""
                            bridge_state["active_persona"] = active_p
                            bridge_state["active_mode"] = brain.current_mode
                            bridge_state["trust_level"] = f"{brain.get_current_trust():.2f}"
                            bridge_state["bravery"] = f"{brain.get_current_bravery():.2f}"
                            ini.update_bridge_section(bridge_state)

                            log("====================================================================")
                            log(f"  [NEW COMPANION RECRUITED] {identity['name']} (Model #{npc_model}) joined CJ.")
                            if active_p:
                                log(f"  [SAVED PERSONA RESTORED] Resumed active role: [{active_p.upper()}] (Trust: {brain.get_current_trust()*100:.0f}%)")
                            else:
                                log("  [CLEAN SLATE] Initialized fresh companion session (Default Companion).")
                            log("====================================================================")
                            trigger_llm_event(latest_game_context, f"I just joined CJ as a companion here in {zone_name}!")
                        elif threat_active == 1 and prev_threat_active == 0:
                            # تبديل المود إلى القتال محلياً دون استهلاك الـ API
                            if brain.current_mode != "combat":
                                set_active_mode("combat")
                            log("[LOCAL TACTICS] Hostile threat engaged by squad locally (0 API Calls).")
                        elif threat_active == 0 and prev_threat_active == 1:
                            log("[LOCAL TACTICS] Threat neutralized by squad locally (0 API Calls).")
                        elif car_crashed == 1 and crash_severity >= 50 and (now - last_crash_comment_time > 8.0):
                            last_crash_comment_time = now
                            # تعديل رصيد الثقة سلباً بسبب تعريض حياة المرافق للخطر
                            brain.record_trust_event(-0.04, f"Violent car crash with CJ ({crash_severity} damage)")
                            bridge_state["trust_level"] = f"{brain.get_current_trust():.2f}"
                            ini.update_bridge_section(bridge_state)
                            log(f"[LOCAL EVENT] Car collision detected (Damage: {crash_severity} HP). Trust adjusted to {brain.get_current_trust():.2f}.")
                            trigger_llm_event(latest_game_context, f"CJ just crashed the vehicle violently (Severity: {crash_severity} HP damage)! React in shock or anger at his reckless driving!")
                        elif cj_in_car and car_radio != prev_car_radio and prev_car_radio is not None and (now - last_radio_comment_time > 30.0):
                            last_radio_comment_time = now
                            station_info = RADIO_STATIONS.get(car_radio, {"name": "Radio", "genre": "Music"})
                            st_name = station_info.get("name", "Radio")
                            st_genre = station_info.get("genre", "music")
                            if car_radio in [-1, 12]:
                                trigger_llm_event(latest_game_context, "CJ just turned off the car radio. We are driving in quiet.")
                            else:
                                trigger_llm_event(latest_game_context, f"CJ changed the radio station to {st_name} ({st_genre}).")
                        elif (now - last_ambient_comment_time > 90.0) and threat_active == 0 and not cj_in_car and (now - last_autonomous_event_time > 45.0):
                            last_ambient_comment_time = now
                            trigger_llm_event(latest_game_context, f"We are casually walking together in {zone_name} during {time_period}. Make a brief, natural street remark about our surroundings.")
                        elif prev_cj_wanted is not None and cj_wanted > prev_cj_wanted and cj_wanted >= 2:
                            if brain.current_mode == "emote":
                                set_active_mode("combat")
                            log(f"[LOCAL TACTICS] Police alert level raised to {cj_wanted} stars.")
                    elif npc_active == 0 and prev_npc_active == 1:
                        # تحرير الرفيق أو موته: إعادة ضبط كاملة وفورية
                        log("====================================================================")
                        log("  [COMPANION DISMISSED / DIED] Resetting persona & clearing session.")
                        log("====================================================================")
                        brain.reset_session()
                        bridge_state["active_persona"] = ""
                        bridge_state["active_mode"] = "companion"
                        bridge_state["trust_level"] = "0.50"
                        bridge_state["bravery"] = "0.50"
                        ini.update_bridge_section(bridge_state)

                    prev_cj_weapon = cj_weapon
                    prev_cj_wanted = cj_wanted
                    prev_cj_in_car = cj_in_car
                    prev_cj_health = cj_health
                    prev_npc_active = npc_active
                    prev_car_radio = car_radio
                    prev_threat_active = threat_active
                    prev_hour_period = time_period
                    prev_weather_id = weather_id

                    # عرض شاشة الـ Telemetry الحية بترشيد لحفظ موارد المعالج
                    if now - last_telemetry_print_time > 2.0:
                        last_telemetry_print_time = now
                        current_snapshot = format_telemetry(ini)
                        if current_snapshot != last_telemetry_snapshot:
                            last_telemetry_snapshot = current_snapshot
                            print("-" * 68, flush=True)
                            print(f"[{datetime.now().strftime('%H:%M:%S')}] LIVE TELEMETRY STREAM:", flush=True)
                            print(current_snapshot, flush=True)
                except Exception:
                    pass

    except KeyboardInterrupt:
        log("\n[BRIDGE] Shutting down cleanly...")
        llm_queue.put(None)
        log("[BRIDGE] Goodbye!")

if __name__ == "__main__":
    main()
