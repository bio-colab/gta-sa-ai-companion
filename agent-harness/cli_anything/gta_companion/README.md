# GTA San Andreas AI Companion CLI (`cli-anything-gta`)

Agent-native command-line interface for the GTA San Andreas AI Companion mod.

## Installation

Install in editable development mode:
```bash
cd agent-harness
pip install -e .
```

Verify the installation:
```bash
cli-anything-gta --help
```

## Quick Start

### 1. Interactive REPL Mode
Running without arguments drops into the stateful interactive REPL shell:
```bash
cli-anything-gta
```

### 2. Machine-Readable JSON Mode
Every command accepts `--json` for deterministic agent-compatible JSON output:
```bash
# Check status
cli-anything-gta status --json

# Read live telemetry
cli-anything-gta telemetry --json

# Switch companion persona
cli-anything-gta companion persona hitman --json

# Dispatch orders
cli-anything-gta companion order cover --json
cli-anything-gta companion order attack --json
cli-anything-gta companion order heal --json

# Equip weapons
cli-anything-gta companion equip m4 --json

# Trigger authentic in-engine voice lines
cli-anything-gta companion speak cover --json
```

## Architecture & Subsystems
- **IPC Protocol:** Communicates via `cleo/ainpc_bridge.ini` atomic transactional queue.
- **REA Level 3 Audio:** Triggers in-engine `CPed::Say` (0x005EFFE0) with 3D spatial lip-sync.
- **Tactical Cover AI:** Uses `CTaskComplexSeekCoverUntilTargetDead` (0x00654200) and `KillCharOnFootWhileDucking` (0787).
- **Universal Signatures:** AOB pattern scanning ensures compatibility across all game versions.
