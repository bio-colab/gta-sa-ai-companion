# GTA San Andreas AI Companion - Architecture & Technical Design

This document details the internal architecture, IPC protocol, telemetry streams, and engine opcode hooks that power the Embodied AI NPC Companion for GTA San Andreas (v1.0 US).

---

## 1. High-Level System Architecture

The project bridges a 2004 game engine with state-of-the-art Generative AI models using a zero-overhead, multi-process architecture:

```
+-------------------------------------------------------------------------------+
|                        GTA San Andreas (v1.0 US Game Engine)                  |
|                                                                               |
|  +-------------------------------------------------------------------------+  |
|  |                 CLEO Redux JavaScript Mod (stage1_test[fs].js)          |  |
|  |  * Native Gang Recruitment (CPedGroup)                                  |  |
|  |  * In-game Telemetry Loop (30-50 FPS)                                   |  |
|  |  * Autonomous World Sensing (Clock, Radio, Crash, Threats)             |  |
|  |  * Vehicle Drive-By & Street Defense System                             |  |
|  |  * Dynamic Radar Blip Manager (BLIP_ONLY, NEITHER, BOTH)                |  |
|  +-------------------------------------------------------------------------+  |
+---------------------------------------^---------------------------------------+
                                        |
                            File-Based Safe IPC (INI)
                        (cleo/ainpc_bridge.ini / RAM-buffered)
                                        |
+---------------------------------------v---------------------------------------+
|                       Python Orchestrator Backend (AINPC/)                    |
|                                                                               |
|  +-------------------+  +--------------------+  +--------------------------+  |
|  |   bridge.py       |  |   llm_brain.py     |  |   voice_stt.py           |  |
|  |  * IPC Reader     |  |  * Groq Cloud LLM  |  |  * Push-to-Talk (T key)  |  |
|  |  * State Machine  |  |  * Prompt Engine   |  |  * Groq Whisper Turbo    |  |
|  |  * Thread Pool    |  |  * Mode Validation |  |  * Microphone capture    |  |
|  +-------------------+  +--------------------+  +--------------------------+  |
|                                    |                                          |
|                         +----------v-----------+                              |
|                         |   memory_db.py       |                              |
|                         |  * SQLite Database   |                              |
|                         |  * Episodic Recall   |                              |
|                         |  * Relationship/Trust|                              |
|                         +----------------------+                              |
+-------------------------------------------------------------------------------+
```

---

## 2. IPC Protocol & Telemetry Stream (`ainpc_bridge.ini`)

Inter-process communication between CLEO Redux and Python is coordinated via `ainpc_bridge.ini` with sequence IDs (monotonically increasing integers) ensuring zero dropped packets and thread safety.

### 2.1 Game-to-Python Telemetry (`[GAME]`)
Updated every tick by the CLEO Redux script:

| Key | Type | Description |
| :--- | :--- | :--- |
| `pong` | Int | Incremented heartbeat counter |
| `status` | String | Connection status (`connected`) |
| `cj_health` | Int | CJ's current health (0 - 100+) |
| `cj_armor` | Int | CJ's body armor (0 - 100) |
| `cj_weapon` | Int | CJ's active weapon ID |
| `cj_wanted` | Int | CJ's wanted level (0 - 6 stars) |
| `cj_in_car` | 0 / 1 | 1 if CJ is inside a vehicle |
| `cj_car_model` | Int | Vehicle model ID (e.g. 404 = Perennial) |
| `car_radio` | Int | Active radio station channel ID (0 - 12) |
| `car_crashed` | 0 / 1 | 1 on instant severe vehicle collision |
| `crash_severity` | Int | Damage delta from collision |
| `clock_hour` | Int | In-game clock hour (0 - 23) |
| `clock_min` | Int | In-game clock minute (0 - 59) |
| `weather_id` | Int | Weather ID (-1 if disabled) |
| `threat_active` | 0 / 1 | 1 if CJ or companion is targeted by hostiles |
| `cj_zone` | String | Audio/GXT zone name (e.g. `GAN2` = Ganton) |
| `cj_x`, `cj_y`, `cj_z` | Float | CJ 3D world coordinates |
| `target_active` | 0 / 1 | 1 if player placed a target marker on the map |
| `target_x`, `target_y`| Float | Target marker coordinates |
| `npc_active` | 0 / 1 | 1 if an AI Companion is currently recruited |
| `npc_health` | Int | Companion health |
| `npc_armor` | Int | Companion body armor |
| `npc_model` | Int | Companion pedestrian model ID |
| `npc_in_car` | 0 / 1 | 1 if companion is inside a vehicle |
| `npc_dist` | Float | Distance between CJ and companion (meters) |
| `npc_weapon` | Int | Companion's currently equipped weapon |
| `say_ack` | Int | Last subtitle ID acknowledged by the game |

### 2.2 Python-to-Game Commands (`[BRIDGE]`)
Written by Python upon LLM judgment or speech transcription:

| Key | Type | Description |
| :--- | :--- | :--- |
| `ping` | Int | Heartbeat ping counter |
| `say_id` | Int | Incremented subtitle ID |
| `say_text` | String | GTA formatted colored subtitle text |
| `action_id` | Int | Incremented action sequence ID |
| `action_cmd` | String | Exact action opcode to execute |
| `active_mode` | String | Active layer mode (`companion`, `combat`, `vehicle`, `emote`) |

---

## 3. Game Engine Opcode Catalog & Safety Matrix

All opcodes used have been audited for vanilla GTA San Andreas v1.0 US compatibility:

| Opcode | SBL / CLEO Command | Purpose | Stability Rule |
| :--- | :--- | :--- | :--- |
| `0187` | `Blip.AddForChar(char)` | Creates radar blip & 3D marker for companion | Safe |
| `0165` | `blip.changeColor(1)` | Sets blip color (1 = Grove Street Green) | Safe |
| `0168` | `blip.changeScale(2)` | Sets blip icon size on radar | Safe |
| `07BE` | `blip.setAsFriendly(true)` | Treats companion as friendly ally | Safe |
| `018B` | `blip.changeDisplay(mode)` | Dynamic display (0=Neither, 2=BlipOnly, 3=Both) | Safe |
| `0164` | `blip.remove()` | Destroys blip when released or dead | Safe |
| `00BF` | `Clock.GetTimeOfDay()` | Reads in-game hour and minute | Safe (100% vanilla) |
| `051E` | `Audio.GetRadioChannel()` | Reads player vehicle radio station | Safe |
| `0713` | `Task.DriveBy(...)` | Executes window hanging vehicle drive-by | Safe |
| `05E2` | `Task.KillCharOnFoot(...)`| Commands companion to engage enemy on foot | Safe |
| `02E0` | `grp.setLeader(player)` | Assigns CJ as gang leader in engine | Safe |
| `0632` | `grp.setFollowStatus(true)`| Native embark/disembark sync with vehicle | Safe |
| `0792` | `player.setGroupToFollowAlways`| Prevents native 'H' whistle from breaking AI | Safe |
| `0D59` | `Weather.GetCurrent()` | **FORBIDDEN (CLEO+)** | **Causes CTD in v1.0. Do not use.** |

---

## 4. Episodic Memory Schema (`memory.db`)

Episodic memory runs on SQLite with zero external dependencies:

```sql
-- Characters Table (Tied to model_id and ped demographics)
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

-- Memories & Shared Incidents Table
CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character_name TEXT,
    event_type TEXT, -- 'chat', 'recruit', 'crash', 'combat', 'pain', 'spatial'
    description TEXT,
    zone TEXT,
    timestamp TIMESTAMP,
    emotional_impact REAL DEFAULT 0.0,
    FOREIGN KEY(character_name) REFERENCES characters(name)
);
```

---

## 5. Dynamic Radar Blip State Machine

To eliminate immersion breaking 3D floating markers while maintaining navigation:

```
             +------------------------------+
             |       NPC Recruited (H)      |
             +--------------+---------------+
                            |
                            v
             +------------------------------+
             |  Blip.AddForChar (0187)      |
             |  changeColor(1), Scale(2)    |
             |  setAsFriendly(true)         |
             +--------------+---------------+
                            |
             +--------------v---------------+
             |     Every 300ms Update       |
             +--------------+---------------+
                            |
           +----------------+----------------+
           |                                 |
    In Vehicle?                        On Foot?
           |                                 |
    +------+------+                   +------+------+
    |             |                   |             |
With CJ?     Solo?               Dist <= 25m?   Dist > 25m?
    |             |                   |             |
    v             v                   v             v
Mode 0         Mode 2              Mode 2        Mode 3
(NEITHER)    (BLIP_ONLY)         (BLIP_ONLY)     (BOTH)
[No marker]  [Radar only]        [Radar only]    [Radar + 3D]
```
