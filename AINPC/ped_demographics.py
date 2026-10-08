# ====================================================================
# GTA San Andreas - AI NPC Ped Demographics & Persona Engine
# Dynamic Classification: Gender, Age, Archetype, Personality & Emotes
# ====================================================================

import os
import random
from typing import Dict, Any, List, Optional

PEDS_IDE_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "peds.ide")

# أسماء واقعية حسب الجنس والفئة العمرية
MALE_NAMES = [
    "Marcus", "Darnell", "Eddie", "Tyrone", "Lamar", "Curtis", "Andre",
    "Jamal", "Malik", "DeShawn", "Trey", "Anthony", "Darius", "Terrance",
    "Trevor", "Cedric", "Reggie", "Kendrick", "Devon", "Maurice", "Javier",
    "Carlos", "Hector", "Mateo", "Luis", "Rico", "Miguel", "Angel", "Sal",
    "Vito", "Tony", "Frankie", "Johnny", "Tommy", "Jimmy", "Bobby", "Wayne",
    "Billy", "Earl", "Travis", "Cody", "Shane", "Dwight", "Hank", "Otis",
    "Clarence", "Leroy", "Calvin", "Leon", "Russell"
]

FEMALE_NAMES = [
    "Keesha", "Denise", "Latoya", "Shaniqua", "Monique", "Tasha", "Ebony",
    "Vanessa", "Tamika", "Yolanda", "Alicia", "Mercedes", "Roxy", "Candy",
    "Krystal", "Jasmine", "Tiffany", "Destiny", "Chantel", "Brianna", "Maria",
    "Elena", "Rosa", "Carmen", "Sofia", "Lucia", "Camila", "Isabella", "Catalina",
    "Donna", "Gina", "Bianca", "Angela", "Tina", "Amber", "Heather", "Crystal",
    "Brittany", "Ashley", "Samantha", "Brenda", "Loretta", "Patsy", "Darlene",
    "Shelly", "Peggy", "Wanda", "Bernice", "Betty", "Ruby"
]

ELDERLY_MALE_NAMES = [
    "Old Man Otis", "Pops Jenkins", "Uncle Willie", "Gramps Earl", "Mr. Henderson", "Old Joe"
]

ELDERLY_FEMALE_NAMES = [
    "Mama Johnson", "Auntie Mae", "Granny Pearl", "Mrs. Washington", "Miss Clara", "Grandma Edna"
]

SPECIAL_CHARACTERS = {
    269: ("Melvin 'Big Smoke' Harris", "male", "adult", "Corrupt Grove Veteran", "Greedy, loves fast food, philosophical street talk"),
    270: ("Sean 'Sweet' Johnson", "male", "adult", "Grove Street Families Leader", "Fiercely loyal to the Grove, serious, brotherhood-first"),
    271: ("Lance 'Ryder' Wilson", "male", "young", "Water-Sherm Smoker Homie", "Hyperactive, paranoid, smokes sherm, arrogant, funny"),
}

GROVE_HOMIES = {105, 106, 107}
BALLAS_GANG = {102, 103, 104}
VAGOS_GANG = {108, 109, 110}

class PedDemographicsEngine:
    def __init__(self):
        self.peds_data: Dict[int, Dict[str, Any]] = {}
        self._load_peds_ide()

    def _load_peds_ide(self):
        """قراءة وتحليل ملف peds.ide الأصلي للعبة"""
        if not os.path.exists(PEDS_IDE_PATH):
            return

        try:
            with open(PEDS_IDE_PATH, "r", encoding="utf-8", errors="replace") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#") or line.startswith("peds") or line.startswith("end"):
                        continue
                    parts = [p.strip() for p in line.split(",")]
                    if len(parts) >= 6 and parts[0].isdigit():
                        mid = int(parts[0])
                        model_name = parts[1].upper()
                        ped_type = parts[3].upper()
                        stat = parts[4].upper()
                        anim_group = parts[5].lower()

                        # تحديد الجنس
                        is_female = (
                            "FEMALE" in ped_type or
                            "WOMAN" in anim_group or
                            "GIRL" in stat or
                            model_name.startswith(("BF", "VF", "WF", "SHFY"))
                        )
                        gender = "female" if is_female else "male"

                        # تحديد الفئة العمرية
                        if any(k in anim_group for k in ["old", "oldwoman", "oldman", "oldfat"]) or "OLD" in stat or "OLD" in model_name:
                            age = "elderly"
                        elif any(k in anim_group for k in ["sexywoman", "jogger", "jogwoman"]) or any(k in stat for k in ["STREET", "BEACH", "GANG"]):
                            age = "young"
                        else:
                            age = "adult"

                        # تحديد الهوية والمهنة / التوجه
                        if mid in GROVE_HOMIES:
                            archetype = "Grove Street Families Gangster"
                        elif mid in BALLAS_GANG:
                            archetype = "Ballas Street Gangster"
                        elif mid in VAGOS_GANG:
                            archetype = "Los Santos Vagos Gangster"
                        elif "COP" in ped_type or "COP" in stat or "SWAT" in anim_group:
                            archetype = "Police Officer"
                        elif "PRO" in anim_group or "PROSTITUTE" in ped_type or "SEXY" in anim_group:
                            archetype = "Attractive Street Woman"
                        elif "TRAMP" in stat or "BUM" in model_name or anim_group == "drunkman":
                            archetype = "Drunk Street Tramp"
                        elif age == "elderly":
                            archetype = "Elderly Grandmother" if gender == "female" else "Elderly Grandfather"
                        elif "SUIT" in stat:
                            archetype = "Downtown Business Citizen"
                        else:
                            archetype = "Los Santos Street Citizen"

                        self.peds_data[mid] = {
                            "model_id": mid,
                            "model_name": model_name,
                            "gender": gender,
                            "age": age,
                            "archetype": archetype,
                            "anim_group": anim_group
                        }
        except Exception:
            pass

    def get_demographics(self, model_id: int) -> Dict[str, Any]:
        """استخراج الملف التعريفي الديمغرافي الكامل لشخصية الـ NPC"""
        if model_id in SPECIAL_CHARACTERS:
            name, gender, age, arch, guide = SPECIAL_CHARACTERS[model_id]
            return {
                "name": name,
                "gender": gender,
                "age": age,
                "archetype": arch,
                "guidelines": guide,
                "flirty": False
            }

        data = self.peds_data.get(model_id, {
            "gender": "male",
            "age": "adult",
            "archetype": "Los Santos Citizen",
            "anim_group": "man"
        })

        gender = data["gender"]
        age = data["age"]
        archetype = data["archetype"]

        # تخصيص اسم حتمي وواقعي ملائم للشخصية بناءً على model_id لضمان ثبات الهوية عبر الجلسات
        if age == "elderly":
            name_pool = ELDERLY_FEMALE_NAMES if gender == "female" else ELDERLY_MALE_NAMES
        else:
            name_pool = FEMALE_NAMES if gender == "female" else MALE_NAMES
        name = name_pool[model_id % len(name_pool)]

        # صياغة توجيهات الشخصية والأسلوب
        if archetype == "Grove Street Families Gangster":
            guide = "Hardcore Grove Street loyalty, speaks authentic 90s Compton street slang, ready to blast Ballas, homie love for CJ."
            flirty = False
        elif archetype == "Attractive Street Woman":
            guide = "Flirty, confident, attractive 90s street woman. Can tease CJ, flirt playfully, loves dancing and good music."
            flirty = True
        elif archetype == "Elderly Grandmother":
            guide = "Maternal, sweet, calls CJ 'baby' or 'child', warns him to stay out of trouble, offers advice, funny nagging."
            flirty = False
        elif archetype == "Elderly Grandfather":
            guide = "Grumpy old-timer, complains about his back and the youth these days, but respects CJ."
            flirty = False
        elif archetype == "Drunk Street Tramp":
            guide = "Slurring speech, laughs randomly, hiccups (*hic*), calls CJ his best friend, acts drunk and dizzy."
            flirty = False
        elif archetype == "Police Officer":
            guide = "Authoritative, suspicious, talks in law enforcement codes, tense partnership with CJ."
            flirty = False
        elif gender == "female":
            guide = "Authentic Los Santos female citizen. Friendly, expressive, can flirt or dance if the mood is right."
            flirty = True
        else:
            guide = "Chill 1990s Los Santos street guy. Loyal to CJ, down to ride, loves music and street life."
            flirty = False

        return {
            "name": name,
            "gender": gender,
            "age": age,
            "archetype": archetype,
            "guidelines": guide,
            "flirty": flirty
        }

CORE_PERSONAS: Dict[str, Dict[str, Any]] = {
    "hitman": {
        "type": "hitman",
        "title": "Ruthless Hitman & Master Marksman",
        "role": "Hitman",
        "action": "persona_hitman",
        "guidelines": (
            "You are a cold-blooded, ruthless criminal hitman and master marksman. "
            "You love violence, chaos, and gunfights. You obey violent commands eagerly, "
            "including eliminating pedestrians, police officers, and rival gangs without hesitation. "
            "Talk tough, cynical, street-hardened, and lethal. Always ready to shoot."
        ),
        "intro_quote": "Target confirmed CJ. Point me at whoever needs to disappear.",
        "gta_subtitle": "~r~[PERSONA: HITMAN]~w~ Max Accuracy (100%) & Lethal Combatant Online!"
    },
    "medic": {
        "type": "medic",
        "title": "Combat Field Medic & Lifesaver",
        "role": "Field Medic",
        "action": "persona_medic",
        "guidelines": (
            "You are a dedicated combat field medic and lifesaver. You prioritize CJ's health, "
            "safety, and squad survival above all else. You dislike senseless violence and prefer defense. "
            "If CJ or squad members are injured, you rush to heal wounds and provide first aid. "
            "Frequently advise CJ to stay alert and watch his health."
        ),
        "intro_quote": "Medic on duty! Keep your head down CJ, I got your back.",
        "gta_subtitle": "~g~[PERSONA: MEDIC]~w~ Field Medic Online! Auto-Heal & Support Active."
    },
    "heavy": {
        "type": "heavy",
        "title": "Demolitions & Heavy Weapons Specialist",
        "role": "Heavy Specialist",
        "action": "persona_heavy",
        "guidelines": (
            "You are a deranged demolitions and heavy artillery expert. You are obsessed with "
            "massive explosions, RPG rocket launchers, and utter destruction. When wanted level rises, "
            "or when facing police cruisers, SWAT vans, tanks, or helicopters, you go crazy and unleash heavy firepower. "
            "Talk loud, chaotic, explosive, and fearless."
        ),
        "intro_quote": "Hell yeah! Hand me the rockets CJ, let's blow this city up!",
        "gta_subtitle": "~r~[PERSONA: DEMOLITIONS]~w~ Heavy Weapons (RPG & Explosives) Active!"
    },
    "driver": {
        "type": "driver",
        "title": "Master Transporter & Getaway Wheelman",
        "role": "Transporter Driver",
        "action": "persona_driver",
        "guidelines": (
            "You are an elite getaway driver and vehicle transporter. You know every alley, "
            "bridge, and shortcut in San Andreas. You drive fast, fearless, and with extreme precision. "
            "You take pride in high-speed escapes and stealing wheels for CJ. Talk confident, smooth, "
            "automotive slang, like a professional wheelman."
        ),
        "intro_quote": "Buckle up Carl. Nobody outruns me behind the wheel in San Andreas.",
        "gta_subtitle": "~b~[PERSONA: TRANSPORTER]~w~ Master Getaway Driver Online! Speed boosted."
    },
    "girlfriend": {
        "type": "girlfriend",
        "title": "Romantic Companion & Girlfriend",
        "role": "Girlfriend",
        "action": "persona_girlfriend",
        "guidelines": (
            "You are CJ's loving, flirtatious, and affectionate romantic girlfriend/companion. "
            "You adore Carl, tease him playfully, use sweet pet names ('baby', 'honey', 'handsome', 'Carl'). "
            "You love hanging out, dancing at clubs, cruising together, and intimate moments. "
            "You care deeply about Carl's well-being and react emotionally and warmly."
        ),
        "intro_quote": "Hey handsome... I'm all yours now, baby.",
        "gta_subtitle": "~p~[PERSONA: GIRLFRIEND]~w~ Romantic Companion Active! Special emotes unlocked."
    }
}

def resolve_persona_input(text: str) -> Optional[Dict[str, Any]]:
    """
    تحليل ومعالجة أوامر تخصيص الشخصية القادمة من شريط الكتابة في اللعبة أو الطرفية
    يدعم: /persona, #persona, /role, #role, persona:, أو الأوامر المباشرة /hitman, /medic...
    """
    cleaned = text.strip()
    raw_instruction = ""
    is_persona_cmd = False

    # فحص البوادئ المدعومة
    for prefix in ["/persona ", "#persona ", "/role ", "#role ", "persona: ", "/persona:", "/set persona "]:
        if cleaned.lower().startswith(prefix):
            raw_instruction = cleaned[len(prefix):].strip()
            is_persona_cmd = True
            break

    # فحص الأوامر المباشرة السريعة
    if not is_persona_cmd:
        direct_map = {
            "/hitman": "hitman", "/killer": "hitman", "/مجرم": "hitman", "/قاتل": "hitman",
            "/medic": "medic", "/doctor": "medic", "/طبيب": "medic", "/معالج": "medic",
            "/heavy": "heavy", "/rpg": "heavy", "/متفجرات": "heavy", "/دمار": "heavy",
            "/driver": "driver", "/سائق": "driver", "/نقل": "driver",
            "/girlfriend": "girlfriend", "/gf": "girlfriend", "/حبيبة": "girlfriend", "/عشيقة": "girlfriend"
        }
        low = cleaned.lower()
        if low in direct_map:
            raw_instruction = direct_map[low]
            is_persona_cmd = True

    if not is_persona_cmd:
        return None

    instr_lower = raw_instruction.lower()

    # مطابقة التصنيف مع الأنماط الأساسية الـ 5 أو اعتبارها شخصية مخصصة
    if any(k in instr_lower for k in ["hitman", "مجرم", "قاتل", "رامي", "سفاح", "killer", "assassin", "shooter", "marksman", "sniper"]):
        res = dict(CORE_PERSONAS["hitman"])
        res["custom_text"] = raw_instruction
        return res
    elif any(k in instr_lower for k in ["medic", "معالج", "طبيب", "دكتور", "مسعف", "healer", "doctor", "health", "علاج"]):
        res = dict(CORE_PERSONAS["medic"])
        res["custom_text"] = raw_instruction
        return res
    elif any(k in instr_lower for k in ["heavy", "متفجرات", "دمار", "فوضى", "صواريخ", "rpg", "demolitions", "explosive", "chaos", "قنابل"]):
        res = dict(CORE_PERSONAS["heavy"])
        res["custom_text"] = raw_instruction
        return res
    elif any(k in instr_lower for k in ["driver", "سائق", "نقل", "توصيل", "transporter", "wheelman", "pilot", "getaway", "قيادة"]):
        res = dict(CORE_PERSONAS["driver"])
        res["custom_text"] = raw_instruction
        return res
    elif any(k in instr_lower for k in ["girlfriend", "حبيبة", "عشيقة", "رومانسية", "lover", "romantic", "bae", "wife", "زوجة", "بنات"]):
        res = dict(CORE_PERSONAS["girlfriend"])
        res["custom_text"] = raw_instruction
        return res
    else:
        return {
            "type": "custom",
            "title": "Custom Unique Persona",
            "role": "Custom Persona",
            "action": "persona_custom",
            "guidelines": f"Custom player instructions: {raw_instruction}",
            "custom_text": raw_instruction,
            "intro_quote": "Understood, CJ. I know my role.",
            "gta_subtitle": "~y~[PERSONA: CUSTOM]~w~ Custom Personality & Guidelines Applied!"
        }

if __name__ == "__main__":
    engine = PedDemographicsEngine()
    test_models = [9, 10, 12, 105, 137, 280]
    for m in test_models:
        demo = engine.get_demographics(m)
        print(f"Model {m:3d}: Name={demo['name']:15s} | Gender={demo['gender']:6s} | Age={demo['age']:7s} | Archetype={demo['archetype']}")
        print(f"   Guide: {demo['guidelines']}\n")
