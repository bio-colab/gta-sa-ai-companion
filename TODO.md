# Future Roadmap & Unfinished Goals (TODO.md)

This document tracks upcoming milestones, architectural goals, and experimental features planned for the **GTA San Andreas AI Companion** project. Community contributions are warmly welcomed!

---

## 🎯 Milestone 1: Audible Speech Synthesis (TTS - Text-To-Speech)
- [ ] **Current State**: Responses are rendered via in-game colored text subtitles (`Text.PrintStringNow`).
- [ ] **Goal**: Generate real-time audible spoken voices for the companion.
- [ ] **Technical Pathways**:
  - Integration with **ElevenLabs API** or **Cartesia / PlayHT** for high-fidelity voice cloning matching character demographic (accent, pitch, gender).
  - Integration with **Piper TTS** or **Coqui TTS** for ultra-fast, local, offline voice synthesis ($< 150\text{ ms}$).
  - Audio playback through GTA San Andreas's custom audio streams or a virtual audio sink.

---

## 🎯 Milestone 2: 100% Offline / Local AI Pipeline
- [ ] **Current State**: Relies on Groq Cloud API for ultra-fast inference.
- [ ] **Goal**: Enable fully offline play for users without internet connections or API keys.
- [ ] **Technical Pathways**:
  - Add native **Ollama** / **Llama.cpp** backend support (`http://localhost:11434/api/generate`).
  - Support quantized models: Llama-3.2-3B-Instruct, Qwen2.5-7B-Instruct (4-bit GGUF).
  - Add local **faster-whisper** fallback for speech recognition.

---

## 🎯 Milestone 3: Multimodal Vision (VLM - Giving the NPC Eyes)
- [ ] **Current State**: Spatial awareness is derived purely from engine coordinates, raycasts, and entity handles.
- [ ] **Goal**: Enable the companion to "see" what CJ sees in the 3D world.
- [ ] **Technical Pathways**:
  - Hook into DirectX 9 frame buffer or capture game viewport via high-speed memory grabber (`dxcam` / `mss`).
  - Downscale frames to $384 \times 384$ and pass periodically to Vision-Language Models (e.g., **Qwen2-VL**, **Llama-3.2-Vision**).
  - Enable queries like: *"Curtis, do you see that green lowrider down the alley?"* or *"Look at that billboard!"*.

---

## 🎯 Milestone 4: Multi-Companion Squads & Inter-NPC Banter
- [ ] **Current State**: Single companion attached to player group (`activePed`).
- [ ] **Goal**: Command up to 7 squad members simultaneously with emergent social interaction.
- [ ] **Technical Pathways**:
  - Expand group allocation to manage up to 7 peds in `CPedGroup`.
  - Assign distinct squad roles (Driver, Heavy Gunner, Scout, Medic).
  - Enable autonomous conversation and banter between companions when riding in the car together without CJ needing to intervene.

---

## 🎯 Milestone 5: Procedural Emergent Quests & Dynamic Missions
- [ ] **Current State**: Companion reacts to world events and follows direct commands.
- [ ] **Goal**: Companion initiates dynamic quests based on their background archetype.
- [ ] **Technical Pathways**:
  - Gang companion: *"Hey CJ, I heard a rival Ballas drug dealer is operating in Glen Park. Want to shake him down?"*
  - Police companion: *"We got a 10-41 in Rodeo, let's respond."*
  - Procedural spawn of target peds, briefcases, or ambush cars with reward payouts.

---

## 🎯 Milestone 6: Autonomous Aviation & Stunt Navigation
- [ ] **Current State**: Ground driving and on-foot traversal supported.
- [ ] **Goal**: Autonomous helicopter piloting, fixed-wing aircraft flying, and boat navigation.
- [ ] **Technical Pathways**:
  - Implement opcodes for `Task.FlyHelicopterToCoord`, `Task.PlaneChase`, and parachute deployment.
  - Companion pilot picks up CJ on skyscraper rooftops.

---

## 🎯 Milestone 7: Extended Emotional & Psychological States
- [ ] **Current State**: Linear relationship score ($0 - 100$) and fear state.
- [ ] **Goal**: Dynamic psychological traits including greed, cowardice, betrayal threshold, and PTSD.
- [ ] **Technical Pathways**:
  - If CJ constantly crashes cars or kills innocent pedestrians, low-morality companions cheer while high-morality companions may abandon CJ or report him to the police.
