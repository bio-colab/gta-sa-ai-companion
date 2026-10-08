# Engineering Memory & Technical Retrospective (MEMORY.md)

> **Audience**: AI Engineers, Game Developers, Robotics & Embodied AI Researchers.  
> **Topic**: How we transformed a closed-source, 2004 game engine (Grand Theft Auto: San Andreas v1.0) into an embodied, autonomous AI agent sandbox.

---

## 1. The Thesis: Why GTA San Andreas for Embodied AI?

Modern AI agents often operate in isolated text prompts or synthetic grid worlds (Crafter, Minecraft, BabyAI). While rich, modern AAA games are heavily encrypted, compute-heavy, and difficult to instrument.

**Grand Theft Auto: San Andreas (2004, RenderWare Engine)** presents the optimal research environment:
1. **Rich Urban Simulation**: Pedestrian AI schedules, police dispatch, dynamic weather, full 24-hour day/night cycles, vehicles, radio stations, and gang territorial dynamics.
2. **Deterministic & Lightweight**: Runs at $< 100\text{ MB}$ RAM on modest hardware (tested on an Intel UHD 620 integrated GPU) leaving maximum compute for AI reasoning.
3. **Deep SCM Opcode Architecture**: Thousands of exposed engine routines accessible through script runtimes without requiring reverse-engineering of binary memory offsets.

Our goal was not merely to build a "chat mod", but to create a **physically embodied autonomous companion** capable of living, perceiving, and acting inside the simulation with zero desynchronization.

---

## 2. Phase-by-Phase Technical Evolution

### Phase 1: Embodiment & The Pathfinding Dilemma
* **The Naive Approach**: Writing custom A* pathfinding and vector collision avoidance in Python or CLEO script.  
  * *Result*: Severe CPU overhead, companion getting stuck on stairs, fences, and unable to negotiate vehicle geometry.
* **The Breakthrough**: Leveraging the native `CPedGroup` architecture.
  * GTA SA already possesses native gang follower intelligence. By invoking `grp.setLeader(playerChar)`, `grp.setDefaultTaskAllocator(0)` (*FollowAnyMeans*), and `grp.setFollowStatus(true)`, the engine delegates physics, obstacle avoidance, collision meshes, and vehicle passenger embarking to the internal C++ core.
  * **Opcode `0792` (`player.setGroupToFollowAlways`)**: In vanilla GTA SA, pressing the 'H' key toggles gang members between "follow" and "wait here". By locking group follow status, we repurposed the 'H' key as the AI Activation/Release toggle without interference.

---

### Phase 2: Dual IPC Bridge & Real-Time Voice Pipeline
* **The IPC Challenge**: Bridging an unmanaged C++ game loop (running at 30-60 FPS) with an asynchronous Python runtime.
  * Raw TCP sockets or Named Pipes often caused micro-stutters or deadlocks if the Python process blocked.
  * **Solution**: A memory-buffered, sequence-tracked file stream (`ainpc_bridge.ini`).
  * By pairing sequence numbers (`say_id` / `say_ack`, `action_id` / `action_ack`, and heartbeat `ping` / `pong`), we guaranteed deterministic delivery with zero race conditions.
* **Voice Input (Push-To-Talk)**:
  * Holding the `T` key triggers direct PCM audio capture at 16kHz via `sounddevice`.
  * Audio buffer is dispatched to **Groq Whisper Large v3 Turbo**, achieving transcription latencies under **$300\text{ ms}$**.
  * Transcripts are fed directly into the LLM context, which returns formatted GTA colored text (`~y~`, `~w~`, `~g~`) rendered via Opcode `03E5` (`Text.PrintStringNow`).

---

### Phase 3: Demographic Identity & Episodic Memory
* **Procedural Identity Engine**:
  * Pedestrian model IDs in San Andreas correlate with specific societal archetypes (e.g. Model 19 = Curtis, South Central gang member; Model 63 = Prostitute; Model 91 = Business executive).
  * `ped_demographics.py` inspects the spawned ped model and procedurally derives a realistic profile (name, background story, speaking cadence, temperament).
* **Episodic SQLite Schema**:
  * Implemented an embedded database (`memory.db`) with tables for `conversations`, `relationships`, and `incidents`.
  * Dynamic trust scoring ($0 - 100$): Surviving police pursuits or shootouts increases loyalty; leaving the companion injured decreases it.
  * Relevant episodic memories are injected dynamically into the LLM system prompt.

---

### Phase 4: Action Catalog & Layered Mode State Machine
* **The Multi-Action Interference Problem**:
  * In early tests, prompt LLMs attempted to execute contradictory actions simultaneously (e.g., trying to dance while firing an assault rifle or driving).
* **The Layered Solution**:
  * We partitioned all engine actions into four distinct operational layers:
    1. **`companion`**: Natural following, looking, orientation, healing.
    2. **`combat`**: Firearm equipment (M4, Deagle, MP5, Shotgun with 85% accuracy), disarming, hands-up stance.
    3. **`vehicle`**: Driving modes, cruising, navigating to map waypoints.
    4. **`emote`**: Club dancing, smoking cigarettes, drunken stumbling, cheering.
* **Autonomous Car Fetching Engine**:
  * A 3-phase asynchronous finite state machine:
    * **Phase 0**: Sprints (`Task.GoToCoordAnyMeans`) to the nearest empty vehicle identified via `World.GetRandomCarInSphereNoSaveRecursive` (Opcode `0AE2`).
    * **Phase 1**: Enters driver door via `Task.EnterCarAsDriver`.
    * **Phase 2**: Drives the vehicle directly to CJ's coordinates via `Task.CarDriveToCoord` and brings it to a halt.

---

### Phase 5: Ambient World Sensing & The Opcode `0D59` Crash
* **World Perception**:
  * Companion recognizes the active car radio station via Opcode `051E` (`Audio.GetRadioChannel`) and offers real-time commentary on 90s West Coast Rap, Classic Rock, or WCTR talk radio.
  * High-speed vehicle crashes are detected by monitoring delta vehicle health (`car.getHealth()`), triggering instant panic dialogue.
* **Vehicle Drive-By & Street Defense**:
  * When CJ is attacked on foot, companion defends him using Opcode `05E2` (`Task.KillCharOnFoot`).
  * In vehicular combat, passenger companion hangs out the window firing via Opcode `0713` (`Task.DriveBy`).
* **The Critical CTD Bug & The Opcode `0D59` Lesson**:
  * During Phase 5 development, the game began crashing instantly upon loading any save file.
  * **Diagnosis**: The script attempted to read current weather using `Weather.GetCurrent()` (CLEO+ Opcode `0D59`). In vanilla GTA SA v1.0 US with standard CLEO Redux, Opcode `0D59` does not exist in the host executable. CLEO Redux timed out waiting for the opcode, disposed the script, and induced a fatal memory crash.
  * **Rule Established**: *Never use non-vanilla CLEO+ opcodes.* Weather and temporal awareness were transitioned strictly to vanilla Opcode `00BF` (`Clock.GetTimeOfDay`).

---

### Phase 6: Native Radar Blips & Dynamic Camera Immersion
* **The Immersion Problem**:
  * Adding a radar marker via Opcode `0187` (`Blip.AddForChar`) placed a blip on the mini-map, but also rendered a giant, spinning 3D cone/arrow above the companion's head in the game world.
  * Inside vehicles or when standing close to CJ, this arrow clipped through car roofs and broke cinematic immersion.
* **The Opcode `018B` Solution**:
  * Opcode `018B` (`changeDisplay`) controls the rendering pipeline of `CRadar::ms_aMarkerArray`:
    * Mode `0` (`NEITHER`): Completely hidden.
    * Mode `2` (`BLIP_ONLY`): Radar mini-map only; **completely disables 3D world rendering**.
    * Mode `3` (`BOTH`): Both 3D world marker and radar icon.
  * **Dynamic State Machine**:
    * Companion within $25\text{ m}$: Set to Mode `2` (`BLIP_ONLY`). Clean, natural vision.
    * Both inside the same vehicle: Set to Mode `0` (`NEITHER`). Zero visual clutter.
    * Separated $> 25\text{ m}$ on foot: Switches to Mode `3` (`BOTH`) so CJ can spot them across city blocks.

---

## 3. Summary of Core Design Decisions

| Challenge | Explored Alternatives | Final Chosen Design | Rationale |
| :--- | :--- | :--- | :--- |
| **Scripting Runtime** | C++ ASI Plugin / SCM Script | CLEO Redux (JavaScript) | Hot-reloadable, native V8 speed, zero pointer headaches. |
| **Companion Movement** | Custom Python pathfinding | Engine `CPedGroup` | 100% native collision meshes, zero CPU overhead. |
| **Speech-To-Text** | Local Whisper / Vosk | Groq Whisper Large v3 Turbo | 300ms latency, zero GPU/RAM load on the host machine. |
| **IPC Mechanism** | TCP Sockets / Named Pipes | Atomic INI with Sequence IDs | Non-blocking, fault-tolerant, immune to game loop pauses. |
| **Radar & Markers** | Custom 3D coordinates | Opcode `0187` + `018B` | Native map integration with zero immersion loss. |
