# ====================================================================
# GTA San Andreas - AI NPC LLM Brain (Groq Cloud API)
# Dynamic Ped Identity & Long-Term Episodic Memory (Phase 3)
# ====================================================================

import os
import json
import time
import random
import urllib.request
import urllib.error
from typing import Dict, Any, Optional, Tuple
try:
    from AINPC.memory_db import MemoryDB
except ImportError:
    from memory_db import MemoryDB
try:
    from AINPC.ped_demographics import PedDemographicsEngine, CORE_PERSONAS, resolve_persona_input
except ImportError:
    from ped_demographics import PedDemographicsEngine, CORE_PERSONAS, resolve_persona_input

ENV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")

def load_env() -> Dict[str, str]:
    env = {}
    if os.path.exists(ENV_PATH):
        with open(ENV_PATH, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    env[k.strip()] = v.strip()
    return env

VALID_MODES = ["companion", "combat", "vehicle", "emote"]

MODE_ACTIONS = {
    "companion": [
        "follow_player", "look_at_player", "face_player", "heal", "attack_threat", "none"
    ],
    "combat": [
        "arm_rifle", "arm_pistol", "arm_smg", "arm_shotgun", "arm_rpg", "arm_combat_shotgun", "disarm", "driveby", "attack_threat", "heal", "hands_up", "follow_player", "none"
    ],
    "vehicle": [
        "fetch_car", "drive_wander", "drive_to_target", "driveby", "exit_car", "follow_player", "none"
    ],
    "emote": [
        "dance", "flirt", "kiss", "strip", "lapdance", "cuddle", "act_drunk", "sober_up", "gang_sign", "smoke", "cheer", "cower", "follow_player", "none"
    ]
}

class LLMBrain:
    def __init__(self):
        env = load_env()
        self.api_key = env.get("GROQ_API_KEY", "")
        self.model = env.get("GROQ_MODEL", "qwen/qwen3.8-27b")
        self.endpoint = "https://api.groq.com/openai/v1/chat/completions"
        self.last_response_time = 0.0
        self.current_identity = None
        self.db = MemoryDB()
        self.demographics_engine = PedDemographicsEngine()
        self.current_mode = "companion"
        self.current_persona = None
        self.session_memories: List[str] = []

    def is_configured(self) -> bool:
        return bool(self.api_key and self.api_key.startswith("gsk_"))

    def reset_session(self):
        """إعادة ضبط الجلسة بالكامل عند تحرير الـ NPC أو موته لضمان عزل تام للشخصيات والذكريات"""
        self.current_identity = None
        self.current_persona = None
        self.current_mode = "companion"
        self.session_memories.clear()

    def get_or_create_identity(self, model_id: int) -> dict:
        """تخصيص هوية وشخصية واقعية مع ربطها بالملف الديمغرافي والذاكرة الدائمة SQLite"""
        if self.current_identity and self.current_identity.get("model") == model_id:
            return self.current_identity

        demo = self.demographics_engine.get_demographics(model_id)
        name = demo["name"]
        gender = demo["gender"]
        age = demo["age"]
        archetype = demo["archetype"]
        guidelines = demo["guidelines"]
        flirty = demo.get("flirty", False)

        # تسجيل أو استرجاع سجل الشخصية من قاعدة البيانات
        char_record = self.db.get_or_register_character(model_id, name, archetype)

        # ضمان بداية نقية لكل تجنيد جديد كمرافق طبيعي دون وراثة أي أدوار متراكمة
        self.current_persona = None
        self.current_mode = "companion"
        self.session_memories.clear()

        self.current_identity = {
            "name": name,
            "gender": gender,
            "age": age,
            "archetype": archetype,
            "guidelines": guidelines,
            "flirty": flirty,
            "model": model_id,
            "trust_score": char_record.get("trust_score", 0.5),
            "times_recruited": char_record.get("times_recruited", 1)
        }
        return self.current_identity

    def set_custom_persona(self, model_id: int, persona_data: Dict[str, Any]) -> str:
        """تحديث وحفظ شخصية الـ NPC وتوجيهاته بشكل فوري للجلسة الحالية"""
        p_type = persona_data.get("type", "custom")
        if p_type in ["companion", "reset", "none"]:
            self.current_persona = None
            self.current_mode = "companion"
            self.db.update_character_persona(model_id, "", "")
            name = self.current_identity["name"] if self.current_identity else "Companion"
            return persona_data.get("intro_quote", "Alright CJ, back to normal.")

        self.current_persona = persona_data
        c_text = persona_data.get("custom_text", "")
        self.db.update_character_persona(model_id, p_type, c_text)

        # تسجيل الموقف في قاعدة الذكريات
        name = self.current_identity["name"] if self.current_identity else "Companion"
        self.db.record_memory(name, "persona_change", f"Role assigned: {persona_data['title']}", "San Andreas", emotional_impact=0.15)
        return persona_data.get("intro_quote", "Ready CJ.")

    def generate_response(self, context: Dict[str, Any], trigger_type: str, user_prompt: Optional[str] = None) -> Tuple[str, str, str]:
        """
        توليد رد ذكي بنظام الطبقات والمودات المتمايزة (Layered Modes Architecture)
        """
        if not self.is_configured():
            return ("Error: Groq API key not configured.", "none", self.current_mode)

        zone = context.get("zone", "San Andreas")
        cj_health = context.get("cj_health", 100)
        cj_weapon = context.get("cj_weapon_name", "Fist")
        cj_wanted = context.get("cj_wanted", 0)
        cj_mode = context.get("cj_mode", "On Foot")
        npc_health = context.get("npc_health", 100)
        npc_dist = context.get("npc_dist", 2.0)
        npc_model = context.get("npc_model", 107)

        # فحص إشارات تبديل المود التلقائية من كلام اللاعب
        prompt_lower = (user_prompt or "").lower()
        if any(k in prompt_lower for k in [
            "ارقص", "رقص", "دانس", "dance", "دخن", "تدخين", "smoke", "سكر", "سكران", "drunk", "تغزل", "flirt", "صفق", "تصفيق", "cheer",
            "مود المشاعر", "وضع المشاعر", "مود الرقص", "وضع الرقص", "مود السكر", "فعّل المشاعر",
            "emote mode", "social mode", "chill mode", "dance mode", "party mode", "activate emote", "switch to emote"
        ]):
            self.current_mode = "emote"
        elif any(k in prompt_lower for k in [
            "سلاح", "اسلحة", "مسدس", "رشاش", "بندقية", "شوتجن", "قاتل", "احميني", "احمي", "اطلق", "حرب", "درايف باي", "دافع",
            "مود القتال", "وضع القتال", "استعد للحرب", "جهّز السلاح", "اطلق النار", "اطلق من النافذة",
            "combat mode", "war mode", "gear up", "strap up", "get strapped", "ready for war", "driveby", "drive by", "shoot out", "open fire", "gun", "weapon", "shoot", "fight", "protect", "kill"
        ]):
            self.current_mode = "combat"
        elif any(k in prompt_lower for k in [
            "سيارة", "السيارة", "جيب سيارة", "احضر سيارة", "سرق سيارة", "سوق", "قد السيارة", "اركب السيارة", "اركبي", "انزل من السيارة",
            "مود القيادة", "وضع القيادة", "جلب السيارة",
            "drive mode", "vehicle mode", "bring car", "fetch car", "bring me that car", "get the car", "steal a car", "jack that car", "drive me", "car", "drive", "exit car"
        ]):
            self.current_mode = "vehicle"
        elif any(k in prompt_lower for k in [
            "الوضع العادي", "مود المرافقة", "اتبعني", "الحقني", "تعال", "ارجع", "قف", "توقف", "اثبت", "إلغاء",
            "normal mode", "companion mode", "follow me", "follow", "stop", "cancel", "regroup", "come back", "wait", "stay"
        ]):
            self.current_mode = "companion"

        allowed_actions = MODE_ACTIONS.get(self.current_mode, MODE_ACTIONS["companion"])
        allowed_actions_str = ", ".join([f'"{a}"' for a in allowed_actions])

        # استرجاع الهوية الحالية والملف الديمغرافي
        identity = self.get_or_create_identity(npc_model)
        npc_name = identity["name"]
        npc_role = identity["archetype"]
        npc_gender = identity.get("gender", "male")
        npc_age = identity.get("age", "adult")
        npc_guidelines = identity.get("guidelines", "")
        npc_flirty = identity.get("flirty", False)

        npc_weapon_name = context.get("npc_weapon_name", "Unarmed")
        nearest_food = context.get("nearest_food", "Cluckin' Bell / Well Stacked Pizza nearby")
        nearest_weapons = context.get("nearest_weapons", "Ammu-Nation nearby")
        nearest_hospital = context.get("nearest_hospital", "General Hospital nearby")
        target_blip = context.get("target_blip", "None")

        time_str = context.get("time_str", "12:00 (Day)")
        weather_str = context.get("weather_str", "Sunny (Clear)")
        radio_str = context.get("radio_station", "Radio Off")
        threat_str = context.get("threat_state", "Clear (No Threats)")

        # استرجاع الذكريات الحديثة ومستوى الثقة من SQLite مع فلترة الدور النشط لعزل تام
        active_p_type = self.current_persona.get("type") if self.current_persona else None
        recent_mems = self.db.get_recent_memories(npc_name, limit=3, persona_filter=active_p_type)
        char_status = self.db.get_character_status(npc_name)
        trust_pct = int(char_status.get("trust_score", 0.5) * 100)

        all_mems = list(recent_mems)
        if self.session_memories:
            all_mems.extend(self.session_memories[-2:])

        memories_text = "\n".join([f"  * {m}" for m in all_mems]) if all_mems else "  * None yet (we just met)."

        world_state = (
            f"Location: {zone} | Time: {time_str} | Weather: {weather_str} | Car Radio: {radio_str} | "
            f"Combat/Threat Status: {threat_str} | Nearest Food: {nearest_food} | Nearest Guns: {nearest_weapons} | "
            f"Nearest Hospital: {nearest_hospital} | Map Target Blip: {target_blip} | "
            f"CJ Health: {cj_health}% | CJ Weapon: {cj_weapon} | "
            f"Wanted Level: {cj_wanted} stars | CJ Mode: {cj_mode} | "
            f"Your Health: {npc_health}% | Your Weapon: {npc_weapon_name} | Distance to CJ: {npc_dist:.1f}m"
        )

        persona_block = ""
        if self.current_persona:
            p_title = self.current_persona.get("title", "Custom Persona")
            p_guide = self.current_persona.get("guidelines", "")
            persona_block = (
                f"\nACTIVE ASSIGNED PERSONA & ROLE: [{p_title.upper()}]\n"
                f"- Persona Directives: {p_guide}\n"
                f"- MANDATORY ROLEPLAY RULE: You MUST stay completely true to this persona! "
                f"Your morality, language, aggressiveness, and decision-making MUST reflect this role.\n"
            )

        system_prompt = (
            f"You are an autonomous AI companion ped in Grand Theft Auto: San Andreas following Carl Johnson (CJ).\n"
            f"YOUR IDENTITY & DEMOGRAPHICS:\n"
            f"- Your name is: {npc_name}\n"
            f"- Gender: {npc_gender.capitalize()} | Age: {npc_age.capitalize()} | Role: {npc_role} (Ped Model #{npc_model})\n"
            f"- Personality Guidelines: {npc_guidelines}\n"
            f"{persona_block}"
            f"- CRITICAL INSTRUCTION: You are NOT Big Smoke, NOT Ryder, NOT Sweet (unless your model is 269/270/271). Never pretend to be Big Smoke.\n"
            f"- If CJ asks your name, introduce yourself by your real name ({npc_name}) and role naturally!\n"
            f"LAYERED ARCHITECTURE - ACTIVE MODE: [{self.current_mode.upper()}]\n"
            f"System Modes:\n"
            f"1. COMPANION: Default walking, following CJ, normal escort and dialogue.\n"
            f"2. COMBAT: Tactical combat, equipping firearms/heavy weapons, drive-by shootouts, defense against attackers.\n"
            f"3. VEHICLE: Stealing/fetching cars, chauffeuring CJ, waypoint driving, drive-by shooting.\n"
            f"4. EMOTE (Feelings & Emotes): Dancing, flirting, kissing, adult/club animations, drunkenness, smoking, gang signs.\n"
            f"CRITICAL MODE ENFORCEMENT & INTENT TRANSITION RULES:\n"
            f"- CURRENT ACTIVE MODE: [{self.current_mode.upper()}].\n"
            f"- Allowed actions per mode:\n"
            f"  * COMPANION: follow_player, look_at_player, face_player, heal, attack_threat, none\n"
            f"  * COMBAT: arm_rifle, arm_pistol, arm_smg, arm_shotgun, arm_rpg, arm_combat_shotgun, disarm, driveby, attack_threat, heal, hands_up, follow_player, none\n"
            f"  * VEHICLE: fetch_car, drive_wander, drive_to_target, driveby, exit_car, follow_player, none\n"
            f"  * EMOTE: dance, flirt, kiss, strip, lapdance, cuddle, act_drunk, sober_up, gang_sign, smoke, cheer, cower, follow_player, none\n"
            f"- SEAMLESS INTENT TRANSITIONS:\n"
            f"  * If CJ asks for an action belonging to another mode (e.g., asking to dance, strip, fetch a car, or equip firearms), DO NOT REFUSE!\n"
            f"  * Switch seamlessly: set \"new_mode\" to the requested mode, and execute the appropriate \"action\" immediately!\n"
            f"  * Example: CJ says 'Let's dance' -> output {{\"say\": \"Let's groove, CJ!\", \"action\": \"dance\", \"new_mode\": \"emote\"}}\n"
            f"  * Example: CJ says 'Bring me a car' -> output {{\"say\": \"On it CJ, grabbing wheels!\", \"action\": \"fetch_car\", \"new_mode\": \"vehicle\"}}\n"
            f"  * Example: CJ says 'Blow them up' -> output {{\"say\": \"Firing rocket launcher!\", \"action\": \"arm_rpg\", \"new_mode\": \"combat\"}}\n"
            f"AUTONOMOUS ENVIRONMENTAL & COMBAT REACTIONS:\n"
            f"- Car Crashes: If CJ crashes violently, react in panic, scream, or complain angrily about his crazy driving!\n"
            f"- Car Radio: When riding in a car, comment on the music station playing or the vibe!\n"
            f"- Drive-By / Street Shootouts: Shout street battle cries, swear at enemies/cops, and shoot back!\n"
            f"- Weather & Time: You are aware of day/night, rain, fog, and sunset. Reference them if relevant!\n"
            f"RELATIONSHIP & MEMORIES WITH CJ:\n"
            f"- Current Trust in CJ: {trust_pct}%.\n"
            f"- Your shared past memories with CJ:\n{memories_text}\n"
            f"SPATIAL & MAP INTELLIGENCE:\n"
            f"- If CJ asks where you are, where the nearest restaurant/food is, where to buy guns, or where the hospital is, answer accurately using the real landmarks in world state above!\n"
            f"RULES:\n"
            f"1. Output MUST be strictly valid JSON with three fields: \"say\", \"action\", and optionally \"new_mode\".\n"
            f"2. \"say\" must be SHORT (max 15 words, under 70 characters), spoken in natural street English fitting GTA San Andreas.\n"
            f"   DO NOT include prefix like '{npc_name}:' or 'AI:' in 'say'.\n"
            f"3. \"action\" must be EXACTLY ONE of the allowed actions for the current mode: [{allowed_actions_str}].\n"
            f"4. \"new_mode\" (optional): specify \"companion\", \"combat\", \"vehicle\", or \"emote\" if a mode change was ordered.\n"
            f"5. NEVER output markdown codeblocks, explanations, or any text outside the JSON object.\n"
            f"Example output: {{\"say\": \"Emote mode on! Let's party CJ!\", \"action\": \"dance\", \"new_mode\": \"emote\"}}"
        )

        if user_prompt:
            user_content = f"Current Game State: [{world_state}]\nCJ says to you: \"{user_prompt}\"\nRespond now as JSON:"
            # تسجيل المحادثة في الذاكرة
            self.db.record_memory(npc_name, "dialogue", f"CJ spoke with me: \"{user_prompt[:40]}\"", zone, emotional_impact=0.05)
        else:
            event_desc = context.get("event_desc", "Observing the situation")
            user_content = f"Current Game State: [{world_state}]\nEvent Occurred: {event_desc}\nReact briefly as JSON:"
            # تسجيل الحدث البارز في الذاكرة
            self.db.record_memory(npc_name, "event", event_desc, zone, emotional_impact=0.1 if "joined" in event_desc else 0.0)

        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content}
            ],
            "temperature": 0.6,
            "max_tokens": 100,
            "response_format": {"type": "json_object"}
        }

        start_t = time.time()
        try:
            req = urllib.request.Request(
                self.endpoint,
                data=json.dumps(payload).encode("utf-8"),
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                    "User-Agent": "GTA-SA-AI-NPC/3.0"
                },
                method="POST"
            )

            with urllib.request.urlopen(req, timeout=5.0) as resp:
                self.last_response_time = (time.time() - start_t) * 1000
                data = json.loads(resp.read().decode("utf-8"))
                content = data["choices"][0]["message"]["content"].strip()

                parsed = json.loads(content)
                say = str(parsed.get("say", "")).strip()
                action = str(parsed.get("action", "none")).strip().lower()
                new_mode = str(parsed.get("new_mode", "")).strip().lower()

                if new_mode in VALID_MODES:
                    self.current_mode = new_mode

                allowed_actions = MODE_ACTIONS.get(self.current_mode, MODE_ACTIONS["companion"])
                if action not in allowed_actions and action != "follow_player":
                    # إذا اختار النموذج حركة تنتمي لمود آخر، بدّل المود تلقائياً للسماح بها فوراً
                    for mode_name, mode_act_list in MODE_ACTIONS.items():
                        if action in mode_act_list:
                            self.current_mode = mode_name
                            allowed_actions = mode_act_list
                            break
                    else:
                        action = "none"

                # تسجيل ذكريات الأكشن في قاعدة الذاكرة الدائمة
                if action.startswith("arm_"):
                    gun_name = action.replace("arm_", "").upper()
                    self.db.record_memory(npc_name, "combat", f"Equipped {gun_name} to fight alongside CJ", zone, emotional_impact=0.1)
                elif action == "fetch_car":
                    self.db.record_memory(npc_name, "vehicle", "Stealing and fetching a car for CJ", zone, emotional_impact=0.08)
                elif action in ["drive_wander", "drive_to_target"]:
                    self.db.record_memory(npc_name, "vehicle", "Chauffeuring CJ across San Andreas", zone, emotional_impact=0.05)
                elif action == "follow_player":
                    self.db.record_memory(npc_name, "companion", "Regrouped and followed CJ", zone, emotional_impact=0.03)
                elif action == "dance":
                    self.db.record_memory(npc_name, "social", "Danced with CJ", zone, emotional_impact=0.04)
                elif action in ["strip", "lapdance"]:
                    self.db.record_memory(npc_name, "romance", "Performed an intimate dance for CJ", zone, emotional_impact=0.1)
                elif action in ["flirt", "kiss", "cuddle"]:
                    self.db.record_memory(npc_name, "romance", "Exchanged affection with CJ", zone, emotional_impact=0.1)
                elif action == "act_drunk":
                    self.db.record_memory(npc_name, "social", "Drank and acted tipsy with CJ", zone, emotional_impact=0.04)
                elif action == "driveby":
                    self.db.record_memory(npc_name, "combat", "Fired out car window in high-speed drive-by shootout", zone, emotional_impact=0.15)
                elif action == "attack_threat":
                    self.db.record_memory(npc_name, "combat", "Defended CJ against hostile attacker on foot", zone, emotional_impact=0.12)

                say_clean = say.encode("ascii", errors="ignore").decode("ascii").strip()
                if not say_clean:
                    say_clean = say[:70]

                if user_prompt:
                    self.session_memories.append(f"CJ: \"{user_prompt}\" -> You: \"{say_clean}\"")
                    self.session_memories = self.session_memories[-6:]

                return (say_clean, action, self.current_mode)

        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="replace")
            return (f"API Error: HTTP {e.code}", "none", self.current_mode)
        except Exception as e:
            return (f"Brain Error: {str(e)[:40]}", "none", self.current_mode)

if __name__ == "__main__":
    brain = LLMBrain()
    print(f"Loaded Brain with model: {brain.model}")
    print(f"API Configured: {brain.is_configured()}")
    
    mock_context = {
        "zone": "Ganton (Grove Street)",
        "cj_health": 100,
        "cj_weapon_name": "Fist",
        "cj_wanted": 0,
        "cj_mode": "On Foot",
        "npc_health": 100,
        "npc_dist": 2.0,
        "npc_model": 107
    }
    
    # 1. اختبار السؤال عن الذكريات في الوضع العادي
    print("\n--- Testing Memory Recall in COMPANION mode ---")
    say, act, mode = brain.generate_response(mock_context, trigger_type="prompt", user_prompt="Do you remember what we did earlier?")
    print(f"MODE:   {mode}")
    print(f"SAY:    \"{say}\"")
    print(f"ACTION: \"{act}\"")

    # 2. اختبار طلب الرقص في الوضع العادي (يجب رفض الأكشن وتوجيه CJ لتفعيل مود المشاعر)
    print("\n--- Testing Dance Request in COMPANION mode (Should guide CJ to activate Emote Mode) ---")
    say, act, mode = brain.generate_response(mock_context, trigger_type="prompt", user_prompt="Dance for me!")
    print(f"MODE:   {mode}")
    print(f"SAY:    \"{say}\"")
    print(f"ACTION: \"{act}\"")

    # 3. اختبار تفعيل مود المشاعر
    print("\n--- Testing Mode Transition (\"Activate Emote Mode and dance!\") ---")
    say, act, mode = brain.generate_response(mock_context, trigger_type="prompt", user_prompt="Activate emote mode and dance!")
    print(f"MODE:   {mode}")
    print(f"SAY:    \"{say}\"")
    print(f"ACTION: \"{act}\"")
