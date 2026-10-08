# GTA San Andreas - Autonomous AI NPC Companion System

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python: 3.10+](https://img.shields.io/badge/Python-3.10+-blue.svg)](https://www.python.org/)
[![Platform: GTA SA v1.0 US](https://img.shields.io/badge/Game-GTA%20San%20Andreas%20v1.0-green.svg)](https://www.rockstargames.com/)
[![Runtime: CLEO Redux](https://img.shields.io/badge/CLEO-Redux%20JS-orange.svg)](https://re.cleo.li/)
[![AI: Groq Cloud](https://img.shields.io/badge/AI-Groq%20Cloud%20(Whisper%20%2B%20LLM)-purple.svg)](https://groq.com/)

An **Embodied, Autonomous AI NPC Companion** system for vanilla **Grand Theft Auto: San Andreas (v1.0 US)**. Walk up to any pedestrian in the world, recruit them as your companion, and talk to them with real-time push-to-talk voice. 

The NPC possesses procedural demographic identity, persistent episodic memory, layered behavioral modes (combat, vehicle, emotes), and autonomous environmental awareness (reacting to car crashes, radio stations, time of day, and gunfights).

---

## 🌟 Key Features

* **🎙️ Real-Time Voice Conversation (Push-To-Talk)**:
  * Hold the **`T`** key in-game to speak through your microphone.
  * Ultra-fast transcription via **Groq Whisper Large v3 Turbo** (~300ms latency).
  * Context-aware responses with in-game formatted subtitles (`Text.PrintStringNow`).

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
  * **Combat Mode**: Dynamic arming (M4, Desert Eagle, MP5, Combat Shotgun) with 85% accuracy, disarming, hands-up stance.
  * **Vehicle Mode**: Autonomous car fetching (sprinting to nearest empty car, hotwiring, and driving it to CJ), driving to map target markers, or casual cruising.
  * **Emote Mode**: Dancing, smoking, drinking/stumbling, cheering, blowing kisses, cowering.

* **⚡ Ambient World Autonomy**:
  * **Crash Panic**: Reacts dynamically to high-speed vehicle impacts.
  * **Car Radio Commentary**: Listens to CJ's active radio station (Radio Los Santos, K-DST, Bounce FM, WCTR) and comments on the tracks.
  * **Time Awareness**: Notes the sunrise, noon, golden hour, or midnight via vanilla game clock.
  * **Autonomous Threat Defense & Drive-By**: Returns fire on hostile gang members attacking CJ on foot or hangs out the passenger window for drive-by shootings.

---

## 🏗️ Architecture

```
+-------------------------------------------------------------------------+
|                  GTA San Andreas (v1.0 US Game Engine)                  |
|                                                                         |
|   CLEO Redux JavaScript Mod (stage1_test[fs].js)                        |
|   - Native Group AI (CPedGroup)            - Vehicle Drive-By (0713)    |
|   - Dynamic Blip Manager (0187, 018B)      - Street Defense (05E2)      |
|   - Telemetry Stream (30-50 FPS)           - Clock & Radio Sensors      |
+------------------------------------^------------------------------------+
                                     |
                       File IPC (cleo/ainpc_bridge.ini)
                                     |
+------------------------------------v------------------------------------+
|                  Python Orchestrator Backend (AINPC/)                   |
|                                                                         |
|   bridge.py              llm_brain.py            voice_stt.py           |
|   - Heartbeat Monitor    - Groq Cloud LLM        - Microphone Stream    |
|   - Telemetry Parser     - Layered Actions       - Whisper Large Turbo  |
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
GROQ_MODEL=qwen/qwen3.8-27b
GROQ_STT_MODEL=whisper-large-v3-turbo
```

### 4. Deploy Mod Files to GTA San Andreas
Copy the following files into your GTA San Andreas installation folder:
* `cleo/stage1_test[fs].js` ➔ `[GTA SA Folder]/cleo/stage1_test[fs].js`
* `cleo/ainpc_bridge.ini`   ➔ `[GTA SA Folder]/cleo/ainpc_bridge.ini`
* `AINPC/` folder           ➔ `[GTA SA Folder]/AINPC/`

---

## 🎮 How to Play

1. **Launch the Python Backend**:
   Double click `AINPC/run_bridge.bat` or run:
   ```bash
   python AINPC/bridge.py
   ```
   You will see: `[BRIDGE READY] Waiting for GTA San Andreas...`

2. **Start GTA San Andreas**:
   * Load any saved game or start a new game.
   * On game load, you will see the subtitle: `AI NPC READY - Press H near a ped!`.

3. **In-Game Controls**:
   * **`H` Key**: Press once near any pedestrian to recruit them as your AI Companion. Press `H` again to safely dismiss them.
   * **`T` Key (Hold to Talk)**: Hold `T` and speak into your microphone. Release `T` when done speaking. The companion will reply via colored subtitles and execute corresponding in-game actions!

---

## 💬 Example Voice Commands

* **Combat**:
  * *"Curtis, grab your M4 rifle!"* ➔ Equips M4 with 500 ammo.
  * *"Pull out your Desert Eagle!"* ➔ Equips heavy pistol.
  * *"Holster your weapon."* ➔ Disarms.
* **Vehicles**:
  * *"Go bring me a car!"* ➔ Sprints to closest car, enters as driver, drives it directly to CJ.
  * *"Drive to my map target marker."* ➔ Takes the wheel and drives to the waypoint.
* **Social & Emotes**:
  * *"Dance with me!"* ➔ Performs club dance animations.
  * *"Take a smoke break."* ➔ Lights a cigarette and smokes.
  * *"Act drunk!"* ➔ Stumbles with slurred walking gait.
* **World Questions**:
  * *"What station is this?"* ➔ Comments on the current radio station.
  * *"What time is it?"* ➔ Notes the in-game clock hour and morning/evening vibe.

---

## 📂 Project Structure

```
gta-sa-ai-companion/
├── AINPC/
│   ├── bridge.py             # Main Python IPC orchestrator & thread loops
│   ├── llm_brain.py          # Groq Cloud API LLM engine & prompt templates
│   ├── memory_db.py          # SQLite episodic memory & relationship engine
│   ├── ped_demographics.py   # Procedural identity & archetype generator
│   ├── poi_manager.py        # San Andreas map locations & POI tracker
│   ├── voice_stt.py          # Push-to-talk Groq Whisper STT
│   └── run_bridge.bat        # 1-click launch script
├── cleo/
│   ├── stage1_test[fs].js    # CLEO Redux JS runtime script
│   └── ainpc_bridge.ini      # IPC communication exchange template
├── docs/
│   ├── ARCHITECTURE.md       # Detailed technical architecture & opcode matrix
│   └── ACTION_CATALOG.md     # Full catalog of actions, modes & animations
├── .env.example              # Environment variables template
├── .gitignore                # Git ignore rules for keys and binaries
├── LICENSE                   # MIT License
├── README.md                 # English documentation
├── README_AR.md              # Arabic documentation (دليل التوثيق بالعربية)
└── requirements.txt          # Python dependencies
```

---

## 🛡️ Stability & Compatibility Notes

* **Zero Crash Policy**: All game engine opcodes used (`0187`, `018B`, `0165`, `0168`, `0713`, `05E2`, `00BF`, `051E`) are verified safe for vanilla GTA San Andreas v1.0 US.
* **Opcode 0D59 Warning**: Never use `Weather.GetCurrent()` (CLEO+ Opcode `0D59`) as it causes CLEO Redux script disposal and CTD in vanilla v1.0. This project strictly relies on vanilla clock opcodes (`00BF`).
* **Clean Performance**: Memory usage is $< 90\text{ MB}$ RAM on the Python side, with 0 measurable FPS impact on the game engine.

---

## 📜 License

This project is licensed under the [MIT License](LICENSE).
Grand Theft Auto: San Andreas is a registered trademark of Rockstar Games / Take-Two Interactive. This mod is an independent open-source research and companion project.
