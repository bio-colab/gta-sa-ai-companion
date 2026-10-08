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
                # جدول الشخصيات ومستوى العلاقة مع CJ
                cursor.execute("""
                CREATE TABLE IF NOT EXISTS characters (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    model_id INTEGER,
                    name TEXT UNIQUE,
                    archetype TEXT,
                    trust_score REAL DEFAULT 0.5,
                    bravery REAL DEFAULT 0.5,
                    times_recruited INTEGER DEFAULT 1,
                    first_met TIMESTAMP,
                    last_seen TIMESTAMP
                );
                """)

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
        """استرجاع شخصية مسجلة أو إنشاؤها إذا كانت أول مرة يلتقي بها CJ"""
        now = datetime.now().isoformat()
        with self.lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM characters WHERE name = ?", (name,))
                row = cursor.fetchone()

                if row:
                    # تحديث تاريخ آخر ظهور وعدد مرات التجنيد
                    cursor.execute("""
                    UPDATE characters 
                    SET last_seen = ?, times_recruited = times_recruited + 1 
                    WHERE name = ?
                    """, (now, name))
                    conn.commit()
                    return dict(row)
                else:
                    cursor.execute("""
                    INSERT INTO characters (model_id, name, archetype, trust_score, bravery, times_recruited, first_met, last_seen)
                    VALUES (?, ?, ?, 0.5, 0.5, 1, ?, ?)
                    """, (model_id, name, archetype, now, now))
                    conn.commit()
                    return {
                        "model_id": model_id,
                        "name": name,
                        "archetype": archetype,
                        "trust_score": 0.5,
                        "bravery": 0.5,
                        "times_recruited": 1,
                        "first_met": now,
                        "last_seen": now
                    }

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

                # تحديث مقياس الثقة (Trust Score) تدريجياً بناءً على الأثر العاطفي
                if emotional_impact != 0.0:
                    cursor.execute("""
                    UPDATE characters
                    SET trust_score = MAX(0.0, MIN(1.0, trust_score + ?))
                    WHERE name = ?
                    """, (emotional_impact * 0.1, character_name))

                conn.commit()

    def get_recent_memories(self, character_name: str, limit: int = 3) -> List[str]:
        """استرجاع أحدث الذكريات المشتركة لصياغتها داخل سياق الذكاء الاصطناعي"""
        with self.lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                SELECT description, zone, event_type 
                FROM memories 
                WHERE character_name = ? 
                ORDER BY id DESC LIMIT ?
                """, (character_name, limit))
                rows = cursor.fetchall()
                return [f"[{r['zone']}]: {r['description']}" for r in rows]

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
