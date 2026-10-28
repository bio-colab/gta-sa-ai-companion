# GTA San Andreas AI Companion - Release v1.0.0

## 🚀 Overview

**GTA San Andreas AI Companion v1.0.0** is the first official release of the autonomous, embodied AI NPC companion system for *Grand Theft Auto: San Andreas*.

This milestone introduces universal binary compatibility across all major game versions, a robust dual-tier intelligence architecture (100% offline native AI + optional cloud-augmented conversational intelligence), an agent-native CLI harness conforming to HKUDS CLI-Anything standards, and an automated continuous integration test suite.

---

## 🌟 Key Highlights

### 1. Dual-Tier Intelligence Architecture
- **Tier 1: 100% Offline Native Engine (Zero Cost / Zero Internet)**:
  - Operates completely locally without requiring cloud API keys, external servers, or an internet connection.
  - Leverages authentic in-engine 3D ped speech (`CPed::Say` at `0x005EFFE0`) with authentic audio voice banks and facial lip-sync.
  - Features engine-level tactical cover seeking (`CTaskComplexSeekCoverUntilTargetDead` at `0x00654200` and opcode `0787`).
  - Built-in autonomous personas: `/hitman`, `/driver`, `/heavy`, `/medic`.
  - Comprehensive field command bar accessible via `/` in-game (`/heal`, `/gun`, `/bring`, `/distract`, `/drive`, `/cover`).
- **Tier 2: Optional Cloud Augmented Intelligence**:
  - Connects seamlessly to free-tier Groq Cloud (Whisper Large v3 + LLaMA 3.3 / Qwen 2.5) or OpenRouter when internet is present.
  - Push-to-talk microphone interaction with real-time transcription and voice synthesis.
  - Episodic memory system backed by SQLite (`memory.db`) capturing player-companion shared history and trust metrics.

### 2. Universal Binary Compatibility (Dynamic AOB Scanning)
- Replaces fixed hardcoded memory offsets with runtime Array-of-Bytes (AOB) signature scanning.
- Verified compatibility across:
  - GTA SA v1.0 US (14,383,616 bytes)
  - GTA SA v1.01 EU / Australian
  - Steam / Rockstar Games Launcher editions
  - Downgraded and modded configurations (SilentPatch, Widescreen Fix)

### 3. Agent-Native CLI Harness (`cli-anything-gta`)
- Built in strict compliance with HKUDS CLI-Anything specifications (100% / 8 of 8 criteria satisfied).
- Provides autonomous coding agents and human operators with stateful, scriptable game control:
  - `--json`: Strict machine-readable JSON contracts for zero-parsing-ambiguity agent automation.
  - Interactive REPL: Full interactive terminal with auto-completion, contextual command help, and session history.
  - Subcommands: `status`, `telemetry`, `companion`, `memory`, `config`.

### 4. Rigorous Continuous Integration & Quality Assurance
- Automated GitHub Actions CI workflow running on Windows runners.
- 21/21 Unit and End-to-End subprocess tests covering telemetry, session management, weapon mapping, order dispatch, and CLI JSON contracts.
- Automated syntax validation of CLEO JavaScript code (`node -c`).

---

## 📦 Distribution Package Contents

- `cleo/stage1_test[fs][mem].js`: Unified real-time game loop script for CLEO Redux.
- `cleo/ainpc_bridge.ini`: Zero-latency inter-process communication bridge.
- `AINPC/`: Python bridge, LLM brain, audio subsystem, and SQLite memory manager.
- `agent-harness/`: Standalone `cli-anything-gta` package with PyPI-ready PEP 420 namespace structure.
- `docs/`: In-depth documentation including Action Catalog, System Architecture, and Offline Command Reference.

---

## 🛠️ Quick Installation

1. Extract `gta-sa-ai-companion-v1.0.0.zip` into your GTA San Andreas installation folder.
2. Ensure [CLEO Redux](https://re.cleo.li/) is installed.
3. For Offline Mode: Launch `gta_sa.exe`, walk up to any ped and press `H`.
4. For Agent / Terminal Control:
   ```bash
   pip install -e agent-harness
   cli-anything-gta --help
   ```
5. For Voice / Cloud Intelligence: Run `AINPC\run_bridge.bat` (optional Groq API key).
