# GTA San Andreas AI Companion: Agent Harness Architecture

## Overview
`cli-anything-gta` is an agent-native CLI harness for the GTA San Andreas AI Companion mod. It enables AI coding agents and automated pipelines to control, inspect, and interact with GTA San Andreas and its autonomous companion system directly through deterministic JSON-contract CLI commands and an interactive REPL skin.

## Architecture

```
                  ┌─────────────────────────────┐
                  │    AI Agent / Terminal      │
                  └──────────────┬──────────────┘
                                 │
                   cli-anything-gta [--json]
                                 │
                  ┌──────────────▼──────────────┐
                  │  Click CLI & ReplSkin REPL  │
                  └──────────────┬──────────────┘
                                 │
            ┌────────────────────┼────────────────────┐
            ▼                    ▼                    ▼
     ┌─────────────┐      ┌─────────────┐      ┌─────────────┐
     │  telemetry  │      │  companion  │      │   memory    │
     │   module    │      │   module    │      │   module    │
     └──────┬──────┘      └──────┬──────┘      └──────┬──────┘
            │                    │                    │
            └────────────────────┼────────────────────┘
                                 │
                    ┌────────────▼───────────┐
                    │       gta_backend      │
                    └────────────┬───────────┘
                                 │
              ┌──────────────────┴──────────────────┐
              ▼                                     ▼
     ┌──────────────────┐                  ┌──────────────────┐
     │ ainpc_bridge.ini │                  │   gta_sa.exe     │
     │  (IPC Channel)   │                  │ (Native Process) │
     └──────────────────┘                  └──────────────────┘
```

## State & Data Model
- **Game State (`[GAME]` in `cleo/ainpc_bridge.ini`):** Read-only telemetry updated live by CLEO Redux script:
  - `status`: Game connection state (`online` / `offline`)
  - `npc_active`: Companion recruitment state (0 or 1)
  - `cj_health`, `cj_armor`, `cj_wanted`, `cj_weapon`, `cj_in_car`, `threat_active`
- **Control State (`[BRIDGE]` in `cleo/ainpc_bridge.ini`):** Transactional command queue:
  - `action_cmd`: Dispatched action (`persona_<name>`, `give_weapon_<id>`, `heal`, `cover`, etc.)
  - `say_text`: Subtitle speech prompt
  - `active_mode`, `active_persona`, `trust_level`, `bravery`
- **Session State (`session.json`):** Local CLI session tracking recent commands, audit history, and active target.

## Command Groups
1. **`status` / `info`**: Non-destructive probe of game process, connection state, and active companion.
2. **`telemetry`**: Instant inspection of player stats, vehicle status, crime level, and environmental context.
3. **`companion`**: Full lifecycle management: `spawn`, `dismiss`, `persona`, `order`, `equip`, `speak`.
4. **`memory`**: Verification of live memory pools and REA reverse-engineered AOB signatures.
5. **`config`**: Reading and updating bridge settings and active persona traits.
6. **`repl`**: Interactive shell with auto-completion and styled prompt.
