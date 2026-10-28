---
name: cli-anything-gta
description: >
  Agent-native stateful CLI harness for GTA San Andreas AI Companion. Enables AI coding agents
  and automated pipelines to inspect live game telemetry, dispatch companion personas (hitman,
  driver, heavy, medic), issue tactical orders (attack, cover, follow, heal), equip weaponry,
  trigger native in-engine 3D speech, and verify REA memory signatures.
---

# GTA San Andreas AI Companion CLI (`cli-anything-gta`)

Agent-native command-line interface for the GTA San Andreas AI Companion mod.

## Installation

Install in editable development mode:
```bash
cd agent-harness
pip install -e .
```

Verify installation:
```bash
cli-anything-gta --help
```

## Usage

### 1. Interactive REPL Mode
Running without arguments starts the interactive shell:
```bash
cli-anything-gta
```

### 2. Machine-Readable JSON Mode
All commands support `--json` for deterministic AI agent consumption:

```bash
# Check system status
cli-anything-gta status --json

# Read live player and companion telemetry
cli-anything-gta telemetry --json

# Switch companion persona
cli-anything-gta companion persona hitman --json
cli-anything-gta companion persona driver --json
cli-anything-gta companion persona heavy --json
cli-anything-gta companion persona medic --json

# Issue tactical orders
cli-anything-gta companion order follow --json
cli-anything-gta companion order attack --json
cli-anything-gta companion order cover --json
cli-anything-gta companion order heal --json
cli-anything-gta companion order drive --json

# Equip weapons
cli-anything-gta companion equip m4 --json
cli-anything-gta companion equip deagle --json
cli-anything-gta companion equip shotgun --json
cli-anything-gta companion equip rpg --json

# Trigger authentic in-engine native voice lines
cli-anything-gta companion speak recruit --json
cli-anything-gta companion speak dismiss --json
cli-anything-gta companion speak attack --json
cli-anything-gta companion speak cover --json
cli-anything-gta companion speak follow --json

# Dismiss companion
cli-anything-gta companion dismiss --json

# Inspect REA reverse-engineered memory signatures
cli-anything-gta memory --json

# Inspect / update bridge configuration
cli-anything-gta config show --json
cli-anything-gta config set --key trust_level --val 0.85 --json
```

## Agent Workflows
When controlling GTA San Andreas as an autonomous agent:
1. Call `cli-anything-gta status --json` to verify `game_process_running` and `bridge_status`.
2. Inspect `cli-anything-gta telemetry --json` before mutating game state.
3. Use `cli-anything-gta companion persona <name> --json` to adjust AI combat tactics.
4. When CJ is in danger, dispatch `cli-anything-gta companion order cover --json` or `heal`.
