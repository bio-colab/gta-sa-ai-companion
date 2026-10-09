# GTA San Andreas - Autonomous AI NPC Companion System

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python: 3.10+](https://img.shields.io/badge/Python-3.10+-blue.svg)](https://www.python.org/)
[![Platform: GTA SA v1.0 US](https://img.shields.io/badge/Game-GTA%20San%20Andreas%20v1.0-green.svg)](https://www.rockstargames.com/)
[![Runtime: CLEO Redux](https://img.shields.io/badge/CLEO-Redux%20JS-orange.svg)](https://re.cleo.li/)
[![AI: Groq Cloud](https://img.shields.io/badge/AI-Groq%20Cloud%20(Whisper%20%2B%20LLM)-purple.svg)](https://groq.com/)
[![Hardware: Budget Friendly](https://img.shields.io/badge/Hardware-Intel%20i5%20%2B%20UHD%20620-brightgreen.svg)]()
[![Cost: 0$ Routine Reflexes](https://img.shields.io/badge/Token%20Cost-0%24%20Local%20Reflexes-blue.svg)]()

An **Embodied, Autonomous AI NPC Companion** system for vanilla **Grand Theft Auto: San Andreas (v1.0 US)**. Walk up to any pedestrian in the world, recruit them as your companion, and interact via real-time push-to-talk voice or an in-game HUD typing bar.

The companion features procedural demographic identity, persistent episodic memory, layered behavioral modes (combat, vehicle, emotes), dynamic personas (Hitman, Medic, Demolitions, Driver, Girlfriend), and hybrid local autonomy that handles combat and driving reflexes with **zero API token cost**.

---

## 💰 Zero Financial Burden & Resource Conservation Philosophy

One of the foundational design pillars of this project is **eliminating financial and hardware barriers for players**:

1. **No Expensive GPU or High-End PC Required**:
   * Traditional local AI gaming mods require multi-thousand dollar gaming rigs equipped with dedicated NVIDIA RTX GPUs with massive VRAM (12GB–24GB+).
   * This project is engineered, benchmarked, and verified from scratch on **modest budget office laptops** (Intel Core i5-8350U with integrated Intel UHD Graphics 620).
   * It achieves a rock-solid **60 FPS** in vanilla GTA San Andreas with negligible Python memory overhead (< 115 MB RAM) and under 2% CPU usage.

2. **Zero-Cost Hybrid Reflexes (Token Frugality)**:
   * Real-time open-world gameplay generates dozens of sensory triggers every minute (hostile gang attacks, police chases, car crashes, health drops). Routing all routine combat reflexes through a cloud LLM quickly depletes API quotas and incurs 1–2s network latency.
   * **Hybrid Intelligence Solution**: 95%+ of routine combat, survival, and vehicle decisions are executed **100% locally** via native CLEO Redux opcodes:
     - Autonomous Ballas/Vagos targeting: **0 API Cost (0ms latency)**
     - Emergency Field Triage healing: **0 API Cost (0ms latency)**
     - Anti-Air & Anti-Armor RPG rocket interception: **0 API Cost (0ms latency)**
     - Getaway boarding & vehicle repair: **0 API Cost (0ms latency)**
   * **Cloud LLM API tokens (Groq Cloud)** are strictly reserved for conversational dialogue, emergent storytelling, and dynamic persona reconfigurations. A standard free-tier Groq API key is more than sufficient for unlimited daily play!

---

## 💻 Tested Hardware Specifications & Benchmarks

The system was developed and stress-tested on real-world, accessible hardware:

### Hardware Specifications
| Component | Specification |
| :--- | :--- |
| **Model** | Dell Latitude 5490 |
| **Processor (CPU)** | Intel Core i5-8350U (4 Cores / 8 Threads, 1.70 GHz base, up to 3.60 GHz turbo) |
| **Graphics (GPU)** | Intel UHD Graphics 620 (Integrated Graphics) |
| **System Memory (RAM)** | 8 GB / 16 GB DDR4 @ 2400 MHz |
| **Storage** | M.2 NVMe SSD |
| **Operating System** | Windows 10 / 11 Pro 64-bit |
| **Game Executable** | Vanilla GTA San Andreas v1.0 US (`gta_sa.exe`, 14,383,616 bytes) |

### Performance Benchmarks
| Metric | Benchmark Result | Impact |
| :--- | :--- | :--- |
| **In-Game Framerate** | Solid 60 FPS (with standard framelimiter/silentpatch) | Zero frame drops or micro-stutters |
| **Python Backend RAM** | ~85 MB – 115 MB | Extremely lightweight |
| **Python Backend CPU** | < 2.0% average utilization | Background thread pool optimization |
| **CLEO Script Overhead** | < 0.2 ms per game tick | Executes within native engine cycle |
| **Voice STT Latency** | ~300 ms – 450 ms | Groq Whisper Large v3 Turbo |
| **LLM Inference Latency** | ~350 ms – 600 ms | Groq Cloud Qwen 2.5 / LLaMA 3.3 |
| **Local Reflex Latency** | **0 ms (Instantaneous)** | Native GTA SA opcodes |

---

## 🌟 Key Features

* **🎙️ Real-Time Voice Conversation (Push-To-Talk)**:
  * Hold **`T`** in-game to speak through your microphone.
  * Ultra-fast speech recognition via **Groq Whisper Large v3 Turbo** (~300ms latency).
  * In-game formatted dialogue subtitles (`Text.PrintStringNow`).

* **⌨️ In-Game Text Command Bar (`F6` / `~`)**:
  * Press **`~` / `\``** (Tilde / Backtick) or **`F6`** to open the live on-screen typing bar.
  * **Isolated Input Layer**: CJ's movement, weapon firing, and `H`-key recruitment toggles are safely locked while typing to prevent accidental dismissals or misfires.
  * **Safe String Sanitization**: Sanitizes GXT escape sequences (`~`) and unsupported font characters to guarantee zero texture corruption and zero CTD crashes.
  * Send voice-equivalent commands, chat messages, or persona assignments directly via keyboard.

* **🎭 Deep Persona System (`/persona`)**:
  * Dynamically reconfigure your companion's system instructions, personality, weapon proficiencies, and autonomous behaviors.
  * **Hitman**: Ruthless marksman with 100% weapon accuracy, lethal autonomous threat interception.
  * **Medic**: Field triage specialist who automatically heals CJ (100 HP + 50 armor) when CJ drops below 70 HP.
  * **Heavy**: Demolitions expert armed with an RPG-7 who locks onto and destroys police cruisers, SWAT vans, and police helicopters (Police Maverick) when wanted level rises.
  * **Driver**: High-speed getaway driver (44.0 speed) who takes the wheel and automatically repairs damaged vehicles.
  * **Girlfriend**: Romantic companion who unlocks exclusive affection, club dancing, and adult animations (`strip`, `lapdance`, `kiss`).
  * **Custom**: Define any custom personality or operational background on the fly; stored persistently in SQLite.

* **🧠 Living Demographic Identity & SQLite Episodic Memory**:
  * Every recruited pedestrian procedurally generates a name, gender, age, background, archetype, and personality.
  * Persistent memory via SQLite (`memory.db`): companions remember past conversations, shared shootouts, and car rides across gameplay sessions.
  * Dynamic trust and relationship scoring (0 to 100).

* **🛡️ Native Engine Group Embodiment (`CPedGroup`)**:
  * Uses the vanilla GTA engine's native gang mechanics (`CPedGroup`).
  * Seamlessly accompanies CJ on foot and enters passenger seats automatically.
  * Bulletproof vehicle synchronization with zero desync.

* **🎯 Dynamic Radar Blip Manager**:
  * Recruited companions appear on the radar mini-map with Grove Street green blips.
  * **Dynamic immersion control**: The 3D arrow above their head is automatically hidden when close or inside a car (`BLIP_ONLY` mode), and only appears if they are far away on foot (`BOTH` mode).

* **🚗 Layered Action Architecture**:
  * **Companion Mode**: Following, healing, eye contact, body orientation.
  * **Combat Mode**: Dynamic arming (M4, RPG-7, Combat Shotgun, Desert Eagle, MP5) with dynamic accuracy, disarming, hands-up stance.
  * **Vehicle Mode**: Autonomous car fetching (sprinting to nearest empty car, hotwiring, and driving it to CJ), driving to map target markers, or casual cruising.
  * **Emote Mode**: Dancing, adult animations (`strip`, `lapdance`, `kiss`), smoking, drinking/stumbling, cheering, cowering.

* **⚡ Ambient World Autonomy**:
  * **Crash Panic**: Reacts dynamically to high-speed vehicle impacts.
  * **Car Radio Commentary**: Listens to CJ's active radio station (Radio Los Santos, K-DST, Bounce FM, WCTR) and comments on the tracks.
  * **Time Awareness**: Notes sunrise, noon, golden hour, or midnight via vanilla game clock.
  * **Autonomous Threat Defense & Drive-By**: Returns fire on hostile gang members attacking CJ on foot or hangs out the passenger window for drive-by shootings.

---

## 🏗️ Architecture

```
+-------------------------------------------------------------------------+
|                  GTA San Andreas (v1.0 US Game Engine)                  |
|                                                                         |
|   CLEO Redux JavaScript Mod (stage1_test[fs].js)                        |
|   - Native Group AI (CPedGroup)            - Vehicle Drive-By (0713)    |
|   - Dynamic Blip Manager (0187, 018B)      - Local Threat Reflexes      |
|   - HUD Text Input Bar (F6 / ~)            - Clock & Radio Sensors      |
|   - Local Triage / RPG Chopper Intercept   - Telemetry Stream           |
+------------------------------------^------------------------------------+
                                     |
                       File IPC (cleo/ainpc_bridge.ini)
                                     |
+------------------------------------v------------------------------------+
|                  Python Orchestrator Backend (AINPC/)                   |
|                                                                         |
|   bridge.py              llm_brain.py            voice_stt.py           |
|   - Heartbeat Monitor    - Groq Cloud LLM        - Microphone Stream    |
|   - Telemetry Parser     - Persona System        - Whisper Large Turbo  |
|                                                                         |
|   memory_db.py           ped_demographics.py     poi_manager.py         |
|   - SQLite Memory        - Procedural Identity   - Map POI Tracker      |
+-------------------------------------------------------------------------+
```

---

## 📋 Prerequisites

1. **Grand Theft Auto: San Andreas (v1.0 US executable)**:
   * Tested and optimized for vanilla v1.0 US (`gta_sa.exe` size: 14,383,616 bytes).
2. **CLEO Redux**:
   * Installed into your GTA SA directory (`cleo_redux.asi`). Download from [re.cleo.li](https://re.cleo.li/).
3. **Python 3.10+**:
   * Make sure Python is added to your system `PATH`.
4. **Groq Cloud API Key** (Free & Ultra-Fast):
   * Obtain a free API key at [console.groq.com/keys](https://console.groq.com/keys).

---

## 🚀 Installation & Setup

### 1. Clone the Repository
```bash
git clone https://github.com/bio-colab/gta-sa-ai-companion.git
cd gta-sa-ai-companion
```

### 2. Install Python Dependencies
```bash
pip install -r requirements.txt
```

### 3. Configure API Credentials
Copy `.env.example` to `AINPC/.env` and insert your Groq API key:
```env
GROQ_API_KEY=gsk_your_groq_api_key_here
GROQ_MODEL=llama-3.3-70b-versatile
GROQ_STT_MODEL=whisper-large-v3-turbo
```

### 4. Deploy Mod Files to GTA San Andreas
Copy the following files into your GTA San Andreas installation folder:
* `cleo/stage1_test[fs].js` ➔ `[GTA SA Folder]/cleo/stage1_test[fs].js`
* `cleo/ainpc_bridge.ini`   ➔ `[GTA SA Folder]/cleo/ainpc_bridge.ini`
* `AINPC/` folder           ➔ `[GTA SA Folder]/AINPC/`

---

## 🎮 How to Play & Controls

### 1. Launch the Backend
Double click `AINPC/run_bridge.bat` or run:
```bash
python AINPC/bridge.py
```
You will see: `[BRIDGE READY] Waiting for GTA San Andreas...`

### 2. Start GTA San Andreas
* Load any saved game or start a new game.
* On game load, you will see the subtitle: `AI NPC READY - Press H near a ped!`.

### 3. Controls
* **`H` Key**: Press once near any pedestrian to recruit them as your AI Companion. Press `H` again to safely dismiss them.
* **`T` Key (Push-To-Talk Voice)**: Hold `T` and speak into your microphone. Release `T` when done speaking.
* **`~` / `\`` Key or `F6` (HUD Command Bar)**: Press to open the live typing bar. Type any message or command, then press **Enter** to submit or **ESC** to cancel. Player controls are automatically frozen during typing to prevent accidental movement or weapon firing.

---

## 🎭 Persona System Commands

You can set your companion's persona at any time via the command bar (`F6` / `~`) or by voice:

| Persona | Command | In-Game Special Ability & Stats |
| :--- | :--- | :--- |
| **Hitman** | `/persona hitman` or `/hitman` | 100% weapon accuracy, lethal threat engagement, bloodthirsty demeanor. |
| **Medic** | `/persona medic` or `/medic` | Autonomous field triage: restores CJ to 100 HP + 50 armor when CJ drops below 70 HP. |
| **Heavy** | `/persona heavy` or `/heavy` | Demolitions expert armed with RPG-7; intercepts police cruisers, SWAT vans, and police helicopters. |
| **Driver** | `/persona driver` or `/driver` | Master getaway driver (speed 44.0); automatically takes driver seat and repairs damaged vehicles. |
| **Girlfriend** | `/persona girlfriend` or `/girlfriend` | Romantic relationship; unlocks affectionate dialogue, dancing, kissing, and adult animations. |
| **Custom** | `/persona custom <text>` | Defines a custom personality or roleplay instruction that persists in SQLite memory. |

---

## 💬 Example Commands

* **Combat**:
  * *"Curtis, grab your M4 rifle!"* / `/arm_rifle` ➔ Equips M4 with 600 ammo.
  * *"Pull out your rocket launcher!"* / `/arm_rpg` ➔ Equips RPG-7.
  * *"Holster your weapon."* / `/disarm` ➔ Disarms.
* **Vehicles**:
  * *"Go bring me a car!"* / `/fetch_car` ➔ Sprints to closest car, enters as driver, drives it directly to CJ.
  * *"Drive to my map target marker."* / `/drive_to_target` ➔ Takes the wheel and drives to the waypoint.
* **Social & Romance**:
  * *"Dance with me!"* / `/dance` ➔ Performs club dance animations.
  * *"Give me a kiss!"* / `/kiss` ➔ Romantic kiss animation.
  * *"Give me a lap dance"* / `/lapdance` ➔ Lap dance animation routine.
  * *"Strip for me"* / `/strip` ➔ Club exotic dance routine.
  * *"Take a smoke break."* / `/smoke` ➔ Lights a cigarette and smokes.
* **World Questions**:
  * *"What station is this?"* ➔ Comments on the current radio station.
  * *"What time is it?"* ➔ Notes the in-game clock hour and morning/evening vibe.

---

## 📂 Project Structure

```
gta-sa-ai-companion/
├── AINPC/
│   ├── bridge.py             # Main Python IPC orchestrator & thread loops
│   ├── llm_brain.py          # Groq Cloud API LLM engine & persona prompt builder
│   ├── memory_db.py          # SQLite episodic memory & persona persistence
│   ├── ped_demographics.py   # Procedural identity & persona archetypes
│   ├── poi_manager.py        # San Andreas map locations & POI tracker
│   ├── voice_stt.py          # Push-to-talk Groq Whisper STT
│   └── run_bridge.bat        # 1-click launch script
├── cleo/
│   ├── stage1_test[fs].js    # CLEO Redux JS runtime (local reflexes, text HUD, group AI)
│   └── ainpc_bridge.ini      # IPC communication exchange template
├── docs/
│   ├── ARCHITECTURE.md       # Detailed technical architecture & opcode matrix
│   └── ACTION_CATALOG.md     # Full catalog of actions, modes, personas & animations
├── .env.example              # Environment variables template
├── .gitignore                # Git ignore rules for keys and binaries
├── LICENSE                   # MIT License
├── README.md                 # English documentation
├── README_AR.md              # Arabic documentation (دليل التوثيق بالعربية)
└── requirements.txt          # Python dependencies
```

---

## ⚡ v1.1 Architectural Hardening & Production Reliability

1. **Atomic Windows Native IPC (`WritePrivateProfileStringW`)**:
   - Updates `[BRIDGE]` keys at the kernel level without reading or rewriting `[GAME]` keys, completely eliminating INI file write collisions with CLEO Redux.
2. **Thread-Safe FIFO Message Queues**:
   - `say_fifo` and `action_fifo` buffer rapid inputs and LLM responses, confirming receipt via `say_ack` and `action_ack` so no command or dialogue line is ever dropped.
3. **Dynamic Trust & Bravery Scaling**:
   - Natural trust decay toward baseline upon recruitment prevents early saturation.
   - Trust level (0.0 to 1.0) directly modulates gameplay parameters: Medic triage threshold (45–80 HP), shooting accuracy (40%–100%), and getaway evasion velocity.
4. **Persistent Persona Memory**:
   - Recruited peds automatically restore previously assigned personas from SQLite (`memory.db`), maintaining character continuity across gameplay sessions.
5. **Zero-Overhead Polling (< 0.5% CPU)**:
   - File modification timestamp (`mtime`) caching prevents redundant INI parsing.
   - Process enumeration is cached with a 1.5-second TTL, cutting CPU cycles by over 80%.
6. **Strict Regex Boundary Intent Detection**:
   - Word boundary anchors (`\bkeyword\b`) eliminate partial match false positives (e.g. "care" triggering "car", or "begun" triggering "gun").
7. **Graceful API Fallbacks & Exponential Backoff**:
   - Built-in retry mechanism for HTTP 429/5xx responses with seamless in-character dialogue fallbacks, guaranteeing raw error strings never leak into game subtitles.
8. **Autonomous Environmental Events**:
   - Real-time commentary triggers on car crash trauma, radio station changes, and idle ambient chatter with safety cooldowns.

---

## 🛡️ Stability & Compatibility Notes

* **Zero Crash Policy**: All game engine opcodes used (`0187`, `018B`, `0165`, `0168`, `0713`, `05E2`, `00BF`, `051E`, `054E`) are verified safe for vanilla GTA San Andreas v1.0 US.
* **Safe String Sanitization**: The text command bar sanitizes tildes (`~`) and font missing characters to eliminate GXT font formatting corruption and crash-to-desktop errors.
* **Opcode 0D59 Warning**: Never use `Weather.GetCurrent()` (CLEO+ Opcode `0D59`) as it causes CLEO Redux script disposal and CTD in vanilla v1.0. This project strictly relies on vanilla clock opcodes (`00BF`).
* **Clean Performance**: Memory usage is $< 115\text{ MB}$ RAM on the Python side, with 0 measurable FPS impact on the game engine.

---

## 📜 License

This project is licensed under the [MIT License](LICENSE).
Grand Theft Auto: San Andreas is a registered trademark of Rockstar Games / Take-Two Interactive. This mod is an independent open-source research and companion project.
