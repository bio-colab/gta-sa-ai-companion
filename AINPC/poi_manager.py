# ====================================================================
# GTA San Andreas - AI NPC Spatial & POI Manager (Phase 4.4)
# Comprehensive Zone Decoding, Iconic POIs & Proximity Navigation
# ====================================================================

import math
from typing import Dict, Any, List, Optional, Tuple

ZONE_NAMES = {
    # Los Santos
    "GAN1": "Ganton (Grove Street)",
    "GAN2": "Ganton",
    "GANTON": "Ganton (Grove Street)",
    "IDL": "Idlewood",
    "IDLE": "Idlewood",
    "IDLEWOOD": "Idlewood",
    "JEF": "Jefferson",
    "JEF1": "Jefferson",
    "JEF2": "Jefferson",
    "JEF3": "Jefferson",
    "JEF3B": "Jefferson",
    "JEFFERSON": "Jefferson",
    "EAS": "East Los Santos",
    "EAST": "East Los Santos",
    "COM": "Commerce (City Hall)",
    "DOWNT": "Downtown Los Santos",
    "DOW": "Downtown Los Santos",
    "VER": "Verona Beach",
    "VERO": "Verona Beach",
    "MAR": "Marina",
    "GLN": "Glen Park",
    "GLEN": "Glen Park",
    "LFL": "Little Mexico",
    "LFL1": "Little Mexico",
    "SUN": "Sunrise",
    "ROD": "Rodeo",
    "VIN": "Vinewood",
    "VINE": "Vinewood",
    "MUL": "Mulholland",
    "MULH": "Mulholland",
    "ELS": "East Beach",
    "WILL": "Willowfield",
    "WIL": "Willowfield",
    "PLY": "Playa del Seville",
    "OCE": "Ocean Docks",
    "LSIA": "Los Santos International Airport",
    "LST": "Market",
    "MRK": "Market",
    "TEM": "Temple",
    "SAN_AND": "San Andreas",
    "SAN_ANDREAS": "San Andreas",

    # San Fierro
    "OCEAF": "Ocean Flats",
    "CALT": "Calton Heights",
    "CHINA": "Chinatown",
    "DOH": "Doherty",
    "GARC": "Garcia",
    "SFAIR": "Easter Bay Airport",
    "BATTP": "Battery Point",
    "PARIS": "Paradiso",
    "JUN": "Juniper Hill",
    "FINA": "Financial District",

    # Las Venturas & Countryside
    "BAYS": "Bayside",
    "RED": "Red County",
    "FLINT": "Flint County",
    "WHET": "Whetstone",
    "BONE": "Bone County",
    "TIER": "Tierra Robada",
    "LV": "Las Venturas",
    "STRIP": "The Strip (Las Venturas)",
}

# قائمة المعالم والمطاعم والأسلحة والمستشفيات بدقة إحداثيات San Andreas
POINTS_OF_INTEREST = [
    # المطاعم والمأكولات (Food & Restaurants)
    {"name": "Well Stacked Pizza", "category": "food", "zone": "Idlewood", "x": 2105.0, "y": -1806.0, "z": 13.5},
    {"name": "Cluckin' Bell", "category": "food", "zone": "East Los Santos", "x": 2393.0, "y": -1474.0, "z": 23.8},
    {"name": "Cluckin' Bell", "category": "food", "zone": "Market", "x": 925.0, "y": -1353.0, "z": 13.3},
    {"name": "Burger Shot", "category": "food", "zone": "Marina", "x": 811.0, "y": -1616.0, "z": 13.5},
    {"name": "Burger Shot", "category": "food", "zone": "Temple", "x": 1199.0, "y": -918.0, "z": 43.1},
    {"name": "Rusty Brown's Ring Donuts", "category": "food", "zone": "Market", "x": 1039.0, "y": -1338.0, "z": 13.7},

    # متاجر الأسلحة (Ammu-Nation)
    {"name": "Ammu-Nation (with Shooting Range)", "category": "weapons", "zone": "Downtown Los Santos", "x": 1368.0, "y": -1279.0, "z": 13.5},
    {"name": "Ammu-Nation", "category": "weapons", "zone": "Willowfield", "x": 2539.0, "y": -1675.0, "z": 15.1},

    # المستشفيات والرعاية الطبية (Hospitals)
    {"name": "All Saints General Hospital", "category": "hospital", "zone": "Jefferson", "x": 2033.0, "y": -1405.0, "z": 17.2},
    {"name": "County General Hospital", "category": "hospital", "zone": "East Los Santos", "x": 1242.0, "y": -1324.0, "z": 13.5},

    # مراكز الشرطة (Police)
    {"name": "Los Santos Police HQ", "category": "police", "zone": "Commerce / Pershing Square", "x": 1555.0, "y": -1675.0, "z": 16.1},

    # معالم Grove Street والمنازل الآمنة
    {"name": "Johnson House (Grove Street HQ)", "category": "landmark", "zone": "Ganton", "x": 2495.0, "y": -1686.0, "z": 13.5},

    # تصليح وتعديل السيارات (Pay 'n' Spray & Tuning)
    {"name": "Pay 'n' Spray", "category": "garage", "zone": "Idlewood", "x": 2066.0, "y": -1831.0, "z": 13.5},
    {"name": "TransFender Garage", "category": "garage", "zone": "Temple", "x": 1041.0, "y": -1017.0, "z": 32.1},
]

def resolve_zone_name(raw_zone: str) -> str:
    """تحويل كود المنطقة الخام إلى اسم حي واقعي وواضح"""
    raw_clean = raw_zone.strip().upper()
    if raw_clean in ZONE_NAMES:
        return ZONE_NAMES[raw_clean]
    
    # فحص البادئات (Prefix Matching)
    for prefix, name in ZONE_NAMES.items():
        if raw_clean.startswith(prefix):
            return name

    # في حال عدم وجود تطابق، تنسيق الاسم بشكل نظيف
    return raw_clean.replace("_", " ").title()

def calculate_direction(from_x: float, from_y: float, to_x: float, to_y: float) -> str:
    """تحديد الاتجاه البصري الواقعي (شمال، جنوب، شرق، غرب)"""
    dx = to_x - from_x
    dy = to_y - from_y
    angle = math.degrees(math.atan2(dy, dx)) # -180 to 180

    if -22.5 <= angle < 22.5:
        return "East"
    elif 22.5 <= angle < 67.5:
        return "Northeast"
    elif 67.5 <= angle < 112.5:
        return "North"
    elif 112.5 <= angle < 157.5:
        return "Northwest"
    elif angle >= 157.5 or angle < -157.5:
        return "West"
    elif -157.5 <= angle < -112.5:
        return "Southwest"
    elif -112.5 <= angle < -67.5:
        return "South"
    else:
        return "Southeast"

def get_nearest_poi(x: float, y: float, category: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """حساب أقرب معلم أو مطعم من موقع CJ الحالي"""
    candidates = POINTS_OF_INTEREST
    if category:
        candidates = [p for p in candidates if p["category"] == category]

    if not candidates:
        return None

    nearest = None
    min_dist = float("inf")

    for poi in candidates:
        dist = math.hypot(x - poi["x"], y - poi["y"])
        if dist < min_dist:
            min_dist = dist
            direction = calculate_direction(x, y, poi["x"], poi["y"])
            nearest = dict(poi)
            nearest["distance"] = round(dist)
            nearest["direction"] = direction

    return nearest

def get_spatial_brief(x: float, y: float, raw_zone: str) -> Dict[str, str]:
    """إعداد ملخص مكاني ذكي وشامل لتزويد دماغ الـ LLM به"""
    zone_friendly = resolve_zone_name(raw_zone)

    nearest_food = get_nearest_poi(x, y, category="food")
    nearest_guns = get_nearest_poi(x, y, category="weapons")
    nearest_hospital = get_nearest_poi(x, y, category="hospital")

    food_str = f"{nearest_food['name']} in {nearest_food['zone']} ({nearest_food['distance']}m {nearest_food['direction']})" if nearest_food else "Unknown"
    guns_str = f"{nearest_guns['name']} in {nearest_guns['zone']} ({nearest_guns['distance']}m {nearest_guns['direction']})" if nearest_guns else "Unknown"
    hosp_str = f"{nearest_hospital['name']} in {nearest_hospital['zone']} ({nearest_hospital['distance']}m {nearest_hospital['direction']})" if nearest_hospital else "Unknown"

    return {
        "zone": zone_friendly,
        "nearest_food": food_str,
        "nearest_weapons": guns_str,
        "nearest_hospital": hosp_str
    }

if __name__ == "__main__":
    # تجربة سريعة عند CJ في شارع Grove Street (2495, -1686)
    brief = get_spatial_brief(2495.0, -1686.0, "GAN1")
    print("Spatial Brief from Grove Street:")
    for k, v in brief.items():
        print(f"  {k}: {v}")
