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
    "Jamal", "Malik", "DeShawn", "Trey", "Anthony", "Darius", "Terrance"
]

FEMALE_NAMES = [
    "Keesha", "Denise", "Latoya", "Shaniqua", "Monique", "Tasha", "Ebony",
    "Vanessa", "Tamika", "Yolanda", "Alicia", "Mercedes", "Roxy", "Candy"
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

        # تخصيص اسم واقعي ملائم للشخصية
        if age == "elderly":
            name = random.choice(ELDERLY_FEMALE_NAMES if gender == "female" else ELDERLY_MALE_NAMES)
        else:
            name = random.choice(FEMALE_NAMES if gender == "female" else MALE_NAMES)

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

if __name__ == "__main__":
    engine = PedDemographicsEngine()
    test_models = [9, 10, 12, 105, 137, 280]
    for m in test_models:
        demo = engine.get_demographics(m)
        print(f"Model {m:3d}: Name={demo['name']:15s} | Gender={demo['gender']:6s} | Age={demo['age']:7s} | Archetype={demo['archetype']}")
        print(f"   Guide: {demo['guidelines']}\n")
