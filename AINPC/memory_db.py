# ====================================================================
# GTA San Andreas - AI NPC Memory Database (Phase 3.1: SQLite Engine)
# Long-Term Episodic Memory & Dynamic Relationship Tracking
# ====================================================================

import os
import sqlite3
import threading
from datetime import datetime
from typing import Dict, Any, List, Optional

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "memory.db")

class MemoryDB:
    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path
        self.lock = threading.Lock()
        self._init_tables()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=5.0)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_tables(self):
        with self.lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                # جدول الشخصيات ومستوى العلاقة مع CJ (تم إزالة UNIQUE من name لتفادي أي أخطاء تطابق أسماء)
                cursor.execute("""
                CREATE TABLE IF NOT EXISTS characters (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    model_id INTEGER,
                    name TEXT,
                    archetype TEXT,
                    trust_score REAL DEFAULT 0.5,
                    bravery REAL DEFAULT 0.5,
                    times_recruited INTEGER DEFAULT 1,
                    first_met TIMESTAMP,
                    last_seen TIMESTAMP,
                    persona TEXT DEFAULT '',
                    persona_custom TEXT DEFAULT ''
                );
                """)

                # التحقق مما إذا كان الجدول القديم يحتوي على قيد UNIQUE وترقيته تلقائياً
                cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='characters';")
                schema_row = cursor.fetchone()
                if schema_row and "name TEXT UNIQUE" in (schema_row[0] or ""):
                    try:
                        cursor.execute("ALTER TABLE characters RENAME TO characters_old;")
                        cursor.execute("""
                        CREATE TABLE characters (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            model_id INTEGER,
                            name TEXT,
                            archetype TEXT,
                            trust_score REAL DEFAULT 0.5,
                            bravery REAL DEFAULT 0.5,
                            times_recruited INTEGER DEFAULT 1,
                            first_met TIMESTAMP,
                            last_seen TIMESTAMP,
                            persona TEXT DEFAULT '',
                            persona_custom TEXT DEFAULT ''
                        );
                        """)
                        cursor.execute("PRAGMA table_info(characters_old);")
                        old_cols = [c[1] for c in cursor.fetchall()]
                        common_cols = [c for c in ["id", "model_id", "name", "archetype", "trust_score", "bravery", "times_recruited", "first_met", "last_seen", "persona", "persona_custom"] if c in old_cols]
                        cols_str = ", ".join(common_cols)
                        cursor.execute(f"INSERT INTO characters ({cols_str}) SELECT {cols_str} FROM characters_old;")
                        cursor.execute("DROP TABLE characters_old;")
                    except Exception:
                        pass

                # التحقق من وجود الأعمدة الجديدة وترقية قاعدة البيانات القديمة تلقائياً
                cursor.execute("PRAGMA table_info(characters);")
                existing_cols = [col[1] for col in cursor.fetchall()]
                if "persona" not in existing_cols:
                    try:
                        cursor.execute("ALTER TABLE characters ADD COLUMN persona TEXT DEFAULT '';")
                    except Exception:
                        pass
                if "persona_custom" not in existing_cols:
                    try:
                        cursor.execute("ALTER TABLE characters ADD COLUMN persona_custom TEXT DEFAULT '';")
                    except Exception:
                        pass

                # جدول الذكريات والأحداث المشتركة
                cursor.execute("""
                CREATE TABLE IF NOT EXISTS memories (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    character_name TEXT,
                    event_type TEXT,
                    description TEXT,
                    zone TEXT,
                    timestamp TIMESTAMP,
                    emotional_impact REAL DEFAULT 0.0,
                    FOREIGN KEY(character_name) REFERENCES characters(name)
                );
                """)
                conn.commit()

    def get_or_register_character(self, model_id: int, name: str, archetype: str) -> Dict[str, Any]:
        """استرجاع شخصية مسجلة بـ model_id أو إنشاؤها إذا كانت أول مرة يلتقي بها CJ"""
        now = datetime.now().isoformat()
        with self.lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                # البحث الثابت بـ model_id لضمان استمرارية الذاكرة عبر الجلسات
                cursor.execute("SELECT * FROM characters WHERE model_id = ?", (model_id,))
                row = cursor.fetchone()

                if row:
                    # تحديث تاريخ آخر ظهور وعدد مرات التجنيد للشخصية الدائمة
                    new_recruits = row["times_recruited"] + 1
                    cursor.execute("""
                    UPDATE characters 
                    SET last_seen = ?, times_recruited = ? 
                    WHERE id = ?
                    """, (now, new_recruits, row["id"]))
                    conn.commit()
                    updated = dict(row)
                    updated["times_recruited"] = new_recruits
                    updated["last_seen"] = now
                    return updated
                else:
                    try:
                        cursor.execute("""
                        INSERT INTO characters (model_id, name, archetype, trust_score, bravery, times_recruited, first_met, last_seen, persona, persona_custom)
                        VALUES (?, ?, ?, 0.5, 0.5, 1, ?, ?, '', '')
                        """, (model_id, name, archetype, now, now))
                        conn.commit()
                    except sqlite3.IntegrityError:
                        # في حال وجود قيد قديم استثنائي، تفادي الانهيار وتحديد اسم مميز برقم الموديل
                        unique_name = f"{name} #{model_id}"
                        cursor.execute("""
                        INSERT INTO characters (model_id, name, archetype, trust_score, bravery, times_recruited, first_met, last_seen, persona, persona_custom)
                        VALUES (?, ?, ?, 0.5, 0.5, 1, ?, ?, '', '')
                        """, (model_id, unique_name, archetype, now, now))
                        conn.commit()
                        name = unique_name

                    return {
                        "model_id": model_id,
                        "name": name,
                        "archetype": archetype,
                        "trust_score": 0.5,
                        "bravery": 0.5,
                        "times_recruited": 1,
                        "first_met": now,
                        "last_seen": now,
                        "persona": "",
                        "persona_custom": ""
                    }

    def update_character_persona(self, model_id: int, persona: str, persona_custom: str = "") -> bool:
        """تحديث وحفظ شخصية الـ NPC ودوره المحدد بشكل دائم في قاعدة البيانات"""
        with self.lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                UPDATE characters 
                SET persona = ?, persona_custom = ? 
                WHERE model_id = ?
                """, (persona, persona_custom, model_id))
                conn.commit()
                return cursor.rowcount > 0

    def get_character_persona(self, model_id: int) -> Dict[str, str]:
        """استرجاع الشخصية المحفوظة للـ NPC بناءً على الموديل"""
        with self.lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT persona, persona_custom FROM characters WHERE model_id = ?", (model_id,))
                row = cursor.fetchone()
                if row:
                    return {"persona": row["persona"] or "", "persona_custom": row["persona_custom"] or ""}
                return {"persona": "", "persona_custom": ""}

    def record_memory(self, character_name: str, event_type: str, description: str, zone: str, emotional_impact: float = 0.0):
        """تسجيل ذكرى أو موقف مشترك بين CJ والـ NPC مع أثره العاطفي"""
        now = datetime.now().isoformat()
        with self.lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                INSERT INTO memories (character_name, event_type, description, zone, timestamp, emotional_impact)
                VALUES (?, ?, ?, ?, ?, ?)
                """, (character_name, event_type, description, zone, now, emotional_impact))

                # تحديث مقياس الثقة (Trust Score) تدريجياً وبشكل ملموس بناءً على الأثر العاطفي
                if emotional_impact != 0.0:
                    cursor.execute("""
                    UPDATE characters
                    SET trust_score = MAX(0.0, MIN(1.0, trust_score + ?))
                    WHERE name = ?
                    """, (emotional_impact, character_name))

                conn.commit()

    def clean_persona_clutter(self):
        """تنظيف الأدوار المتراكمة من الاختبارات السابقة لضمان بداية نقية لكل شخصية يتم تجنيدها"""
        with self.lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("UPDATE characters SET persona = '', persona_custom = '';")
                # حذف الذكريات المتداخلة القديمة الناتجة عن تجارب الأدوار السابقة
                cursor.execute("""
                DELETE FROM memories 
                WHERE description LIKE '%assigned me the role%' 
                   OR description LIKE '%Role assigned%';
                """)
                conn.commit()

    def get_recent_memories(self, character_name: str, limit: int = 3, persona_filter: Optional[str] = None) -> List[str]:
        """استرجاع أحدث الذكريات المشتركة مع فلترة ذكية حسب الشخصية النشطة لمنع تداخل الأدوار"""
        with self.lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                SELECT description, zone, event_type 
                FROM memories 
                WHERE character_name = ? 
                ORDER BY id DESC LIMIT 15
                """, (character_name,))
                rows = cursor.fetchall()

                filtered = []
                for r in rows:
                    desc_lower = r["description"].lower()
                    ev_type = r["event_type"].lower()

                    # إذا كانت الشخصية النشطة ليست حبيبة، استبعاد أي ذكريات رومانسية أو حركات خاصة
                    if persona_filter != "girlfriend":
                        if any(k in desc_lower for k in ["kiss", "girlfriend", "lapdance", "strip", "honey", "baby", "handsome", "flirt"]):
                            continue
                        if ev_type in ["romance", "flirt"]:
                            continue

                    # إذا كانت الشخصية النشطة ليست متفجرات/ثقيلة، استبعاد ذكريات الصواريخ المفرطة
                    if persona_filter != "heavy":
                        if any(k in desc_lower for k in ["rocket", "rpg", "demolition", "blow up", "missile"]):
                            continue

                    # إذا كانت الشخصية مرافق طبيعي، استبعاد أي أثر للأدوار المتطرفة
                    if not persona_filter:
                        if any(k in desc_lower for k in ["hitman", "medic", "heavy", "driver", "girlfriend"]):
                            continue

                    filtered.append(f"[{r['zone']}]: {r['description']}")
                    if len(filtered) >= limit:
                        break

                return filtered

    def get_character_status(self, character_name: str) -> Dict[str, Any]:
        """الحصول على ملخص العلاقة الحالية والثقة"""
        with self.lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT trust_score, times_recruited FROM characters WHERE name = ?", (character_name,))
                row = cursor.fetchone()
                if row:
                    return dict(row)
                return {"trust_score": 0.5, "times_recruited": 1}

if __name__ == "__main__":
    db = MemoryDB()
    print("Testing MemoryDB Engine...")

    # 1. تسجيل شخصية جديدة
    char = db.get_or_register_character(107, "D-Mac", "Grove Street Families homie")
    print(f"Registered/Loaded Character: {char['name']} | Initial Trust: {char['trust_score']}")

    # 2. تسجيل أحداث وذكريات
    db.record_memory("D-Mac", "police_escape", "We escaped a 2-star police pursuit together!", "Ganton", emotional_impact=0.5)
    db.record_memory("D-Mac", "ride", "Cruised around East Los Santos in a lowrider.", "East Los Santos", emotional_impact=0.2)
    db.record_memory("D-Mac", "combat", "Fought off Ballas homies on foot.", "Idlewood", emotional_impact=0.4)

    # 3. فحص تطور الثقة
    status = db.get_character_status("D-Mac")
    print(f"Updated Trust Score: {status['trust_score']:.2f}")

    # 4. استرجاع الذكريات
    mems = db.get_recent_memories("D-Mac", limit=3)
    print("\nRecent Shared Memories:")
    for m in mems:
        print(" -", m)
