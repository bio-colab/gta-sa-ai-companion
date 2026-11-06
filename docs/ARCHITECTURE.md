# GTA San Andreas AI Companion - Architecture & Technical Design

This document details the internal architecture, IPC protocol, telemetry streams, failover mechanics, and opcode safety rules that power the Embodied AI NPC Companion for GTA San Andreas.

---

## 1. High-Level System Architecture

The project bridges a 2004 32-bit RenderWare game engine with state-of-the-art Generative AI models and an agent-native CLI harness using a zero-overhead, multi-process architecture:

```
+---------------------------------------------------------------------------------------------------+
|                                GTA San Andreas (RenderWare Engine)                                |
|                                                                                                   |
|  +---------------------------------------------------------------------------------------------+  |
|  |                 CLEO Redux JavaScript Engine Mod (stage1_test[fs][mem].js)                  |  |
|  |  * Direct Memory Struct Access (CPed, CVehicle, Pools)                                      |  |
|  |  * Native Calling Dispatchers (CPed::Say, CWorld::GetIsLineOfSightClear)                    |  |
|  |  * 100% Native In-Engine Offline AI Command Processor (0ms Latency)                         |  |
|  |  * Combat Medic CPR & Adrenaline Resuscitation State Machine                                |  |
|  |  * Physics Raycasting Computer Vision & Flanking Logic                                      |  |
|  |  * Zero-Latency Speech Completion Tracker (pPed + 0x32E)                                    |  |
|  |  * Native Gang Recruitment (CPedGroup) & Telemetry Loop (30-50 FPS)                         |  |
|  |  * Dynamic Radar Blip Manager (BLIP_ONLY, NEITHER, BOTH)                                    |  |
|  +---------------------------------------------------------------------------------------------+  |
+------------------------------------------------^--------------------------------------------------+
                                                 |
                                     File-Based Safe IPC (INI)
                               (cleo/ainpc_bridge.ini / RAM-buffered)
                                                 |
         +---------------------------------------+---------------------------------------+
         |                                                                               |
         v                                                                               v
+-----------------------------------------------+               +-----------------------------------------------+
|     Python Orchestrator Backend (AINPC/)      |               |     Agent-Native CLI Harness (agent-harness/)  |
|                                               |               |                                               |
|  +-------------------+  +-------------------+ |               |  +-------------------+  +-------------------+ |
|  |   bridge.py       |  |   llm_brain.py    | |               |  |    gta_cli.py     |  |    session.py     | |
|  |  * IPC Reader     |  |  * Groq Cloud LLM | |               |  |  * Click / REPL   |  |  * JSON History   | |
|  |  * State Machine  |  |  * Prompt Engine  | |               |  |  * --json Mode    |  |  * State Capture  | |
|  |  * Failover Watch |  |  * Mode Router    | |               |  +-------------------+  +-------------------+ |
|  +-------------------+  +-------------------+ |               |                                               |
|  +-------------------+  +-------------------+ |               |  +-------------------+  +-------------------+ |
|  |   voice_stt.py    |  |   memory_db.py    | |               |  | version_resolver  |  |     memory.py     | |
|  |  * Push-to-Talk   |  |  * SQLite DB      | |               |  |  * 16-D Embeddings|  |  * AOB Signatures | |
|  |  * Whisper Turbo  |  |  * Episodic Recall| |               |  |  * Argmax Scanner |  |  * Pointer Inspec | |
|  +-------------------+  +-------------------+ |               |  +-------------------+  +-------------------+ |
+-----------------------------------------------+               +-----------------------------------------------+
```

---

## 2. Dual-Tier Intelligence Architecture & Automatic Failover

The system is architected around two complementary tiers of artificial intelligence, allowing uninterrupted operation regardless of network availability or API key configuration.

```
                    +------------------------------------+
                    |        Player Voice / Text         |
                    +-----------------+------------------+
                                      |
                      Is Python Bridge Connected?
                                      |
                     +----------------+----------------+
                     |                                 |
                  YES (Ping <= 4s)                  NO (Standby / Offline)
                     |                                 |
                     v                                 v
          +----------------------+          +----------------------+
          |   Tier 2: Cloud AI   |          |  Tier 1: Native AI   |
          +----------------------+          +----------------------+
          | • Whisper Large v3   |          | • 100% In-Engine     |
          | • Groq LLaMA 3.3     |          | • 0ms Latency        |
          | • SQLite Episodic DB |          | • Zero Cost / No Net |
          | • Dynamic Personas   |          | • Authentic Voices   |
          | • Strategic Emotes   |          | • Auto Medic CPR     |
          +----------------------+          +----------------------+
```

### 2.1 Tier 1: 100% Offline Native In-Engine AI
* **Location**: Directly executed inside the CLEO Redux runtime (`cleo/stage1_test[fs][mem].js`).
* **Latency**: $0.0\text{ ms}$ (zero network roundtrips, zero process serialization).
* **Requirements**: Zero API keys, zero cloud tokens, zero active network connections.
* **Capabilities**:
  * Native 3D audio speech playback with facial lip-sync (`CPed::Say` at `0x005EFFE0`).
  * Tactical cover seeking and vehicle barrier identification (`CTaskComplexSeekCoverUntilTargetDead` at `0x00654200`).
  * Physics line-of-sight raycasting vision (`CWorld::GetIsLineOfSightClear` at `0x0056A490`).
  * Autonomous Combat Medic CPR and Adrenaline resuscitation triage.
  * Direct RenderWare struct injection for health, armor, weapons, and ammunition.
  * Built-in text command parser triggered via in-game HUD typing bar (`F6` or `~`).

### 2.2 Tier 2: Augmented Cloud Conversational AI
* **Location**: Python backend process (`AINPC/bridge.py`).
* **Capabilities**:
  * Real-time push-to-talk speech-to-text (`voice_stt.py` via Groq Whisper Large v3 Turbo).
  * High-speed contextual reasoning (`llm_brain.py` via Groq LLaMA 3.3 70B / Qwen 2.5).
  * Long-term episodic memory persistence (`memory_db.py` via local SQLite).
  * Dynamic trust and bravery metric computation.

### 2.3 Resilient 4-Second Heartbeat Failover
The CLEO Redux script polls the `ping` monotonic counter inside `cleo/ainpc_bridge.ini`:
1. Every $250\text{ ms}$, the script compares `ping` against `lastAckPing`.
2. When `ping` increments, CLEO updates `pong = ping`, sets `status = connected`, and records `lastPingTime = now`.
3. If `now - lastPingTime > 4000\text{ ms}`, the game instantly and silently flips `bridgeConnected = false`.
4. The companion transitions into **100% Tier 1 Native Offline AI Mode** immediately without freezing the game, dropping frames, or throwing script exceptions.

---

## 3. IPC Protocol & Telemetry Stream (`ainpc_bridge.ini`)

Inter-process communication between CLEO Redux, Python, and the CLI harness is coordinated through `cleo/ainpc_bridge.ini`. All packet writes use monotonic sequence identifiers (`say_id`, `action_id`, `ping`, `pong`) to guarantee zero packet loss and strict ordering across asynchronous polling loops.

### 3.1 Telemetry Stream: Game $\rightarrow$ External Process (`[GAME]`)
Updated every tick ($30\text{--}50\text{ FPS}$) by the CLEO Redux script:

| Key | Type | Unit / Range | Description |
| :--- | :--- | :--- | :--- |
| `pong` | Int | $\ge 0$ | Incremented heartbeat acknowledgement counter |
| `status` | String | `connected` / `offline` | CLEO runtime bridge connection state |
| `cj_health` | Int | $0 \dots 100+$ | CJ's current health points |
| `cj_armor` | Int | $0 \dots 100$ | CJ's current body armor points |
| `cj_weapon` | Int | Enum ($0 \dots 46$) | CJ's currently equipped weapon ID |
| `cj_wanted` | Int | $0 \dots 6$ | Active wanted star level |
| `cj_in_car` | 0 / 1 | Boolean | `1` if CJ is currently seated in any vehicle |
| `cj_car_model` | Int | Model ID ($400 \dots 611$) | Vehicle model ID (e.g., $404$ Perennial, $411$ Infernus) |
| `car_radio` | Int | Channel ($0 \dots 12$) | Active in-game radio station |
| `car_crashed` | 0 / 1 | Boolean | `1` upon severe vehicle collision delta |
| `crash_severity` | Int | HP delta | Structural integrity damage lost in collision |
| `clock_hour` | Int | $0 \dots 23$ | In-game clock hour |
| `clock_min` | Int | $0 \dots 59$ | In-game clock minute |
| `weather_id` | Int | Weather ID | Active weather state ID |
| `threat_active` | 0 / 1 | Boolean | `1` if CJ or companion is engaged by hostiles |
| `cj_zone` | String | GXT Audio Zone | Current world zone (e.g., `GAN2` = Ganton, `COM` = Commerce) |
| `cj_x`, `cj_y`, `cj_z` | Float | World Units | CJ's 3D spatial coordinates |
| `target_active` | 0 / 1 | Boolean | `1` if the player has placed a yellow radar target marker |
| `target_x`, `target_y`| Float | World Units | Coordinates of user-placed map marker |
| `npc_active` | 0 / 1 | Boolean | `1` if an AI companion pedestrian is currently recruited |
| `npc_health` | Int | $0 \dots 100+$ | Companion health points |
| `npc_armor` | Int | $0 \dots 100$ | Companion body armor points |
| `npc_model` | Int | Model ID ($0 \dots 312$) | Pedestrian model ID |
| `npc_in_car` | 0 / 1 | Boolean | `1` if companion is currently inside a vehicle |
| `npc_dist` | Float | Meters | Euclidean distance between CJ and companion |
| `npc_weapon` | Int | Enum ($0 \dots 46$) | Companion's currently equipped weapon ID |
| `say_ack` | Int | $\ge 0$ | Last subtitle packet acknowledged by the game HUD |
| `action_ack` | Int | $\ge 0$ | Last tactical action packet executed by the game engine |

### 3.2 Command Stream: External Process $\rightarrow$ Game (`[BRIDGE]`)
Written by Python or `cli-anything-gta` to command the NPC:

| Key | Type | Description |
| :--- | :--- | :--- |
| `ping` | Int | Monotonically increasing heartbeat ping counter |
| `say_id` | Int | Incremented packet ID for dialog subtitles |
| `say_text` | String | Subtitle string formatted with GTA HUD color codes (`~g~`, `~y~`, `~w~`) |
| `action_id` | Int | Incremented packet ID for tactical physical actions |
| `action_cmd` | String | Literal opcode action command (e.g. `attack_threat`, `cover`, `medic`) |
| `active_mode` | String | Operational layer mode: `companion`, `combat`, `vehicle`, `emote` |
| `active_persona` | String | Behavioral persona: `hitman`, `driver`, `heavy`, `medic`, `girlfriend` |
| `trust_level` | Float | Floating point relationship score ($0.0 \dots 1.0$) affecting combat accuracy |
| `bravery` | Float | Floating point courage score ($0.0 \dots 1.0$) affecting retreat threshold |

### 3.3 Dynamic Memory Cache (`[MEMORY_DYNAMIC]`)
Written by `cli-anything-gta memory resolve` to supply runtime hardware offsets:

| Key | Type | Example Value | Description |
| :--- | :--- | :--- | :--- |
| `ped_say` | Hex | `0x005EFFE0` | Hardware address of `CPed::Say` |
| `task_cover` | Hex | `0x00654200` | Hardware address of `CTaskComplexSeekCoverUntilTargetDead` |
| `los_raycast` | Hex | `0x0056A490` | Hardware address of `CWorld::GetIsLineOfSightClear` |
| `ped_pool` | Hex | `0x00B74490` | Hardware pointer to `CPedPool` |
| `veh_pool` | Hex | `0x00B74494` | Hardware pointer to `CVehiclePool` |
| `world_players`| Hex | `0x00B7CD98` | Hardware pointer to `CWorld::Players[0]` |
| `resolver_method`| String | `16D_SEMANTIC_BEHAVIORAL_MATCH` | Verification method employed |

---

## 4. Game Engine Opcode Safety Matrix & Rules

CLEO Redux JavaScript runs directly inside the single-threaded RenderWare engine loop. Invoking unstable or deprecated opcodes results in unhandled access violations (CTD). Every opcode utilized by the companion is cataloged and safety-audited:

| Opcode | SBL / CLEO Redux Syntax | Stability Status | Engine Constraint & Safety Rule |
| :--- | :--- | :--- | :--- |
| `0187` | `Blip.AddForChar(char)` | **Safe** | Must always be cleaned up via `0164` upon ped death. |
| `0165` | `blip.changeColor(1)` | **Safe** | Values $0 \dots 4$ are valid. $1$ = Grove Street Green. |
| `0168` | `blip.changeScale(2)` | **Safe** | Scale must be between $1$ and $4$. |
| `07BE` | `blip.setAsFriendly(true)` | **Safe** | Prevents auto-targeting by CJ's weapons. |
| `018B` | `blip.changeDisplay(mode)` | **Safe** | $0$ = Neither, $2$ = BlipOnly, $3$ = Both. |
| `0164` | `blip.remove()` | **Safe** | Safe to call even if blip pointer is already null. |
| `00BF` | `Clock.GetTimeOfDay()` | **Safe** | Vanilla opcode. Reads hours and minutes. |
| `051E` | `Audio.GetRadioChannel()`| **Safe** | Returns channel index ($0 \dots 12$). |
| `0713` | `Task.DriveBy(...)` | **Safe** | Target must be a valid ped handle; requires SMG/Micro-Uzi. |
| `05E2` | `Task.KillCharOnFoot(...)`| **Safe** | Validates `Char.DoesExist(target)` prior to dispatch. |
| `02E0` | `grp.setLeader(player)` | **Safe** | Reclaims orphaned gang groups cleanly. |
| `0632` | `grp.setFollowStatus(true)`| **Safe** | Ensures synchronized vehicle embarkation/disembarkation. |
| `0792` | `player.setGroupToFollowAlways`| **Safe** | Prevents native 'H' whistle from breaking custom AI tasks. |
| `0AE2` | `World.GetRandomCarInSphere...`| **Safe** | Safe alternative to pool iteration for vehicle retrieval. |
| `0787` | `car.doesProvideCover(true)`| **Safe** | Flags nearest vehicle for engine tactical crouching tasks. |
| `0D59` | `Weather.GetCurrent()` | ❌ **FORBIDDEN** | **Causes instant CTD in GTA SA v1.0**. Memory reading `0xC81320` is used instead. |

---

## 5. Episodic Memory Database Schema (`memory.db`)

Episodic memory operates on a zero-dependency local SQLite database (`AINPC/memory.db`), capturing social interactions, shared firefights, and vehicular crashes.

```sql
-- Characters Table (Tied to ped model_id and demographics)
CREATE TABLE IF NOT EXISTS characters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    model_id INTEGER,
    name TEXT UNIQUE,
    archetype TEXT,
    trust_score REAL DEFAULT 0.5,      -- [0.0, 1.0] Modulates shooting accuracy
    bravery REAL DEFAULT 0.5,          -- [0.0, 1.0] Modulates cover retreat threshold
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
    event_type TEXT, -- 'chat', 'recruit', 'crash', 'combat', 'pain', 'spatial', 'heal'
    description TEXT,
    zone TEXT,
    timestamp TIMESTAMP,
    emotional_impact REAL DEFAULT 0.0, -- [-1.0, +1.0] Affects relationship delta
    FOREIGN KEY(character_name) REFERENCES characters(name)
);
```

### 5.1 Trust & Bravery Update Formulas
When a combat or rescue incident concludes:
$$\Delta_{\text{trust}} = \text{impact} \times \alpha_{\text{decay}}, \quad \alpha_{\text{decay}} = e^{-\lambda \Delta t}$$
* Rescuing CJ via Combat Medic CPR awards $\Delta_{\text{trust}} = +0.15$.
* Abandoning the companion in a shootout deducts $\Delta_{\text{trust}} = -0.10$.
* Companion weapon accuracy dynamically scales as:
$$\text{Accuracy}_{\text{companion}} = \text{BaseAcc} + (\text{trust} \times 40\%)$$

---

## 6. Dynamic Radar Blip State Machine

To eliminate immersion-breaking 3D floating arrows directly above the companion's head while preserving radar orientation across Los Santos:

```
             +------------------------------+
             |       NPC Recruited (H)      |
             +--------------+---------------+
                            |
                            v
             +------------------------------+
             |    Blip.AddForChar (0187)    |
             |    changeColor(1), Scale(2)  |
             |    setAsFriendly(true)       |
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
[No marker]  [Radar only]        [Radar only]    [Radar + 3D Arrow]
```

---

## 7. Agent-Native CLI Harness (`cli-anything-gta`)

In compliance with the **HKUDS CLI-Anything** methodology, the companion codebase includes an agent-native CLI harness designed specifically for autonomous coding agents and external automation pipelines.

```
                      User / Autonomous Agent
                                 |
           +---------------------+---------------------+
           |                                           |
           v                                           v
  Subprocess Mode (--json)                     Interactive REPL
  cli-anything-gta status --json               cli-anything-gta
  cli-anything-gta companion order cover       >>> companion order cover
           |                                           |
           +---------------------+---------------------+
                                 |
                                 v
               Click Command Processor & Router
                                 |
       +-------------------------+-------------------------+
       |                         |                         |
       v                         v                         v
 Core Companion Logic       Memory Resolver         Telemetry Reader
 (companion.py)             (version_resolver.py)   (telemetry.py)
       |                         |                         |
       +-------------------------+-------------------------+
                                 |
                                 v
                 Safe File-Based IPC & INI Bridge
                    (cleo/ainpc_bridge.ini)
```

### 7.1 Strict JSON Contract Specification
Every CLI command accepts `--json` and emits a deterministic schema guaranteeing zero parsing ambiguity:

```json
{
  "status": "success",
  "data": { ... },
  "message": "Optional human-readable confirmation message"
}
```

On error:
```json
{
  "status": "error",
  "error": "Error description string",
  "code": 1
}
```

### 7.2 Subcommand Matrix
* `status`: Checks bridge connection, CLEO script status, and active companion entity.
* `telemetry`: Dumps live player/NPC health, armor, coords, vehicle, and threat metrics.
* `companion persona <hitman|driver|heavy|medic|girlfriend>`: Switches operational role.
* `companion order <follow|stay|cover|attack|heal|dismiss>`: Dispatches tactical behavior.
* `companion equip <m4|ak47|sniper|deagle|shotgun|smg|rpg>`: Arms companion with ammunition.
* `companion speak <phrase>`: Triggers native in-engine speech with facial lip-sync.
* `memory signatures`: Catalogs verified AOB signatures and hardware pointers.
* `memory resolve [--exe PATH] [--no-ini]`: Executes 16-D behavioral vector scan.
* `config show|get|set`: Manages harness settings and API endpoints.

---

## 8. Reverse Engineering & Low-Level Specifications Reference

For the comprehensive low-level breakdown of RenderWare structures (`CPed`, `CVehicle`), memory pool indexing mathematics, 16-D behavioral vector categories, calling conventions (`__thiscall` vs `__cdecl`), and Line-of-Sight raycasting implementation details, consult the dedicated developer manual:

👉 **[Engine Internals & Reverse Engineering Specifications (`docs/ENGINE_INTERNALS.md`)](file:///d:/GTA%20san%20andreas/docs/ENGINE_INTERNALS.md)**
